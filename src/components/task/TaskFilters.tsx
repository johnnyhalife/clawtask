'use client';

export type SortField = 'updatedAt' | 'createdAt' | 'priority' | 'title' | 'issueId';
type SortOrder = 'asc' | 'desc';
export type StatusValue = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'archived';
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

export const OPEN_STATUS_FILTERS: StatusValue[] = ['backlog', 'todo', 'in_progress', 'blocked'];

// Issue views are active-work queues by default, including project/tag scopes.
// Closed work remains available through the status filter.
export function getDefaultFiltersForTab(tab: string): FilterState {
  return {
    ...DEFAULT_FILTERS,
    statuses: tab === 'all' ? [...OPEN_STATUS_FILTERS] : [],
    priorities: [],
  };
}

/**
 * Issue lists default to active work only, but navigation must never erase a
 * status choice the user made in the current page session.
 */
export function preserveExplicitStatusFilters(
  filters: FilterState,
  transition: { fromTab: string; toTab: string; statusSelectionExplicit: boolean },
): FilterState {
  const { fromTab, toTab, statusSelectionExplicit } = transition;
  if (fromTab === 'pulse' && toTab === 'all' && !statusSelectionExplicit) {
    return { ...filters, statuses: [...OPEN_STATUS_FILTERS] };
  }
  return filters;
}
