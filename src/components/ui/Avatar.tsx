'use client';

interface AvatarProps {
  type: 'agent' | 'human';
  displayName: string;
  size?: 'sm' | 'md';
}

export function Avatar({ type, displayName, size = 'md' }: AvatarProps) {
  const initials = displayName
    .split(/[\s_-]/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  const bgClass = type === 'agent' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30';
  const emoji = type === 'agent' ? '🤖' : '👤';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium ${sizeClass} ${bgClass}`}
      title={`${emoji} ${displayName}`}
    >
      {initials || emoji}
    </span>
  );
}

export function AssigneeLabel({ type, displayName }: { type: 'agent' | 'human'; displayName: string }) {
  const emoji = type === 'agent' ? '🤖' : '👤';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-400">
      <Avatar type={type} displayName={displayName} size="sm" />
      <span>{emoji} {displayName}</span>
    </span>
  );
}
