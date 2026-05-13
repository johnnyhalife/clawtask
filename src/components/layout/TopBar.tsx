'use client';

import { useState, useCallback, useRef, useEffect, Ref } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ui/ThemeProvider';
import { ThemeSegmentedControl } from '@/components/ui/ThemeSegmentedControl';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  FilterState, SortField,
  StatusValue, PriorityValue, AssigneeFilter, GroupByField,
  DEFAULT_FILTERS,
} from '@/components/task/TaskFilters';

interface TopBarProps {
  onNewTask?: () => void;
  filters?: FilterState;
  onFiltersChange?: (f: FilterState) => void;
  hideAssignee?: boolean;
  hideToolbar?: boolean;
  totalCount?: number;
  ref?: Ref<HTMLInputElement>;
}

// ─── Reusable: close dropdown when clicking outside ──────────────────────────
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// ─── Icon toolbar button ──────────────────────────────────────────────────────
function IconBtn({
  active, title, onClick, children,
}: { active?: boolean; title: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center size-7 rounded transition-colors"
      style={{
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: active ? 'var(--color-base-800)' : 'var(--color-base-500)',
        border: active ? '1px solid #2A2A2E' : '1px solid transparent',
      }}
      onMouseEnter={e => { (e.currentTarget.style.color = active ? 'var(--color-base-800)' : 'var(--color-base-700)'); }}
      onMouseLeave={e => { (e.currentTarget.style.color = active ? 'var(--color-base-800)' : 'var(--color-base-500)'); }}
    >
      {children}
    </button>
  );
}

// ─── Checkbox row for filter panel ───────────────────────────────────────────
function CheckRow({
  checked, label, color, dot, onClick,
}: { checked: boolean; label: string; color?: string; dot?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 w-full px-0 py-1 text-left rounded transition-colors"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* checkbox */}
      <span
        className="flex-shrink-0 flex items-center justify-center rounded"
        style={{
          width: 14, height: 14,
          border: `1px solid ${checked ? '#3189FF' : 'var(--color-base-400)'}`,
          background: checked ? '#3189FF' : 'transparent',
        }}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      {/* dot */}
      {dot && color && (
        <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />
      )}
      <span style={{ fontSize: '0.78rem', color: checked ? 'var(--color-base-900)' : 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif" }}>
        {label}
      </span>
    </button>
  );
}

// ─── Section header inside filter panel ──────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ fontSize: '0.7rem', color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", letterSpacing: '0.07em', textTransform: 'uppercase', padding: '10px 0 4px', fontWeight: 600 }}>
      {label}
    </div>
  );
}

// ─── Filter dropdown (multi-column) ──────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo', color: 'var(--color-base-650)' },
  { value: 'in_progress', label: 'In Progress', color: '#3189FF' },
  { value: 'blocked', label: 'Blocked', color: '#F87171' },
  { value: 'done', label: 'Done', color: '#22C55E' },
  { value: 'archived', label: 'Archived', color: 'var(--color-base-500)' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: '#F87171' },
  { value: 'high', label: 'High', color: '#FFC674' },
  { value: 'medium', label: 'Medium', color: '#3189FF' },
  { value: 'low', label: 'Low', color: 'var(--color-base-650)' },
] as const;

const ASSIGNEE_OPTIONS = [
  { value: 'agent', label: 'Agent', color: '#7E67F7' },
  { value: 'human', label: 'Human', color: '#3189FF' },
  { value: 'unassigned', label: 'Unassigned', color: 'var(--color-base-650)' },
] as const;

function FilterDropdown({ f, set, hideAssignee, onClear }: {
  f: FilterState;
  set: (patch: Partial<FilterState>) => void;
  hideAssignee?: boolean;
  onClear: () => void;
}) {
  const hasActive = f.statuses.length > 0 || f.priorities.length > 0 || f.assignee !== '';

  const toggleStatus = (v: string) => {
    const val = v as StatusValue;
    set({ statuses: f.statuses.includes(val) ? f.statuses.filter(s => s !== val) : [...f.statuses, val] });
  };
  const togglePriority = (v: string) => {
    const val = v as PriorityValue;
    set({ priorities: f.priorities.includes(val) ? f.priorities.filter(p => p !== val) : [...f.priorities, val] });
  };
  const toggleAssignee = (v: string) =>
    set({ assignee: f.assignee === v ? '' : v as AssigneeFilter });

  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl"
      style={{
        background: 'var(--color-base-100)',
        border: '1px solid var(--color-base-300)',
        width: 480,
        padding: '12px 16px 14px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: '0.75rem', color: 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600 }}>Filters</span>
        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            style={{ fontSize: '0.7rem', color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}
          >
            ✕ clear all
          </button>
        )}
      </div>

      <div style={{ borderTop: '1px solid #222226', margin: '0 0 4px' }} />

      {/* Columns */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Left: Status + Priority */}
        <div>
          <SectionHeader label="Status" />
          {STATUS_OPTIONS.map(o => (
            <CheckRow key={o.value} checked={f.statuses.includes(o.value as any)} label={o.label} color={o.color} dot onClick={() => toggleStatus(o.value)} />
          ))}

          <SectionHeader label="Priority" />
          {PRIORITY_OPTIONS.map(o => (
            <CheckRow key={o.value} checked={f.priorities.includes(o.value as any)} label={o.label} color={o.color} dot onClick={() => togglePriority(o.value)} />
          ))}
        </div>

        {/* Right: Assignee */}
        {!hideAssignee && (
          <div>
            <SectionHeader label="Assignee" />
            {ASSIGNEE_OPTIONS.map(o => (
              <CheckRow key={o.value} checked={f.assignee === o.value} label={o.label} color={o.color} dot onClick={() => toggleAssignee(o.value)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────
const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: 'updatedAt', label: 'Updated' },
  { field: 'createdAt', label: 'Created' },
  { field: 'priority', label: 'Priority' },
  { field: 'title', label: 'Title' },
];

function SortDropdown({ f, cycleSort }: { f: FilterState; cycleSort: (field: SortField) => void }) {
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl overflow-hidden"
      style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', minWidth: 160 }}
    >
      {SORT_FIELDS.map(({ field, label }) => {
        const active = f.sortField === field;
        return (
          <button
            key={field}
            type="button"
            onClick={() => cycleSort(field)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left"
            style={{
              background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: active ? 'var(--color-base-900)' : 'var(--color-base-650)',
              fontSize: '0.8rem',
              fontFamily: "'Instrument Sans', sans-serif",
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'); }}
            onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
          >
            {label}
            {active && (
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                {f.sortOrder === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Group dropdown ───────────────────────────────────────────────────────────
const GROUP_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'completedDate', label: 'Completed' },
  { value: 'none', label: 'None' },
];

function GroupDropdown({ current, onChange }: { current: GroupByField; onChange: (v: GroupByField) => void }) {
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl overflow-hidden"
      style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', minWidth: 160 }}
    >
      {GROUP_OPTIONS.map(({ value, label }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left"
            style={{
              background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: active ? 'var(--color-base-900)' : 'var(--color-base-650)',
              fontSize: '0.8rem',
              fontFamily: "'Instrument Sans', sans-serif",
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'); }}
            onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
          >
            {label}
            {active && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3189FF' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
type Panel = 'filter' | 'sort' | 'group' | null;

export function TopBar({ onNewTask, filters, onFiltersChange, hideAssignee, hideToolbar, totalCount, ref: searchRef }: TopBarProps) {
  const [query, setQuery] = useState('');
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { push } = router;
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useClickOutside(filterRef, () => setOpenPanel(p => p === 'filter' ? null : p));
  useClickOutside(sortRef, () => setOpenPanel(p => p === 'sort' ? null : p));
  useClickOutside(groupRef, () => setOpenPanel(p => p === 'group' ? null : p));

  const f = filters ?? DEFAULT_FILTERS;
  const set = useCallback((patch: Partial<FilterState>) => {
    onFiltersChange?.({ ...f, ...patch });
  }, [f, onFiltersChange]);

  const cycleSort = (field: SortField) => {
    if (f.sortField === field) set({ sortOrder: f.sortOrder === 'desc' ? 'asc' : 'desc' });
    else set({ sortField: field, sortOrder: 'desc' });
  };

  const toggle = (panel: Panel) => setOpenPanel(p => p === panel ? null : panel);

  const hasActiveFilters = f.statuses.length > 0 || f.priorities.length > 0 || f.assignee !== '';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) push(`/?tab=all&q=${encodeURIComponent(query.trim())}`);
  };

  // Mobile search expand effect
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const id = setTimeout(() => mobileSearchRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [mobileSearchOpen]);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex-shrink-0" style={{ background: 'var(--color-base)', borderBottom: '1px solid var(--color-base-300)' }}>
        {/* Main row */}
        <div className="flex items-center gap-2 px-3" style={{ height: '44px', minHeight: '44px' }}>
          {onNewTask && (
            <button
              onClick={onNewTask}
              className="flex items-center justify-center rounded-md flex-shrink-0 transition-opacity hover:opacity-80"
              style={{
                width: 32, height: 32,
                background: 'var(--color-base-200)', color: 'var(--color-base-800)', border: '1px solid var(--color-base-350)',
              }}
              aria-label="New Issue"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}

          {/* Title / search input */}
          <div className="flex-1" style={{ overflow: 'hidden' }}>
            {mobileSearchOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) {
                    push(`/?tab=all&q=${encodeURIComponent(query.trim())}`);
                    setMobileSearchOpen(false);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  ref={mobileSearchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setMobileSearchOpen(false); setQuery(''); } }}
                  placeholder="Search issues…"
                  className="flex-1 text-xs rounded-md outline-none"
                  style={{
                    padding: '6px 10px',
                    background: 'var(--color-base-150)', border: '1px solid #3189FF',
                    color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif",
                  }}
                />
                <button
                  type="button"
                  onClick={() => { setMobileSearchOpen(false); setQuery(''); }}
                  style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 6px' }}
                >
                  ✕
                </button>
              </form>
            ) : (
              <span
                style={{
                  color: 'var(--color-base-700)',
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 700,
                  fontSize: '1rem',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Issues
              </span>
            )}
          </div>

          {!mobileSearchOpen && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="flex items-center justify-center size-8 rounded flex-shrink-0"
              style={{ background: 'transparent', color: 'var(--color-base-500)', border: 'none', cursor: 'pointer' }}
              aria-label="Search"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          {/* Group by — mobile */}
          {!hideToolbar && !mobileSearchOpen && (
            <div ref={groupRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => toggle('group')}
                className="flex items-center justify-center size-8 rounded"
                style={{
                  background: (openPanel === 'group' || f.groupBy !== 'none') ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: (openPanel === 'group' || f.groupBy !== 'none') ? 'var(--color-base-800)' : 'var(--color-base-500)',
                  border: (openPanel === 'group' || f.groupBy !== 'none') ? '1px solid #2A2A2E' : '1px solid transparent',
                  cursor: 'pointer',
                }}
                aria-label="Group by"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              {openPanel === 'group' && (
                <GroupDropdown
                  current={f.groupBy}
                  onChange={v => { set({ groupBy: v }); setOpenPanel(null); }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0" style={{ background: 'var(--color-base)', borderBottom: '1px solid var(--color-base-300)' }}>
      <div className="flex items-center gap-2 px-4" style={{ height: '48px' }}>

        {/* New Issue */}
        {onNewTask && (
          <button
            onClick={onNewTask}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              background: 'var(--color-base-200)', color: 'var(--color-base-800)', border: '1px solid var(--color-base-350)',
              fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Issue
          </button>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-sm">
          <div className="relative">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-base-400)' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search issues…"
              className="w-full text-xs rounded-md outline-none transition-colors"
              style={{
                paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px',
                background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)',
                color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#3189FF')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
            />
          </div>
        </form>

        {/* Right icon toolbar */}
        <div className="ml-auto flex items-center gap-0.5">
          {!hideToolbar && <div style={{ width: 1, height: 16, background: 'var(--color-base-300)', margin: '0 6px' }} />}

          {/* Filter / Sort / Group — hidden on Pulse */}
          {!hideToolbar && <>{/* Filter */}
          <div ref={filterRef} className="relative">
            <IconBtn title="Filter" active={openPanel === 'filter' || hasActiveFilters} onClick={() => toggle('filter')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </IconBtn>
            {openPanel === 'filter' && (
              <FilterDropdown
                f={f}
                set={set}
                hideAssignee={hideAssignee}
                onClear={() => set({ statuses: [], priorities: [], assignee: '' })}
              />
            )}
          </div>

          {/* Sort */}
          <div ref={sortRef} className="relative">
            <IconBtn title="Sort" active={openPanel === 'sort'} onClick={() => toggle('sort')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="9" y2="18" />
              </svg>
            </IconBtn>
            {openPanel === 'sort' && (
              <SortDropdown f={f} cycleSort={cycleSort} />
            )}
          </div>

          {/* Group */}
          <div ref={groupRef} className="relative">
            <IconBtn title="Group by" active={openPanel === 'group' || f.groupBy !== 'none'} onClick={() => toggle('group')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </IconBtn>
            {openPanel === 'group' && (
              <GroupDropdown
                current={f.groupBy}
                onChange={v => { set({ groupBy: v }); setOpenPanel(null); }}
              />
            )}
          </div>

          {/* Count */}
          {totalCount !== undefined && (
            <span className="ml-2 text-xs tabular-nums" style={{ color: 'var(--color-base-400)', fontFamily: "'Roboto Mono', monospace", fontSize: '0.7rem' }}>
              {totalCount}
            </span>
          )}
          </> /* end !hideToolbar */}

          <div style={{ width: 1, height: 16, background: 'var(--color-base-300)', margin: '0 4px 0 8px' }} />

          {/* Theme control */}
          <ThemeSegmentedControl />
        </div>
      </div>
    </div>
  );
}
