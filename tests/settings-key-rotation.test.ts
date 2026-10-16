import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { SettingsPageClient } from '../src/app/settings/SettingsPageClient';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{self:dom.window,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.assign(globalThis,{EventSource:class {close() {}}});
window.matchMedia=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as any;
import {render,fireEvent,waitFor,cleanup} from '@testing-library/react';
const originalFetch=globalThis.fetch;
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;localStorage.clear();});

test('rendered Settings confirmation, pending duplicates, authorization/ownership/conflict errors, retry, copy and dismiss',async()=>{
  let confirmed=false, requests=0, copied='';
  let release!: (value: Response)=>void;
  Object.assign(globalThis,{confirm:()=>confirmed});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{copied=text;}},configurable:true});
  localStorage.setItem('clawtask_ui_token','synthetic-human');
  globalThis.fetch=(async(url: any,init?:RequestInit)=>{
    if(String(url).endsWith('/rotate-key')) {
      requests++;
      assert.equal((init?.headers as any).Authorization,'Bearer synthetic-human');
      return new Promise<Response>(resolve=>{release=resolve;});
    }
    return Response.json({ok:true,data:String(url)==='/api/v1/agents'?[{id:'a',openclawAgentId:'test',displayName:'Synthetic',probeStatus:'ok'}]:{}});
  }) as typeof fetch;
  const view=render(React.createElement(SettingsPageClient));
  fireEvent.click(view.getByRole('button',{name:'Agents'}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Rotate key'})));
  fireEvent.click(view.getByRole('button',{name:'Rotate key'})); assert.equal(requests,0);
  confirmed=true;
  for(const message of ['Only an authenticated human can rotate agent keys','Agent has pending, active or unresolved work','The agent key changed during rotation']) {
    fireEvent.click(view.getByRole('button',{name:'Rotate key'}));
    await waitFor(()=>assert.ok((view.getByRole('button',{name:'Rotating...'}) as HTMLButtonElement).disabled));
    const count: number=requests;
    fireEvent.click(view.getByRole('button',{name:'Rotating...'})); assert.equal(requests,count);
    release(Response.json({ok:false,error:{message}}));
    await waitFor(()=>assert.match(view.getByRole('alert').textContent!,new RegExp(message.replaceAll('.','\.'))));
    assert.equal((view.getByRole('button',{name:'Rotate key'}) as HTMLButtonElement).disabled,false);
  }
  fireEvent.click(view.getByRole('button',{name:'Rotate key'}));
  await waitFor(()=>assert.ok(view.queryByRole('button',{name:'Rotating...'})));
  assert.equal(view.queryByRole('alert'),null);
  release(Response.json({ok:true,data:{id:'a',apiKey:'synthetic-once-only'}}));
  await waitFor(()=>assert.ok(view.getByText('synthetic-once-only')));
  assert.ok(view.getByText(/shown once/));
  fireEvent.click(view.getByRole('button',{name:'Copy'})); assert.equal(copied,'synthetic-once-only');
  fireEvent.click(view.getByRole('button',{name:'Dismiss'})); assert.equal(view.queryByText('synthetic-once-only'),null);
  fireEvent.click(view.getByRole('button',{name:'General'}));
  fireEvent.click(view.getByRole('button',{name:'Agents'}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Rotate key'})));
  assert.equal(view.queryByText('synthetic-once-only'),null);
});
