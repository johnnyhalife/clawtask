'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Comment, Task } from '@/types';
import { useSse } from '@/hooks/useSse';
import { useIsMobile } from '@/hooks/useIsMobile';
import { TaskDrawer } from './TaskDrawer';
import { ActorAvatar, actorLabel } from '@/components/ui/ActorDisplay';
import { useTheme } from '@/components/ui/ThemeProvider';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function intensityColor(n: number, dark = true): string {
  if (n === 0) return 'var(--color-base-250, var(--color-base-200))';
  if (dark) {
    if (n <= 1) return '#0e4429';
    if (n <= 3) return '#006d32';
    if (n <= 6) return '#26a641';
    return '#39d353';
  }
  // Light mode: visible greens on white
  if (n <= 1) return '#bbf7d0';
  if (n <= 3) return '#4ade80';
  if (n <= 6) return '#16a34a';
  return '#166534';
}

function verbLabel(verb: string) {
  const m: Record<string, string> = {
    created: 'created issue', updated: 'updated', status_changed: 'changed status',
    priority_changed: 'changed priority', commented: 'commented', assigned: 'assigned to',
    unassigned: 'unassigned', closed: 'closed', reopened: 'reopened',
    tagged: 'added tag', untagged: 'removed tag', project_changed: 'moved to project',
    cancelled: 'cancelled', archived: 'archived',
  };
  return m[verb] ?? verb.replace(/_/g, ' ');
}

function verbIcon(verb: string) {
  switch (verb) {
    case 'created':          return <circle cx="12" cy="12" r="4" fill="currentColor" />;
    case 'status_changed':   return <><circle cx="12" cy="12" r="9" /><polyline points="12 8 12 12 14 14" /></>;
    case 'commented':        return <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />;
    case 'assigned':         return <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>;
    case 'priority_changed':  return <><polyline points="18 15 12 9 6 15"/></>;
    case 'tagged':            return <><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>;
    case 'project_changed':   return <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>;</>
    case 'archived':           return <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>;</>
    default:                 return <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>;
  }
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'var(--color-base-650)', in_progress: '#3189FF', blocked: '#F87171', done: '#22C55E',
};

// ─── Contribution grid helpers ─────────────────────────────────────────────────
// Build day buckets from startDate (inclusive) to endDate (inclusive)
function buildGrid(startDate: Date, endDate: Date, activity: Activity[]) {
  // Expand to Monday of the start week
  const start = new Date(startDate);
  const dayOfWeek = start.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
  start.setDate(start.getDate() + mondayOffset);

  const buckets = new Map<string, number>();
  const cur = new Date(start);
  while (cur <= endDate) {
    buckets.set(isoDate(cur), 0);
    cur.setDate(cur.getDate() + 1);
  }

  for (const a of activity) {
    const key = new Date(a.createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  // Build weeks (columns), each a 7-element array Sun-Sat → Mon-Sun
  const days = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
  const weeks: { date: string; count: number; inRange: boolean }[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).map(d => ({
      ...d,
      inRange: d.date >= isoDate(startDate) && d.date <= isoDate(endDate),
    })));
  }
  return weeks;
}

function buildMonthLabels(weeks: { date: string }[][]) {
  const labels: { label: string; col: number }[] = [];
  let last = '';
  let lastCol = -3; // minimum 3 columns apart before showing a label
  weeks.forEach((week, wi) => {
    const m = MONTH_SHORT[new Date(week[0].date).getMonth()];
    if (m !== last) {
      last = m;
      if (wi - lastCol >= 3) { labels.push({ label: m, col: wi }); lastCol = wi; }
    }
  });
  return labels;
}

// ─── Activity grouping ─────────────────────────────────────────────────────────
interface IssueGroup {
  taskId: string;
  issueId: string;
  title: string;
  items: Activity[];
  latestAt: string;
}
interface MonthGroup {
  key: string;   // YYYY-MM
  label: string; // "April 2026"
  issues: IssueGroup[];
}

function groupActivity(activity: Activity[]): MonthGroup[] {
  const byMonth = new Map<string, Map<string, IssueGroup>>();

  for (const a of activity) {
    const d = new Date(a.createdAt);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const taskId = a.taskId ?? '__no_task__';
    const issueId = (a.task as any)?.issueId ?? '';
    const title = (a.task as any)?.title ?? '(no issue)';

    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const m = byMonth.get(monthKey)!;
    if (!m.has(taskId)) m.set(taskId, { taskId, issueId, title, items: [], latestAt: a.createdAt });
    const g = m.get(taskId)!;
    g.items.push(a);
    if (a.createdAt > g.latestAt) g.latestAt = a.createdAt;
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, issueMap]) => {
      const [year, month] = key.split('-');
      const label = `${MONTH_SHORT[parseInt(month, 10) - 1]} ${year}`;
      const issues = Array.from(issueMap.values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
      return { key, label, issues };
    });
}

// ─── Components ───────────────────────────────────────────────────────────────
function VerbIcon({ verb }: { verb: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {verbIcon(verb)}
    </svg>
  );
}

function ActivityRow({ a, extraCount = 0 }: { a: Activity; extraCount?: number }) {
  const meta = a.meta as Record<string, any>;
  const isAgent = a.actorType === 'agent';
  const isExternal = a.actorType === 'external';
  const actorName = (a.actor as any)?.displayName ?? a.actorId;
  const d = new Date(a.createdAt);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-3 py-2 pl-4 pr-3" style={{ borderTop: '1px solid var(--color-base-200)' }}>
      <ActorAvatar name={actorName} isAgent={isAgent} isExternal={isExternal} size={20} />
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span style={{ color: isExternal ? '#10B981' : isAgent ? 'var(--color-purple, #7E67F7)' : 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.78rem', fontWeight: 600, flexShrink: 0 }}>
          {actorLabel(actorName, isAgent, isExternal)}
        </span>
        <span style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.78rem' }}>
          {verbLabel(a.verb)}{extraCount > 0 && <span style={{ color: 'var(--color-base-400)', fontStyle: 'italic', marginLeft: 4 }}>(+{extraCount} more)</span>}
        </span>
        {a.verb === 'status_changed' && meta.from && meta.to && (
          <span className="flex items-center gap-1" style={{ fontSize: '0.72rem' }}>
            <span style={{ color: STATUS_COLOR[meta.from] ?? 'var(--color-base-650)' }}>{meta.from?.replace('_', ' ')}</span>
            <span style={{ color: 'var(--color-base-400)' }}>→</span>
            <span style={{ color: STATUS_COLOR[meta.to] ?? 'var(--color-base-650)', fontWeight: 600 }}>{meta.to?.replace('_', ' ')}</span>
          </span>
        )}
        {a.verb === 'priority_changed' && meta.from && meta.to && (
          <span className="flex items-center gap-1" style={{ fontSize: '0.72rem', color: 'var(--color-base-500)' }}>
            <span style={{ textDecoration: 'line-through' }}>{meta.from}</span>
            <span style={{ color: 'var(--color-base-400)' }}>→</span>
            <span style={{ fontWeight: 600 }}>{meta.to}</span>
          </span>
        )}
        {a.verb === 'assigned' && (
          <span style={{ fontSize: '0.72rem', color: meta.assigneeType === 'agent' ? 'var(--color-purple, #7E67F7)' : 'var(--color-base-650)', fontWeight: 600 }}>
            {meta.assigneeName ?? meta.assigneeId}
          </span>
        )}
        {(a.verb === 'tagged' || a.verb === 'untagged') && (
          <span style={{ fontSize: '0.72rem', background: 'var(--color-base-200)', borderRadius: 4, padding: '1px 6px', color: 'var(--color-base-600)', fontWeight: 500 }}>
            {meta.tagName ?? meta.tagId}
          </span>
        )}
        {a.verb === 'project_changed' && (
          <span style={{ fontSize: '0.72rem', color: 'var(--color-base-650)', fontWeight: 600 }}>
            {meta.to ? (meta.projectName ?? meta.to) : <span style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--color-base-500)' }}>removed</span>}
          </span>
        )}
      </div>
      <span style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.65rem', flexShrink: 0 }}>{time}</span>
    </div>
  );
}

// Collapse consecutive same-actor 'commented' activities within 5 min into a single display row
type DisplayItem = { key: string; items: Activity[]; collapsed: number };
function collapseComments(items: Activity[]): DisplayItem[] {
  const FIVE = 5 * 60 * 1000;
  const result: DisplayItem[] = [];
  for (const a of items) {
    const last = result[result.length - 1];
    if (
      last && last.items[0].verb === 'commented' && a.verb === 'commented' &&
      last.items[0].actorId === a.actorId &&
      Math.abs(new Date(a.createdAt).getTime() - new Date(last.items[last.items.length - 1].createdAt).getTime()) < FIVE
    ) {
      last.items.push(a);
      last.collapsed = last.items.length - 1;
    } else {
      result.push({ key: a.id, items: [a], collapsed: 0 });
    }
  }
  return result;
}

function IssueGroupRow({ group, onOpenTask }: { group: IssueGroup; onOpenTask: (id: string, issueId?: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const displayItems = collapseComments(group.items);
  const count = displayItems.length;
  const primaryVerb = group.items[0]?.verb ?? 'updated';

  return (
    <div className="mb-3">
      {/* Group header */}
      <button
        type="button"
        className="flex items-center gap-3 w-full py-2.5 text-left group"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        onClick={() => setCollapsed(v => !v)}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-650)' }}>
          <VerbIcon verb={primaryVerb} />
        </div>
        {/* Label — single line with ellipsis */}
        <div className="flex-1 min-w-0" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>{count} {count === 1 ? 'activity' : 'activities'}</span>
          {' '}
          <span className="text-sm" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>on</span>
          {' '}
          {group.issueId && <span style={{ color: 'var(--color-base-500)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.72rem', marginRight: 4 }}>{group.issueId}</span>}
          <button
            type="button"
            className="text-sm font-medium"
            style={{ color: 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif", background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
            onClick={e => { e.stopPropagation(); if (group.taskId !== '__no_task__') onOpenTask(group.taskId, group.issueId); }}
          >
            {group.title}
          </button>
        </div>
        {/* Collapse icon */}
        <div style={{ color: 'var(--color-base-400)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Activity items */}
      {!collapsed && (
        <div className="rounded-lg overflow-hidden ml-11" style={{ border: '1px solid var(--color-base-200)', background: 'var(--color-base-100)' }}>
          {displayItems.map(di => (
            <ActivityRow key={di.key} a={di.items[0]} extraCount={di.collapsed} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main PulseView ───────────────────────────────────────────────────────────
// ─── Active run card with live status ────────────────────────────────────────
function ActiveRunCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const [latestComment, setLatestComment] = useState<Comment | null>(null);

  const loadLatest = useCallback(() => {
    fetch(`/api/v1/tasks/${task.id}/comments?limit=1&order=desc&authorType=agent`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data?.length) {
          const c = d.data[d.data.length - 1] as Comment;
          if (c.content?.trim()) setLatestComment(c);
        }
      })
      .catch(() => {});
  }, [task.id]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  useSse((event) => {
    if ((event.type === 'comment.added' || event.type === 'comment.updated') &&
        (event.data as any)?.taskId === task.id) {
      const c = event.data as Comment;
      if (c.content?.trim()) setLatestComment(c);
    }
    if (event.type === 'task.updated' && (event.data as any)?.id === task.id) {
      loadLatest();
    }
  });

  const typeIcon = latestComment?.type === 'tool'
    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

  return (
    <button
      type="button"
      className="w-full text-left rounded-lg px-4 py-3 transition-colors"
      style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-base-400)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontFamily: "\'Roboto Mono\', monospace", fontSize: '0.72rem', color: 'var(--color-base-500)' }}>{task.issueId}</span>
        <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: '#3189FF22', color: '#3189FF', border: '1px solid #3189FF44', fontFamily: "\'Instrument Sans\', sans-serif" }}>in progress</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-base-500)', fontFamily: "\'Instrument Sans\', sans-serif" }}>{(task.assignee as any)?.displayName}</span>
      </div>
      <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--color-base-800)', fontFamily: "\'Instrument Sans\', sans-serif" }}>{task.title}</div>
      {latestComment && (
        <div className="flex items-start gap-1.5 mt-1">
          <span style={{ color: '#3189FF', flexShrink: 0, marginTop: 2 }}>{typeIcon}</span>
          <span className="text-xs truncate" style={{ color: 'var(--color-base-500)', fontFamily: "\'Instrument Sans\', sans-serif", fontStyle: 'italic' }}>
            {latestComment.content.split('\n')[0].slice(0, 120)}
          </span>
        </div>
      )}
      {!latestComment && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#3189FF', animation: 'pulse 1.5s infinite' }} />
          <span className="text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "\'Instrument Sans\', sans-serif" }}>working…</span>
        </div>
      )}
    </button>
  );
}

export function PulseView() {
  const { theme } = useTheme(); // subscribe so cells re-render on theme change
  const router = useRouter();
  const isMobile = useIsMobile();
  const [allActivity, setAllActivity] = useState<Activity[]>([]);
  const [activeRuns, setActiveRuns] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'T12'>('T12');

  const loadData = useCallback(async () => {
    const [actRes, runsRes] = await Promise.all([
      fetch('/api/v1/activity?limit=1000').then(r => r.json()),
      fetch('/api/v1/tasks?status=in_progress&limit=20').then(r => r.json()),
    ]);
    if (actRes.ok) setAllActivity(actRes.data.activity ?? []);
    if (runsRes.ok) setActiveRuns((runsRes.data.tasks as Task[]).filter(t => t.assigneeType === 'agent'));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSse(event => {
    if (['task.created', 'task.updated', 'comment.added', 'activity.added'].includes(event.type)) loadData();
  });

  // ── Available years ──
  const availableYears = useMemo(() => {
    const cur = new Date().getFullYear();
    const fromData = new Set(allActivity.map(a => new Date(a.createdAt).getFullYear()));
    fromData.add(cur);
    return Array.from(fromData).sort((a, b) => b - a);
  }, [allActivity]);

  // ── Date range for selected period ──
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedYear === 'T12') {
      const start = new Date(today);
      start.setDate(start.getDate() - 364);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: today };
    }
    const start = new Date(selectedYear, 0, 1);
    const end = new Date(Math.min(new Date(selectedYear, 11, 31, 23, 59, 59, 999).getTime(), today.getTime()));
    return { startDate: start, endDate: end };
  }, [selectedYear]);

  // ── Filter activity to period ──
  const periodActivity = useMemo(() =>
    allActivity.filter(a => {
      const d = new Date(a.createdAt);
      return d >= startDate && d <= endDate;
    }), [allActivity, startDate, endDate]);

  // ── Contribution grid ──
  const weeks = useMemo(() => buildGrid(startDate, endDate, periodActivity), [startDate, endDate, periodActivity]);
  const monthLabels = useMemo(() => buildMonthLabels(weeks), [weeks]);
  const totalCount = periodActivity.length;

  // ── Activity groups ──
  const monthGroups = useMemo(() => groupActivity(periodActivity), [periodActivity]);

  const periodLabel = selectedYear === 'T12' ? 'the last year' : String(selectedYear);

  return (
    <div className="flex gap-8 min-h-0">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-8 pb-16">

        {/* Header */}
        <div>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-base-900)', fontFamily: "'Instrument Sans', sans-serif" }}>
            {totalCount} {totalCount === 1 ? 'activity' : 'activities'} in {periodLabel}
          </h2>

          {/* Contribution graph — hidden on mobile */}
          {!isMobile && <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div className="rounded-xl p-4" style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', minWidth: 600 }}>
            {/* Month labels row */}
            <div className="flex" style={{ marginBottom: 4, paddingLeft: 28, gap: 3 }}>
              {weeks.map((week, wi) => {
                const found = monthLabels.find(m => m.col === wi);
                return (
                  <div key={wi} style={{ width: 13, flexShrink: 0, fontSize: '0.68rem', color: found ? 'var(--color-base-650)' : 'transparent', fontFamily: "'Instrument Sans', sans-serif", userSelect: 'none', overflow: 'visible', whiteSpace: 'nowrap' }}>
                    {found?.label ?? ''}
                  </div>
                );
              })}
            </div>

            {/* Grid with day labels */}
            <div className="flex items-start gap-0">
              {/* Day labels */}
              <div className="flex flex-col mr-1" style={{ gap: 3 }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                  <div key={d} style={{ height: 13, width: 24, fontSize: '0.62rem', color: (i === 0 || i === 2 || i === 4 || i === 6) ? 'var(--color-base-500)' : 'transparent', fontFamily: "'Instrument Sans', sans-serif", display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                    {(i === 0 || i === 2 || i === 4 || i === 6) ? d : ''}
                  </div>
                ))}
              </div>

              {/* Cells */}
              <div className="flex" style={{ gap: 3 }}>
                {weeks.map((week, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 13px)', gap: 3 }}>
                    {week.map(({ date, count, inRange }, di) =>
                      inRange ? (
                        <div
                          key={date}
                          title={`${date}: ${count} event${count !== 1 ? 's' : ''}`}
                          style={{ width: 13, height: 13, borderRadius: 3, background: intensityColor(count, theme === 'dark'), gridRow: di + 1 }}
                        />
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3 justify-end">
              <span style={{ fontSize: '0.68rem', color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>Less</span>
              {[0, 1, 3, 6, 9].map(n => (
                <div key={n} style={{ width: 13, height: 13, borderRadius: 3, background: intensityColor(n, theme === 'dark') }} />
              ))}
              <span style={{ fontSize: '0.68rem', color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>More</span>
            </div>
          </div>
          </div>}
        </div>

        {/* Active runs */}
        {activeRuns.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-base-900)', fontFamily: "'Instrument Sans', sans-serif" }}>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#3189FF', boxShadow: '0 0 6px #3189FF' }} />
              Active now
            </h3>
            <div className="space-y-2">
              {activeRuns.map(task => (
                <ActiveRunCard
                  key={task.id}
                  task={task}
                  onClick={() => router.push(`/issues/${task.issueId.toLowerCase()}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Activity feed */}
        <section>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-base-900)', fontFamily: "'Instrument Sans', sans-serif" }}>
            Activity
          </h3>

          {monthGroups.length === 0 ? (
            <div style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.85rem' }}>No activity in this period.</div>
          ) : (
            <div>
              {monthGroups.map(mg => (
                <div key={mg.key} className="mb-6">
                  {/* Month header */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}>
                      {mg.label.split(' ')[0]}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}>
                      {mg.label.split(' ')[1]}
                    </span>
                    <div className="flex-1" style={{ height: 1, background: 'var(--color-base-200)' }} />
                  </div>

                  {/* Issue groups */}
                  {mg.issues.map(group => (
                    <IssueGroupRow
                      key={group.taskId}
                      group={group}
                      onOpenTask={(id, issueId) => router.push(`/issues/${(issueId ?? id).toLowerCase()}`)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Year rail — hidden on mobile ── */}
      {!isMobile && <div className="flex-shrink-0 flex flex-col gap-1" style={{ width: 52, marginTop: '2.5rem' }}>
        {[...availableYears].map(year => {
          const isT12 = year === new Date().getFullYear();
          const active = isT12 ? selectedYear === 'T12' : selectedYear === year;
          return (
            <button
              key={year}
              type="button"
              className="px-2 py-1 text-sm text-right transition-colors"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: active ? 700 : 400,
                color: active ? 'var(--color-base-900)' : 'var(--color-base-400)',
                textDecoration: active ? 'underline' : 'none',
                textUnderlineOffset: 3,
              }}
              onClick={() => setSelectedYear(isT12 ? 'T12' : year)}
              onMouseEnter={e => { if (!active) (e.currentTarget.style.color = 'var(--color-base-650)'); }}
              onMouseLeave={e => { if (!active) (e.currentTarget.style.color = 'var(--color-base-400)'); }}
            >
              {year}
            </button>
          );
        })}
      </div>}
    </div>
  );
}
