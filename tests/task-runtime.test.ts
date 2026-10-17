import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { POST as create, GET as list } from '../src/app/api/v1/tasks/route';
import { PATCH as patch, GET as get } from '../src/app/api/v1/tasks/[id]/route';
import { POST as createSubtask } from '../src/app/api/v1/tasks/[id]/subtasks/route';
import { PATCH as patchSubtask } from '../src/app/api/v1/tasks/[id]/subtasks/[subId]/route';
import { THINKING_LEVELS } from '../src/lib/task-runtime';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:'); db.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
  db.prepare("INSERT INTO humans(id,name,displayName) VALUES('h','human','Human')").run();
  db.prepare("INSERT INTO config(key,value) VALUES('issueCounter','0')").run();
  db.prepare("INSERT INTO tasks(id,issueId,title) VALUES('parent','TEST-001','Parent')").run();
  globalThis.__clawtask_db = db;
  globalThis.__clawtask_adapter = { assignTaskToAgent: async()=>{}, notifyTaskState: async()=>{} } as any;
  process.env.CLAWTASK_UI_TOKEN = 'isolated-runtime-token';
});
afterEach(() => { globalThis.__clawtask_db = undefined; globalThis.__clawtask_adapter = undefined; delete process.env.CLAWTASK_UI_TOKEN; db.close(); });
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api', { method, headers: { Authorization: 'Bearer isolated-runtime-token', 'Content-Type':'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const props = (id = 'parent') => ({ params: Promise.resolve({ id }) });
for (const overrides of [{}, {modelOverride:'test/model'}, {thinkingOverride:'high'}, {modelOverride:'test/model',thinkingOverride:'high'}, {modelOverride:null,thinkingOverride:null}]) {
  for (const kind of ['task','subtask']) test(kind + ' create/get/list persists ' + JSON.stringify(overrides), async () => {
    const response = kind === 'task' ? await create(req('POST',{title:'Runtime', ...overrides})) : await createSubtask(req('POST',{title:'Runtime', ...overrides}), props());
    assert.equal(response.status,201); const task = (await response.json()).data;
    for (const field of ['modelOverride','thinkingOverride']) assert.equal(task[field], (overrides as any)[field] ?? null);
    const read = (await (await get(req('GET'),props(task.id))).json()).data;
    assert.equal(read.modelOverride,task.modelOverride); assert.equal(read.thinkingOverride,task.thinkingOverride);
    if (kind==='task') assert.ok((await (await list(req('GET'))).json()).data.tasks.some((t:any)=>t.id===task.id && t.modelOverride===task.modelOverride));
  });
}
for (const kind of ['task','subtask']) test(kind + ' PATCH independently sets, preserves omitted and explicitly clears',async()=>{
  if (kind==='subtask') db.prepare("UPDATE tasks SET parentTaskId='p' WHERE id='parent'").run();
  const mutate=(body:any)=>kind==='task'?patch(req('PATCH',body),props()):patchSubtask(req('PATCH',body),{params:Promise.resolve({id:'p',subId:'parent'})});
  assert.equal((await mutate({modelOverride:'test/model',thinkingOverride:'high'})).status,200);
  await mutate({modelOverride:null}); let row=db.prepare('SELECT * FROM tasks').get() as any;
  assert.equal(row.modelOverride,null);assert.equal(row.thinkingOverride,'high');
  await mutate({modelOverride:'other/model'}); await mutate({thinkingOverride:null}); row=db.prepare('SELECT * FROM tasks').get() as any;
  assert.equal(row.modelOverride,'other/model');assert.equal(row.thinkingOverride,null);
  await mutate({title:'Changed'}); assert.equal((db.prepare('SELECT modelOverride FROM tasks').get() as any).modelOverride,'other/model');
});
const invalid = [
  ...['', ' ', 'test', '/model','test/','test/model name',' test/model','test/model ', 'test/model@profile','test/model/','test/model//nested','test/../model','test/model\n','test/'+'x'.repeat(256),42,true,[],{}].map(modelOverride=>({modelOverride})),
  ...['', ' ', 'HIGH','unknown','high ',42,true,[],{}].map(thinkingOverride=>({thinkingOverride})),
];
for (const value of invalid) test('invalid runtime rejects atomically ' + JSON.stringify(value), async()=>{
  db.prepare("UPDATE tasks SET parentTaskId='root'").run();
  const before=db.prepare('SELECT * FROM tasks').get(); const counter=db.prepare('SELECT value FROM config').get();
  for (const mutate of [()=>create(req('POST',{title:'bad',...value})),()=>createSubtask(req('POST',{title:'bad',...value}),props()),()=>patch(req('PATCH',{title:'bad',...value}),props()),()=>patchSubtask(req('PATCH',{title:'bad',...value}),{params:Promise.resolve({id:'root',subId:'parent'})})]) {
    const response=await mutate();assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_RUNTIME');
    assert.deepEqual(db.prepare('SELECT * FROM tasks').get(),before);assert.deepEqual(db.prepare('SELECT value FROM config').get(),counter);
    assert.equal((db.prepare('SELECT count(*) n FROM activity').get() as any).n,0);
  }
});
for (const body of [null, [], 42, 'bad']) test('malformed task payload rejected: '+JSON.stringify(body),async()=>{
  for(const mutate of [()=>create(req('POST',body)),()=>patch(req('PATCH',body),props())]) assert.equal((await mutate()).status,400);
});
test('runtime and assignment transaction failure rolls back both values',async()=>{
  db.prepare("INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES('a','test','Test','unused')").run();
  db.exec("CREATE TRIGGER reject_dispatch BEFORE INSERT ON task_dispatches BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(()=>patch(req('PATCH',{status:'todo',assigneeId:'a',assigneeType:'agent',modelOverride:'test/model',thinkingOverride:'high'}),props()),/synthetic failure/);
  const task=db.prepare('SELECT * FROM tasks').get() as any;
  assert.equal(task.modelOverride,null);assert.equal(task.thinkingOverride,null);assert.equal(task.assigneeId,null);assert.equal(task.status,'backlog');
});
for (const level of THINKING_LEVELS) test('canonical thinking accepted: '+level,async()=>{
  assert.equal((await patch(req('PATCH',{thinkingOverride:level}),props())).status,200);
});
test('startup migrates historical task rows idempotently without changing their data',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clawtask-runtime-migrate-'));
  try {
    fs.mkdirSync(path.join(root,'.clawtask'));
    const file=path.join(root,'.clawtask','clawtask.db');const old=new Database(file);
    old.exec(fs.readFileSync('src/db/schema.sql','utf8').replace('  modelOverride TEXT,\n','').replace('  thinkingOverride TEXT,\n','').replace('  runtimeRevision INTEGER NOT NULL DEFAULT 0,\n','').replace('  runtimeSettings TEXT,\n','').replace('  runtimeSessionRevision TEXT,\n','').replace('  creationPending INTEGER NOT NULL DEFAULT 0,\n',''));
    old.prepare("INSERT INTO tasks(id,issueId,title) VALUES('old','OLD-001','Preserve me')").run();
    old.prepare("INSERT INTO task_dispatches(id,taskId,agentId,sessionKey,runId,state,attempts) VALUES('held','old','a','agent:test:clawtask:old','held','recovery',4)").run();
    old.prepare("INSERT INTO task_sessions(taskId,agentId,sessionKey,sessionId,cleanupAttempts,errorCode) VALUES('old','a','agent:test:clawtask:old','original',2,'preserved')").run();
    old.close();
    for(let n=0;n<2;n++) {
      const result=spawnSync(process.execPath,['--import','tsx','-e',"const {getDb}=require('./src/db/db.ts');const db=getDb();const row=db.prepare('SELECT * FROM tasks').get();if(row.title!=='Preserve me'||row.modelOverride!==null||row.thinkingOverride!==null||row.runtimeRevision!==0)process.exit(1);const held=db.prepare('SELECT * FROM task_dispatches').get();if(held.state!=='recovery'||held.runId!=='held'||held.attempts!==4||held.runtimeSettings!==null)process.exit(2);const s=db.prepare('SELECT * FROM task_sessions').get();if(s.sessionId!=='original'||s.creationPending!==0||s.cleanupAttempts!==2||s.errorCode!=='preserved')process.exit(3);db.close();"],{cwd:process.cwd(),env:{...process.env,HOME:root},encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
