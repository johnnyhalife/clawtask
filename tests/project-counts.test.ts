import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../src/types';
import { getDefaultFiltersForTab } from '../src/components/task/TaskFilters';
import { countProjectIssues } from '../src/lib/project-counts';
import { buildIssueCollectionUrl } from '../src/lib/issue-scope';
const task = (id: string, projectId: string | null, status = 'todo', extra = {}) => ({
  id, issueId: id, title: 'SOC controls', description: '', projectId, status,
  priority: 'low', assigneeType: null, parentTaskId: null, updatedAt: '2026-10-16', ...extra,
} as Task);
const tasks = [task('1', 'a'), task('2', 'b'), task('3', 'a', 'done'),
  task('4', 'b', 'archived'), task('5', null), task('6', 'a', 'todo', {parentTaskId:'1'})];
test('active-work counts cover all projects and exclude subtasks/no-project tasks', () => {
  assert.deepEqual({...countProjectIssues(tasks, getDefaultFiltersForTab('all'))}, {a:1,b:1});
});
test('explicit closed/all-status filters change counts, including zero', () => {
  const filters = getDefaultFiltersForTab('all'); filters.statuses = ['done'];
  const counts = countProjectIssues(tasks, filters);
  assert.deepEqual({...counts}, {a:1}); assert.equal(counts.b ?? 0, 0);
  filters.statuses = [];
  assert.deepEqual({...countProjectIssues(tasks, filters)}, {a:2,b:2});
});
test('priority, assignee and search use issue-list semantics', () => {
  const data = [...tasks,task('7','b','todo',{priority:'high',assigneeType:'agent',title:'Review contract'})];
  const filters = {...getDefaultFiltersForTab('all'), priorities:['high' as const], assignee:'agent' as const};
  assert.deepEqual({...countProjectIssues(data, filters, 'CONTRACT')}, {b:1});
  assert.deepEqual({...countProjectIssues(data, filters, 'SOC')}, {});
});
test('count query retains tag/status but not project scope; no 500-item truncation', () => {
  const url=buildIssueCollectionUrl({activeTab:'all',projectId:'',tagId:'soc'},getDefaultFiltersForTab('all'));
  const params=new URL(url,'http://localhost').searchParams;
  assert.equal(params.get('projectId'),null); assert.equal(params.get('tagId'),'soc');
  assert.equal(params.getAll('statuses').length,4);
  assert.equal(countProjectIssues(Array.from({length:505},(_,i)=>task(String(i),'a')),getDefaultFiltersForTab('all')).a,505);
});
