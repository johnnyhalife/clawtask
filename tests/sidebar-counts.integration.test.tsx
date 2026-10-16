import './dom-setup';
import React from 'react';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { render, act, cleanup, within, fireEvent } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { Sidebar } from '../src/components/layout/Sidebar';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';

const sources: FakeSource[] = [];
class FakeSource {
  onmessage: ((event: {data: string}) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { sources.push(this); }
  close() {}
}
afterEach(() => { cleanup(); sources.length = 0; });
const row = (id: string, projectId: string, status: string) => ({ id, issueId:id, title:'SOC', description:'', projectId, status, priority:'low', assigneeType:null, updatedAt:'2026-10-16' });
async function flush() { await act(async () => { for(let i=0;i<20;i++) await Promise.resolve(); }); }
test('rendered sidebar updates all project counts on filter changes and SSE, without selected-project leakage', async () => {
  (globalThis as any).EventSource = FakeSource;
  (globalThis as any).self = window;
  let failCounts = true;
  let rows = [row('1','a','todo'),row('2','b','done')];
  const requests: string[] = [];
  (globalThis as any).fetch = async (input: string) => {
    const url = String(input); requests.push(url);
    let data: unknown = [];
    if(url === '/api/v1/projects') data=[{id:'a',name:'engineering',color:'#000'},{id:'b',name:'inbox',color:'#000'}];
    if(url.startsWith('/api/v1/tasks?')) {
      if (failCounts) throw new Error('Temporary count failure');
      const params = new URL(url,'http://localhost').searchParams;
      const statuses=params.getAll('statuses');
      const tasks=rows.filter(r=>!statuses.length||statuses.includes(r.status));
      data={tasks,total:tasks.length,page:1,limit:500};
    }
    return {ok:true,json:async()=>({ok:true,data})};
  };
  const router={push(){},prefetch(){}} as any;
  const wrap = (filters: ReturnType<typeof getDefaultFiltersForTab>) => <AppRouterContext.Provider value={router}><PathnameContext.Provider value="/"><SearchParamsContext.Provider value={new URLSearchParams('tab=all&projectId=a')}><Sidebar appName="Clawtask" filters={filters}/></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>;
  const view=render(wrap(getDefaultFiltersForTab('all'))); await flush();
  assert.match(within(document.body).getByRole('alert').textContent || '', /Counts unavailable/);
  assert.ok(within(document.body).getByRole('link',{name:'engineering'}));
  assert.equal(within(document.body).queryByRole('link',{name:'engineering (0)'}), null);
  failCounts = false;
  fireEvent.click(within(document.body).getByRole('button',{name:'Retry counts'}));await flush();
  assert.equal(within(document.body).queryByRole('alert'),null);
  assert.ok(within(document.body).getByRole('link',{name:'engineering (1)'}));
  assert.ok(within(document.body).getByRole('link',{name:'inbox (0)'}));
  assert.ok(requests.filter(u=>u.startsWith('/api/v1/tasks?')).every(u=>!u.includes('projectId')));
  view.rerender(wrap({...getDefaultFiltersForTab('all'),statuses:['done']}));await flush();
  assert.ok(within(document.body).getByRole('link',{name:'engineering (0)'}));
  assert.ok(within(document.body).getByRole('link',{name:'inbox (1)'}));
  rows=[...rows,row('3','b','done')];
  await act(async()=>{for(const source of sources) source.onmessage?.({data:JSON.stringify({type:'task.created'})});});await flush();
  assert.ok(within(document.body).getByRole('link',{name:'inbox (2)'}));
  await act(async()=>{for(const source of sources) source.onmessage?.({data:JSON.stringify({type:'connected'})});});
  rows=[...rows,row('4','b','done')];
  await act(async()=>{for(const source of sources) source.onmessage?.({data:JSON.stringify({type:'connected'})});});await flush();
  assert.ok(within(document.body).getByRole('link',{name:'inbox (3)'}));
});
