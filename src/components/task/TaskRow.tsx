'use client';

import { useRouter } from 'next/navigation';
import { Task } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';

interface TaskRowProps {
  task: Task;
  selected?: boolean;
  onClick?: () => void;
}

const statusDotColor: Record<string, string> = {
  todo: 'var(--color-base-650)',
  in_progress: '#3189FF',
  blocked: '#F87171',
  done: '#22C55E',
  archived: 'var(--color-base-500)',
};

function relativeTime(d: string | null): string {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const priorityDotColor: Record<string, string> = {
  urgent: '#F87171',
  high: '#FFC674',
  medium: '#3189FF',
  low: 'var(--color-base-500)',
};

export function TaskRow({ task, selected, onClick }: TaskRowProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const dotColor = statusDotColor[task.status] || 'var(--color-base-650)';
  const priorityColor = priorityDotColor[task.priority] || 'var(--color-base-500)';

  const handleClick = () => {
    onClick?.();
    router.push(`/issues/${task.issueId.toLowerCase()}`);
  };

  if (isMobile) {
    return (
      <div
        className="flex items-center gap-3 cursor-pointer select-none"
        style={{
          minHeight: '44px',
          padding: '8px 12px',
          background: selected ? 'rgba(255,255,255,0.07)' : undefined,
          borderBottom: '1px solid var(--color-base-300)',
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          if (!selected) (e.currentTarget as HTMLElement).style.background = '';
        }}
      >
        {/* Status dot */}
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: '8px', height: '8px', background: dotColor }}
        />

        {/* Issue ID */}
        <span
          className="flex-shrink-0 font-mono-id"
          style={{ minWidth: '56px', fontSize: '0.7rem' }}
        >
          {task.issueId}
        </span>

        {/* Title */}
        <span
          className="flex-1 truncate"
          style={{
            color: 'var(--color-base-800)',
            fontFamily: "'Instrument Sans', sans-serif",
            fontWeight: 500,
            fontSize: '0.8125rem',
          }}
        >
          {task.title}
        </span>

        {/* Priority dot */}
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: '6px', height: '6px', background: priorityColor }}
        />

        {/* Status chip */}
        <span
          className="flex-shrink-0 text-xs rounded-full px-2 py-0.5"
          style={{
            background: dotColor + '22',
            color: dotColor,
            fontFamily: "'Instrument Sans', sans-serif",
            fontSize: '0.65rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {task.status.replace('_', ' ')}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 cursor-pointer transition-colors select-none"
      style={{
        height: '36px',
        padding: '0 12px',
        background: selected ? 'rgba(255,255,255,0.07)' : undefined,
        borderBottom: '1px solid var(--color-base-300)',
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = '';
      }}
    >
      {/* Status dot */}
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: '8px', height: '8px', background: dotColor }}
      />

      {/* Issue ID */}
      <span
        className="flex-shrink-0 font-mono-id"
        style={{ minWidth: '64px' }}
      >
        {task.issueId}
      </span>

      {/* Title */}
      <span
        className="flex-1 truncate text-sm"
        style={{
          color: 'var(--color-base-800)',
          fontFamily: "'Instrument Sans', sans-serif",
          fontWeight: 500,
          fontSize: '0.8125rem',
        }}
      >
        {task.title}
      </span>

      {/* Assignee (if any) */}
      {task.assignee && (
        <span
          className="flex-shrink-0 text-xs"
          style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif" }}
        >
          {task.assigneeType === 'agent' ? '⬡' : '○'}{' '}
          {(task.assignee as any).displayName?.split(' ')[0]}
        </span>
      )}

      {/* Relative timestamp */}
      <span
        className="flex-shrink-0"
        style={{
          fontFamily: "'Roboto Mono', monospace",
          fontSize: '0.7rem',
          color: 'var(--color-base-500)',
          minWidth: '52px',
          textAlign: 'right',
        }}
      >
        {relativeTime(task.updatedAt)}
      </span>
    </div>
  );
}
