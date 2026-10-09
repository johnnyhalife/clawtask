import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { GET as list } from '../src/app/api/v1/tasks/route';
import { DELETE as deleteTask } from '../src/app/api/v1/tasks/[id]/route';
import { addSseWriter } from '../src/lib/sse';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';
import { filterAndSortTasks, getFlatOrderedTasks, getIssueNeighbors, issueArrowDirection, parseGroupBy } from '../src/lib/task-view';
import { fetchTaskCollection } from '../src/lib/task-collection';
import type { Task } from '../src/types';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
  globalThis.__clawtask_db = db;
});
afterEach(() => { globalThis.__clawtask_db = undefined; db.close(); });
function task(id: string, status = 'todo', updatedAt = '2026-10-01', priority = 'medium'): Task {
  return { id, issueId: 'TEST-' + id, title: id, description: '', status, priority, updatedAt, createdAt: updatedAt, assigneeType: null, projectId: null } as Task;
}
function insert(id: string, status: string, updatedAt: string) {
  db.prepare('INSERT INTO tasks(id,issueId,title,status,updatedAt) VALUES(?,?,?,?,?)').run(id, 'TEST-' + id, id, status, updatedAt);
}
const openUrl = '/api/v1/tasks?sort=updatedAt&order=desc&statuses=todo&statuses=in_progress&statuses=blocked';
const localFetch = (async (url: string | URL | Request, options?: RequestInit) => {
  if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return list(new NextRequest('http://localhost' + String(url)));
}) as typeof fetch;

test('All Issues and Pulse defaults are independent copies', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, []);
  assert.deepEqual(getDefaultFiltersForTab('pulse').statuses, []);
  const filters = getDefaultFiltersForTab('all'); filters.statuses.push('done');
  assert.equal(getDefaultFiltersForTab('all').statuses.length, 0);
});
test('detail neighbors follow grouped All Issues order, not global update order', () => {
  const input = [task('b', 'blocked', '2026-10-09'), task('t', 'todo', '2026-10-08'), task('i', 'in_progress', '2026-10-07'), task('done', 'done')];
  const ordered = getFlatOrderedTasks(filterAndSortTasks(input, getDefaultFiltersForTab('all')), 'status');
  assert.deepEqual(ordered.map(t => t.id), ['i', 't', 'b', 'done']);
  assert.deepEqual(getIssueNeighbors(ordered, 't'), { previous: input[2], next: input[0] });
  assert.equal(getIssueNeighbors(ordered, 'i').previous, null);
  assert.equal(getIssueNeighbors(ordered, 'b').next?.id, 'done');
  assert.deepEqual(getIssueNeighbors(ordered, 'done'), { previous: input[0], next: null });
  assert.deepEqual(getIssueNeighbors(ordered, 'deleted'), { previous: null, next: null });
  assert.deepEqual(input.map(t => t.id), ['b', 't', 'i', 'done']);
});
test('stored grouping and priority, assignee, project, none orders use the list helpers', () => {
  const input = [task('low', 'todo', '2026-10-09', 'low'), task('urgent', 'todo', '2026-10-08', 'urgent')];
  input[0].assigneeType = 'human'; input[0].projectId = 'z'; input[1].assigneeType = 'agent'; input[1].projectId = 'a';
  for (const group of ['priority', 'assignee', 'project'] as const) {
    assert.equal(parseGroupBy(group), group);
    assert.deepEqual(getFlatOrderedTasks(input, group).map(t => t.id), ['urgent', 'low']);
  }
  assert.equal(parseGroupBy('completedDate'), 'completedDate');
  assert.equal(parseGroupBy('bad'), 'status'); assert.equal(parseGroupBy(null), 'status');
  assert.deepEqual(getFlatOrderedTasks(input, 'none'), input);
});
test('status change retains completed targets in default navigation', () => {
  const input = [task('a'), task('b'), task('c')];
  input[1].status = 'done';
  const ordered = getFlatOrderedTasks(filterAndSortTasks(input, getDefaultFiltersForTab('all')), 'status');
  assert.equal(getIssueNeighbors(ordered, 'a').next?.id, 'c');
  assert.deepEqual(getIssueNeighbors(ordered, 'b'), { previous: input[2], next: null });
});
test('only unmodified unhandled arrows outside editors and pickers navigate', () => {
  const event = { key: 'ArrowRight', defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false };
  assert.equal(issueArrowDirection(event, false, false), 'next');
  assert.equal(issueArrowDirection({ ...event, key: 'ArrowLeft' }, false, false), 'previous');
  for (const key of ['defaultPrevented', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing']) assert.equal(issueArrowDirection({ ...event, [key]: true }, false, false), null);
  assert.equal(issueArrowDirection(event, true, false), null);
  assert.equal(issueArrowDirection(event, false, true), null);
  assert.equal(issueArrowDirection({ ...event, key: 'ArrowDown' }, false, false), null);
});
test('server filters before pagination and client loads beyond 500 open issues', async () => {
  const seed = db.transaction(() => {
    for (let i = 0; i < 520; i++) insert('done-' + i, 'done', '2026-10-09');
    for (let i = 0; i < 505; i++) insert('open-' + i, i % 2 ? 'todo' : 'blocked', '2026-10-01');
  }); seed();
  const first = await (await localFetch(openUrl + '&limit=500')).json();
  assert.equal(first.data.total, 505); assert.equal(first.data.tasks.length, 500);
  const collection = await fetchTaskCollection(openUrl, undefined, localFetch);
  assert.equal(collection.tasks.length, 505); assert.equal(new Set(collection.tasks.map(t => t.id)).size, 505);
  assert.ok(collection.tasks.every(t => ['todo', 'blocked'].includes(t.status)));
});
test('server pagination validates input and counts Mine relation before paging', async () => {
  db.prepare("INSERT INTO humans(id,name,displayName) VALUES('h','Human','Human')").run();
  insert('mine', 'todo', '2026-10-01'); insert('other', 'todo', '2026-10-01');
  db.prepare("UPDATE tasks SET assigneeId='h',assigneeType='human' WHERE id='mine'").run();
  const data = await (await localFetch('/api/v1/tasks?mineFilter=assigned')).json();
  assert.equal(data.data.total, 1); assert.equal(data.data.tasks[0].id, 'mine');
  for (const query of ['page=0', 'page=NaN', 'limit=501', 'limit=-1', 'statuses=wrong']) assert.equal((await localFetch('/api/v1/tasks?' + query)).status, 400);
});
test('delete emits one task.deleted event and refresh cannot retain deleted target', async () => {
  insert('a', 'todo', '2026-10-01'); insert('b', 'todo', '2026-10-01');
  const events: any[] = []; const unsubscribe = addSseWriter(event => events.push(event));
  try {
    const props = { params: Promise.resolve({ id: 'b' }) };
    assert.equal((await deleteTask(new NextRequest('http://localhost/api', { method: 'DELETE' }), props)).status, 200);
    assert.deepEqual(events, [{ type: 'task.deleted', data: { id: 'b' } }]);
    assert.equal((await deleteTask(new NextRequest('http://localhost/api', { method: 'DELETE' }), props)).status, 404);
    const refreshed = await fetchTaskCollection(openUrl, undefined, localFetch);
    assert.equal(getIssueNeighbors(refreshed.tasks, 'a').next, null);
    assert.deepEqual(getIssueNeighbors(refreshed.tasks, 'b'), { previous: null, next: null });
  } finally { unsubscribe(); }
});
test('pagination errors and cancellation do not publish a partial collection', async () => {
  const request = (async () => new Response(JSON.stringify({ ok: false, error: { message: 'failure' } }), { status: 500 })) as typeof fetch;
  await assert.rejects(fetchTaskCollection(openUrl, undefined, request), /failure/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchTaskCollection(openUrl, controller.signal, localFetch), /Aborted/);
});

test('issue route keys reset local drafts and pickers between issue identities', async () => {
  const { default: IssuePage } = await import('../src/app/issues/[id]/page');
  const first = await IssuePage({ params: Promise.resolve({ id: 'test-a' }) });
  const second = await IssuePage({ params: Promise.resolve({ id: 'test-b' }) });
  assert.equal(first.key, 'test-a');
  assert.equal(second.key, 'test-b');
  assert.notEqual(first.key, second.key);
});
