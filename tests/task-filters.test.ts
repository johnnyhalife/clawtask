import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';

test('All Issues defaults to no status restriction', () => {
  assert.deepEqual(getDefaultFiltersForTab('all').statuses, []);
});

test('Pulse retains the unfiltered status default', () => {
  assert.deepEqual(getDefaultFiltersForTab('pulse').statuses, []);
});
