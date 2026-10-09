'use client';

export type SortField = 'updatedAt' | 'createdAt' | 'priority' | 'title' | 'issueId';
type SortOrder = 'asc' | 'desc';
export type StatusValue = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type PriorityValue = 'urgent' | 'high' | 'medium' | 'low';
export type AssigneeFilter = '' | 'agent' | 'human' | 'unassigned';
export type GroupByField = 'status' | 'priority' | 'assignee' | 'project' | 'completedDate' | 'none';

// Legacy single-value types (internal use only)
type StatusFilter = '' | StatusValue;
type PriorityFilter = '' | PriorityValue;

export interface FilterState {
  sortField: SortField;
  sortOrder: SortOrder;
  statuses: StatusValue[];   // multi-select
  priorities: PriorityValue[]; // multi-select
  assignee: AssigneeFilter;
  groupBy: GroupByField;
  // legacy compat shims (derived)
  status?: StatusFilter;
  priority?: PriorityFilter;
}

export const DEFAULT_FILTERS: FilterState = {
  sortField: 'updatedAt',
  sortOrder: 'desc',
  statuses: [],
  priorities: [],
  assignee: '',
  groupBy: 'status',
};

const ALL_ISSUES_DEFAULT_STATUSES: StatusValue[] = ['todo', 'in_progress', 'blocked'];

export function getDefaultFiltersForTab(tab: string): FilterState {
  return {
    ...DEFAULT_FILTERS,
    statuses: tab === 'all' ? [...ALL_ISSUES_DEFAULT_STATUSES] : [],
  };
}
