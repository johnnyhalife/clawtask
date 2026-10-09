import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { hashApiKey } from '../src/lib/auth';
import { AdapterService } from '../src/lib/adapter';
import { POST as postComment } from '../src/app/api/v1/tasks/[id]/comments/route';
import { POST as postStatus } from '../src/app/api/v1/tasks/[id]/status/route';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawtask-unit-'));
const db = new Database(path.join(root, 'test.db'));
const events: any[] = [];
const agentKey = 'local-test-agent-key';
let adapter: any;
const conn: any = { agentId: 'agent-test', currentTaskId: 'task-test', currentRunId: 'run-test', pending: new Map() };

before(async () => {
  db.exec(fs.readFileSync(path.resolve('src/db/schema.sql'), 'utf8'));
  db.prepare('INSERT INTO agents (id,openclawAgentId,displayName,apiKeyHash,apiKey) VALUES (?,?,?,?,?)')
    .run('agent-test','test','Test agent',await hashApiKey(agentKey),agentKey);
  db.prepare('INSERT INTO tasks (id,issueId,title,status,assigneeId,assigneeType) VALUES (?,?,?,?,?,?)')
    .run('task-test','TEST-001','Test task','in_progress','agent-test','agent');
  globalThis.__clawtask_db = db;
  globalThis.__clawtask_sse_writers = new Set([event => events.push(event)]);
  // Test frame handling without constructor side effects or a real connection.
  adapter = Object.create(AdapterService.prototype);
});

after(() => {
  globalThis.__clawtask_db = undefined;
  globalThis.__clawtask_sse_writers = undefined;
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('socket assistant text, deltas, duplicate frames and NO_REPLY create no comments', () => {
  for (const data of [{text:'Gateway text.'},{delta:'Chunk.'},{text:'NO_REPLY'}]) {
    const frame = JSON.stringify({type:'event',event:'agent',payload:{runId:'run-test',stream:'assistant',data}});
    adapter.handleFrame(conn, frame);
    adapter.handleFrame(conn, frame);
  }
  assert.equal((db.prepare('SELECT count(*) n FROM comments').get() as any).n, 0);
  assert.equal(events.filter(e => e.type.startsWith('comment.')).length, 0);
});

test('API agent comment creates one row, activity and comment event', async () => {
  const response = await postComment(new NextRequest('http://localhost/api/v1/tasks/task-test/comments', {
    method:'POST', headers:{Authorization:'Bearer '+agentKey,'Content-Type':'application/json'},
    body:JSON.stringify({content:'API result.'})
  }), {params:Promise.resolve({id:'task-test'})});
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.data.authorType, 'agent');
  assert.equal((db.prepare('SELECT count(*) n FROM comments').get() as any).n, 1);
  assert.equal((db.prepare("SELECT count(*) n FROM activity WHERE verb='commented'").get() as any).n, 1);
  assert.equal(events.filter(e => e.type === 'comment.added').length, 1);
});

test('September 10 status fix clears both assignee fields on blocked', async () => {
  const response = await postStatus(new NextRequest('http://localhost/api/v1/tasks/task-test/status', {
    method:'POST',headers:{Authorization:'Bearer '+agentKey,'Content-Type':'application/json'},
    body:JSON.stringify({status:'blocked'})
  }), {params:Promise.resolve({id:'task-test'})});
  assert.equal(response.status, 200);
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get('task-test') as any;
  assert.equal(task.status, 'blocked');
  assert.equal(task.assigneeId, null);
  assert.equal(task.assigneeType, null);
});

test('gateway response resolves the matching request without comment writes', () => {
  let payload: unknown;
  const timer = setTimeout(() => {}, 1000);
  conn.pending.set('request-test',{timer,resolve:(value:unknown)=>{payload=value},reject:()=>assert.fail('unexpected rejection')});
  adapter.handleFrame(conn, JSON.stringify({type:'res',id:'request-test',ok:true,payload:{status:'ok'}}));
  assert.deepEqual(payload,{status:'ok'});
  assert.equal(conn.pending.size,0);
});
