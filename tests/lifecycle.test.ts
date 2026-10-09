import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunControl } from '../src/lib/run-control';
import { admitFollowup } from '../src/lib/run-store';
let db: Database.Database,root: string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'clawtask-run-'));db=new Database(path.join(root,'test.db'));db.pragma('foreign_keys=ON');db.exec(fs.readFileSync('src/db/schema.sql','utf8'));db.prepare('INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES(?,?,?,?)').run('a','test','Test','unused');task('t');});
afterEach(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
function task(id:string,status='in_progress'){db.prepare('INSERT INTO tasks(id,issueId,title,status,assigneeId,assigneeType) VALUES(?,?,?,?,?,?)').run(id,id.toUpperCase(),id,status,'a','agent');}
function status(id:string,value:string){db.prepare('UPDATE tasks SET status=? WHERE id=?').run(value,id);}
function follow(id:string,taskId='t'){db.transaction(()=>{db.prepare("INSERT INTO comments(id,taskId,authorId,authorType,content) VALUES(?,?,?,'human',?)").run(id,taskId,'h',id);admitFollowup(db,db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId),{id,content:id});})();}
function row(){return db.prepare('SELECT * FROM task_dispatches ORDER BY seq LIMIT 1').get() as any;}
function deferred(){let resolve!: (value:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {promise,resolve};}
function fake(){
 const conn:any={agentId:'a',openclawAgentId:'test',currentTaskId:null,currentRunId:null};let available=true;
 const calls:any[]=[];const sessions=new Map<string,any>();
 const get=(key:string)=>{if(!sessions.has(key))sessions.set(key,{key,sessionId:'session-'+key,hasActiveRun:false,archived:false});return sessions.get(key);};
 let handler: ((method:string,params:any)=>Promise<any>|any)|undefined;
 const request=async(_:any,method:string,params:any)=>{calls.push({method,params});if(handler){const value=await handler(method,params);if(value!==undefined)return value;}
  const session=get(params.key??'agent:test:clawtask:t');
  if(method==='sessions.describe')return {session:{...session}};
  if(method==='sessions.patch'){assert.equal(params.expectedSessionId,session.sessionId);session.archived=params.archived;return {ok:true,key:params.key,entry:{sessionId:session.sessionId,...params.archived?{archivedAt:123}:{}}};}
  if(method==='agent')return {runId:params.idempotencyKey,status:'accepted'};
  if(method==='agent.wait')return {runId:params.runId,status:'timeout'};
  throw Error('Unknown RPC '+method);
 };
 const create=()=>new RunControl(db,request,()=>available,(task,comment)=>comment?.id??task.id);
 return {conn,calls,get,create,setHandler:(fn:typeof handler)=>{handler=fn;},disconnect:()=>{available=false;},reconnect:()=>{available=true;},control:create()};
}
const sends=(f:ReturnType<typeof fake>)=>f.calls.filter(c=>c.method==='agent');
const patches=(f:ReturnType<typeof fake>)=>f.calls.filter(c=>c.method==='sessions.patch');

test('wait timeout keeps ownership, stable key, and uses three bounded waits',async()=>{const f=fake();await f.control.pump(f.conn);assert.equal(f.conn.currentTaskId,'t');assert.equal(f.conn.currentRunId,row().id);assert.equal(row().state,'recovery');assert.equal(sends(f).length,1);assert.equal(f.calls.filter(c=>c.method==='agent.wait').length,3);assert.equal(sends(f)[0].params.idempotencyKey,row().id);});
test('long run completes after timeout without duplicate dispatch',async()=>{const f=fake();let waits=0;f.setHandler((m,p)=>{if(m==='agent.wait' && ++waits===2){status('t','done');return {runId:p.runId,status:'ok',endedAt:123};}});await f.control.pump(f.conn);assert.equal(sends(f).length,1);assert.equal(row().state,'completed');assert.equal(f.conn.currentTaskId,null);assert.equal(patches(f).length,1);});
test('terminal run without task outcome is reported and not repeated',async()=>{const f=fake();f.setHandler((m,p)=>m==='agent.wait'?{runId:p.runId,status:'ok',endedAt:123}:undefined);await f.control.pump(f.conn);await f.control.pump(f.conn);assert.equal(row().state,'outcome_required');assert.equal(row().errorCode,'terminal_without_task_outcome');assert.equal(sends(f).length,1);});
test('busy agent retains two ordered followups on another task',async()=>{const f=fake();await f.control.pump(f.conn);task('other','done');follow('c1','other');follow('c2','other');await f.control.pump(f.conn);assert.equal(f.conn.currentTaskId,'t');assert.equal(sends(f).length,1);assert.deepEqual((db.prepare("SELECT commentId FROM task_dispatches WHERE state='pending' ORDER BY seq").all() as any[]).map(r=>r.commentId),['c1','c2']);});
test('followups share completion path, retain FIFO order, and release locks',async()=>{status('t','done');follow('c1');follow('c2');const f=fake();f.setHandler((m,p)=>{if(m==='agent.wait'){status('t','done');return {runId:p.runId,status:'ok',endedAt:123};}});await f.control.pump(f.conn);assert.deepEqual(sends(f).map(c=>c.params.message),['c1','c2']);assert.equal(f.conn.currentTaskId,null);assert.equal((db.prepare("SELECT count(*) n FROM task_dispatches WHERE state='completed'").get() as any).n,2);assert.equal(patches(f).length,1);});
test('unknown acceptance is persisted and restart never resubmits',async()=>{const f=fake();f.setHandler(m=>{if(m==='agent')throw Error('lost ack');});await f.control.pump(f.conn);const id=row().id;assert.equal(row().state,'recovery');f.setHandler(undefined);const restarted=f.create();f.conn.currentTaskId=null;f.conn.currentRunId=null;await restarted.pump(f.conn);assert.equal(row().id,id);assert.equal(sends(f).length,1);assert.equal(f.conn.currentRunId,id);});
test('restart recovers pending followups with their saved dispatch key',async()=>{status('t','done');follow('c');const id=row().id;const f=fake();await f.create().pump(f.conn);assert.equal(sends(f)[0].params.idempotencyKey,id);assert.equal(row().commentId,'c');});
test('connection loss retains ownership and reconnect waits for the same run',async()=>{const f=fake();f.setHandler(m=>{if(m==='agent.wait'){f.disconnect();throw Error('socket lost');}});await f.control.pump(f.conn);const id=row().runId;f.reconnect();f.setHandler(undefined);await f.control.pump(f.conn);assert.equal(row().runId,id);assert.equal(sends(f).length,1);});
test('wait recovery budget persists across notifications and restarts',async()=>{const f=fake();await f.control.pump(f.conn);await f.create().pump(f.conn);await f.create().pump(f.conn);assert.equal(row().attempts,6);assert.equal(row().errorCode,'recovery_required');assert.equal(sends(f).length,1);});
test('mismatched and yielded wait results cannot release ownership',async()=>{const f=fake();f.setHandler((m,p)=>m==='agent.wait'?{runId:p.runId,status:'ok',endedAt:123,yielded:true}:undefined);await f.control.pump(f.conn);assert.equal(row().state,'recovery');assert.equal(f.conn.currentTaskId,'t');});
test('blocked, backlog, done and archived tasks are excluded from initial queue',async()=>{status('t','blocked');task('b','backlog');task('d','done');task('x','archived');const f=fake();await f.control.pump(f.conn);assert.equal(sends(f).length,0);});
test('next queued task starts after terminal outcome',async()=>{task('other');const f=fake();f.setHandler((m,p)=>{if(m==='agent.wait'){status(f.conn.currentTaskId,'done');return {runId:p.runId,status:'ok',endedAt:123};}});await f.control.pump(f.conn);assert.equal(sends(f).length,2);assert.equal(f.conn.currentTaskId,null);});
test('done during active owned run cannot archive',async()=>{const f=fake();await f.control.pump(f.conn);status('t','done');f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.control.cleanup(f.conn,'t');assert.equal(patches(f).length,0);});
test('idle done schedules cleanup and repeated checks archive once',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.control.cleanup(f.conn,'t');await f.control.cleanup(f.conn,'t');assert.equal(patches(f).length,1);assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get('t') as any).status,'done');});
test('gateway active or queued state prevents idle cleanup',async()=>{status('t','done');const f=fake();f.get('agent:test:clawtask:t').hasActiveRun=true;f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.control.cleanup(f.conn,'t');assert.equal(patches(f).length,0);});
test('archive and restore preserve original identity and restore before dispatch',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.control.cleanup(f.conn,'t');follow('c');await f.control.pump(f.conn);const restore=f.calls.findIndex(c=>c.method==='sessions.patch' && !c.params.archived),send=f.calls.findIndex(c=>c.method==='agent');assert.ok(restore>=0 && restore<send);assert.equal(patches(f)[0].params.expectedSessionId,patches(f)[1].params.expectedSessionId);assert.equal(sends(f)[0].params.sessionKey,'agent:test:clawtask:t');});
test('restore failure keeps task done and pending followup, starts no run',async()=>{status('t','done');follow('c');const f=fake();f.get('agent:test:clawtask:t').archived=true;f.setHandler((m,p)=>{if(m==='sessions.patch' && !p.archived)throw Error('restore failed');});await f.control.pump(f.conn);assert.equal(sends(f).length,0);assert.equal(row().state,'pending');assert.equal((db.prepare('SELECT status FROM tasks WHERE id=?').get('t') as any).status,'done');});
test('missing session on followup is explicit recovery, never replacement creation',async()=>{status('t','done');follow('c');const f=fake();f.setHandler(m=>m==='sessions.describe'?{session:null}:undefined);await f.control.pump(f.conn);assert.equal(sends(f).length,0);assert.equal(row().errorCode,'restore_or_identity_failed');assert.equal(patches(f).length,0);});
test('changed session identity cannot mutate the replacement',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.control.cleanup(f.conn,'t');follow('c');f.get('agent:test:clawtask:t').sessionId='replacement';await f.control.pump(f.conn);assert.equal(sends(f).length,0);assert.equal(patches(f).length,1);assert.equal(row().state,'pending');});
test('comment during archive is retained and then restored before submission',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));f.setHandler((m,p)=>{if(m==='sessions.patch' && p.archived)follow('during');});await f.control.cleanup(f.conn,'t');assert.equal(row().state,'pending');await f.control.pump(f.conn);assert.equal(sends(f).length,1);assert.equal(patches(f)[1].params.archived,false);});
test('comment admitted during describe prevents archive',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));f.setHandler(m=>{if(m==='sessions.describe')follow('during');});await f.control.cleanup(f.conn,'t');assert.equal(patches(f).length,0);assert.equal(row().state,'pending');});
test('archive failure remains done and cleanup retries are bounded across restart',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));f.setHandler(m=>{if(m==='sessions.patch')throw Error('archive failed');});for(let i=0;i<5;i++)await f.create().cleanup(f.conn,'t');assert.equal(patches(f).length,3);const s=db.prepare('SELECT * FROM task_sessions').get() as any;assert.equal(s.cleanupPending,1);assert.equal(s.cleanupAttempts,3);assert.equal(s.errorCode,'archive_failed');});
test('cleanup restart only recovers tracked sessions, never historical done tasks',async()=>{status('t','done');task('historic','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await f.create().pump(f.conn);assert.equal(patches(f).length,1);assert.equal(patches(f)[0].params.key,'agent:test:clawtask:t');});
test('concurrent cleanup requests serialize to a single archive',async()=>{status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));await Promise.all([f.control.cleanup(f.conn,'t'),f.control.cleanup(f.conn,'t')]);assert.equal(patches(f).length,1);});
test('old wait callback cannot release a newer run owner',async()=>{const f=fake();const gate=deferred();f.setHandler((m,p)=>m==='agent.wait'?gate.promise:undefined);const pumping=f.control.pump(f.conn);while(!f.calls.some(c=>c.method==='agent.wait'))await new Promise(r=>setImmediate(r));f.conn.currentRunId='newer';gate.resolve({runId:row().runId,status:'ok',endedAt:123});await pumping;assert.equal(f.conn.currentRunId,'newer');assert.equal(row().state,'running');});
test('atomic followup admission rolls back comment if outbox cannot persist',()=>{db.exec('DROP TABLE task_dispatches');assert.throws(()=>follow('c'));assert.equal((db.prepare('SELECT count(*) n FROM comments').get() as any).n,0);});

test('concurrent admission during a queue-owned archive is woken after cleanup',async()=>{
 const f=fake();let injected=false;
 f.setHandler((m,p)=>{if(m==='agent.wait'){status('t','done');return {runId:p.runId,status:'ok',endedAt:123};}if(m==='sessions.patch' && p.archived && !injected){injected=true;follow('late');void f.control.pump(f.conn);}});
 await f.control.pump(f.conn);assert.deepEqual(sends(f).map(c=>c.params.message),['t','late']);assert.equal(row().state,'completed');assert.equal(f.conn.currentTaskId,null);
});
test('missing active-state contract is never interpreted as idle',async()=>{
 status('t','done');const f=fake();f.control.statusChanged(db.prepare('SELECT * FROM tasks WHERE id=?').get('t'));
 f.setHandler(m=>m==='sessions.describe'?{session:{sessionId:'s',archived:false}}:undefined);
 await f.control.cleanup(f.conn,'t');assert.equal(patches(f).length,0);assert.equal((db.prepare('SELECT * FROM task_sessions').get() as any).errorCode,'archive_failed');
});
test('uncertain accepted run cannot bind and archive a replacement identity',async()=>{
 const f=fake();f.setHandler(m=>{if(m==='sessions.describe')return {session:null};if(m==='agent')throw Error('lost acknowledgement');});
 await f.control.pump(f.conn);f.setHandler((m,p)=>{if(m==='agent.wait'){status('t','done');return {runId:p.runId,status:'ok',endedAt:123};}});
 await f.create().pump(f.conn);assert.equal(patches(f).length,0);assert.equal((db.prepare('SELECT * FROM task_sessions').get() as any).sessionId,null);assert.equal(sends(f).length,1);
});
test('wait for a different run ID cannot release task ownership',async()=>{
 const f=fake();f.setHandler(m=>m==='agent.wait'?{runId:'other',status:'ok',endedAt:123}:undefined);await f.control.pump(f.conn);assert.equal(row().state,'recovery');assert.equal(f.conn.currentRunId,row().runId);
});

test('submission carries backend expectedExistingSessionId after restore',async()=>{status('t','done');follow('c');const f=fake();f.get('agent:test:clawtask:t').archived=true;await f.control.pump(f.conn);assert.equal(sends(f)[0].params.expectedExistingSessionId,f.get('agent:test:clawtask:t').sessionId);});
test('another task followups start only after the active task releases its owner',async()=>{
 const f=fake();task('other','done');const gate=deferred();let first=true;
 f.setHandler((m,p)=>{if(m==='agent.wait'){if(first){first=false;return gate.promise;}status('other','done');return {runId:p.runId,status:'ok',endedAt:123};}});
 const running=f.control.pump(f.conn);while(!f.calls.some(c=>c.method==='agent.wait'))await new Promise(r=>setImmediate(r));
 follow('c1','other');follow('c2','other');await f.control.pump(f.conn);assert.equal(f.conn.currentTaskId,'t');assert.equal(sends(f).length,1);
 status('t','done');gate.resolve({runId:row().runId,status:'ok',endedAt:123});await running;assert.deepEqual(sends(f).map(c=>c.params.message),['t','c1','c2']);assert.equal(f.conn.currentTaskId,null);
});
