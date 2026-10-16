import type { Task } from '@/types';
import type { FilterState } from '@/components/task/TaskFilters';
import { filterAndSortTasks } from './task-view';

/** Count project facets with the same filters as the issue list. */
export function countProjectIssues(tasks: Task[], filters: FilterState, query = ''): Record<string, number> {
  const counts: Record<string, number> = Object.create(null);
  for (const task of filterAndSortTasks(tasks, filters, query)) {
    if (task.parentTaskId || !task.projectId) continue;
    counts[task.projectId] = (counts[task.projectId] ?? 0) + 1;
  }
  return counts;
}
