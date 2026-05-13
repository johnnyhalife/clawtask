'use client';

import { useCallback, useState } from 'react';
import { Task } from '@/types';
import { TaskRow } from './TaskRow';
import { GroupByField } from '@/components/task/TaskFilters';

interface TaskListProps {
  tasks: Task[];
  groupBy?: GroupByField;
  emptyMessage?: string;
  onTaskUpdated?: () => void;
  onNewTask?: () => void;
  selectedTaskId?: string | null;
  onSelectTaskId?: (id: string) => void;
}

// ─── Order / label maps ───────────────────────────────────────────────────────
const STATUS_ORDER = ['in_progress', 'todo', 'backlog', 'blocked', 'done', 'archived'];
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  todo: 'Todo',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
};
const STATUS_COLOR: Record<string, string> = {
  backlog: '#94A3B8',
  in_progress: '#3189FF',
  todo: 'var(--color-base-650)',
  blocked: '#F87171',
  done: '#22C55E',
  archived: 'var(--color-base-500)',
};
const STATUS_DEFAULT_COLLAPSED = new Set(['backlog', 'archived']);

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', ''];
const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  '': 'No Priority',
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#F87171',
  high: '#FFC674',
  medium: '#3189FF',
  low: 'var(--color-base-650)',
  '': 'var(--color-base-400)',
};

const ASSIGNEE_ORDER = ['agent', 'human', 'unassigned', ''];

const COMPLETED_DATE_ORDER = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'older', 'no_date'];
const COMPLETED_DATE_LABEL: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  older: 'Older',
  no_date: 'Not Completed',
};
const COMPLETED_DATE_COLOR: Record<string, string> = {
  today: '#22C55E',
  yesterday: '#3189FF',
  this_week: '#7E67F7',
  this_month: '#FFC674',
  this_year: '#94A3B8',
  older: 'var(--color-base-400)',
  no_date: 'var(--color-base-400)',
};

function getCompletedDateBucket(task: Task): string {
  if (task.status !== 'done') return 'no_date';
  const now = new Date();
  const completed = new Date(task.updatedAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const completedDay = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate());
  const diffDays = Math.floor((today.getTime() - completedDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  // This week: Monday of current week through now (excluding today/yesterday)
  const dayOfWeek = today.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  if (completedDay >= weekStart) return 'this_week';
  // This month (excluding this week)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (completedDay >= monthStart) return 'this_month';
  // This year (excluding this month)
  const yearStart = new Date(now.getFullYear(), 0, 1);
  if (completedDay >= yearStart) return 'this_year';
  return 'older';
}
const ASSIGNEE_LABEL: Record<string, string> = {
  agent: 'Agent',
  human: 'Human',
  unassigned: 'Unassigned',
  '': 'No Assignee',
};
const ASSIGNEE_COLOR: Record<string, string> = {
  agent: '#7E67F7',
  human: '#3189FF',
  unassigned: 'var(--color-base-650)',
  '': 'var(--color-base-400)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGroupKey(task: Task, groupBy: GroupByField): string {
  if (groupBy === 'status') return task.status || '';
  if (groupBy === 'priority') return task.priority || '';
  if (groupBy === 'assignee') return task.assigneeType || (task.assigneeId ? 'human' : 'unassigned');
  if (groupBy === 'project') return task.projectId ?? '__none__';
  if (groupBy === 'completedDate') return getCompletedDateBucket(task);
  return 'all';
}

function sortedGroupKeys(keys: string[], groupBy: GroupByField): string[] {
  if (groupBy === 'status') {
    return [
      ...STATUS_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !STATUS_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'priority') {
    return [
      ...PRIORITY_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !PRIORITY_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'assignee') {
    return [
      ...ASSIGNEE_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !ASSIGNEE_ORDER.includes(k)),
    ];
  }
  if (groupBy === 'project') {
    return [
      ...keys.filter(k => k !== '__none__').sort(),
      ...keys.filter(k => k === '__none__'),
    ];
  }
  if (groupBy === 'completedDate') {
    return [
      ...COMPLETED_DATE_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !COMPLETED_DATE_ORDER.includes(k)),
    ];
  }
  return keys;
}

// Project name cache populated at render time via task data
const _projectNameCache: Record<string, string> = {};
function cacheProjectName(id: string, name: string) { _projectNameCache[id] = name; }

// Returns tasks in the same flat order TaskList renders them (respects groupBy)
export function getFlatOrderedTasks(tasks: Task[], groupBy: GroupByField): Task[] {
  if (groupBy === 'none') return tasks;
  const groups: Record<string, Task[]> = {};
  for (const task of tasks) {
    const key = getGroupKey(task, groupBy);
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }
  const keys = sortedGroupKeys(Object.keys(groups), groupBy);
  const result: Task[] = [];
  for (const key of keys) {
    for (const task of (groups[key] ?? [])) result.push(task);
  }
  return result;
}

function groupLabel(key: string, groupBy: GroupByField): string {
  if (groupBy === 'status') return STATUS_LABEL[key] ?? key;
  if (groupBy === 'priority') return PRIORITY_LABEL[key] ?? key;
  if (groupBy === 'assignee') return ASSIGNEE_LABEL[key] ?? key;
  if (groupBy === 'project') return key === '__none__' ? 'No Project' : (_projectNameCache[key] ?? key);
  if (groupBy === 'completedDate') return COMPLETED_DATE_LABEL[key] ?? key;
  return 'All Issues';
}

function groupColor(key: string, groupBy: GroupByField): string {
  if (groupBy === 'status') return STATUS_COLOR[key] ?? 'var(--color-base-500)';
  if (groupBy === 'priority') return PRIORITY_COLOR[key] ?? 'var(--color-base-500)';
  if (groupBy === 'assignee') return ASSIGNEE_COLOR[key] ?? 'var(--color-base-500)';
  if (groupBy === 'project') return 'var(--color-base-500)';
  if (groupBy === 'completedDate') return COMPLETED_DATE_COLOR[key] ?? 'var(--color-base-500)';
  return 'var(--color-base-500)';
}

// ─── Component ────────────────────────────────────────────────────────────────
const ASCII_AGENT = `
 ░░░░░░░░░░░░░░░░░░░
 ░  ╔═══════════╗  ░
 ░  ║  ●     ●  ║  ░
 ░  ║     ▲     ║  ░
 ░  ║  \_____/  ║  ░
 ░  ╚═══════════╝  ░
 ░  ╔═╗ ╔═══╗ ╔═╗  ░
 ░░░░░░░░░░░░░░░░░░░`;

function EmptyState({ message, onNewTask }: { message: string; onNewTask?: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: '60vh', gap: 0 }}
    >
      {/* ASCII art */}
      <pre
        style={{
          fontFamily: "'Roboto Mono', 'Courier New', monospace",
          fontSize: '0.72rem',
          lineHeight: 1.5,
          color: 'var(--color-base-350)',
          margin: '0 0 20px',
          userSelect: 'none',
          letterSpacing: '0.05em',
        }}
      >
        {ASCII_AGENT}
      </pre>

      {/* Message */}
      <p style={{
        fontSize: '0.85rem',
        color: 'var(--color-base-500)',
        fontFamily: "'Instrument Sans', sans-serif",
        margin: '0 0 20px',
        textAlign: 'center',
      }}>
        {message}
      </p>

      {/* CTA */}
      {onNewTask && (
        <button
          type="button"
          onClick={onNewTask}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-base)',
            fontFamily: "'Instrument Sans', sans-serif",
            fontWeight: 700,
            letterSpacing: '-0.01em',
            fontSize: '0.85rem',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Issue
        </button>
      )}
    </div>
  );
}

export function TaskList({
  tasks,
  groupBy = 'status',
  emptyMessage = 'No tasks found.',
  onTaskUpdated,
  onNewTask,
  selectedTaskId,
  onSelectTaskId,
}: TaskListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    groupBy === 'status' ? new Set(STATUS_DEFAULT_COLLAPSED) : new Set()
  );

  const handleClose = useCallback(() => {
    onTaskUpdated?.();
  }, [onTaskUpdated]);

  if (tasks.length === 0) {
    return <EmptyState message={emptyMessage} onNewTask={onNewTask} />;
  }

  // Build groups
  const groups: Record<string, Task[]> = {};
  for (const task of tasks) {
    const key = getGroupKey(task, groupBy);
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
    // Populate project name cache so groupLabel can resolve names
    if (task.projectId && task.project?.name) cacheProjectName(task.projectId, task.project.name);
  }

  const keys = sortedGroupKeys(Object.keys(groups), groupBy);
  const showGroupHeaders = groupBy !== 'none';

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <>
      <div>
        {keys.map(key => {
          const groupTasks = groups[key];
          const isCollapsed = collapsed.has(key);
          const color = groupColor(key, groupBy);
          const label = groupLabel(key, groupBy);

          return (
            <div key={key}>
              {showGroupHeaders && (
                <button
                  type="button"
                  onClick={() => toggleCollapse(key)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left"
                  style={{
                    background: 'var(--color-base-50)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    cursor: 'pointer',
                    border: 'none',
                    borderBottom: '1px solid var(--color-base-200)',
                  }}
                >
                  {/* Collapse chevron */}
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      color: 'var(--color-base-400)',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {/* Color dot */}
                  <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: color }} />
                  {/* Label */}
                  <span className="section-label" style={{ color: 'var(--color-base-650)', fontSize: '0.75rem', fontWeight: 600 }}>
                    {label}
                  </span>
                  {/* Count */}
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '0.75rem', color: 'var(--color-base-400)' }}>
                    {groupTasks.length}
                  </span>
                </button>
              )}

              {!isCollapsed && groupTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedTaskId}
                  onClick={() => onSelectTaskId?.(task.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

    </>
  );
}
