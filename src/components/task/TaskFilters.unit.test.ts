import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultFiltersForTab } from './TaskFilters';

test('All Issues defaults to Todo, In Progress, and Blocked', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, [
    'todo',
    'in_progress',
    'blocked',
  ]);
});

test('Pulse retains the unfiltered status default', () => {
  assert.deepEqual(getDefaultFiltersForTab('pulse').statuses, []);
});
