'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Task, Comment, Activity } from '@/types';
import { useApi, apiPatch, apiPost } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { ChipSelect, ChipSelectHandle, STATUS_OPTIONS, PRIORITY_OPTIONS } from '@/components/task/ChipSelect';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { Tag, Project } from '@/types';
import { ActorAvatar, actorLabel } from '@/components/ui/ActorDisplay';
import { useTheme } from '@/components/ui/ThemeProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLOR: Record<string, string> = {
  todo: '#71717A', in_progress: '#3189FF', blocked: '#F87171', done: '#22C55E', archived: '#71717A',
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#F87171', high: '#FFC674', medium: '#FFC674', low: '#71717A',
};

// ─── Markdown component overrides (theme-aware) ─────────────────────────────
const mdComponents = {
  code({ className, children, ...props }: any) {
    const isBlock = !!className?.startsWith('language-');
    return isBlock ? (
      <code className={className} style={{ display: 'block', background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 4, padding: '0.15em 0.4em', color: 'var(--color-base-800)', fontFamily: "'Roboto Mono',monospace", fontSize: '0.82em' }} {...props}>{children}</code>
    ) : (
      <code style={{ background: 'var(--color-base-200)', border: '1px solid var(--color-base-300)', borderRadius: 3, padding: '0.1em 0.35em', color: 'var(--color-accent)', fontFamily: "'Roboto Mono',monospace", fontSize: '0.85em' }} {...props}>{children}</code>
    );
  },
  pre({ children, ...props }: any) {
    return <pre style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 6, padding: '0.75rem 1rem', overflowX: 'auto', margin: '0.5rem 0', color: 'var(--color-base-800)', fontFamily: "'Roboto Mono',monospace", fontSize: '0.82em' }} {...props}>{children}</pre>;
  },
  table({ children, ...props }: any) {
    return <table style={{ borderCollapse: 'collapse', width: '100%', margin: '0.5rem 0', fontSize: '0.85em' }} {...props}>{children}</table>;
  },
  th({ children, ...props }: any) {
    return <th style={{ border: '1px solid var(--color-base-300)', padding: '0.3rem 0.6rem', background: 'var(--color-base-200)', color: 'var(--color-base-700)', fontWeight: 600, textAlign: 'left' }} {...props}>{children}</th>;
  },
  td({ children, ...props }: any) {
    return <td style={{ border: '1px solid var(--color-base-300)', padding: '0.3rem 0.6rem', color: 'var(--color-base-800)' }} {...props}>{children}</td>;
  },
};

// ─── Property row ─────────────────────────────────────────────────────────────
function PropRow({ label, kbd, children }: { label: string; kbd?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2.5 group">
      <div className="flex-shrink-0 w-24 flex items-center gap-1.5 pt-0.5">
        <span className="text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>{label}</span>
        {kbd && (
          <span
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[0.55rem] px-1 rounded"
            style={{ color: 'var(--color-base-400)', background: 'var(--color-base-200)', border: '1px solid var(--color-base-300)', fontFamily: "'Roboto Mono', monospace", lineHeight: 1.6 }}
          >{kbd}</span>
        )}
      </div>
      <div className="flex-1 text-sm" style={{ fontFamily: "'Instrument Sans', sans-serif", color: 'var(--color-base-700)' }}>{children}</div>
    </div>
  );
}

// Avatar is now ActorAvatar from shared component

// ─── Timeline entry ───────────────────────────────────────────────────────────
function TimelineEntry({ item, showHeader = true, showBorder = true, groupLastTime }: { item: (Comment | Activity) & { _timelineType: string }; showHeader?: boolean; showBorder?: boolean; groupLastTime?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  if (item._timelineType === 'activity') {
    const a = item as Activity;
    const actorName = (a.actor as any)?.displayName || a.actorId;
    const isAgent = a.actorType === 'agent';
    const actorDisplay = actorLabel(actorName, isAgent);

    if (a.verb === 'status_changed' && a.meta) {
      const from = (a.meta as any).from as string;
      const to = (a.meta as any).to as string;
      return (
        <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          <ActorAvatar name={actorName} isAgent={isAgent} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>{actorDisplay}</span>
              <span className="text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>updated this task</span>
              <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace" }}>{relativeTime(a.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-base-200)', color: 'var(--color-base-500)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.08em' }}>STATUS</span>
              <span className="text-xs" style={{ color: 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}>{from?.replace(/_/g, ' ')}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3A3A3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              <span className="text-xs font-semibold" style={{ color: STATUS_COLOR[to] ?? '#71717A', fontFamily: "'Instrument Sans', sans-serif" }}>{to?.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>
      );
    }

    // Generic activity
    return (
      <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
        <ActorAvatar name={actorName} isAgent={isAgent} size={28} />
        <span className="text-sm flex-1" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
          <span style={{ color: 'var(--color-base-800)', fontWeight: 600 }}>{actorDisplay}</span>
          {' '}<span style={{ color: 'var(--color-base-500)' }}>{a.verb.replace(/_/g, ' ')} this issue</span>
        </span>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace" }}>{relativeTime(a.createdAt)}</span>
      </div>
    );
  }

  const c = item as Comment;
  const authorName = (c.author as any)?.displayName || c.authorId;
  const isAgent = c.authorType === 'agent';
  const authorDisplay = actorLabel(authorName, isAgent);

  // Thinking / tool — collapsible header row
  if (c.type === 'thinking' || c.type === 'tool') {
    return (
      <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
        <ActorAvatar name={authorName} isAgent={isAgent} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>{authorDisplay}</span>
            <span className="text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
              {c.type === 'thinking' ? 'thought' : 'used a tool'}
            </span>
            <button onClick={() => setCollapsed(v => !v)} style={{ color: 'var(--color-base-400)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <span className="text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace" }}>{relativeTime(c.createdAt)}</span>
          </div>
          {!collapsed && (
            <pre className="mt-2 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap" style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-600)', fontFamily: "'Roboto Mono', monospace" }}>
              {c.content}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={showHeader ? "py-3" : "pt-1 pb-2"} style={{ borderBottom: showBorder ? '1px solid var(--color-base-200)' : 'none' }}>
      {showHeader ? (
        <div className="flex items-center gap-3 mb-2">
          <ActorAvatar name={authorName} isAgent={isAgent} size={28} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>{authorDisplay}</span>
          <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace" }}>{relativeTime(groupLastTime ?? c.createdAt)}</span>
        </div>
      ) : null}
      <div className="pl-10 prose-clawtask text-sm" style={{ color: 'var(--color-base-800)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{c.content || ' '}</ReactMarkdown>
      </div>

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function IssuePage() {
  const params = useParams();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const taskSlug = params.id as string; // may be slug (cwt-012) or UUID

  const { data: config } = useApi<Record<string, string>>('/api/v1/config');
  const { data: task, reload: reloadTask } = useApi<Task>(`/api/v1/tasks/${taskSlug}`);
  // Real UUID — used for SSE matching and sub-resource calls once task loads
  const taskId = task?.id ?? taskSlug;
  const { data: allTags } = useApi<Tag[]>('/api/v1/tags');
  const { data: allProjects } = useApi<Project[]>('/api/v1/projects');
  const { data: allAgents } = useApi<{ id: string; displayName: string }[]>('/api/v1/agents');
  const { data: allHumans } = useApi<{ id: string; displayName: string }[]>('/api/v1/humans');
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'activity'>('chat');
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // Populate edit fields when opening editor
  useEffect(() => {
    if (editingTask && task) { setEditTitle(task.title ?? ''); setEditDescription(task.description ?? ''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTask]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Inline-edit open states
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeHighlight, setAssigneeHighlight] = useState(0);
  const statusRef = useRef<ChipSelectHandle>(null);
  const priorityRef = useRef<ChipSelectHandle>(null);
  const assigneeTriggerRef = useRef<HTMLButtonElement>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const loadTimeline = useCallback(async () => {
    const [cRes, aRes] = await Promise.all([
      fetch(`/api/v1/tasks/${taskSlug}/comments`).then(r => r.json()),
      fetch(`/api/v1/tasks/${taskSlug}/activity`).then(r => r.json()),
    ]);
    if (cRes.ok) setComments(cRes.data);
    if (aRes.ok) setActivities(aRes.data);
  }, [taskSlug]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments, activities]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === 'Escape') {
        if (assigneeOpen) { e.stopPropagation(); setAssigneeOpen(false); return; }
        if (editingTask) { e.stopPropagation(); setEditingTask(false); return; }
        router.push('/');
        return;
      }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEditingTask(true); }
      if (isEditing) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); statusRef.current?.openDropdown(); }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); priorityRef.current?.openDropdown(); }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setAssigneeOpen(true); assigneeTriggerRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [router, assigneeOpen, editingTask]);

  useSse(event => {
    if (event.type === 'comment.added') {
      const c = event.data as Comment;
      if (c.taskId === taskId) setComments(p => p.find(x => x.id === c.id) ? p : [...p, c]);
    }
    if (event.type === 'comment.updated') {
      const c = event.data as Comment;
      if (c.taskId === taskId) setComments(p => p.map(x => x.id === c.id ? c : x));
    }
    if (event.type === 'activity.added') {
      const a = event.data as Activity;
      if (a.taskId === taskId) setActivities(p => p.find(x => x.id === a.id) ? p : [...p, a]);
    }
    if (event.type === 'task.updated') {
      const t = event.data as Task;
      if (t.id === taskId) reloadTask();
    }
  }, () => { reloadTask(); loadTimeline(); });

  // is the task actively being worked on by an agent?
  const inFlight = task?.status === 'in_progress' && !!task?.assigneeId;

  const handleStatusChange = async (status: string) => {
    await apiPost(`/api/v1/tasks/${taskId}/status`, { status });
    reloadTask();
  };
  const handlePriorityChange = async (priority: string) => {
    await apiPatch(`/api/v1/tasks/${taskId}`, { priority });
    reloadTask();
  };
  const handleAssignChange = async (assigneeId: string | null, assigneeType: 'agent' | 'human' | null) => {
    setAssigneeOpen(false);
    await apiPatch(`/api/v1/tasks/${taskId}`, { assigneeId, assigneeType });
    reloadTask();
  };
  const handleProjectChange = async (pid: string | null) => {
    setProjectOpen(false);
    await apiPatch(`/api/v1/tasks/${taskId}`, { projectId: pid });
    reloadTask();
  };
  const handleTagToggle = async (tagId: string) => {
    const current = task?.tags?.map(t => t.id) ?? [];
    const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId];
    await apiPatch(`/api/v1/tasks/${taskId}`, { tags: next });
    reloadTask();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    const text = newComment.trim();
    setNewComment('');
    try {
      await apiPost(`/api/v1/tasks/${taskId}/comments`, { content: text, type: 'message' });
    } catch (err) {
      setNewComment(text); // restore on failure
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
      loadTimeline(); // always sync — don't rely solely on SSE
    }
  };

  // Filter out empty agent messages (noise from adapter turns with no text output)
  const visibleComments = comments.filter(c => c.content.trim() !== '');

  const allTimeline = [
    ...visibleComments.map(c => ({ ...c, _timelineType: 'comment' as const })),
    ...activities.map(a => ({ ...a, _timelineType: 'activity' as const })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Chat tab: group consecutive agent messages into a single collapsible block
  const rawChat = visibleComments
    .filter(c => c.type === 'message')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const FIVE_MIN_MS = 5 * 60 * 1000;
  // For each group-start, find the last message in the run to use its timestamp
  const chatTimeline = rawChat.map((c, i) => {
    const prev = rawChat[i - 1];
    const next = rawChat[i + 1];
    const samePrev = prev && prev.authorId === c.authorId &&
      Math.abs(new Date(c.createdAt).getTime() - new Date(prev.createdAt).getTime()) < FIVE_MIN_MS;
    const sameNext = next && next.authorId === c.authorId &&
      Math.abs(new Date(next.createdAt).getTime() - new Date(c.createdAt).getTime()) < FIVE_MIN_MS;
    // Find the last message in this run (for group-start header timestamp)
    let lastInRun = c;
    if (!samePrev) {
      let j = i;
      while (j + 1 < rawChat.length && rawChat[j + 1].authorId === c.authorId &&
        Math.abs(new Date(rawChat[j + 1].createdAt).getTime() - new Date(rawChat[j].createdAt).getTime()) < FIVE_MIN_MS) j++;
      lastInRun = rawChat[j];
    }
    return { ...c, _timelineType: 'comment' as const, _showHeader: !samePrev, _showBorder: !sameNext, _groupLastTime: lastInRun.createdAt };
  });

  const timeline = activeTab === 'chat' ? chatTimeline : allTimeline;

  const statusCfg = STATUS_OPTIONS.find(o => o.value === task?.status) ?? STATUS_OPTIONS[0];
  const priorityCfg = PRIORITY_OPTIONS.find(o => o.value === task?.priority) ?? PRIORITY_OPTIONS[2];
  const appName = config?.appName ?? 'Clawtask';
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col overflow-hidden" style={{ background: 'var(--color-base)', height: '100dvh' }}>
        {/* Mobile: top nav bar */}
        <div
          className="flex items-center gap-2 px-4 flex-shrink-0"
          style={{ height: 44, borderBottom: '1px solid var(--color-base-200)', background: 'var(--color-base)' }}
        >
          <Link href="/" style={{ color: 'var(--color-base-500)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <span className="flex-1 truncate text-sm" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600 }}>
            {task?.issueId ?? '…'}
          </span>
        </div>

        {/* Properties: horizontal scrollable chip row */}
        <div
          className="flex-shrink-0 px-4 py-2"
          style={{ borderBottom: '1px solid var(--color-base-200)', overflowX: 'auto', whiteSpace: 'nowrap' }}
        >
          {task ? (
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <ChipSelect ref={statusRef} label={statusCfg.label} color={statusCfg.color} options={STATUS_OPTIONS} onChange={handleStatusChange} />
              <ChipSelect ref={priorityRef} label={priorityCfg.label} color={priorityCfg.color} options={PRIORITY_OPTIONS} onChange={handlePriorityChange} />
              {task.assignee && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border"
                  style={{ borderColor: '#7E67F750', background: '#7E67F720', color: '#7E67F7', fontFamily: "'Instrument Sans', sans-serif", whiteSpace: 'nowrap' }}
                >
                  <ActorAvatar name={(task.assignee as any).displayName ?? ''} isAgent={task.assigneeType === 'agent'} size={14} />
                  {task.assigneeType === 'human' ? 'You' : (task.assignee as any).displayName}
                </span>
              )}
              {task.project && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border"
                  style={{ borderColor: task.project.color + '50', background: task.project.color + '20', color: task.project.color, fontFamily: "'Instrument Sans', sans-serif", whiteSpace: 'nowrap' }}
                >
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.project.color }} />
                  {task.project.name}
                </span>
              )}
              {task.tags?.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
                  style={{ borderColor: tag.color + '50', background: tag.color + '20', color: tag.color, fontFamily: "'Instrument Sans', sans-serif", whiteSpace: 'nowrap' }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Issue header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          <h1 style={{ fontFamily: "'Instrument Sans', sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-base-900)', lineHeight: 1.3, marginBottom: task?.description ? 8 : 0 }}>
            {task?.title}
          </h1>
          {task?.description && (
            <div className="prose-clawtask" style={{ color: 'var(--color-base-600)', fontSize: '0.875rem' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{task.description}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center px-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          {(['chat', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
              style={{
                color: activeTab === tab ? 'var(--color-base-900)' : 'var(--color-base-500)',
                borderBottom: activeTab === tab ? '2px solid var(--color-base-900)' : '2px solid transparent',
                marginBottom: '-1px',
                fontFamily: "'Instrument Sans', sans-serif",
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ paddingBottom: 'calc(140px + env(safe-area-inset-bottom))' }}>
          {timeline.map(item => {
            const ext = item as any;
            return <TimelineEntry key={item.id} item={item as any} showHeader={ext._showHeader !== false} showBorder={ext._showBorder !== false} groupLastTime={ext._groupLastTime} />;
          })}
          {timeline.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>
              {activeTab === 'chat' ? 'No messages yet' : 'No activity yet'}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply box — pinned above bottom nav */}
        <form
          onSubmit={handleComment}
          className="flex-shrink-0 px-4 py-3"
          style={{
            borderTop: '1px solid var(--color-base-200)',
            background: 'var(--color-base)',
            position: 'sticky',
            bottom: 'calc(56px + env(safe-area-inset-bottom))',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Reply"
              rows={2}
              className="flex-1 px-3 py-2 text-sm rounded-xl resize-none"
              style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", outline: 'none' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-base-500)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(e as any); }}
            />
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--color-base-900)', color: 'var(--color-base)', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 700, opacity: submitting || !newComment.trim() ? 0.4 : 1, cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer', border: 'none', minHeight: '44px' }}
            >
              {submitting ? '…' : 'Send'}
            </button>
          </div>
        </form>

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-base)' }}>
      {/* Sidebar */}
      <Sidebar appName={appName} workspaceLogo={config?.workspaceLogo} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Center ── */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--color-base-200)' }}>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 px-6 flex-shrink-0" style={{ height: 48, borderBottom: '1px solid var(--color-base-200)', background: 'var(--color-base)' }}>
            <Link href="/" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.85rem', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}>
              Issues
            </Link>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3A3A3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-sm truncate" style={{ color: 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}>
              {task?.title ?? '…'}
            </span>
          </div>

          {/* Issue header */}
          <div className="flex-shrink-0 px-8 pt-6 pb-5" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
            {/* Meta row */}
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[task?.status ?? 'todo'] }} />
              <span style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.72rem' }}>—</span>
              <span style={{ color: 'var(--color-base-500)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.72rem', fontWeight: 600 }}>{task?.issueId}</span>
              {task?.project && (
                <>
                  <span style={{ color: 'var(--color-base-300)' }}>·</span>
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.project.color }} />
                    {task.project.name}
                  </span>
                </>
              )}
              <div className="ml-auto flex items-center gap-1.5" style={{ position: 'relative' }}>
                <button title="More" onClick={() => setEditMenuOpen(v => !v)}
                  style={{ color: 'var(--color-base-400)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-650)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-400)')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>
                </button>
                {editMenuOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--color-base)', border: '1px solid var(--color-base-300)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 120 }}>
                    <button type="button"
                      onClick={() => { setEditMenuOpen(false); setEditingTask(true); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", gap: 16 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span>Edit</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace", background: 'var(--color-base-200)', border: '1px solid var(--color-base-300)', borderRadius: 3, padding: '1px 5px' }}>E</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {editingTask ? (
              <div>
                <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingTask(false); }}
                  style={{ width: '100%', fontSize: '1.5rem', fontWeight: 700, fontFamily: "'Instrument Sans', sans-serif", color: 'var(--color-base-900)', background: 'var(--color-base-100)', border: '1px solid var(--color-base-400)', borderRadius: 6, padding: '4px 8px', marginBottom: 8, boxSizing: 'border-box' }}
                />
                <textarea rows={4} value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description (optional)"
                  onKeyDown={e => { if (e.key === 'Escape') setEditingTask(false); }}
                  style={{ width: '100%', fontSize: '0.9rem', fontFamily: "'Instrument Sans', sans-serif", color: 'var(--color-base-700)', background: 'var(--color-base-100)', border: '1px solid var(--color-base-400)', borderRadius: 6, padding: '6px 8px', marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div className="flex gap-2">
                  <button type="button"
                    onClick={async () => {
                      await fetch(`/api/v1/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle, description: editDescription }) });
                      reloadTask();
                      setEditingTask(false);
                    }}
                    style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: 6, background: 'var(--color-base-900)', color: 'var(--color-base)', border: 'none', cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif" }}
                  >Save</button>
                  <button type="button" onClick={() => setEditingTask(false)}
                    style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: 6, background: 'none', color: 'var(--color-base-600)', border: '1px solid var(--color-base-300)', cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif" }}
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 style={{ fontFamily: "'Instrument Sans', sans-serif", fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-base-900)', lineHeight: 1.3, marginBottom: task?.description ? '10px' : 0 }}>
                  {task?.title}
                </h1>
                {task?.description && (
                  <div className="prose-clawtask" style={{ color: 'var(--color-base-600)', fontSize: '0.9rem', fontFamily: "'Instrument Sans', sans-serif" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{task.description}</ReactMarkdown>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tabs + action buttons */}
          <div className="flex items-center px-8 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
            {(['chat', 'activity'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors"
                style={{
                  color: activeTab === tab ? 'var(--color-base-900)' : 'var(--color-base-500)',
                  borderBottom: activeTab === tab ? '2px solid var(--color-base-900)' : '2px solid transparent',
                  marginBottom: '-1px',
                  fontFamily: "'Instrument Sans', sans-serif",
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {tab === 'chat'
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                }
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}

          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {timeline.length > 0 && (
              <div className="flex justify-end mb-3">
                <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.78rem', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}>
                  Jump to latest ↓
                </button>
              </div>
            )}
            {timeline.map(item => {
            const ext = item as any;
            return <TimelineEntry key={item.id} item={item as any} showHeader={ext._showHeader !== false} showBorder={ext._showBorder !== false} groupLastTime={ext._groupLastTime} />;
          })}
            {timeline.length === 0 && (
              <div className="py-12 text-center text-sm" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>
                {activeTab === 'chat' ? 'No messages yet' : 'No activity yet'}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          <form onSubmit={handleComment} className="flex-shrink-0 px-8 py-4" style={{ borderTop: '1px solid var(--color-base-200)' }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Reply"
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-xl resize-none mb-3"
              style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", outline: 'none' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-base-500)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(e as any); }}
            />
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <button type="submit" disabled={submitting || !newComment.trim()}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--color-base-900)', color: 'var(--color-base)', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 700, opacity: submitting || !newComment.trim() ? 0.4 : 1, cursor: submitting || !newComment.trim() ? 'not-allowed' : 'pointer', border: 'none' }}>
                  {submitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* ── Right: properties ── */}
        <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 260, background: 'var(--color-base)', borderLeft: '1px solid var(--color-base-200)' }}>
          {/* Properties header — aligned with breadcrumb topbar */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-base-200)', height: 48 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-base-500)', fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Properties</span>
            <button
              type="button"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}
            >
              {theme === 'dark' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-1">
            {task ? (
              <>
                <PropRow label="Status" kbd="S">
                  <span style={inFlight ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
                    <ChipSelect ref={statusRef} label={statusCfg.label} color={statusCfg.color} options={STATUS_OPTIONS} onChange={handleStatusChange} />
                  </span>
                </PropRow>
                <PropRow label="Priority" kbd="P">
                  <span style={inFlight ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
                    <ChipSelect ref={priorityRef} label={priorityCfg.label} color={priorityCfg.color} options={PRIORITY_OPTIONS} onChange={handlePriorityChange} />
                  </span>
                </PropRow>
                {/* Tags */}
                <PropRow label="Tags">
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setTagsOpen(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {task.tags?.length ? task.tags.map(tag => (
                        <span key={tag.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs border"
                          style={{ borderColor: tag.color + '50', background: tag.color + '20', color: tag.color, fontFamily: "'Instrument Sans', sans-serif" }}>
                          {tag.name}
                        </span>
                      )) : <span style={{ color: 'var(--color-base-500)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>No tags</span>}
                    </button>
                    {tagsOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setTagsOpen(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4, overflow: 'hidden' }}>
                          {(allTags ?? []).map(tag => {
                            const sel = task.tags?.some(t => t.id === tag.id);
                            return (
                              <button key={tag.id} onClick={() => handleTagToggle(tag.id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                style={{ background: sel ? 'var(--color-base-200)' : 'transparent', color: sel ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                                onMouseLeave={e => (e.currentTarget.style.background = sel ? 'var(--color-base-200)' : 'transparent')}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                                {tag.name}
                                {sel && <svg className="ml-auto" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                              </button>
                            );
                          })}
                          {!allTags?.length && <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>No tags yet</div>}
                        </div>
                      </>
                    )}
                  </div>
                </PropRow>

                {/* Assignee — locked while in flight */}
                <PropRow label="Assignee" kbd={inFlight ? undefined : 'A'}>
                  {inFlight ? (
                    <span className="flex items-center gap-2">
                      <ActorAvatar name={(task.assignee as any)?.displayName ?? ''} isAgent={true} size={20} />
                      <span style={{ color: 'var(--color-base-700)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif", opacity: 0.6 }}>{(task.assignee as any)?.displayName}</span>
                      <button
                        onClick={async () => { await apiPost(`/api/v1/tasks/${taskId}/cancel`, {}); reloadTask(); }}
                        className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
                        style={{ color: '#F87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', fontFamily: "'Instrument Sans', sans-serif", cursor: 'pointer' }}
                      >cancel</button>
                    </span>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <button ref={assigneeTriggerRef}
                        onClick={() => { setAssigneeOpen(v => !v); setAssigneeHighlight(0); }}
                        onKeyDown={e => {
                          const opts: { id: string | null; type: 'human' | 'agent' | null }[] = [
                            { id: null, type: null },
                            ...(allHumans ?? []).map(h => ({ id: h.id, type: 'human' as const })),
                            ...(allAgents ?? []).map(a => ({ id: a.id, type: 'agent' as const })),
                          ];
                          if (!assigneeOpen) {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAssigneeOpen(true); setAssigneeHighlight(0); }
                            return;
                          }
                          if (e.key === 'ArrowDown') { e.preventDefault(); setAssigneeHighlight(i => Math.min(i + 1, opts.length - 1)); }
                          else if (e.key === 'ArrowUp') { e.preventDefault(); setAssigneeHighlight(i => Math.max(i - 1, 0)); }
                          else if (e.key === 'Enter') { e.preventDefault(); const o = opts[assigneeHighlight]; handleAssignChange(o.id, o.type); }
                          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAssigneeOpen(false); }
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {task.assignee ? (
                          <>
                            <ActorAvatar name={(task.assignee as any).displayName ?? ''} isAgent={task.assigneeType === 'agent'} size={20} />
                            <span style={{ color: 'var(--color-base-800)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>
                              {task.assigneeType === 'human' ? 'You' : (task.assignee as any).displayName}
                            </span>
                          </>
                        ) : <span style={{ color: 'var(--color-base-500)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>No assignee</span>}
                      </button>
                      {assigneeOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setAssigneeOpen(false)} />
                          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4, overflow: 'hidden' }}>
                            {(() => {
                              let idx = 0;
                              const allOpts = [
                                { id: null as string | null, type: null as 'human'|'agent'|null, label: 'Unassigned', isAgent: false },
                                ...(allHumans ?? []).map(h => ({ id: h.id, type: 'human' as const, label: h.displayName, isAgent: false })),
                                ...(allAgents ?? []).map(a => ({ id: a.id, type: 'agent' as const, label: a.displayName, isAgent: true })),
                              ];
                              return (
                                <>
                                  {allOpts.map((opt) => {
                                    const myIdx = idx++;
                                    const isActive = opt.id ? task.assigneeId === opt.id : !task.assigneeId;
                                    const isHL = myIdx === assigneeHighlight;
                                    const needsSection = (myIdx === 1 && (allHumans ?? []).length > 0) || (myIdx === 1 + (allHumans ?? []).length && (allAgents ?? []).length > 0);
                                    return (
                                      <>
                                        {needsSection && myIdx === 1 && <div key="sec-me" className="px-3 pt-2 pb-0.5" style={{ color: 'var(--color-base-500)', fontSize: '0.6rem', fontFamily: "'Instrument Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>Me</div>}
                                        {needsSection && myIdx > 1 && <div key="sec-agents" className="px-3 pt-2 pb-0.5" style={{ color: 'var(--color-base-500)', fontSize: '0.6rem', fontFamily: "'Instrument Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agents</div>}
                                        <button key={opt.id ?? 'unassigned'}
                                          onMouseDown={e => { e.preventDefault(); handleAssignChange(opt.id, opt.type); }}
                                          onMouseEnter={() => setAssigneeHighlight(myIdx)}
                                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                                          style={{ background: isHL || isActive ? 'var(--color-base-200)' : 'transparent', color: isActive ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}>
                                          {opt.id ? <ActorAvatar name={opt.label} isAgent={opt.isAgent} size={16} /> : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-base-400)' }} />}
                                          {opt.label}
                                        </button>
                                      </>
                                    );
                                  })}
                                </>
                              );
                            })()}

                          </div>
                        </>
                      )}
                    </div>
                  )}
                </PropRow>

                {/* Project */}
                <PropRow label="Project">
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setProjectOpen(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {task.project ? (
                        <>
                          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: task.project.color }} />
                          <span style={{ color: 'var(--color-base-800)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>{task.project.name}</span>
                        </>
                      ) : <span style={{ color: 'var(--color-base-500)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>No project</span>}
                    </button>
                    {projectOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setProjectOpen(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4, overflow: 'hidden' }}>
                          <button onClick={() => handleProjectChange(null)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                            style={{ background: !task.projectId ? 'var(--color-base-200)' : 'transparent', color: 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                            onMouseLeave={e => (e.currentTarget.style.background = !task.projectId ? 'var(--color-base-200)' : 'transparent')}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-base-400)' }} />No project
                          </button>
                          {(allProjects ?? []).map(p => (
                            <button key={p.id} onClick={() => handleProjectChange(p.id)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                              style={{ background: task.projectId === p.id ? 'var(--color-base-200)' : 'transparent', color: task.projectId === p.id ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
                              onMouseLeave={e => (e.currentTarget.style.background = task.projectId === p.id ? 'var(--color-base-200)' : 'transparent')}>
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />{p.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </PropRow>

                {/* Metadata */}
                <div style={{ height: 1, background: 'var(--color-base-200)', margin: '8px 0' }} />

                <PropRow label="Created by">
                  <span className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <span style={{ color: 'var(--color-base-800)' }}>You</span>
                  </span>
                </PropRow>
                {task.startDate && <PropRow label="Started"><span style={{ color: 'var(--color-base-800)' }}>{fmtDate(task.startDate)}</span></PropRow>}
                {task.status === 'done' && <PropRow label="Completed"><span style={{ color: '#22C55E' }}>{fmtDate(task.updatedAt)}</span></PropRow>}
                <PropRow label="Created"><span style={{ color: 'var(--color-base-800)' }}>{fmtDate(task.createdAt)}</span></PropRow>
                <PropRow label="Updated"><span style={{ color: 'var(--color-base-800)' }}>{relativeTime(task.updatedAt)}</span></PropRow>
              </>
            ) : (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>Loading…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

