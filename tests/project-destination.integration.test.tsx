import './dom-setup';
import React, { useState } from 'react';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { render, act, cleanup, within, fireEvent } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { HomeContent } from '../src/app/HomeContent';

const sources: FakeSource[] = [];
class FakeSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { sources.push(this); }
  close() { sources.splice(sources.indexOf(this), 1); }
}
afterEach(() => { cleanup(); sources.length = 0; localStorage.clear(); });
const row = (id: string, projectId: string, status = 'todo', extra = {}) => ({
  id, issueId: 'TEST-' + id, title: id, description: '', projectId, status,
  priority: 'low', assigneeType: null, parentTaskId: null, tags: [{ id: 'tag', name: 'Tag' }],
  createdAt: '2026-10-16', updatedAt: '2026-10-16', ...extra,
});
type Row = ReturnType<typeof row>;
async function flush() { await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); }); }
function setup(initial: string, initialRows: Row[], holdTasks = false) {
  (globalThis as any).EventSource = FakeSource;
  (globalThis as any).self = window;
  let rows = initialRows;
  let releaseTasks!: () => void;
  const tasksReady = new Promise<void>(resolve => { releaseTasks = resolve; });
  const requests: string[] = [];
  (globalThis as any).fetch = async (input: string) => {
    const url = String(input); requests.push(url);
    let data: unknown = [];
    if (url === '/api/v1/config') data = { appName: 'Clawtask' };
    if (url === '/api/v1/projects') data = ['a', 'b', 'c'].map((id, i) => ({ id, name: ['Alpha', 'Beta', 'Completed'][i], color: '#000' }));
    if (url === '/api/v1/tags') data = [{ id: 'tag', name: 'Tag', color: '#000' }];
    if (url.startsWith('/api/v1/tasks?')) {
      if (holdTasks) await tasksReady;
      const params = new URL(url, 'http://localhost').searchParams;
      const statuses = params.getAll('statuses');
      const tasks = rows.filter(r => (!statuses.length || statuses.includes(r.status))
        && (!params.get('projectId') || r.projectId === params.get('projectId'))
        && (!params.get('tagId') || r.tags.some(t => t.id === params.get('tagId')))
        && (!params.get('status') || r.status === params.get('status')));
      const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 500);
      data = { tasks: tasks.slice((page - 1) * limit, page * limit), total: tasks.length, page, limit };
    }
    return { ok: true, json: async () => ({ ok: true, data }) };
  };
  let current = initial;
  function Harness() {
    const [query, setQuery] = useState(initial);
    const router = { push(href: string) { current = href; setQuery(href.split('?')[1] || ''); }, prefetch() {} } as any;
    return <AppRouterContext.Provider value={router}><PathnameContext.Provider value="/"><SearchParamsContext.Provider value={new URLSearchParams(query)}><div onClickCapture={event => {
      const anchor = (event.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (href?.startsWith('/?')) { event.preventDefault(); router.push(href); }
    }}><HomeContent /></div></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>;
  }
  render(<Harness />);
  return { requests, releaseTasks, get current() { return current; }, setRows(next: Row[]) { rows = next; } };
}
const ui = () => within(document.body);
const projectLink = (name: string) => ui().getByRole('link', { name: new RegExp('^' + name + ' [(]') });
function count(name: string) { return Number(projectLink(name).textContent?.match(/[(]([0-9]+)[)]$/)?.[1]); }
function renderedCount() {
  const badge = document.querySelector('span.ml-2.tabular-nums');
  assert.ok(badge, 'real issue collection count is rendered');
  return Number(badge.textContent);
}
async function navigateAndCompare(name: string, expected: number) {
  assert.equal(count(name), expected, 'pre-click facet count');
  fireEvent.click(projectLink(name)); await flush();
  assert.equal(renderedCount(), expected, 'destination filtered collection');
  assert.equal(count(name), expected, 'post-click facet count');
}
const sixRows = () => ['a', 'b'].flatMap(p => ['todo', 'done', 'archived'].map(s => row(p + s, p, s)));

test('fresh Pulse project counts predict the active destination, not every status', async () => {
  setup('tab=pulse', sixRows()); await flush();
  await navigateAndCompare('Alpha', 1);
  assert.ok(ui().getByText('atodo'));
  assert.equal(ui().queryByText('adone'), null);
});

test('project links retain counted search and tag scopes, including zero-count projects', async () => {
  const harness = setup('tab=all&q=atodo&tagId=tag', [row('atodo', 'a'), row('btodo', 'b')]); await flush();
  await navigateAndCompare('Beta', 0);
  const params = new URL(harness.current, 'http://localhost').searchParams;
  assert.equal(params.get('q'), 'atodo'); assert.equal(params.get('tagId'), 'tag');
  assert.equal(ui().queryByText('btodo'), null);
});

async function filterButton(name: string | RegExp) {
  fireEvent.click(ui().getByRole('button', { name })); await flush();
}
async function openFilters() { await filterButton('Filter'); }
async function clearAll() { await filterButton(/clear all/); }
async function closeFilters() { await filterButton('Filter'); }

for (const status of ['Done', 'Archived', 'Clear All']) {
  test('explicit ' + status + ' survives project, Pulse and project navigation', async () => {
    setup('tab=all', [...sixRows(), row('cdone', 'c', 'done')]); await flush();
    await openFilters(); await clearAll();
    if (status !== 'Clear All') await filterButton(status);
    await closeFilters();
    const expected = status === 'Clear All' ? 3 : 1;
    await navigateAndCompare('Alpha', expected);
    fireEvent.click(ui().getByRole('link', { name: 'Pulse' })); await flush();
    await navigateAndCompare('Beta', expected);
    await navigateAndCompare('Completed', status === 'Archived' ? 0 : 1);
  });
}

test('combined search/tag/priority/assignee filters exclude only the project facet', async () => {
  const harness = setup('tab=all&q=match&tagId=tag&projectId=a', [
    row('match-a', 'a', 'todo', { priority: 'high', assigneeType: 'agent' }),
    row('match-b', 'b', 'todo', { priority: 'high', assigneeType: 'agent' }),
    row('match-low', 'b', 'todo', { assigneeType: 'agent' }),
    row('match-human', 'b', 'todo', { priority: 'high', assigneeType: 'human' }),
    row('match-no-tag', 'b', 'todo', { priority: 'high', assigneeType: 'agent', tags: [] }),
    row('other', 'b', 'todo', { priority: 'high', assigneeType: 'agent' }),
  ]); await flush();
  await openFilters(); await filterButton('High'); await filterButton('Agent'); await closeFilters();
  await navigateAndCompare('Beta', 1);
  assert.ok(ui().getByText('match-b'));
  assert.equal(ui().queryByText('match-low'), null); assert.equal(ui().queryByText('match-human'), null);
  assert.equal(ui().queryByText('match-no-tag'), null); assert.equal(ui().queryByText('other'), null);
  assert.equal(new URL(harness.current, 'http://localhost').searchParams.get('tagId'), 'tag');
});

test('rendered project counts and destination load every page beyond 500', async () => {
  const harness = setup('tab=pulse', Array.from({ length: 505 }, (_, i) => row('bulk-' + i, 'a')));
  await flush(); await navigateAndCompare('Alpha', 505);
  assert.ok(ui().getByText('bulk-504'));
  assert.ok(harness.requests.some(u => u.includes('page=2') && !u.includes('projectId')));
  assert.ok(harness.requests.some(u => u.includes('page=2') && u.includes('projectId=a')));
});

test('Home and Sidebar counts agree after create/update/delete SSE and reconnect', async () => {
  const harness = setup('tab=all&projectId=a', [row('first', 'a')]); await flush();
  async function event(type: string, expected: number) {
    await act(async () => { for (const source of [...sources]) source.onmessage?.({ data: JSON.stringify({ type }) }); });
    await flush(); assert.equal(count('Alpha'), expected); assert.equal(renderedCount(), expected);
  }
  harness.setRows([row('first', 'a'), row('second', 'a')]); await event('task.created', 2);
  harness.setRows([row('first', 'a', 'done'), row('second', 'a')]); await event('task.updated', 1);
  harness.setRows([]); await event('task.deleted', 0);
  await event('connected', 0);
  harness.setRows([row('reconnected', 'a')]); await event('connected', 1);
});

test('Clear All reports explicit status intent even when its status array is already empty', async () => {
  const { TopBar } = await import('../src/components/layout/TopBar');
  const { getDefaultFiltersForTab } = await import('../src/components/task/TaskFilters');
  const changes: { statuses: string[]; explicit: boolean | undefined }[] = [];
  render(<AppRouterContext.Provider value={{ push() {} } as any}><TopBar
    filters={{ ...getDefaultFiltersForTab('pulse'), priorities: ['high'] }}
    onFiltersChange={(next, intent) => changes.push({ statuses: next.statuses, explicit: intent?.statusSelectionExplicit })}
  /></AppRouterContext.Provider>);
  await openFilters(); await clearAll();
  assert.deepEqual(changes, [{ statuses: [], explicit: true }]);
});

test('loading counts never show a false zero before the complete collection arrives', async () => {
  const harness = setup('tab=all', [row('atodo', 'a')], true); await flush();
  assert.ok(ui().getByRole('link', { name: 'Alpha' }));
  assert.equal(ui().queryByRole('link', { name: 'Alpha (0)' }), null);
  await act(async () => { harness.releaseTasks(); }); await flush();
  await navigateAndCompare('Alpha', 1);
});
