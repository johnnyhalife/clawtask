import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultFiltersForTab, preserveExplicitStatusFilters } from '../src/components/task/TaskFilters';

test('All Issues defaults to active-work statuses', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, ['backlog', 'todo', 'in_progress', 'blocked']);
});

test('Pulse retains the unfiltered status default', () => {
  assert.deepEqual(getDefaultFiltersForTab('pulse').statuses, []);
});

test('project and tag issue lists use the same active-work default', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, ['backlog', 'todo', 'in_progress', 'blocked']);
});

test('navigation preserves an explicit closed-status selection', () => {
  const done = { ...getDefaultFiltersForTab('all'), statuses: ['done' as const] };
  assert.deepEqual(
    preserveExplicitStatusFilters(done, { fromTab: 'all', toTab: 'all', statusSelectionExplicit: true }).statuses,
    ['done'],
  );
  assert.deepEqual(
    preserveExplicitStatusFilters(done, { fromTab: 'pulse', toTab: 'all', statusSelectionExplicit: true }).statuses,
    ['done'],
  );
});

test('entering an issue view without a status selection applies active defaults', () => {
  assert.deepEqual(
    preserveExplicitStatusFilters(getDefaultFiltersForTab('pulse'), {
      fromTab: 'pulse', toTab: 'all', statusSelectionExplicit: false,
    }).statuses,
    ['backlog', 'todo', 'in_progress', 'blocked'],
  );
});
