'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task, Activity, Comment } from '@/types';
import { useSse } from '@/hooks/useSse';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { TaskDrawer } from './TaskDrawer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ActiveAgentRun {
  task: Task;
  latestComment: Comment | null;
}

export function PulseView() {
  const [activeRuns, setActiveRuns] = useState<ActiveAgentRun[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Active agent runs (in_progress + assigned to agent)
    const runsRes = await fetch('/api/v1/tasks?status=in_progress&limit=10').then((r) => r.json());
    if (runsRes.ok) {
      const agentTasks = (runsRes.data.tasks as Task[]).filter(
        (t) => t.assigneeType === 'agent'
      );
      const runs: ActiveAgentRun[] = await Promise.all(
        agentTasks.map(async (task) => {
          const commentsRes = await fetch(`/api/v1/tasks/${task.id}/comments`).then((r) => r.json());
          const comments: Comment[] = commentsRes.ok ? commentsRes.data : [];
          const latestComment = comments.filter((c) => c.type === 'message').slice(-1)[0] || null;
          return { task, latestComment };
        })
      );
      setActiveRuns(runs);
    }

    // Recent tasks (updated last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentRes = await fetch('/api/v1/tasks?sort=updatedAt&order=desc&limit=10').then((r) => r.json());
    if (recentRes.ok) {
      const recent = (recentRes.data.tasks as Task[]).filter(
        (t) => new Date(t.updatedAt) > new Date(oneHourAgo)
      );
      setRecentTasks(recent);
    }

    // Activity feed
    const actRes = await fetch('/api/v1/activity?limit=20').then((r) => r.json());
    if (actRes.ok) setActivity(actRes.data.activity);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useSse((event) => {
    if (['task.created', 'task.updated', 'comment.added', 'comment.updated', 'activity.added'].includes(event.type)) {
      loadData();
    }
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Active Agent Runs */}
      {activeRuns.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            🤖 Active Agent Runs
          </h2>
          <div className="space-y-3">
            {activeRuns.map(({ task, latestComment }) => (
              <div
                key={task.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-700 transition-colors"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono text-zinc-500">{task.issueId}</span>
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  <span className="text-xs text-zinc-500 ml-auto">
                    🤖 {(task.assignee as any)?.displayName}
                  </span>
                </div>
                <div className="text-sm font-medium text-zinc-200 mb-2">{task.title}</div>
                {latestComment && (
                  <div className="text-xs text-zinc-500 bg-zinc-800/50 rounded p-2 border border-zinc-700/50 line-clamp-2">
                    {latestComment.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Changes */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            🕐 Changed Last Hour
          </h2>
          {recentTasks.length === 0 ? (
            <div className="text-sm text-zinc-600">No recent changes</div>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-zinc-900 rounded px-2 transition-colors"
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="text-xs font-mono text-zinc-600 w-20 flex-shrink-0">{task.issueId}</span>
                  <span className="text-sm text-zinc-300 flex-1 truncate">{task.title}</span>
                  <StatusBadge status={task.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activity Feed */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            📋 Recent Activity
          </h2>
          {activity.length === 0 ? (
            <div className="text-sm text-zinc-600">No activity yet</div>
          ) : (
            <div className="space-y-1">
              {activity.slice(0, 15).map((a) => {
                const actorEmoji = a.actorType === 'agent' ? '🤖' : '👤';
                const actorName = (a.actor as any)?.displayName || a.actorId;
                const taskName = (a.task as any)?.issueId || '';
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 py-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors"
                    onClick={() => a.taskId && setSelectedTaskId(a.taskId)}
                  >
                    <span>{actorEmoji}</span>
                    <span className="flex-1">
                      <span className="text-zinc-400">{actorName}</span>{' '}
                      {a.verb.replace(/_/g, ' ')}{' '}
                      {taskName && <span className="font-mono text-zinc-600">{taskName}</span>}
                    </span>
                    <span className="text-zinc-700 flex-shrink-0">
                      {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedTaskId && (
        <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      )}
    </div>
  );
}
