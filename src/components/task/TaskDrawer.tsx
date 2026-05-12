'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Task, Comment, Activity } from '@/types';
import { useApi, apiPatch, apiPost } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { ChipSelect, STATUS_OPTIONS, PRIORITY_OPTIONS, AGENT_COLOR } from './ChipSelect';
import { ActorAvatar, actorLabel } from '@/components/ui/ActorDisplay';
import { useIsMobile } from '@/hooks/useIsMobile';

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
}



function StatusPill({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const cfg = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
  return <ChipSelect label={cfg.label} color={cfg.color} options={STATUS_OPTIONS} onChange={onChange} />;
}

function PriorityPill({ priority, onChange }: { priority: string; onChange: (p: string) => void }) {
  const cfg = PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[2];
  return <ChipSelect label={cfg.label} color={cfg.color} options={PRIORITY_OPTIONS} onChange={onChange} />;
}

function CommentBubble({ item }: { item: Comment | (Activity & { _type: 'activity' }) }) {
  const [expanded, setExpanded] = useState(false);

  if ('verb' in item) {
    const a = item as Activity;
    const actorName = (a.actor as any)?.displayName || a.actorId;
    const isAgent = a.actorType === 'agent';
    return (
      <div
        className="flex items-start gap-2.5 py-2"
        style={{ borderBottom: '1px solid rgba(39,39,43,0.5)' }}
      >
        <ActorAvatar name={actorName} isAgent={isAgent} size={20} />
        <span className="text-xs flex-1" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
          <span style={{ color: 'var(--color-base-650)', fontWeight: 600 }}>{actorLabel(actorName, isAgent)}</span>{' '}
          {a.verb.replace(/_/g, ' ')} this issue
        </span>
        <span
          suppressHydrationWarning
          style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '0.65rem', color: 'var(--color-base-400)', flexShrink: 0 }}
        >
          {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  const comment = item as Comment;
  const authorName = (comment.author as any)?.displayName || comment.authorId;
  const isAgent = comment.authorType === 'agent';
  const authorDisplay = actorLabel(authorName, isAgent);

  if (comment.type === 'thinking') {
    return (
      <div className="py-2" style={{ borderBottom: '1px solid rgba(39,39,43,0.5)' }}>
        <div className="flex items-center gap-2">
          <ActorAvatar name={authorName} isAgent={isAgent} size={20} />
          <span className="text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
            <span style={{ color: 'var(--color-base-650)', fontWeight: 600 }}>{authorDisplay}</span> thought
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-xs transition-colors"
            style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}
          >
            {expanded ? 'collapse ▾' : 'expand ▸'}
          </button>
        </div>
        {expanded && (
          <div
            className="mt-2 ml-7 text-xs italic leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--color-base-500)', fontFamily: "'Roboto Mono', monospace" }}
          >
            {comment.content}
          </div>
        )}
      </div>
    );
  }

  if (comment.type === 'tool') {
    return (
      <div className="py-2" style={{ borderBottom: '1px solid rgba(39,39,43,0.5)' }}>
        <div className="flex items-center gap-2">
          <ActorAvatar name={authorName} isAgent={isAgent} size={20} />
          <span className="text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
            <span style={{ color: 'var(--color-base-650)', fontWeight: 600 }}>{authorDisplay}</span> used a tool
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-xs transition-colors"
            style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}
          >
            {expanded ? 'collapse ▾' : 'expand ▸'}
          </button>
        </div>
        {expanded && (
          <pre
            className="mt-2 ml-7 text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap"
            style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-650)', fontFamily: "'Roboto Mono', monospace" }}
          >
            {comment.content}
          </pre>
        )}
      </div>
    );
  }

  // Regular message comment
  return (
    <div className="py-3" style={{ borderBottom: '1px solid rgba(39,39,43,0.5)' }}>
      <div className="flex items-center gap-2.5 mb-2">
        <ActorAvatar name={authorName} isAgent={isAgent} size={24} />
        <span
          className="text-xs font-semibold"
          style={{ color: 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif" }}
        >
          {authorDisplay}
          {comment.humanRequested && isAgent && (
            <span className="ml-1 font-normal" style={{ color: 'var(--color-base-500)' }}>on behalf of you</span>
          )}
        </span>
        <span
          suppressHydrationWarning
          className="ml-auto flex-shrink-0"
          style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '0.65rem', color: 'var(--color-base-400)' }}
        >
          {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="ml-[34px] prose-clawtask">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.content || ' '}</ReactMarkdown>
      </div>
    </div>
  );
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const isMobile = useIsMobile();
  const { data: task, reload: reloadTask } = useApi<Task>(`/api/v1/tasks/${taskId}`);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<'activity' | 'chat'>('activity');
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [agents, setAgents] = useState<{ id: string; displayName: string; openclawAgentId: string }[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeLoading, setAssigneeLoading] = useState(false);

  const [humans, setHumans] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/agents').then(r => r.json()).then(d => { if (d.ok) setAgents(d.data); });
    fetch('/api/v1/humans').then(r => r.json()).then(d => { if (d.ok) setHumans(d.data); });
  }, []);

  const handleAssign = async (assigneeId: string | null, assigneeType: 'agent' | 'human' | null) => {
    setAssigneeLoading(true);
    setAssigneeOpen(false);
    try {
      await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId, assigneeType }),
      });
      reloadTask();
    } finally {
      setAssigneeLoading(false);
    }
  };
  const timelineEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments, activities]);

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
      await apiPost(`/api/v1/tasks/${taskId}/comments`, {
        content: newComment.trim(),
        type: 'message',
      });
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  // Build timeline (activity tab shows both; chat tab shows message comments only)
  const allTimeline: Array<(Comment | Activity) & { _timelineType: string }> = [
    ...comments.map((c) => ({ ...c, _timelineType: 'comment' })),
    ...activities.map((a) => ({ ...a, _timelineType: 'activity' })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const chatTimeline = comments
    .filter((c) => c.type === 'message')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const shownTimeline = activeTab === 'chat' ? chatTimeline : allTimeline;

  // Mobile: full-screen slide-up sheet
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40"
          style={{ zIndex: 40 }}
          onClick={onClose}
        />

        {/* Sheet */}
        <div
          className="fixed flex flex-col z-50 shadow-2xl overflow-hidden"
          style={{
            left: 0,
            right: 0,
            bottom: 0,
            top: '10%',
            background: 'var(--color-base-100)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            borderTop: '1px solid #27272B',
            zIndex: 50,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-base-300)' }} />
          </div>

          {/* Header: close + issue ID */}
          <div
            className="flex items-center justify-between px-5 py-2 flex-shrink-0"
            style={{ borderBottom: '1px solid #27272B' }}
          >
            <span className="font-mono-id" style={{ fontSize: '0.72rem' }}>{task?.issueId}</span>
            <button
              onClick={onClose}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {task ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Title + pills */}
              <div className="px-5 pt-3 pb-3 flex-shrink-0">
                <h2
                  style={{
                    fontFamily: "'Darker Grotesque', sans-serif",
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: 'var(--color-base-900)',
                    lineHeight: 1.3,
                    marginBottom: 8,
                  }}
                >
                  {task.title}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={task.status} onChange={handleStatusChange} />
                  <PriorityPill priority={task.priority} onChange={handlePriorityChange} />
                </div>
              </div>

              {/* Tabs */}
              <div
                className="flex items-center gap-0 px-5 flex-shrink-0"
                style={{ borderBottom: '1px solid #27272B', borderTop: '1px solid #27272B' }}
              >
                {(['activity', 'chat'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-4 py-2.5 text-xs font-medium transition-colors capitalize"
                    style={{
                      color: activeTab === tab ? 'var(--color-base-900)' : 'var(--color-base-500)',
                      borderBottom: activeTab === tab ? '2px solid #3189FF' : '2px solid transparent',
                      marginBottom: '-1px',
                      fontFamily: "'Instrument Sans', sans-serif",
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tab === 'activity' ? 'Activity' : 'Chat'}
                  </button>
                ))}
              </div>

              {/* Timeline */}
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {shownTimeline.map((item) => (
                  <CommentBubble key={item.id} item={item as any} />
                ))}
                {shownTimeline.length === 0 && (
                  <div className="py-8 text-center text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>
                    {activeTab === 'chat' ? 'No messages yet' : 'No activity yet'}
                  </div>
                )}
                <div ref={timelineEndRef} />
              </div>

              {/* Comment input — pinned above safe area */}
              <form
                onSubmit={handleComment}
                className="flex-shrink-0 px-4 py-3"
                style={{ borderTop: '1px solid #27272B' }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm rounded-lg resize-none"
                    style={{
                      background: 'var(--color-base-150)',
                      border: '1px solid var(--color-base-300)',
                      color: 'var(--color-base-800)',
                      fontFamily: "'Instrument Sans', sans-serif",
                      outline: 'none',
                    }}
                    onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3189FF'; }}
                    onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-base-300)'; }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(e as any);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    className="flex-shrink-0 px-3 py-2 rounded-md text-xs font-semibold"
                    style={{
                      background: '#3189FF',
                      color: 'var(--color-base)',
                      fontFamily: "'Instrument Sans', sans-serif",
                      opacity: submitting || !newComment.trim() ? 0.4 : 1,
                      cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer',
                      border: 'none',
                      minHeight: '44px',
                    }}
                  >
                    {submitting ? '…' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>
              Loading…
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full flex flex-col z-50 shadow-2xl overflow-hidden"
        style={{
          width: '380px',
          maxWidth: '100%',
          background: 'var(--color-base-100)',
          borderLeft: '1px solid #27272B',
        }}
      >
        {/* Header: close + issue ID */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #27272B' }}
        >
          <span
            className="font-mono-id"
            style={{ fontSize: '0.72rem' }}
          >
            {task?.issueId}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-base-500)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-base-800)';
              (e.currentTarget as HTMLElement).style.background = 'var(--color-base-150)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-base-500)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {task ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Title + pills */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              <h2
                className="font-display mb-3"
                style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 700,
                  fontSize: '1.15rem',
                  color: 'var(--color-base-900)',
                  lineHeight: 1.3,
                }}
              >
                {task.title}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={task.status} onChange={handleStatusChange} />
                <PriorityPill priority={task.priority} onChange={handlePriorityChange} />
              </div>
            </div>

            {/* Properties (simplified) */}
            <div
              className="px-5 py-3 flex-shrink-0 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"
              style={{ borderTop: '1px solid #27272B', borderBottom: '1px solid #27272B' }}
            >
              <div>
                <div className="section-label mb-1" style={{ fontSize: '10px' }}>Assignee</div>
                <div style={{ position: 'relative' }}>
                  {(task.status === 'todo' || task.status === 'backlog') ? (
                    <>
                      <button
                        onClick={() => setAssigneeOpen(v => !v)}
                        disabled={assigneeLoading}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-opacity hover:opacity-80"
                        style={{
                          borderColor: '#7E67F750',
                          backgroundColor: '#7E67F720',
                          color: task.assignee ? '#7E67F7' : 'var(--color-base-500)',
                          fontFamily: "'Instrument Sans', sans-serif",
                        }}
                      >
                        {task.assignee ? (task.assignee as any).displayName : 'Unassigned'}
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {assigneeOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setAssigneeOpen(false)} />
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 20,
                            background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)',
                            borderRadius: '8px', minWidth: '160px', overflow: 'hidden',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: '4px',
                          }}>
                            <button
                              onClick={() => handleAssign(null, null)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                              style={{ background: !task.assignee ? 'var(--color-base-150)' : 'transparent', color: !task.assignee ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                              onMouseLeave={e => (e.currentTarget.style.background = !task.assignee ? 'var(--color-base-150)' : 'transparent')}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-base-400)' }} />
                              Unassigned
                            </button>
                            {humans.length > 0 && (
                              <div className="px-3 pt-2 pb-0.5 text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.6rem' }}>Me</div>
                            )}
                            {humans.map(h => (
                              <button
                                key={h.id}
                                onClick={() => handleAssign(h.id, 'human')}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ background: task.assigneeId === h.id ? 'var(--color-base-150)' : 'transparent', color: task.assigneeId === h.id ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                                onMouseLeave={e => (e.currentTarget.style.background = task.assigneeId === h.id ? 'var(--color-base-150)' : 'transparent')}
                              >
                                <ActorAvatar name={h.displayName} isAgent={false} size={14} />
                                {h.displayName}
                              </button>
                            ))}
                            {agents.length > 0 && (
                              <div className="px-3 pt-2 pb-0.5 text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.6rem' }}>Agents</div>
                            )}
                            {agents.map(a => (
                              <button
                                key={a.id}
                                onClick={() => handleAssign(a.id, 'agent')}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ background: task.assigneeId === a.id ? 'var(--color-base-150)' : 'transparent', color: task.assigneeId === a.id ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                                onMouseLeave={e => (e.currentTarget.style.background = task.assigneeId === a.id ? 'var(--color-base-150)' : 'transparent')}
                              >
                                <ActorAvatar name={a.displayName} isAgent={true} size={14} />
                                {a.displayName}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                      style={{
                        borderColor: '#7E67F750',
                        backgroundColor: '#7E67F720',
                        color: task.assignee ? '#7E67F7' : 'var(--color-base-500)',
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      {task.assignee ? (task.assignee as any).displayName : 'Unassigned'}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="section-label mb-1" style={{ fontSize: '10px' }}>Project</div>
                <div style={{ color: 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif" }}>
                  {task.project ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.project.color }} />
                      {task.project.name}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-base-400)' }}>None</span>
                  )}
                </div>
              </div>
              <div>
                <div className="section-label mb-1" style={{ fontSize: '10px' }}>Created</div>
                <div
                  suppressHydrationWarning
                  style={{ color: 'var(--color-base-650)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.7rem' }}
                >
                  {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              {task.tags && task.tags.length > 0 && (
                <div className="col-span-2">
                  <div className="section-label mb-1" style={{ fontSize: '10px' }}>Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                        style={{ borderColor: tag.color + '50', backgroundColor: tag.color + '20', color: tag.color, fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div
                className="px-5 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid #27272B' }}
              >
                <div className="section-label mb-2" style={{ fontSize: '10px' }}>Description</div>
                <div className="prose-clawtask text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Subtasks */}
            {task.subtasks && task.subtasks.length > 0 && (
              <div
                className="px-5 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid #27272B' }}
              >
                <div className="section-label mb-2" style={{ fontSize: '10px' }}>Subtasks ({task.subtasks.length})</div>
                <div className="space-y-1.5">
                  {task.subtasks.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2.5 py-1.5 px-3 rounded-md"
                      style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)' }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sub.status === 'done' ? '#22C55E' : sub.status === 'in_progress' ? '#3189FF' : sub.status === 'backlog' ? '#94A3B8' : 'var(--color-base-650)' }} />
                      <span className="font-mono-id">{sub.issueId}</span>
                      <span className="text-sm flex-1 truncate" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>{sub.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div
              className="flex items-center gap-0 px-5 flex-shrink-0"
              style={{ borderBottom: '1px solid #27272B' }}
            >
              {(['activity', 'chat'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2.5 text-xs font-medium transition-colors capitalize"
                  style={{
                    color: activeTab === tab ? 'var(--color-base-900)' : 'var(--color-base-500)',
                    borderBottom: activeTab === tab ? '2px solid #3189FF' : '2px solid transparent',
                    marginBottom: '-1px',
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {tab === 'activity' ? 'Activity' : 'Chat'}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto px-5 py-2">
              {shownTimeline.map((item) => (
                <CommentBubble key={item.id} item={item as any} />
              ))}
              {shownTimeline.length === 0 && (
                <div
                  className="py-8 text-center text-xs"
                  style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  {activeTab === 'chat' ? 'No messages yet' : 'No activity yet'}
                </div>
              )}
              <div ref={timelineEndRef} />
            </div>

            {/* Comment input */}
            <form
              onSubmit={handleComment}
              className="flex-shrink-0 px-5 py-3"
              style={{ borderTop: '1px solid #27272B' }}
            >
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment… (Markdown supported)"
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg resize-none transition-colors"
                style={{
                  background: 'var(--color-base-150)',
                  border: '1px solid var(--color-base-300)',
                  color: 'var(--color-base-800)',
                  fontFamily: "'Instrument Sans', sans-serif",
                  outline: 'none',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3189FF'; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-base-300)'; }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(e as any);
                }}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold transition-opacity"
                  style={{
                    background: '#3189FF',
                    color: 'var(--color-base)',
                    fontFamily: "'Instrument Sans', sans-serif",
                    opacity: submitting || !newComment.trim() ? 0.4 : 1,
                    cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>
            Loading…
          </div>
        )}
      </div>
    </>
  );
}
