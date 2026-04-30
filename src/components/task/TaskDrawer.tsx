'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Task, Comment, Activity } from '@/types';
import { useApi, apiPatch, apiPost } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { PriorityBadge, StatusBadge, TagBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
}

function TimelineItem({ item }: { item: Comment | (Activity & { _type: 'activity' }) }) {
  const [expanded, setExpanded] = useState(false);

  if ('verb' in item) {
    // Activity
    const actorEmoji = item.actorType === 'agent' ? '🤖' : '👤';
    const actorName = (item.actor as any)?.displayName || item.actorId;
    const humanReqSuffix =
      item.humanRequested && item.actorType === 'agent'
        ? ` on behalf of 👤 ${(item as any).humanDisplayName || 'you'}`
        : '';

    return (
      <div className="flex items-start gap-3 py-2 text-xs text-zinc-500">
        <span className="mt-0.5">{actorEmoji}</span>
        <span>
          {actorName} {item.verb.replace(/_/g, ' ')} this task{humanReqSuffix}
        </span>
        <span className="ml-auto flex-shrink-0">{new Date(item.createdAt).toLocaleTimeString()}</span>
      </div>
    );
  }

  // Comment
  const comment = item as Comment;
  const authorEmoji = comment.authorType === 'agent' ? '🤖' : '👤';
  const authorName = (comment.author as any)?.displayName || comment.authorId;
  const humanReqSuffix =
    comment.humanRequested && comment.authorType === 'agent'
      ? ` on behalf of 👤 you`
      : '';

  if (comment.type === 'thinking') {
    return (
      <div className="py-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span>{authorEmoji}</span>
          <span>{authorName} thought{humanReqSuffix}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {expanded ? '▾ collapse' : '▸ expand'}
          </button>
        </div>
        {expanded && (
          <div className="mt-2 ml-6 text-xs text-zinc-600 italic font-mono whitespace-pre-wrap leading-relaxed">
            {comment.content}
          </div>
        )}
      </div>
    );
  }

  if (comment.type === 'tool') {
    return (
      <div className="py-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span>🔧</span>
          <span>{authorName} used a tool{humanReqSuffix}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {expanded ? '▾ collapse' : '▸ expand'}
          </button>
        </div>
        {expanded && (
          <pre className="mt-2 ml-6 text-xs text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {comment.content}
          </pre>
        )}
      </div>
    );
  }

  // Message
  return (
    <div className="py-3 border-b border-zinc-800/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{authorEmoji}</span>
        <span className="text-xs font-medium text-zinc-400">{authorName}{humanReqSuffix}</span>
        <span className="ml-auto text-xs text-zinc-600">
          {new Date(comment.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="ml-6 prose-clawtask">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content || ' '}</ReactMarkdown>
      </div>
    </div>
  );
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const { data: task, reload: reloadTask } = useApi<Task>(`/api/v1/tasks/${taskId}`);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  // Load comments and activity
  const loadTimeline = useCallback(async () => {
    const [cRes, aRes] = await Promise.all([
      fetch(`/api/v1/tasks/${taskId}/comments`).then((r) => r.json()),
      fetch(`/api/v1/tasks/${taskId}/activity`).then((r) => r.json()),
    ]);
    if (cRes.ok) setComments(cRes.data);
    if (aRes.ok) setActivities(aRes.data);
  }, [taskId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Auto-scroll
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments, activities]);

  // SSE for realtime updates
  useSse((event) => {
    if (event.type === 'comment.added') {
      const c = event.data as Comment;
      if (c.taskId === taskId) {
        setComments((prev) => {
          const exists = prev.find((x) => x.id === c.id);
          return exists ? prev : [...prev, c];
        });
      }
    }
    if (event.type === 'comment.updated') {
      const c = event.data as Comment;
      if (c.taskId === taskId) {
        setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      }
    }
    if (event.type === 'activity.added') {
      const a = event.data as Activity;
      if (a.taskId === taskId) {
        setActivities((prev) => {
          const exists = prev.find((x) => x.id === a.id);
          return exists ? prev : [...prev, a];
        });
      }
    }
    if (event.type === 'task.updated') {
      const t = event.data as Task;
      if (t.id === taskId) reloadTask();
    }
  });

  const handleStatusChange = async (status: string) => {
    await apiPost(`/api/v1/tasks/${taskId}/status`, { status });
    reloadTask();
  };

  const handlePriorityChange = async (priority: string) => {
    await apiPatch(`/api/v1/tasks/${taskId}`, { priority });
    reloadTask();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/v1/tasks/${taskId}/comments`, { content: newComment.trim(), type: 'message' });
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  // Build merged timeline sorted by createdAt
  const timeline: Array<(Comment | Activity) & { _timelineType: string }> = [
    ...comments.map((c) => ({ ...c, _timelineType: 'comment' })),
    ...activities.map((a) => ({ ...a, _timelineType: 'activity' })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-full bg-[#131316] border-l border-zinc-800 z-50 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500">{task?.issueId}</span>
            {task && <StatusBadge status={task.status} />}
            {task && <PriorityBadge priority={task.priority} />}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {task ? (
          <div className="flex-1 overflow-y-auto">
            {/* Title */}
            <div className="px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold text-zinc-100">{task.title}</h2>
            </div>

            {/* Metadata */}
            <div className="px-6 pb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Status</div>
                <Select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="!py-1 !text-xs"
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </Select>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Priority</div>
                <Select
                  value={task.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="!py-1 !text-xs"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Assignee</div>
                <div className="text-sm text-zinc-400">
                  {task.assignee ? (
                    <span>
                      {task.assigneeType === 'agent' ? '🤖' : '👤'}{' '}
                      {(task.assignee as any).displayName}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Unassigned</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Project</div>
                <div className="text-sm text-zinc-400">
                  {task.project ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                      {task.project.name}
                    </span>
                  ) : (
                    <span className="text-zinc-600">None</span>
                  )}
                </div>
              </div>
              {task.tags && task.tags.length > 0 && (
                <div className="col-span-2">
                  <div className="text-xs text-zinc-500 mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map((tag) => (
                      <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div className="px-6 pb-4 border-t border-zinc-800 pt-4">
                <div className="text-xs text-zinc-500 mb-2">Description</div>
                <div className="prose-clawtask">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Subtasks */}
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="px-6 pb-4 border-t border-zinc-800 pt-4">
                <div className="text-xs text-zinc-500 mb-2">Subtasks ({task.subtasks.length})</div>
                <div className="space-y-2">
                  {task.subtasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 py-1.5 px-3 rounded bg-zinc-900 border border-zinc-800">
                      <StatusBadge status={sub.status} />
                      <span className="text-xs font-mono text-zinc-500">{sub.issueId}</span>
                      <span className="text-sm text-zinc-300 flex-1 truncate">{sub.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="px-6 pt-4 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 mb-3">Activity & Comments</div>
              <div className="space-y-0">
                {timeline.map((item) => (
                  <TimelineItem key={item.id} item={item as any} />
                ))}
                {timeline.length === 0 && (
                  <div className="text-xs text-zinc-600 py-4 text-center">No activity yet</div>
                )}
                <div ref={timelineEndRef} />
              </div>
            </div>

            {/* Comment input */}
            <form onSubmit={handleComment} className="px-6 py-4 border-t border-zinc-800 mt-4">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment... (supports Markdown)"
                rows={3}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(e as any);
                }}
              />
              <div className="flex justify-end mt-2">
                <Button type="submit" variant="primary" size="sm" disabled={submitting || !newComment.trim()}>
                  {submitting ? 'Sending...' : 'Comment'}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            Loading...
          </div>
        )}
      </div>
    </>
  );
}
