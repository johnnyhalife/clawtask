'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { GroupByField } from '@/components/task/TaskFilters';

const GROUP_OPTIONS: { value: GroupByField; label: string; icon: React.ReactNode }[] = [
  {
    value: 'status',
    label: 'Status',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    value: 'priority',
    label: 'Priority',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    value: 'assignee',
    label: 'Assignee',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    value: 'project',
    label: 'Project',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    value: 'completedDate',
    label: 'Completed',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 16 11 18 15 14" />
      </svg>
    ),
  },
  {
    value: 'none',
    label: 'None',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
];

interface GroupingSheetProps {
  current: GroupByField;
  onChange: (v: GroupByField) => void;
  onClose: () => void;
}

function GroupingSheet({ current, onChange, onClose }: GroupingSheetProps) {
  // Close on backdrop tap
  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 20,
          background: 'rgba(0,0,0,0.4)',
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 21,
          background: 'var(--color-base-100)',
          borderTop: '1px solid var(--color-base-300)',
          borderRadius: '16px 16px 0 0',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          paddingTop: 12,
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--color-base-350)',
            margin: '0 auto 16px',
          }}
        />

        {/* Title */}
        <div
          style={{
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 12,
            borderBottom: '1px solid var(--color-base-200)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-base-500)',
            fontFamily: "'Instrument Sans', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          Group By
        </div>

        {/* Options */}
        <div style={{ paddingTop: 8 }}>
          {GROUP_OPTIONS.map(({ value, label, icon }) => {
            const active = current === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { onChange(value); onClose(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  padding: '13px 20px',
                  background: active ? 'rgba(49,137,255,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: active ? '#3189FF' : 'var(--color-base-500)', flexShrink: 0 }}>
                  {icon}
                </span>
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--color-base-900)' : 'var(--color-base-700)',
                    flex: 1,
                  }}
                >
                  {label}
                </span>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3189FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const NAV_ITEMS = [
  {
    href: '/?tab=pulse',
    tab: 'pulse',
    label: 'Pulse',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/?tab=all',
    tab: 'all',
    label: 'Issues',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    href: '/settings',
    tab: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

interface BottomNavProps {
  groupBy?: GroupByField;
  onGroupByChange?: (v: GroupByField) => void;
}

function BottomNavInner({ groupBy = 'status', onGroupByChange }: BottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const get = searchParams.get.bind(searchParams);
  const activeTab = get('tab') || 'pulse';
  const [showGroupSheet, setShowGroupSheet] = useState(false);

  // Close sheet when navigating away from issues
  useEffect(() => {
    if (pathname !== '/' || !['all'].includes(activeTab)) {
      setShowGroupSheet(false);
    }
  }, [pathname, activeTab]);

  function isActive(item: typeof NAV_ITEMS[0]): boolean {
    if (item.tab === 'settings') return pathname === '/settings';
    return pathname === '/' && activeTab === item.tab;
  }

  const isIssuesActive = pathname === '/' && activeTab === 'all';

  return (
    <>
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: 'var(--color-base)',
          borderTop: '1px solid var(--color-base-300)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingBottom: 'env(safe-area-inset-bottom)',
          height: 'calc(56px + env(safe-area-inset-bottom))',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);

          // Issues tab: when already active, open grouping sheet instead of navigating
          if (item.tab === 'all') {
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => {
                  if (isIssuesActive) {
                    setShowGroupSheet(prev => !prev);
                  }
                  // If not on issues, let the link navigation happen (handled by wrapping in Link below won't work,
                  // so we navigate programmatically — but since this is a button, we need a different approach)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  flex: 1,
                  height: '100%',
                  color: active ? 'var(--color-base-900)' : 'var(--color-base-500)',
                  textDecoration: 'none',
                  position: 'relative',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {/* When not on issues tab, wrap content in a Link — but we can't nest link in button.
                    Instead use a transparent overlay anchor for navigation when not active. */}
                {!isIssuesActive && (
                  <a
                    href={item.href}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 1,
                    }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                )}
                {item.icon}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: showGroupSheet ? '#3189FF' : '#3189FF',
                    }}
                  />
                )}
                {/* Subtle indicator that grouping is available when on issues */}
                {active && onGroupByChange && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 'calc(50% - 16px)',
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: showGroupSheet ? '#3189FF' : 'var(--color-base-400)',
                      pointerEvents: 'none',
                      display: 'block',
                    }}
                  />
                )}
              </button>
            );
          }

          return (
            <Link
              key={item.tab}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                flex: 1,
                height: '100%',
                color: active ? 'var(--color-base-900)' : 'var(--color-base-500)',
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              {item.icon}
              {active && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#3189FF',
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {showGroupSheet && onGroupByChange && (
        <GroupingSheet
          current={groupBy}
          onChange={onGroupByChange}
          onClose={() => setShowGroupSheet(false)}
        />
      )}
    </>
  );
}

export function BottomNav({ groupBy, onGroupByChange }: BottomNavProps) {
  return (
    <Suspense fallback={null}>
      <BottomNavInner groupBy={groupBy} onGroupByChange={onGroupByChange} />
    </Suspense>
  );
}
