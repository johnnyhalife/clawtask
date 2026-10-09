import type { Task } from '@/types';
import type { FilterState, GroupByField } from '@/components/task/TaskFilters';

const STATUS_ORDER = ['in_progress', 'todo', 'backlog', 'blocked', 'done', 'archived'];
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', ''];
const ASSIGNEE_ORDER = ['agent', 'human', 'unassigned', ''];
const COMPLETED_DATE_ORDER = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'older', 'no_date'];

function getCompletedDateBucket(task: Task): string {
  if (task.status !== 'done') return 'no_date';
  const now = new Date();
  const completed = new Date(task.updatedAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const completedDay = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate());
  const diffDays = Math.floor((today.getTime() - completedDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  // This week: Monday of current week through now (excluding today/yesterday)
  const dayOfWeek = today.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  if (completedDay >= weekStart) return 'this_week';
  // This month (excluding this week)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (completedDay >= monthStart) return 'this_month';
  // This year (excluding this month)
  const yearStart = new Date(now.getFullYear(), 0, 1);
  if (completedDay >= yearStart) return 'this_year';
  return 'older';
}
export function getGroupKey(task: Task, groupBy: GroupByField): string {
  if (groupBy === 'status') return task.status || '';
  if (groupBy === 'priority') return task.priority || '';
  if (groupBy === 'assignee') return task.assigneeType || (task.assigneeId ? 'human' : 'unassigned');
  if (groupBy === 'project') return task.projectId ?? '__none__';
  if (groupBy === 'completedDate') return getCompletedDateBucket(task);
  return 'all';
}

export function sortedGroupKeys(keys: string[], groupBy: GroupByField): string[] {
  if (groupBy === 'status') {
    return [
      ...STATUS_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !STATUS_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'priority') {
    return [
      ...PRIORITY_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !PRIORITY_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'assignee') {
    return [
      ...ASSIGNEE_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !ASSIGNEE_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'project') {
    return [
      ...keys.filter(k => k !== '__none__').sort(),
      ...keys.filter(k => k === '__none__'),
    ];
  }
  if (groupBy === 'completedDate') {
    return [
      ...COMPLETED_DATE_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !COMPLETED_DATE_ORDER.includes(k)),
    ];
  }
  return keys;
}

// Returns tasks in the same flat order TaskList renders them (respects groupBy)
export function getFlatOrderedTasks(tasks: Task[], groupBy: GroupByField): Task[] {
  if (groupBy === 'none') return tasks;
  const groups: Record<string, Task[]> = {};
  for (const task of tasks) {
    const key = getGroupKey(task, groupBy);
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }
  const keys = sortedGroupKeys(Object.keys(groups), groupBy);
  const result: Task[] = [];
  for (const key of keys) {
    for (const task of (groups[key] ?? [])) result.push(task);
  }
  return result;
}

export const GROUPBY_STORAGE_KEY = 'clawtask:groupBy';
export function parseGroupBy(value: string | null): GroupByField {
  const valid: GroupByField[] = ['status', 'priority', 'assignee', 'project', 'completedDate', 'none'];
  return valid.includes(value as GroupByField) ? value as GroupByField : 'status';
}
export function filterAndSortTasks(tasks: Task[], filters: FilterState, q = ''): Task[] {
  const query = q.toLowerCase();
  const priorities: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return tasks.filter(t =>
    (!query || [t.title, t.issueId, t.description].some(value => value.toLowerCase().includes(query))) &&
    (!filters.statuses.length || filters.statuses.includes(t.status as any)) &&
    (!filters.priorities.length || filters.priorities.includes(t.priority)) &&
    (!filters.assignee || (filters.assignee === 'unassigned' ? !t.assigneeType : t.assigneeType === filters.assignee))
  ).sort((a, b) => {
    let cmp = 0;
    if (filters.sortField === 'updatedAt' || filters.sortField === 'createdAt') cmp = Date.parse(a[filters.sortField]) - Date.parse(b[filters.sortField]);
    else if (filters.sortField === 'priority') cmp = (priorities[a.priority] ?? 99) - (priorities[b.priority] ?? 99);
    else cmp = a[filters.sortField].localeCompare(b[filters.sortField]);
    return (filters.sortOrder === 'asc' ? cmp : -cmp) || a.id.localeCompare(b.id);
  });
}
export function getIssueNeighbors(tasks: Task[], currentId: string | null) {
  const index = tasks.findIndex(t => t.id === currentId);
  return { previous: index > 0 ? tasks[index - 1] : null, next: index >= 0 ? tasks[index + 1] ?? null : null };
}
export function issueArrowDirection(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing'>, editing: boolean, pickerOpen: boolean) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || editing || pickerOpen) return null;
  return event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : null;
}
