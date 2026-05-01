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
  selectedIdx?: number;
  onSelectIdx?: (idx: number) => void;
}

// ─── Order / label maps ───────────────────────────────────────────────────────
const STATUS_ORDER = ['in_progress', 'todo', 'blocked', 'done', 'archived'];
const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  todo: 'Todo',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
};
const STATUS_COLOR: Record<string, string> = {
  in_progress: '#3189FF',
  todo: 'var(--color-base-650)',
  blocked: '#F87171',
  done: '#22C55E',
  archived: 'var(--color-base-500)',
};
const STATUS_DEFAULT_COLLAPSED = new Set(['archived']);

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
  return keys;
}

function groupLabel(key: string, groupBy: GroupByField): string {
  if (groupBy === 'status') return STATUS_LABEL[key] ?? key;
  if (groupBy === 'priority') return PRIORITY_LABEL[key] ?? key;
  if (groupBy === 'assignee') return ASSIGNEE_LABEL[key] ?? key;
  return 'All Issues';
}

function groupColor(key: string, groupBy: GroupByField): string {
  if (groupBy === 'status') return STATUS_COLOR[key] ?? 'var(--color-base-500)';
  if (groupBy === 'priority') return PRIORITY_COLOR[key] ?? 'var(--color-base-500)';
  if (groupBy === 'assignee') return ASSIGNEE_COLOR[key] ?? 'var(--color-base-500)';
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
          Create Agent
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
  selectedIdx = -1,
  onSelectIdx,
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

  // Build flat index for J/K navigation
  const flatTasks: Task[] = [];
  for (const key of keys) {
    for (const task of (groups[key] ?? [])) flatTasks.push(task);
  }

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
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '0.68rem', color: 'var(--color-base-400)' }}>
                    {groupTasks.length}
                  </span>
                </button>
              )}

              {!isCollapsed && groupTasks.map(task => {
                const flatIdx = flatTasks.indexOf(task);
                const isSelected = flatIdx === selectedIdx;
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={isSelected}
                    onClick={() => onSelectIdx?.(flatIdx)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

    </>
  );
}
