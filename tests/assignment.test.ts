import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { RunControl } from '../src/lib/run-control';
import { AdapterService } from '../src/lib/adapter';
import { POST as assign } from '../src/app/api/v1/tasks/[id]/assign/route';
import { PATCH as patch } from '../src/app/api/v1/tasks/[id]/route';
import { POST as comment } from '../src/app/api/v1/tasks/[id]/comments/route';
import { assignmentTransaction } from '../src/lib/run-store';
import { POST as createTask } from '../src/app/api/v1/tasks/route';
import { POST as createSubtask } from '../src/app/api/v1/tasks/[id]/subtasks/route';
import { PATCH as patchSubtask } from '../src/app/api/v1/tasks/[id]/subtasks/[subId]/route';
import { POST as status } from '../src/app/api/v1/tasks/[id]/status/route';

let db: Database.Database, root: string;
beforeEach(()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'clawtask-assignment-'));
 db=new Database(path.join(root,'test.db'));db.pragma('foreign_keys=ON');db.exec(fs.readFileSync('src/db/schema.sql','utf8'));
 db.prepare('INSERT INTO humans(id,name,displayName) VALUES(?,?,?)').run('h','human','Human');
 db.prepare('INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES(?,?,?,?)').run('a','test','Test','unused');
 db.prepare("INSERT INTO tasks(id,issueId,title,description,status,assigneeId,assigneeType) VALUES('t','TEST-001','Test','Only report blocked','todo','a','agent')").run();
 globalThis.__clawtask_db=db;
 globalThis.__clawtask_adapter={assignTaskToAgent:async()=>{},notifyTaskState:async()=>{},notifyHumanComment:async()=>{}} as any;
 process.env.CLAWTASK_UI_TOKEN='isolated-human-token';
});
afterEach(()=>{globalThis.__clawtask_db=undefined;globalThis.__clawtask_adapter=undefined;delete process.env.CLAWTASK_UI_TOKEN;db.close();fs.rmSync(root,{recursive:true,force:true});});
function req(method:string,body:any){return new NextRequest('http://localhost/api',{method,headers:{Authorization:'Bearer '+process.env.CLAWTASK_UI_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)});}
const props=()=>({params:Promise.resolve({id:'t'})});
function gateway(){
 const conn:any={agentId:'a',openclawAgentId:'test',currentTaskId:null,currentRunId:null};const calls:any[]=[];
 const adapter:any=Object.create(AdapterService.prototype);
 const control=new RunControl(db,async(_,method,p)=>{
  calls.push({method,p});
  if(method==='sessions.describe')return {session:{sessionId:'original-session',hasActiveRun:false,archived:false}};
  if(method==='agent')return {runId:p.idempotencyKey};
  if(method==='agent.wait'){
   await status(req('POST',{status:calls.filter(c=>c.method==='agent').length===1?'blocked':'done'}),props());
   return {runId:p.runId,status:'ok',endedAt:123};
  }
  if(method==='sessions.patch')return {ok:true,entry:{sessionId:'original-session',archivedAt:123}};
  throw Error(method);
 },()=>true,(task,c,connection)=>adapter.buildMessage(connection,task,c),()=>{},async(_conn,_row,session)=>session);
 return {control,conn,calls};
}
for(const route of ['assign','patch'])test(route+' resumes exact blocked/unassigned/comment/todo/reassign flow',async()=>{
 const f=gateway();await f.control.pump(f.conn);
 const blocked=db.prepare('SELECT * FROM tasks WHERE id=?').get('t') as any;assert.equal(blocked.status,'blocked');assert.equal(blocked.assigneeId,null);
 const response=await comment(req('POST',{content:'Now unblocked. Mark done.'}),props());assert.equal(response.status,201);
 const c=(await response.json()).data;
 assert.equal((db.prepare('SELECT count(*) n FROM task_dispatches').get() as any).n,1);
 await patch(req('PATCH',{status:'todo'}),props());
 const assigned=route==='assign'?await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props()):await patch(req('PATCH',{assigneeId:'a',assigneeType:'agent'}),props());
 assert.equal(assigned.status,200);
 const pending=db.prepare("SELECT * FROM task_dispatches WHERE state='pending'").get() as any;
 assert.ok(pending,'explicit reassignment must save a new pending dispatch');assert.equal(pending.commentId,c.id);
 await f.control.pump(f.conn);
 const sends=f.calls.filter(c=>c.method==='agent');assert.equal(sends.length,2);assert.match(sends[1].p.message,/Now unblocked. Mark done./);
 assert.equal(sends[1].p.expectedExistingSessionId,'original-session');assert.equal(sends[1].p.sessionKey,sends[0].p.sessionKey);
});

function dispatch(state:string,taskId='t',id='saved'){
 db.prepare('INSERT INTO task_dispatches(id,taskId,agentId,sessionKey,runId,state) VALUES(?,?,?,?,?,?)').run(id,taskId,'a','agent:test:clawtask:'+taskId,state==='pending'?null:id,state);
}
for(const route of ['assign','patch'])for(const state of ['pending','submitting','running','recovery','outcome_required'])test(route+' preserves '+state+' work on repeated assignment',async()=>{
 dispatch(state);
 const res=route==='assign'?await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props()):await patch(req('PATCH',{assigneeId:'a',assigneeType:'agent'}),props());
 assert.equal(res.status,['recovery','outcome_required'].includes(state)?409:200);
 assert.equal((db.prepare('SELECT count(*) n FROM task_dispatches').get() as any).n,1);
 assert.equal((db.prepare('SELECT state FROM task_dispatches').get() as any).state,state);
});
for(const route of ['assign','patch'])test(route+' cannot replace another agent owner and rolls back assignment',async()=>{
 dispatch('running');db.prepare('INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES(?,?,?,?)').run('b','other','Other','unused');
 const res=route==='assign'?await assign(req('POST',{assigneeId:'b',assigneeType:'agent'}),props()):await patch(req('PATCH',{title:'must rollback',assigneeId:'b',assigneeType:'agent'}),props());
 assert.equal(res.status,409);const t=db.prepare('SELECT * FROM tasks').get() as any;assert.equal(t.assigneeId,'a');assert.equal(t.title,'Test');assert.equal((db.prepare('SELECT count(*) n FROM activity').get() as any).n,0);
});
test('new assignment waits behind another task owner, then uses its saved dispatch',async()=>{
 db.prepare("INSERT INTO tasks(id,issueId,title,status,assigneeId,assigneeType) VALUES('other','OTHER-001','Other','todo','a','agent')").run();
 dispatch('running','other','other-run');db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();
 await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props());
 const pending=db.prepare("SELECT * FROM task_dispatches WHERE state='pending'").get() as any;assert.ok(pending);
 let finish=false;const calls:any[]=[];const conn:any={agentId:'a',openclawAgentId:'test',currentTaskId:'other',currentRunId:'other-run'};
 const control=new RunControl(db,async(_,m,p)=>{calls.push({m,p});if(m==='agent.wait'){if(!finish)return {runId:p.runId,status:'timeout'};db.prepare("UPDATE tasks SET status='blocked',assigneeId=NULL,assigneeType=NULL WHERE id=?").run(conn.currentTaskId);return {runId:p.runId,status:'ok',endedAt:123};}if(m==='sessions.describe')return {session:{sessionId:'saved-session',archived:false,hasActiveRun:false}};if(m==='agent')return {runId:p.idempotencyKey};throw Error(m);},()=>true,()=> 'task',()=>{},async(_conn,_row,session)=>session);
 await control.pump(conn);assert.equal(conn.currentTaskId,'other');assert.equal(calls.filter(c=>c.m==='agent').length,0);
 finish=true;await control.pump(conn);assert.equal(calls.filter(c=>c.m==='agent').length,1);assert.equal(calls.find(c=>c.m==='agent').p.idempotencyKey,pending.id);
});
test('automatic polling never repeats completed blocked work even after status-only todo',async()=>{
 const f=gateway();await f.control.pump(f.conn);await patch(req('PATCH',{status:'todo'}),props());
 // Simulate legacy assignment without explicit admission. Historical guard remains.
 db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run();
 await f.control.pump(f.conn);assert.equal(f.calls.filter(c=>c.method==='agent').length,1);
});
test('outbox failure rolls back assignment update',()=>{
 db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();db.exec('DROP TABLE task_dispatches');
 assert.throws(()=>assignmentTransaction(db,'t',true,()=>db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run()));
 assert.equal((db.prepare('SELECT assigneeId FROM tasks').get() as any).assigneeId,null);
});
test('latest unused human comment wins over older human and agent comments',()=>{
 dispatch('completed');db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();
 for(const [id,type,content] of [['old','human','old'],['new','human','override'],['agent','agent','blocked again'],['empty','human','   ']])db.prepare('INSERT INTO comments(id,taskId,authorId,authorType,content) VALUES(?,?,?,?,?)').run(id,'t','h',type,content);
 assignmentTransaction(db,'t',true,()=>db.prepare("UPDATE tasks SET assigneeId='a',assigneeType='agent' WHERE id='t'").run());
 assert.equal((db.prepare("SELECT commentId FROM task_dispatches WHERE state='pending'").get() as any).commentId,'new');
});
test('original session cannot move to another agent after completed run',async()=>{
 dispatch('completed');db.prepare("INSERT INTO task_sessions(taskId,agentId,sessionKey,sessionId) VALUES('t','a','agent:test:clawtask:t','original')").run();db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();
 db.prepare('INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES(?,?,?,?)').run('b','other','Other','unused');
 const res=await assign(req('POST',{assigneeId:'b',assigneeType:'agent'}),props());assert.equal(res.status,409);assert.equal((db.prepare('SELECT assigneeId FROM tasks').get() as any).assigneeId,null);
});
test('subtask PATCH saves explicit reassignment',async()=>{
 dispatch('completed');db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL,parentTaskId='parent' WHERE id='t'").run();
 const res=await patchSubtask(req('PATCH',{assigneeId:'a',assigneeType:'agent'}),{params:Promise.resolve({id:'parent',subId:'t'})});assert.equal(res.status,200);assert.ok(db.prepare("SELECT 1 FROM task_dispatches WHERE state='pending'").get());
});
for(const kind of ['task','subtask'])test(kind+' creation saves initial assigned dispatch',async()=>{
 db.prepare("INSERT INTO config(key,value) VALUES('issueCounter','10')").run();
 const body={title:'Created',status:'todo',assigneeId:'a',assigneeType:'agent'};
 const res=kind==='task'?await createTask(req('POST',body)):await createSubtask(req('POST',body),props());assert.equal(res.status,201);
 const t=(await res.json()).data;assert.equal((db.prepare('SELECT state FROM task_dispatches WHERE taskId=?').get(t.id) as any).state,'pending');
});
test('assignment POST leaves blocked task unassigned',async()=>{
 db.prepare("UPDATE tasks SET status='blocked',assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();const res=await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props());assert.equal(res.status,409);assert.equal((db.prepare('SELECT assigneeId FROM tasks').get() as any).assigneeId,null);
});

for(const kind of ['task','subtask'])test(kind+' blocked creation clears inherited or explicit assignment',async()=>{
 db.prepare("INSERT INTO config(key,value) VALUES('issueCounter','10')").run();
 const body={title:'Blocked',status:'blocked',assigneeId:'a',assigneeType:'agent'};
 const res=kind==='task'?await createTask(req('POST',body)):await createSubtask(req('POST',body),props());assert.equal(res.status,201);
 const t=(await res.json()).data;assert.equal(t.assigneeId,null);assert.equal(t.assigneeType,null);assert.equal((db.prepare('SELECT count(*) n FROM task_dispatches').get() as any).n,0);
});
test('repeated identical assignment after completed work does not start a new attempt',async()=>{
 dispatch('completed');await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props());await patch(req('PATCH',{assigneeId:'a',assigneeType:'agent'}),props());
 assert.equal((db.prepare('SELECT count(*) n FROM task_dispatches').get() as any).n,1);
});
for(const route of ['assign','patch'])test(route+' outbox insert failure rolls back assignment through API',async()=>{
 db.prepare("UPDATE tasks SET assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();
 db.exec("CREATE TRIGGER reject_dispatch BEFORE INSERT ON task_dispatches BEGIN SELECT RAISE(ABORT,'test storage failure'); END");
 await assert.rejects(()=>route==='assign'?assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props()):patch(req('PATCH',{assigneeId:'a',assigneeType:'agent'}),props()),/test storage failure/);
 assert.equal((db.prepare('SELECT assigneeId FROM tasks').get() as any).assigneeId,null);assert.equal((db.prepare('SELECT count(*) n FROM task_dispatches').get() as any).n,0);
});
test('blocked run still awaiting recovery cannot be reassigned after status-only todo',async()=>{
 dispatch('recovery');db.prepare("UPDATE tasks SET status='blocked',assigneeId=NULL,assigneeType=NULL WHERE id='t'").run();
 await patch(req('PATCH',{status:'todo'}),props());const res=await assign(req('POST',{assigneeId:'a',assigneeType:'agent'}),props());assert.equal(res.status,409);
 assert.equal((db.prepare('SELECT assigneeId FROM tasks').get() as any).assigneeId,null);assert.equal((db.prepare('SELECT state FROM task_dispatches').get() as any).state,'recovery');
});
