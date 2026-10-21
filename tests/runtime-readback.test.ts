import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareTaskRuntime } from '../src/lib/runtime-control';

const key='agent:synthetic:clawtask:synthetic';
// Synthetic wire shapes derived from immutable OpenClaw .5 projectSessionPatchResult
// and buildGatewaySessionRow (.4 intentionally omits the describe revision).
function fixture(settings={modelOverride:null as string|null,thinkingOverride:null as string|null}) {
 let session:any={key,sessionId:'original',lifecycleRevision:'r1',archived:false,status:'done'};
 let receipt:any;
 let after=false;
 const calls:any[]=[];
 let change:(s:any,r:any)=>void=()=>{};
 const request=async(method:string,p:any)=>{
  calls.push({method,p});
  if(method==='sessions.describe')return {session:structuredClone(session)};
  assert.equal(method,'sessions.patch');assert.equal(p.expectedSessionId,'original');assert.equal(p.expectedLifecycleRevision,'r1');
  session={...session,modelProvider:'test',model:'model',modelOverrideSource:settings.modelOverride===null?null:'user',agentRuntime:{id:'openclaw'},thinkingLevel:settings.thinkingOverride??undefined,thinkingDefault:'medium',thinkingLevels:[{id:'off'},{id:'medium'},{id:'high'}]};
  receipt={ok:true,key,entry:{sessionId:'original',lifecycleRevision:'r1',modelOverrideSource:settings.modelOverride===null?'default':'user',thinkingLevel:settings.thinkingOverride??undefined},resolved:{modelProvider:'test',model:'model',agentRuntime:{id:'openclaw'},thinkingLevel:settings.thinkingOverride??'medium',thinkingLevels:session.thinkingLevels}};
  after=true;change(session,receipt);return receipt;
 };
 return {calls,setChange:(f:typeof change)=>{change=f;},run:()=>prepareTaskRuntime(request,{sessionKey:key,agentId:'synthetic',dispatchId:'d',session},settings),get after(){return after;}};
}
for(const modelOverride of [null,'test/model'])for(const thinkingOverride of [null,'high'])test('optional patch thinking uses exact supported describe: '+JSON.stringify({modelOverride,thinkingOverride}),async()=>{
 const f=fixture({modelOverride,thinkingOverride});f.setChange((s,r)=>{delete r.resolved.thinkingLevel;delete r.resolved.thinkingLevels;});const s=await f.run();assert.equal(s.thinkingLevel??s.thinkingDefault,thinkingOverride??'medium');assert.equal(s.lifecycleRevision,'r1');assert.deepEqual(f.calls.map(c=>c.method),['sessions.describe','sessions.patch','sessions.describe']);
});
const failures:[string,(s:any,r:any)=>void,RegExp][]=[
 ['missing receipt revision',(_,r)=>{delete r.entry.lifecycleRevision;},/runtime_lifecycle_unverified/],
 ['empty receipt revision',(_,r)=>{r.entry.lifecycleRevision='';},/runtime_lifecycle_unverified/],
 ['.4 missing readback revision',s=>{delete s.lifecycleRevision;},/runtime_lifecycle_unverified/],
 ['null readback revision',s=>{s.lifecycleRevision=null;},/runtime_lifecycle_unverified/],
 ['changed readback revision',s=>{s.lifecycleRevision='r2';},/runtime_lifecycle_changed/],
 ['changed receipt revision',(_,r)=>{r.entry.lifecycleRevision='r2';},/runtime_lifecycle_changed/],
 ['missing supported levels',s=>{delete s.thinkingLevels;},/runtime_thinking_unverified/],
 ['empty supported levels',s=>{s.thinkingLevels=[];},/runtime_thinking_unverified/],
 ['unsupported effective thinking',s=>{s.thinkingLevels=[{id:'high'}];},/runtime_thinking_unverified/],
 ['unknown effective thinking',s=>{s.thinkingDefault='future';s.thinkingLevels=[{id:'future'}];},/runtime_thinking_unverified/],
 ['malformed supported levels',s=>{s.thinkingLevels=['medium'];},/runtime_thinking_unverified/],
 ['conflicting supplied receipt thinking',(_,r)=>{r.resolved.thinkingLevel='high';},/runtime_thinking_unverified/],
 ['null supplied receipt thinking',(_,r)=>{r.resolved.thinkingLevel=null;},/runtime_thinking_unverified/],
 ['unsupported supplied receipt levels',(_,r)=>{r.resolved.thinkingLevels=[{id:'high'}];},/runtime_thinking_unverified/],
 ['canonical runtime mismatch',s=>{s.agentRuntime={id:'acp'};},/runtime_readback_mismatch/],
 ['unknown runtime agreement',(s,r)=>{s.agentRuntime=r.resolved.agentRuntime={id:'future'};},/runtime_patch_unconfirmed/],
 ['noncanonical model agreement',(s,r)=>{s.model=r.resolved.model='bad model';},/runtime_patch_unconfirmed/],
 ['clear not committed',(_,r)=>{r.entry.thinkingLevel='low';},/runtime_default_unconfirmed/],
];
for(const [label,change,error]of failures)test('readback rejects '+label,async()=>{const f=fixture();f.setChange(change);await assert.rejects(f.run,error);assert.equal(f.calls.some(c=>c.method==='agent'),false);});
test('supplied consistent optional thinking metadata is accepted',async()=>{const f=fixture();f.setChange((s,r)=>{r.resolved.thinkingLevel='medium';r.resolved.thinkingLevels=s.thinkingLevels;});await f.run();});

for(const status of ['done','failed','interrupted','killed','timeout'])test('supported terminal status-only idle: '+status,async()=>{const f=fixture();f.setChange(s=>{s.status=status;});await f.run();});
for(const evidence of [{status:'running'},{status:'queued'},{status:'unknown'},{status:undefined},{status:'done',hasActiveRun:true},{status:'running',hasActiveRun:false},{status:'done',hasActiveRun:'false'}])test('reject invalid/busy activity '+JSON.stringify(evidence),async()=>{const f=fixture();f.setChange(s=>Object.assign(s,evidence));await assert.rejects(f.run,/runtime_identity_or_activity/);});

test('compact row is not a full describe proof',async()=>{const f=fixture();f.setChange(s=>{s.rowMode='compact';});await assert.rejects(f.run,/runtime_identity_or_activity/);});
test('explicit raw receipt thinking must agree even with consistent describe',async()=>{const f=fixture({modelOverride:null,thinkingOverride:'high'});f.setChange((s,r)=>{r.entry.thinkingLevel='low';});await assert.rejects(f.run,/runtime_readback_mismatch/);});
