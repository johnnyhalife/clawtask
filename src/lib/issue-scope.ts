import type { FilterState } from '@/components/task/TaskFilters';

type SearchParams = Pick<URLSearchParams, 'get' | 'toString'>;
export function getIssueScope(params: SearchParams) {
  const projectId = params.get('projectId') || '';
  const tagId = params.get('tagId') || '';
  // A scoped issue URL must never silently render the unscoped Pulse view.
  return { activeTab: projectId || tagId ? 'all' : params.get('tab') || 'pulse', projectId, tagId };
}
export function buildIssueCollectionUrl(scope: ReturnType<typeof getIssueScope>, filters: FilterState) {
  const params = new URLSearchParams({ sort: 'updatedAt', order: 'desc', limit: '500' });
  for (const status of filters.statuses) params.append('statuses', status);
  if (scope.projectId) params.set('projectId', scope.projectId);
  if (scope.tagId) params.set('tagId', scope.tagId);
  return '/api/v1/tasks?' + params.toString();
}
export function withIssueSearch(params: SearchParams, query: string) {
  const next = new URLSearchParams(params.toString());
  next.set('tab', 'all');
  if (query.trim()) next.set('q', query.trim()); else next.delete('q');
  return '/?' + next.toString();
}
export function projectIssuesHref(projectId: string) {
  return '/?' + new URLSearchParams({ tab: 'all', projectId }).toString();
}
