import { beforeEach, afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/v1/agents/[id]/rotate-key/route';
import { GET as detail } from '../src/app/api/v1/agents/[id]/route';
import { GET as list } from '../src/app/api/v1/agents/route';
import { resolveActor } from '../src/lib/auth';
import { assignmentTransaction, admitFollowup } from '../src/lib/run-store';
import { POST as postComment } from '../src/app/api/v1/tasks/[id]/comments/route';
import { POST as postStatus } from '../src/app/api/v1/tasks/[id]/status/route';
import { addSseWriter } from '../src/lib/sse';
import { RunControl } from '../src/lib/run-control';

let db: Database.Database, root: string;
const oldKey = 'synthetic-old-agent-key';
const humanKey = 'synthetic-human-token';
const originalHash = bcrypt.hash.bind(bcrypt);
const oldHash = bcrypt.hashSync(oldKey, 4);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawtask-rotate-key-'));
  db = new Database(path.join(root, 'test.db'));
  db.pragma('foreign_keys=ON');
  db.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
  db.prepare('INSERT INTO humans(id,name,displayName) VALUES(?,?,?)').run('h','human','Human');
  db.prepare('INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash,apiKey) VALUES(?,?,?,?,?)').run('a','test','Test',oldHash,oldKey);
  db.prepare("INSERT INTO tasks(id,issueId,title,status) VALUES('t','TEST-001','Synthetic task','todo')").run();
  globalThis.__clawtask_db = db;
  process.env.CLAWTASK_UI_TOKEN = humanKey;
});
afterEach(() => {
  mock.restoreAll(); globalThis.__clawtask_db = undefined; globalThis.__clawtask_adapter = undefined;
  delete process.env.CLAWTASK_UI_TOKEN;
  db.close(); fs.rmSync(root, { recursive: true, force: true });
});
function req(token: string | null = humanKey) {
  return new NextRequest('http://localhost/api', { method:'POST', headers: token ? {Authorization:'Bearer '+token} : {} });
}
const props = (id='a') => ({params:Promise.resolve({id})});
const stored = () => db.prepare('SELECT * FROM agents WHERE id=?').get('a') as any;
const snapshot = () => JSON.stringify(['agents','tasks','task_dispatches','task_sessions','activity','comments'].map(t=>db.prepare('SELECT * FROM '+t).all()));
function dispatch(state: string) {
  db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run();
  db.prepare('INSERT INTO task_dispatches(id,taskId,agentId,sessionKey,runId,state) VALUES(?,?,?,?,?,?)').run('d','t','a','agent:test:clawtask:t',state==='pending'?null:'d',state);
}
function pauseHash() {
  const calls: Array<{key:string; release:()=>Promise<void>}> = [];
  mock.method(bcrypt, 'hash', (key: string, rounds: number) => new Promise<string>(resolve => {
    calls.push({key, release: async()=>resolve(await originalHash(key,rounds))});
  }));
  return calls;
}
async function hashing(calls: unknown[], n=1) {
  // Flush promise continuations, not timing-dependent sleeps.
  for(let i=0; i<20 && calls.length<n; i++) await Promise.resolve();
  assert.equal(calls.length,n);
}
function assertNoSecret(body: unknown, ...keys: string[]) {
  const text = JSON.stringify(body);
  for(const key of keys) assert.ok(!text.includes(key));
  assert.ok(!text.includes('apiKeyHash'));
}

test('human idle rotation revokes old key, authenticates replacement, hides detail/list and emits no activity/logs/events', async()=>{
  const log=mock.method(console,'info',()=>{});
  const events: unknown[]=[]; const unsubscribe=addSseWriter(event=>events.push(event));
  const res=await POST(req(),props()); assert.equal(res.status,200);
  const body=await res.json(); assert.match(body.data.apiKey,/^[a-f0-9]{64}$/);
  assert.equal(stored().apiKey,body.data.apiKey);
  assert.ok(await bcrypt.compare(body.data.apiKey,stored().apiKeyHash));
  assert.equal(await resolveActor(req(oldKey)),null);
  assert.deepEqual(await resolveActor(req(body.data.apiKey)),{actorId:'a',actorType:'agent'});
  assertNoSecret(await (await detail(req(),props())).json(),oldKey,body.data.apiKey,stored().apiKeyHash);
  assertNoSecret(await (await list()).json(),oldKey,body.data.apiKey,stored().apiKeyHash);
  assert.equal((db.prepare('SELECT count(*) n FROM activity').get() as any).n,0);
  assert.equal(log.mock.callCount(),0); assert.deepEqual(events,[]); unsubscribe();
});
for(const [name,token,expected] of [['missing',null,401],['invalid','synthetic-invalid',401],['agent',oldKey,403],['external','synthetic-external',403]] as const) {
  test(name+' actor cannot rotate or disclose credentials',async()=>{
    db.prepare('INSERT INTO external_systems(id,name,apiKeyHash) VALUES(?,?,?)').run('e','Synthetic',bcrypt.hashSync('synthetic-external',4));
    const before=snapshot(); const res=await POST(req(token),props());
    assert.equal(res.status,expected); assert.equal(snapshot(),before);
    assertNoSecret(await res.json(),oldKey,oldHash);
  });
}
test('authorized missing agent is 404',async()=>assert.equal((await POST(req(),props('missing'))).status,404));
for(const state of ['pending','submitting','running','recovery','outcome_required']) test(state+' durable work rejects without changing any state',async()=>{
  dispatch(state); const before=snapshot(); const res=await POST(req(),props());
  assert.equal(res.status,409); assert.equal((await res.json()).error.code,'AGENT_BUSY'); assert.equal(snapshot(),before);
});
test('completed historical work permits rotation',async()=>{
  dispatch('completed'); assert.equal((await POST(req(),props())).status,200);
});
for(const kind of ['assignment','followup','automatic']) test(kind+' admission while hashing wins; rotation rechecks atomically',async()=>{
  const calls=pauseHash(); const rotation=POST(req(),props()); await hashing(calls);
  if(kind==='assignment') assignmentTransaction(db,'t',true,()=>db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run());
  else if(kind==='followup') {
    db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run();
    db.prepare("INSERT INTO comments(id,taskId,authorId,authorType,content) VALUES('c','t','h','human','Synthetic followup')").run();
    db.transaction(()=>admitFollowup(db,db.prepare("SELECT * FROM tasks WHERE id='t'").get(),{id:'c',content:'Synthetic followup'}))();
  } else {
    db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run();
    const control=new RunControl(db,async()=>({session:{sessionId:'s',hasActiveRun:true,archived:false}}),()=>true,()=>oldKey);
    await control.pump({agentId:'a',openclawAgentId:'test',currentTaskId:null,currentRunId:null});
  }
  const before=snapshot(); await calls[0].release(); const res=await rotation;
  assert.equal(res.status,409); assert.equal(snapshot(),before);
});
test('overlapping rotations return one success and one explicit stale conflict',async()=>{
  const calls=pauseHash(); const first=POST(req(),props()), second=POST(req(),props()); await hashing(calls,2);
  await calls[0].release(); const a=await first; assert.equal(a.status,200); const key=(await a.json()).data.apiKey;
  await calls[1].release(); const b=await second; assert.equal(b.status,409); assert.equal((await b.json()).error.code,'KEY_CONFLICT');
  assert.equal(stored().apiKey,key); assert.ok(await resolveActor(req(key)));
});
test('delete during hashing is 404 without replacement disclosure',async()=>{
  const calls=pauseHash(); const rotation=POST(req(),props()); await hashing(calls);
  db.prepare("DELETE FROM agents WHERE id='a'").run(); await calls[0].release();
  const res=await rotation; assert.equal(res.status,404); assertNoSecret(await res.json(),calls[0].key);
});
test('zero affected rows never returns success or replacement',async()=>{
  db.exec("CREATE TRIGGER suppress_rotation BEFORE UPDATE OF apiKey ON agents BEGIN SELECT RAISE(IGNORE); END");
  const before=snapshot(); const res=await POST(req(),props()); assert.equal(res.status,409); assert.equal(snapshot(),before);
  assertNoSecret(await res.json(),oldKey,oldHash);
});
test('rotation first: later fake-gateway dispatch uses new key and completes once; rotation during delivered work rejects',async()=>{
  globalThis.__clawtask_adapter={notifyTaskState:async()=>{}} as any;
  const rotation=await POST(req(),props()); assert.equal(rotation.status,200); const key=(await rotation.json()).data.apiKey;
  assignmentTransaction(db,'t',true,()=>db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run());
  const calls: string[]=[];
  const control=new RunControl(db,async(_,method,p)=>{
    calls.push(method);
    if(method==='sessions.describe') return {session:{sessionId:'s',hasActiveRun:false,archived:false}};
    if(method==='agent') {assert.equal(p.message,key); assert.equal((await POST(req(),props())).status,409); assert.ok(await resolveActor(req(key))); return {runId:p.idempotencyKey};}
    if(method==='agent.wait') {
      const taskProps={params:Promise.resolve({id:'t'})};
      const request=(body: unknown)=>new NextRequest('http://localhost/api',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
      assert.equal((await postComment(request({content:'Synthetic completion'}),taskProps)).status,201);
      assert.equal((await postStatus(request({status:'done'}),taskProps)).status,200);
      return {runId:p.runId,status:'ok',endedAt:123};
    }
    if(method==='sessions.patch') return {ok:true,entry:{sessionId:'s',archivedAt:123}};
    throw Error(method);
  },()=>true,()=>stored().apiKey);
  const conn={agentId:'a',openclawAgentId:'test',currentTaskId:null,currentRunId:null};
  await control.pump(conn); await control.pump(conn);
  assert.equal(calls.filter(m=>m==='agent').length,1);
  assert.equal((db.prepare('SELECT state FROM task_dispatches').get() as any).state,'completed');
});

test('pending to submitting while hashing blocks rotation and retains delivered credential',async()=>{
  dispatch('pending');
  const calls=pauseHash(); const rotation=POST(req(),props()); await hashing(calls);
  let delivered!:()=>void, releaseGateway!:()=>void;
  const delivery=new Promise<void>(resolve=>{delivered=resolve;});
  const waiting=new Promise<void>(resolve=>{releaseGateway=resolve;});
  const control=new RunControl(db,async(_,method,p)=>{
    if(method==='sessions.describe') return {session:{sessionId:'s',hasActiveRun:false,archived:false}};
    if(method==='agent') {assert.equal(p.message,oldKey); delivered(); await waiting; return {runId:p.idempotencyKey};}
    if(method==='agent.wait') return {runId:p.runId,status:'timeout'};
    throw Error(method);
  },()=>true,()=>stored().apiKey);
  const pump=control.pump({agentId:'a',openclawAgentId:'test',currentTaskId:null,currentRunId:null});
  await delivery; assert.equal((db.prepare('SELECT state FROM task_dispatches').get() as any).state,'submitting');
  const before=snapshot(); await calls[0].release(); assert.equal((await rotation).status,409); assert.equal(snapshot(),before);
  assert.ok(await resolveActor(req(oldKey))); releaseGateway(); await pump;
});
