'use client';

export type SortField = 'updatedAt' | 'createdAt' | 'priority' | 'title' | 'issueId';
export type SortOrder = 'asc' | 'desc';
export type StatusValue = 'todo' | 'in_progress' | 'blocked' | 'done';
export type PriorityValue = 'urgent' | 'high' | 'medium' | 'low';
export type AssigneeFilter = '' | 'agent' | 'human' | 'unassigned';
export type GroupByField = 'status' | 'priority' | 'assignee' | 'none';

// Legacy single-value types (kept for any remaining consumers)
export type StatusFilter = '' | StatusValue;
export type PriorityFilter = '' | PriorityValue;

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
