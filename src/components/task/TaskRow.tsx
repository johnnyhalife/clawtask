'use client';

import { Task } from '@/types';
import { PriorityBadge, StatusBadge, TagBadge } from '@/components/ui/Badge';

interface TaskRowProps {
  task: Task;
  onClick?: () => void;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TaskRow({ task, onClick }: TaskRowProps) {
  const assigneeEmoji = task.assigneeType === 'agent' ? '🤖' : task.assigneeType === 'human' ? '👤' : null;
  const assigneeName = (task.assignee as any)?.displayName || null;

  return (
    <tr
      className="border-b border-zinc-800 hover:bg-zinc-900/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="py-2.5 px-4 whitespace-nowrap">
        <span className="text-xs font-mono text-zinc-500">{task.issueId}</span>
      </td>
      <td className="py-2.5 px-4">
        <span className="text-sm text-zinc-200 line-clamp-1">{task.title}</span>
      </td>
      <td className="py-2.5 px-4 whitespace-nowrap">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="py-2.5 px-4 whitespace-nowrap">
        <StatusBadge status={task.status} />
      </td>
      <td className="py-2.5 px-4 whitespace-nowrap">
        {assigneeName ? (
          <span className="text-xs text-zinc-400">
            {assigneeEmoji} {assigneeName}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </td>
      <td className="py-2.5 px-4 whitespace-nowrap">
        {task.project ? (
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: task.project.color }}
            />
            {task.project.name}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </td>
      <td className="py-2.5 px-4">
        <div className="flex flex-wrap gap-1">
          {(task.tags || []).slice(0, 3).map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      </td>
      <td className="py-2.5 px-4 whitespace-nowrap text-xs text-zinc-500">
        {formatDate(task.updatedAt)}
      </td>
    </tr>
  );
}
