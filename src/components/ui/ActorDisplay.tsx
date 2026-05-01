'use client';

import React from 'react';

// ─── Shared actor display helpers ─────────────────────────────────────────────
// Any actor/author with type 'human' is always shown as "You" with the person icon.

export function actorLabel(name: string, isAgent: boolean, isExternal?: boolean): string {
  if (isExternal) return name;
  return isAgent ? name : 'You';
}

interface ActorAvatarProps {
  name: string;
  isAgent: boolean;
  isExternal?: boolean;
  size?: number;
}

export function ActorAvatar({ name, isAgent, isExternal, size = 28 }: ActorAvatarProps) {
  const s = size;
  const iconSize = Math.max(10, Math.round(s * 0.55));

  if (isExternal) {
    return (
      <div style={{ width: s, height: s, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/>
        </svg>
      </div>
    );
  }

  if (isAgent) {
    return (
      <div
        style={{
          width: s, height: s, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-purple, #7E67F7)' + '22',
          color: 'var(--color-purple, #7E67F7)',
          border: '1px solid ' + 'var(--color-purple, #7E67F7)' + '44',
        }}
      >
        {/* Bot / CPU chip icon — readable at small sizes */}
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      </div>
    );
  }

  // Human = "You" with a person silhouette
  return (
    <div
      style={{
        width: s, height: s, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-base-200)',
        color: 'var(--color-base-600)',
        border: '1px solid var(--color-base-300)',
      }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}
