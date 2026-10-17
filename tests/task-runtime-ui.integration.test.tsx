import './dom-setup';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { render, cleanup, fireEvent, within, act } from '@testing-library/react';
import { TaskRuntimeSettings } from '../src/components/task/TaskRuntimeSettings';

afterEach(()=>{cleanup();delete (globalThis as any).fetch;});
const q=()=>within(document.body);
function Harness(){
  const [task,setTask]=useState({id:'synthetic',modelOverride:'test/model' as string|null,thinkingOverride:'high' as string|null});
  return <TaskRuntimeSettings task={task} onSaved={()=>setTask({id:'synthetic',modelOverride:null,thinkingOverride:null})}/>;
}
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve();});}
test('runtime clear sends explicit null, disables pending, shows rejection without claiming persistence, then retries',async()=>{
  let release!:(value:any)=>void;const requests:any[]=[];
  (globalThis as any).fetch=async(url:string,init:any)=>{
    if(url==='/api/v1/auth/token')return {json:async()=>({ok:true,data:{token:'synthetic'}})};
    requests.push(JSON.parse(init.body));return new Promise(resolve=>{release=resolve;});
  };
  render(<Harness/>);fireEvent.click(q().getByRole('button',{name:'Edit runtime'}));
  fireEvent.change(q().getByLabelText('Model mode'),{target:{value:'default'}});
  fireEvent.change(q().getByLabelText('Thinking override'),{target:{value:''}});
  fireEvent.click(q().getByRole('button',{name:'Save runtime'}));await flush();
  assert.deepEqual(requests,[{modelOverride:null,thinkingOverride:null}]);
  assert.equal((q().getByRole('button',{name:'Saving…'}) as HTMLButtonElement).disabled,true);
  await act(async()=>release({json:async()=>({ok:false,error:{code:'CONFLICT',message:'Not saved'}})}));
  assert.equal(q().getByRole('alert').textContent,'Not saved');
  assert.match(q().getByLabelText('Task runtime settings').textContent!,/Model: test\/model · Thinking: high/);
  fireEvent.click(q().getByRole('button',{name:'Save runtime'}));await flush();
  await act(async()=>release({json:async()=>({ok:true,data:{}})}));
  assert.match(q().getByLabelText('Task runtime settings').textContent!,/Model: Default · Thinking: Default/);
  assert.equal(q().queryByRole('alert'),null);assert.equal(requests.length,2);
});
test('invalid override is retained as a draft and cancel does not mutate',()=>{
  render(<Harness/>);fireEvent.click(q().getByRole('button',{name:'Edit runtime'}));
  fireEvent.change(q().getByLabelText('Model override'),{target:{value:'   '}});
  fireEvent.click(q().getByRole('button',{name:'Save runtime'}));
  assert.match(q().getByRole('alert').textContent!,/provider\/model/);
  fireEvent.click(q().getByRole('button',{name:'Cancel'}));
  assert.match(q().getByLabelText('Task runtime settings').textContent!,/Model: test\/model/);
});
