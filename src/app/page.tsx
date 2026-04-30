'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Task, Config } from '@/types';
import { useApi } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { TaskList } from '@/components/task/TaskList';
import { PulseView } from '@/components/task/PulseView';
import { CreateTaskModal } from '@/components/task/CreateTaskModal';
import { FilterState, DEFAULT_FILTERS } from '@/components/task/TaskFilters';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'pulse';
  const mineFilter = searchParams.get('mineFilter') || 'assigned'; // assigned | created | activity
  const projectId = searchParams.get('projectId') || '';
  const tagId = searchParams.get('tagId') || '';
  const q = searchParams.get('q') || '';

  const { data: config } = useApi<Config>('/api/v1/config');
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Reset filters when tab changes
  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
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
        router.push('/?tab=all');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeTab, router]);

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

  // For My Issues activity/created filters: fetch task IDs the human acted on
  const { data: meTaskIds } = useApi<{ created: string[]; activity: string[] }>(
    activeTab === 'mine' ? '/api/v1/me/task-ids' : '',
    [activeTab]
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

    // My Issues — client-side filter by sub-tab
    if (activeTab === 'mine') {
      if (mineFilter === 'assigned') {
        tasks = tasks.filter(t => t.assigneeType === 'human');
      } else if (mineFilter === 'created') {
        const ids = new Set(meTaskIds?.created ?? []);
        tasks = tasks.filter(t => ids.has(t.id));
      } else if (mineFilter === 'activity') {
        const ids = new Set(meTaskIds?.activity ?? []);
        tasks = tasks.filter(t => ids.has(t.id));
      }
    }

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
    tasks = [...tasks].sort((a, b) => {
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

  const isPulse = activeTab === 'pulse';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <Sidebar appName={config?.appName || 'Clawtask'} workspaceLogo={config?.workspaceLogo} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar ref={searchRef}
          onNewTask={() => setShowCreate(true)}
          filters={filters}
          onFiltersChange={setFilters}
          hideAssignee={activeTab === 'mine'}
          hideToolbar={isPulse}
          totalCount={isPulse ? undefined : getFilteredTasks().length}
        />

        {/* My Issues sub-nav */}
        {activeTab === 'mine' && (
          <div className="flex-shrink-0 flex items-center gap-1 px-5 pt-3 pb-0"
            style={{ borderBottom: '1px solid var(--color-base-300)', background: 'var(--color-base)' }}>
            {(['assigned', 'created', 'activity'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => router.push(`/?tab=mine&mineFilter=${f}`)}
                className="px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors"
                style={{
                  background: mineFilter === f ? 'var(--color-base-100)' : 'transparent',
                  color: mineFilter === f ? 'var(--color-base-900)' : 'var(--color-base-600)',
                  border: mineFilter === f ? '1px solid var(--color-base-300)' : '1px solid transparent',
                  borderBottom: mineFilter === f ? '1px solid var(--color-base-100)' : '1px solid transparent',
                  marginBottom: mineFilter === f ? '-1px' : '0',
                  fontFamily: "'Instrument Sans', sans-serif",
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

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
                    onClick={() => router.push(`/?tab=${activeTab}`)}
                    className="ml-2"
                    style={{ color: 'var(--color-base-400)' }}
                  >
                    ✕ clear
                  </button>
                </div>
              )}
              <TaskList
                tasks={getFilteredTasks()}
                groupBy={filters.groupBy}
                onNewTask={() => setShowCreate(true)}
                emptyMessage={
                  activeTab === 'mine' && mineFilter === 'assigned' ? 'No tasks assigned to you.' :
                  activeTab === 'mine' && mineFilter === 'created' ? 'No tasks created by you.' :
                  activeTab === 'mine' && mineFilter === 'activity' ? 'No tasks with your activity.' :
                  'No tasks found.'
                }
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
            router.push(`/issues/${issueId.toLowerCase()}`);
          }}
          defaultProjectId={projectId}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0A0A0B] flex items-center justify-center text-[var(--color-base-500)]">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
