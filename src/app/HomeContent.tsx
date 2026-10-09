'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Task, Config, Project, Tag } from '@/types';
import { useApi } from '@/hooks/useApi';
import { RequestState } from '@/components/ui/RequestState';
import { useTaskCollection } from '@/hooks/useTaskCollection';
import { filterAndSortTasks, parseGroupBy, GROUPBY_STORAGE_KEY } from '@/lib/task-view';
import { getIssueScope, buildIssueCollectionUrl, withIssueSearch } from '@/lib/issue-scope';
import { useSse } from '@/hooks/useSse';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { TopBar } from '@/components/layout/TopBar';
import { TaskList, getFlatOrderedTasks } from '@/components/task/TaskList';
import { PulseView } from '@/components/task/PulseView';
import { CreateTaskModal } from '@/components/task/CreateTaskModal';
import { FilterState, getDefaultFiltersForTab } from '@/components/task/TaskFilters';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useFavicon } from '@/hooks/useFavicon';


export function HomeContent() {
  const searchParams = useSearchParams();
  const get = searchParams.get.bind(searchParams);
  const router = useRouter();
  const { push } = router;
  const { activeTab, projectId, tagId } = getIssueScope(searchParams);
  const q = get('q') || '';

  const { data: config } = useApi<Config>('/api/v1/config');
  const { data: projects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags } = useApi<Tag[]>('/api/v1/tags');
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<FilterState>(() => getDefaultFiltersForTab(activeTab));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [groupingLoaded, setGroupingLoaded] = useState(false);
  useEffect(() => {
    try { setFilters(f => ({ ...f, groupBy: parseGroupBy(localStorage.getItem(GROUPBY_STORAGE_KEY)) })); } catch { /* storage blocked */ }
    setGroupingLoaded(true);
  }, []);
  useEffect(() => {
    if (!groupingLoaded) return;
    try { localStorage.setItem(GROUPBY_STORAGE_KEY, filters.groupBy); } catch { /* storage blocked */ }
  }, [filters.groupBy, groupingLoaded]);

  // Keep explicit selections while navigating between project lists and Pulse.

  // "N" opens create modal (skip when typing in an input/textarea)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setShowCreate(true);
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.key === 'l' || e.key === 'L') && activeTab === 'pulse') {
        e.preventDefault();
        push('/?tab=all');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeTab, router]);

  // Reset J/K selection when tab changes
  useEffect(() => { setSelectedTaskId(null); }, [activeTab, projectId, tagId, q]);

  const { data: taskData, error: taskError, reload: reloadTasks } = useTaskCollection(
    buildIssueCollectionUrl({ activeTab, projectId, tagId }, filters)
  );

  useSse((event) => {
    if (['task.created', 'task.updated', 'task.deleted'].includes(event.type)) {
      reloadTasks();
    }
  }, reloadTasks);

  const getFilteredTasks = (): Task[] => filterAndSortTasks(taskData?.tasks ?? [], filters, q);

  const isMobile = useIsMobile();
  const isPulse = activeTab === 'pulse';
  const activeProject = projectId ? projects?.find(p => p.id === projectId) : null;
  const activeTag = tagId ? tags?.find(t => t.id === tagId) : null;
  const pageLabel = isPulse ? 'Pulse'
    : projectId ? `Issues · ${activeProject?.name || projectId}`
    : activeTag ? `Issues · ${activeTag.name}`
    : 'Issues';
  usePageTitle(pageLabel);
  useFavicon(config?.workspaceLogo ?? undefined);

  // J/K navigation on issue list
  useEffect(() => {
    if (isPulse) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isSearchFocused = document.activeElement === searchRef.current;

      // When search is focused: Esc blurs it, everything else falls through
      if (isSearchFocused) {
        if (e.key === 'Escape') { e.preventDefault(); searchRef.current?.blur(); setSelectedTaskId(null); }
        return;
      }

      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      // Use the same grouped flat order that TaskList renders — fixes index mismatch when groupBy != 'none'
      const tasks = getFlatOrderedTasks(getFilteredTasks(), filters.groupBy);
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const idx = selectedTaskId ? tasks.findIndex(t => t.id === selectedTaskId) : -1;
        const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, tasks.length - 1);
        setSelectedTaskId(tasks[nextIdx]?.id ?? null);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const idx = selectedTaskId ? tasks.findIndex(t => t.id === selectedTaskId) : 0;
        const nextIdx = Math.max(idx - 1, 0);
        setSelectedTaskId(tasks[nextIdx]?.id ?? null);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setSelectedTaskId(null);
        searchRef.current?.focus();
      } else if (e.key === 'Enter') {
        if (selectedTaskId) {
          const task = tasks.find(t => t.id === selectedTaskId);
          if (task) {
            setSelectedTaskId(null);
            push(`/issues/${task.issueId.toLowerCase()}`);
          }
        }
      } else if (e.key === 'Escape') {
        setSelectedTaskId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPulse, selectedTaskId, router, filters, taskData, q]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <Sidebar appName={config?.appName || 'Clawtask'} workspaceLogo={config?.workspaceLogo} />

      <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0 }}>
        <TopBar ref={searchRef}
          onNewTask={() => setShowCreate(true)}
          filters={filters}
          onFiltersChange={setFilters}
          onSearch={query => push(withIssueSearch(searchParams, query))}
          hideAssignee={false}
          hideToolbar={isPulse}
          totalCount={isPulse ? undefined : getFilteredTasks().length}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isPulse ? (
            <div className="p-6">
              <PulseView />
            </div>
          ) : (
            <div>
              <h1 className="px-6 pt-4 pb-2 text-sm font-semibold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>
                {projectId || tagId ? pageLabel : 'All Issues'}
              </h1>
              {q && (
                <div className="px-6 pt-4 pb-2 text-sm" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
                  Results for <span style={{ color: 'var(--color-base-800)' }}>"{q}"</span>
                  <button
                    onClick={() => push(withIssueSearch(searchParams, ''))}
                    className="ml-2"
                    style={{ color: 'var(--color-base-400)' }}
                  >
                    ✕ clear
                  </button>
                </div>
              )}
              <RequestState loading={!taskData && !taskError} error={taskError} onRetry={reloadTasks} />
              {taskData && <TaskList
                tasks={getFilteredTasks()}
                selectedTaskId={selectedTaskId}
                onSelectTaskId={setSelectedTaskId}
                groupBy={filters.groupBy}
                onNewTask={() => setShowCreate(true)}
                emptyMessage="No tasks found."
                onTaskUpdated={reloadTasks}
              />}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={(_taskId, issueId) => {
            setShowCreate(false);
            push(`/issues/${issueId.toLowerCase()}`);
          }}
          defaultProjectId={projectId}
        />
      )}

      {isMobile && (
        <BottomNav
          groupBy={filters.groupBy}
          onGroupByChange={(v) => setFilters(f => ({ ...f, groupBy: v }))}
        />
      )}
    </div>
  );
}
