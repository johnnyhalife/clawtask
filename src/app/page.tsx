'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Task, Config } from '@/types';
import { useApi } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { TaskList } from '@/components/task/TaskList';
import { PulseView } from '@/components/task/PulseView';
import { CreateTaskModal } from '@/components/task/CreateTaskModal';
import { Button } from '@/components/ui/Button';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'pulse';
  const projectId = searchParams.get('projectId') || '';
  const tagId = searchParams.get('tagId') || '';
  const q = searchParams.get('q') || '';

  const { data: config } = useApi<Config>('/api/v1/config');
  const [showCreate, setShowCreate] = useState(false);

  const buildTaskUrl = useCallback(() => {
    const params = new URLSearchParams({ sort: 'updatedAt', order: 'desc', limit: '100' });

    if (activeTab === 'mine') {
      // Mine: tasks without agent assignee (human or unassigned), not done
      params.set('status', '');
    } else if (activeTab === 'recent') {
      // Recent: updated in last 24h — we'll filter client side
    } else if (activeTab === 'all') {
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

  const getFilteredTasks = (): Task[] => {
    if (!taskData?.tasks) return [];
    let tasks = taskData.tasks;

    if (activeTab === 'mine') {
      tasks = tasks.filter((t) => t.assigneeType === 'human' || !t.assigneeType);
      tasks = tasks.filter((t) => t.status !== 'done');
    } else if (activeTab === 'recent') {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      tasks = tasks.filter((t) => new Date(t.updatedAt) > cutoff);
    }

    if (q) {
      const lq = q.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(lq) ||
          t.issueId.toLowerCase().includes(lq) ||
          t.description.toLowerCase().includes(lq)
      );
    }

    return tasks;
  };

  const tabs = [
    { key: 'pulse', label: '⚡ Pulse' },
    { key: 'mine', label: '👤 Mine' },
    { key: 'recent', label: '🕐 Recent' },
    { key: 'all', label: '📋 All' },
  ];

  return (
    <div className="flex h-screen bg-[#0A0A0B] overflow-hidden">
      <Sidebar appName={config?.appName || 'Clawtask'} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-zinc-800 bg-[#0A0A0B]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => router.push(`/?tab=${tab.key}`)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <div className="ml-auto pb-2">
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              + New Task
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'pulse' ? (
            <div className="p-6">
              <PulseView />
            </div>
          ) : (
            <div>
              {q && (
                <div className="px-6 pt-4 pb-2 text-sm text-zinc-500">
                  Search results for <span className="text-zinc-300">"{q}"</span>
                  <button
                    onClick={() => router.push(`/?tab=${activeTab}`)}
                    className="ml-2 text-zinc-600 hover:text-zinc-400"
                  >
                    ✕ clear
                  </button>
                </div>
              )}
              <TaskList
                tasks={getFilteredTasks()}
                emptyMessage={
                  activeTab === 'mine'
                    ? 'No tasks assigned to you.'
                    : activeTab === 'recent'
                    ? 'No tasks updated in the last 24 hours.'
                    : 'No tasks found.'
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
          onCreated={() => {
            setShowCreate(false);
            reloadTasks();
          }}
          defaultProjectId={projectId}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0A0A0B] flex items-center justify-center text-zinc-600">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
