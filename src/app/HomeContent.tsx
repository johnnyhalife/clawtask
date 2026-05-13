'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Task, Config, Project, Tag } from '@/types';
import { useApi } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { TopBar } from '@/components/layout/TopBar';
import { TaskList, getFlatOrderedTasks } from '@/components/task/TaskList';
import { PulseView } from '@/components/task/PulseView';
import { CreateTaskModal } from '@/components/task/CreateTaskModal';
import { FilterState, DEFAULT_FILTERS, GroupByField } from '@/components/task/TaskFilters';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useFavicon } from '@/hooks/useFavicon';


export function HomeContent() {
  const searchParams = useSearchParams();
  const get = searchParams.get.bind(searchParams);
  const router = useRouter();
  const { push } = router;
  const activeTab = get('tab') || 'pulse';
  const projectId = get('projectId') || '';
  const tagId = get('tagId') || '';
  const q = get('q') || '';

  const { data: config } = useApi<Config>('/api/v1/config');
  const { data: projects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags } = useApi<Tag[]>('/api/v1/tags');
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const GROUPBY_STORAGE_KEY = 'clawtask:groupBy';

  const getStoredGroupBy = (): GroupByField => {
    try {
      const stored = localStorage.getItem(GROUPBY_STORAGE_KEY);
      const valid: GroupByField[] = ['status', 'priority', 'assignee', 'project', 'none'];
      if (stored && valid.includes(stored as GroupByField)) return stored as GroupByField;
    } catch { /* SSR or storage blocked */ }
    return DEFAULT_FILTERS.groupBy;
  };

  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    groupBy: getStoredGroupBy(),
  }));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Persist groupBy to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(GROUPBY_STORAGE_KEY, filters.groupBy);
    } catch { /* storage blocked */ }
  }, [filters.groupBy]);

  // Reset filters when tab changes, but preserve the persisted groupBy
  useEffect(() => {
    setFilters(f => ({ ...DEFAULT_FILTERS, groupBy: f.groupBy }));
  }, [activeTab]);

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
  useEffect(() => { setSelectedTaskId(null); }, [activeTab]);

  const buildTaskUrl = useCallback(() => {
    const params = new URLSearchParams({ sort: 'updatedAt', order: 'desc', limit: '500' });
    if (activeTab === 'all') {
      if (projectId) params.set('projectId', projectId);
      if (tagId) params.set('tagId', tagId);
    }
    return `/api/v1/tasks?${params.toString()}`;
  }, [activeTab, projectId, tagId]);

  const { data: taskData, reload: reloadTasks } = useApi<{ tasks: Task[]; total: number }>(
    buildTaskUrl(),
    [activeTab, projectId, tagId]
  );

  useSse((event) => {
    if (['task.created', 'task.updated'].includes(event.type)) {
      reloadTasks();
    }
  });

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const getFilteredTasks = (): Task[] => {
    if (!taskData?.tasks) return [];
    let tasks = taskData.tasks;

    // Search
    if (q) {
      const lq = q.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(lq) ||
          t.issueId.toLowerCase().includes(lq) ||
          t.description.toLowerCase().includes(lq)
      );
    }

    // User-selected filters (multi-select)
    if (filters.statuses.length > 0) tasks = tasks.filter((t) => filters.statuses.includes(t.status as any));
    if (filters.priorities.length > 0) tasks = tasks.filter((t) => filters.priorities.includes(t.priority as any));
    if (filters.assignee === 'agent') tasks = tasks.filter((t) => t.assigneeType === 'agent');
    else if (filters.assignee === 'human') tasks = tasks.filter((t) => t.assigneeType === 'human');
    else if (filters.assignee === 'unassigned') tasks = tasks.filter((t) => !t.assigneeType);

    // Sort
    tasks = tasks.toSorted((a, b) => {
      let cmp = 0;
      if (filters.sortField === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (filters.sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (filters.sortField === 'priority') {
        cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      } else if (filters.sortField === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (filters.sortField === 'issueId') {
        cmp = a.issueId.localeCompare(b.issueId);
      }
      return filters.sortOrder === 'asc' ? cmp : -cmp;
    });

    return tasks;
  };

  const isMobile = useIsMobile();
  const isPulse = activeTab === 'pulse';
  const activeProject = projectId ? projects?.find(p => p.id === projectId) : null;
  const activeTag = tagId ? tags?.find(t => t.id === tagId) : null;
  const pageLabel = isPulse ? 'Pulse'
    : activeProject ? `Issues · ${activeProject.name}`
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
  }, [isPulse, selectedTaskId, router, filters, taskData]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <Sidebar appName={config?.appName || 'Clawtask'} workspaceLogo={config?.workspaceLogo} />

      <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0 }}>
        <TopBar ref={searchRef}
          onNewTask={() => setShowCreate(true)}
          filters={filters}
          onFiltersChange={setFilters}
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
              {q && (
                <div className="px-6 pt-4 pb-2 text-sm" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
                  Results for <span style={{ color: 'var(--color-base-800)' }}>"{q}"</span>
                  <button
                    onClick={() => push(`/?tab=${activeTab}`)}
                    className="ml-2"
                    style={{ color: 'var(--color-base-400)' }}
                  >
                    ✕ clear
                  </button>
                </div>
              )}
              <TaskList
                tasks={getFilteredTasks()}
                selectedTaskId={selectedTaskId}
                onSelectTaskId={setSelectedTaskId}
                groupBy={filters.groupBy}
                onNewTask={() => setShowCreate(true)}
                emptyMessage="No tasks found."
                onTaskUpdated={reloadTasks}
              />
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
