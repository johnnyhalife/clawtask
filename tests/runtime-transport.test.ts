import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { AdapterService } from '../src/lib/adapter';

const key='agent:test:clawtask:synthetic';
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
const raw=(publicKey.export({type:'spki',format:'der'}) as Buffer).subarray(-32);
const identity={deviceId:crypto.createHash('sha256').update(raw).digest('hex'),publicKeyRawBase64Url:raw.toString('base64url'),privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}).toString()};
async function fixture(mode='ok',scope='global'){
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await once(server,'listening');
 const calls:any[]=[];const globals={model:'global/original'};const ts=123456789;
 let session:any={key,sessionId:'original',lifecycleRevision:'r1',archived:false,status:'done',modelProvider:'default',model:'agent-model',modelOverrideSource:null,thinkingDefault:'medium',thinkingLevels:[{id:'high'},{id:'medium'}],agentRuntime:{id:'openclaw'}};
 const adapter:any=Object.create(AdapterService.prototype);
 const conn:any={agentId:'a',openclawAgentId:'test',generation:1,handshakeDone:true};
 adapter.connections=new Map([['a',conn]]);adapter.deviceIdentity=identity;adapter.gatewayAuthToken='***';adapter.gatewayUrl='ws://127.0.0.1:'+(server.address() as any).port;
 adapter.autoPairDevice=()=>{throw Error('MUST NOT PAIR');};
 server.on('connection',socket=>{
  let granted:string[]=[];
  socket.on('message',async data=>{
   const frame=JSON.parse(data.toString());calls.push(frame);const p=frame.params;
   let result:any;
   if(frame.method==='connect'){
    assert.deepEqual(p.scopes,['operator.write']);assert.equal(p.client.mode,'backend');assert.equal(p.device.signedAt,ts);assert.equal(p.minProtocol,4);assert.equal(p.maxProtocol,4);
    const signed=['v3',identity.deviceId,p.client.id,p.client.mode,p.role,p.scopes.join(','),String(ts),p.auth.token,'nonce',p.client.platform,''].join('|');
    assert.equal(crypto.verify(null,Buffer.from(signed),publicKey,Buffer.from(p.device.signature,'base64url')),true);
    // This is the actual authority used by the fake server for subsequent mutations.
    granted=[...p.scopes];
    if(mode==='reject'){socket.send(JSON.stringify({type:'res',id:frame.id,ok:false,error:{message:'pairing required'}}));return;}
    result={type:'hello-ok',protocol:4,server:{version:mode==='version3'?'2026.10.3':mode==='version4'?'2026.10.4':mode==='future-version'?'2026.10.6':'2026.10.5',buildId:'synthetic-build',connId:'synthetic'},features:{methods:['sessions.create','sessions.describe','sessions.patch','agent']},auth:{role:'operator',scopes:mode==='admin-response'?['operator.admin']:mode==='missing-write'?[]:granted}};
   if(mode==='missing-server')delete result.server;
    if(mode==='missing-methods')delete result.features;
    if(mode==='missing-patch')result.features.methods=result.features.methods.filter((m:string)=>m!=='sessions.patch');
    if(mode==='empty-build')result.server.buildId='';
   }else if(frame.method==='sessions.create'){
    assert.equal(mode,'dispatch-create');assert.equal(session,null);assert.equal(p.message,undefined);assert.equal(p.task,undefined);
    assert.equal((globalThis.__clawtask_db!.prepare('SELECT creationPending FROM task_sessions').get() as any).creationPending,1);
    session={key,sessionId:'original',lifecycleRevision:'r1',archived:false,status:'done',agentRuntime:{id:'openclaw'},thinkingLevels:[{id:'high'}]};
    result={ok:true,key,sessionId:'original',runStarted:false};
   }else if(frame.method==='sessions.describe'){
    if(mode==='dispatch-create' && globalThis.__clawtask_db)assert.equal((globalThis.__clawtask_db.prepare('SELECT sessionId FROM task_sessions').get() as any).sessionId,'original');
    if(mode==='close'){socket.close();return;}
    result={session};
   }else if(frame.method==='sessions.patch'){
    // Match the installed structural sticky policy: only ACTUAL admin authority can persist config.
    if(granted.includes('operator.admin')&&scope!=='session'&&typeof p.model==='string')globals.model=p.model;
    assert.equal(p.expectedSessionId,'original');assert.deepEqual(Object.keys(p).sort(),['agentId','expectedSessionId','expectedLifecycleRevision','key','model','thinkingLevel'].sort());
    session={...session,modelProvider:'test',model:'model',modelOverrideSource:'user',thinkingLevel:'high'};
    result={ok:true,key,entry:{sessionId:'original',lifecycleRevision:'r1',modelOverrideSource:'user',thinkingLevel:'high'},resolved:{modelProvider:'test',model:'model',agentRuntime:{id:'openclaw'}}};
    if(mode==='stale')conn.generation++;
   }else throw Error(frame.method);
   socket.send(JSON.stringify({type:'res',id:frame.id,ok:true,payload:result}));
  });
  socket.send(JSON.stringify({type:'event',event:'connect.challenge',payload:mode==='invalid-challenge'?{nonce:'nonce',ts:'bad'}:{nonce:'nonce',ts}}));
 });
 try{
  const operation=adapter.prepareRuntime(conn,{id:'dispatch',sessionKey:key},session,{modelOverride:'test/model',thinkingOverride:'high'});
  if(mode==='ok' || mode==='dispatch' || mode==='dispatch-create')assert.equal((await operation).model,'model');else await assert.rejects(operation);
  assert.equal(globals.model,'global/original');
  assert.equal(calls.some(c=>c.method.startsWith('device.')||c.method==='agent'),false);
  if(['admin-response','missing-write','reject','invalid-challenge','version3','version4','future-version','missing-server','missing-methods','missing-patch','empty-build'].includes(mode))assert.equal(calls.filter(c=>c.method==='sessions.patch').length,0);
  if(mode==='dispatch' || mode==='dispatch-create'){
   const db=new Database(':memory:');db.exec(fs.readFileSync('src/db/schema.sql','utf8'));
   db.prepare("INSERT INTO agents(id,openclawAgentId,displayName,apiKeyHash) VALUES('a','test','Test','unused')").run();
   db.prepare("INSERT INTO tasks(id,issueId,title,status,assigneeId,assigneeType,modelOverride,thinkingOverride) VALUES('synthetic','TEST-001','Synthetic','todo','a','agent','test/model','high')").run();
   globalThis.__clawtask_db=db;conn.ws={readyState:1};conn.currentTaskId=null;conn.currentRunId=null;
   if(mode==='dispatch-create')session=null;
   adapter.buildMessage=()=> 'synthetic';let submissions=0;
   adapter.sendReq=async(_:any,method:string,p:any)=>{
    if(method==='sessions.describe')return {session};
    if(method==='agent'){
     submissions++;assert.equal(session.model,'model');assert.equal(session.thinkingLevel,'high');assert.equal(p.expectedExistingSessionId,'original');
     assert.equal(calls.filter(c=>c.method==='sessions.patch').length,2);
     return {runId:p.idempotencyKey};
    }
    if(method==='agent.wait'){
     db.prepare("UPDATE tasks SET status='blocked',assigneeId=NULL,assigneeType=NULL").run();return {runId:p.runId,status:'ok',endedAt:123};
    }
    throw Error('Admin runtime patch forbidden: '+method);
   };
   try{await adapter.control().pump(conn);await adapter.control().pump(conn);assert.equal(submissions,1);assert.equal((db.prepare('SELECT state FROM task_dispatches').get() as any).state,'completed');}
   finally{globalThis.__clawtask_db=undefined;db.close();}
  }
  return calls;
 } finally {for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
for(const scope of ['session','agent','global'])test('signed non-admin runtime authority cannot persist '+scope+' defaults',async()=>{
 const calls=await fixture('ok',scope);assert.equal(calls.filter(c=>c.method==='sessions.patch').length,1);assert.equal(calls.filter(c=>c.method==='connect').length,1);
});
test('adapter admission uses actual narrowed socket before its single admin run submission',async()=>{await fixture('dispatch');});
test('adapter persists verified initial creation over signed socket before describe and submission',async()=>{await fixture('dispatch-create');});
for(const mode of ['admin-response','missing-write','reject','invalid-challenge','close','stale','version3','version4','future-version','missing-server','missing-methods','missing-patch','empty-build'])test('runtime transport fail closed: '+mode,async()=>{await fixture(mode);});
