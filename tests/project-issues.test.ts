import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { GET as list } from '../src/app/api/v1/tasks/route';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';
import { getIssueScope, buildIssueCollectionUrl, withIssueSearch, projectIssuesHref } from '../src/lib/issue-scope';
import { fetchTaskCollection } from '../src/lib/task-collection';
import { filterAndSortTasks, getFlatOrderedTasks, getIssueNeighbors } from '../src/lib/task-view';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
  globalThis.__clawtask_db = db;
  db.prepare('INSERT INTO projects(id,name) VALUES(?,?)').run('alpha', 'Completed only');
  db.prepare('INSERT INTO projects(id,name) VALUES(?,?)').run('beta', 'Mixed');
});
afterEach(() => { globalThis.__clawtask_db = undefined; db.close(); });
function seed(id: string, status: string, projectId: string | null = null) {
  db.prepare('INSERT INTO tasks(id,issueId,title,status,projectId,updatedAt) VALUES(?,?,?,?,?,?)').run(id, 'FIX-' + id, id, status, projectId, '2026-10-09');
}
const localFetch = (async (url: string | URL | Request) => list(new NextRequest('http://localhost' + String(url)))) as typeof fetch;
function url(query: string, filters = getDefaultFiltersForTab('all')) {
  return buildIssueCollectionUrl(getIssueScope(new URLSearchParams(query)), filters);
}

test('project routes encode IDs and select issues without depending on a tab', () => {
  const href = projectIssuesHref('space & /');
  const scope = getIssueScope(new URLSearchParams(href.split('?')[1]));
  assert.equal(scope.activeTab, 'all'); assert.equal(scope.projectId, 'space & /');
  for (const query of ['projectId=alpha', 'tab=pulse&projectId=alpha', 'tab=all&projectId=alpha']) {
    assert.equal(getIssueScope(new URLSearchParams(query)).activeTab, 'all');
    assert.equal(new URL(url(query), 'http://localhost').searchParams.get('projectId'), 'alpha');
  }
  assert.equal(getIssueScope(new URLSearchParams()).activeTab, 'pulse');
});

test('completed-only project and mixed project include all statuses but never other or unassigned projects', async () => {
  seed('alpha-done', 'done', 'alpha'); seed('alpha-archived', 'archived', 'alpha');
  for (const status of ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'archived']) seed('beta-' + status, status, 'beta');
  seed('unassigned', 'backlog');
  const alpha = await fetchTaskCollection(url('projectId=alpha'), undefined, localFetch);
  assert.deepEqual(new Set(alpha.tasks.map(t => t.status)), new Set(['done', 'archived']));
  assert.equal(alpha.total, 2); assert.ok(alpha.tasks.every(t => t.projectId === 'alpha'));
  const beta = await fetchTaskCollection(url('tab=all&projectId=beta'), undefined, localFetch);
  assert.equal(beta.total, 6); assert.ok(beta.tasks.every(t => t.projectId === 'beta'));
  const all = await fetchTaskCollection(url('tab=all'), undefined, localFetch);
  assert.equal(all.total, 9); assert.ok(all.tasks.some(t => t.projectId === null));
  const ordered = getFlatOrderedTasks(filterAndSortTasks(all.tasks, getDefaultFiltersForTab('all')), 'status');
  assert.equal(getIssueNeighbors(ordered, 'alpha-done').next?.status, 'done');
  assert.equal(getIssueNeighbors(ordered, 'alpha-archived').previous?.status, 'done');
});

test('explicit status, priority, assignee, sort and grouping selections survive scope and search changes', async () => {
  seed('done', 'done', 'alpha'); seed('archived', 'archived', 'alpha');
  const filters = { ...getDefaultFiltersForTab('all'), statuses: ['archived'] as const, groupBy: 'priority' as const, sortField: 'title' as const, sortOrder: 'asc' as const, assignee: 'unassigned' as const, priorities: ['medium'] as const };
  const selected = { ...filters, statuses: [...filters.statuses], priorities: [...filters.priorities] };
  const snapshot = structuredClone(selected);
  const scoped = new URLSearchParams('tab=all&projectId=alpha&tagId=label&q=old');
  const searched = withIssueSearch(scoped, ' completed ');
  const cleared = withIssueSearch(new URLSearchParams(searched.split('?')[1]), '');
  assert.equal(new URL(searched, 'http://localhost').searchParams.get('q'), 'completed');
  assert.equal(new URL(cleared, 'http://localhost').searchParams.get('projectId'), 'alpha');
  assert.equal(new URL(cleared, 'http://localhost').searchParams.get('tagId'), 'label');
  assert.equal(new URL(cleared, 'http://localhost').searchParams.has('q'), false);
  const collection = await fetchTaskCollection(url('projectId=alpha', selected), undefined, localFetch);
  assert.deepEqual(filterAndSortTasks(collection.tasks, selected).map(t => t.id), ['archived']);
  assert.deepEqual(selected, snapshot);
  selected.statuses = [];
  assert.equal((await fetchTaskCollection(url('projectId=alpha', selected), undefined, localFetch)).total, 2);
});

test('all-status and scoped collections load every page without leaking other projects', async () => {
  db.transaction(() => {
    for (let i = 0; i < 505; i++) seed('alpha-' + i, i % 2 ? 'done' : 'archived', 'alpha');
    for (let i = 0; i < 520; i++) seed('beta-' + i, 'backlog', 'beta');
    seed('none', 'todo');
  })();
  const alpha = await fetchTaskCollection(url('projectId=alpha'), undefined, localFetch);
  assert.equal(alpha.total, 505); assert.ok(alpha.tasks.every(t => t.projectId === 'alpha'));
  const all = await fetchTaskCollection(url('tab=all'), undefined, localFetch);
  assert.equal(all.total, 1026); assert.equal(new Set(all.tasks.map(t => t.id)).size, 1026);
});
