'use client';

import { Priority, TaskStatus } from '@/types';

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  high:   { label: 'High',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  medium: { label: 'Medium', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  low:    { label: 'Low',    color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

const statusConfig: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  backlog:     { label: 'Backlog',     color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-500' },
  todo:        { label: 'Todo',        color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',  dot: 'bg-zinc-500' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',  dot: 'bg-blue-500' },
  blocked:     { label: 'Blocked',     color: 'bg-red-500/20 text-red-400 border-red-500/30',     dot: 'bg-red-500' },
  done:        { label: 'Done',        color: 'bg-green-500/20 text-green-400 border-green-500/30', dot: 'bg-green-500' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = statusConfig[status] || statusConfig.todo;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function TagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
      style={{ borderColor: color + '50', backgroundColor: color + '20', color }}
    >
      {name}
    </span>
  );
}
