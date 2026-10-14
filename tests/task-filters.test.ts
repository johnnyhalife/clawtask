import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';

test('All Issues defaults to active-work statuses', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, ['backlog', 'todo', 'in_progress', 'blocked']);
});

test('Pulse retains the unfiltered status default', () => {
  assert.deepEqual(getDefaultFiltersForTab('pulse').statuses, []);
});

test('project and tag issue lists use the same active-work default', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, ['backlog', 'todo', 'in_progress', 'blocked']);
});
