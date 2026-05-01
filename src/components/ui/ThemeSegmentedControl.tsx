'use client';

import React from 'react';
import { useTheme, Theme } from '@/components/ui/ThemeProvider';

const OPTIONS: { value: Theme; title: string; icon: React.ReactNode }[] = [
  {
    value: 'system',
    title: 'System',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
  },
  {
    value: 'light',
    title: 'Light',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
  },
  {
    value: 'dark',
    title: 'Night',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    ),
  },
];

export function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center"
      style={{
        background: 'var(--color-base-150)',
        borderRadius: 20,
        padding: 2,
        gap: 0,
        border: '1px solid var(--color-base-250)',
      }}
    >
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          onClick={() => setTheme(opt.value)}
          style={{
            background: theme === opt.value ? 'var(--color-base)' : 'none',
            border: 'none',
            borderRadius: 16,
            padding: '3px 7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: theme === opt.value ? 'var(--color-base-800)' : 'var(--color-base-450)',
            boxShadow: theme === opt.value ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            transition: 'all 0.12s',
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
