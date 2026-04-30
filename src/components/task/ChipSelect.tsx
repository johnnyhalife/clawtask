'use client';

import { useState, useRef, forwardRef, useImperativeHandle } from 'react';

export const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo', color: 'var(--color-base-650)' },
  { value: 'in_progress', label: 'In Progress', color: '#3189FF' },
  { value: 'blocked', label: 'Blocked', color: '#F87171' },
  { value: 'done', label: 'Done', color: '#22C55E' },
  { value: 'archived', label: 'Archived', color: 'var(--color-base-500)' },
];

export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: '#F87171' },
  { value: 'high', label: 'High', color: '#FFC674' },
  { value: 'medium', label: 'Medium', color: '#3189FF' },
  { value: 'low', label: 'Low', color: 'var(--color-base-650)' },
];

export const AGENT_COLOR = '#7E67F7';

export interface ChipOption {
  value: string;
  label: string;
  color: string;
}

// Typeahead variant: chip stays a chip; search input lives inside the dropdown.
// Tab from title → focus chip → onFocus opens dropdown → search autofocused.
export function TypeaheadChipSelect({
  label,
  color,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  color: string;
  placeholder?: string;
  options: ChipOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const defaultLabel = options[0]?.label ?? '';
  const isSelected = label !== defaultLabel;
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  const doOpen = () => {
    setOpen(true);
    setQuery('');
    setHighlightIdx(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const doClose = () => { setOpen(false); setQuery(''); };

  // Close when focus leaves the whole container (works for both Tab and outside-click)
  const handleBlur = () => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) doClose();
    }, 0);
  };

  const handleSelect = (opt: ChipOption) => { onChange(opt.value); doClose(); };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); doClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]); }
    // Tab: blur fires → handleBlur closes dropdown, focus moves naturally
  };

  return (
    <div ref={containerRef} className="relative inline-block" onBlur={e => { if (!containerRef.current?.contains(e.relatedTarget as Node)) doClose(); }}>
      {/* Chip trigger */}
      <button
        type="button"
        tabIndex={0}
        onMouseDown={e => { e.preventDefault(); open ? doClose() : doOpen(); }}
        onFocus={() => { if (!open) doOpen(); }}
        className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium border outline-none transition-colors"
        style={{
          borderColor: isSelected ? color + '55' : 'var(--color-base-300)',
          backgroundColor: isSelected ? color + '12' : 'transparent',
          color: isSelected ? color : 'var(--color-base-600)',
          fontFamily: "'Instrument Sans', sans-serif",
          fontSize: '0.8rem',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onMouseDown={() => doClose()} />
          <div
            className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-20 overflow-hidden"
            style={{ background: 'var(--color-base)', border: '1px solid var(--color-base-300)', minWidth: '200px' }}
          >
          {/* Search */}
          <div style={{ borderBottom: '1px solid var(--color-base-300)' }}>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlightIdx(0); }}
              onKeyDown={handleSearchKeyDown}
              placeholder={placeholder ?? 'Search…'}
              className="w-full px-3 py-2.5 bg-transparent outline-none"
              style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.82rem' }}
            />
          </div>
          {/* Options */}
          {filtered.map((opt, i) => {
            const active = opt.label === label;
            const highlighted = i === highlightIdx;
            return (
              <button
                key={opt.value}
                type="button"
                tabIndex={-1}
                onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setHighlightIdx(i)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left"
                style={{
                  color: active ? 'var(--color-base-900)' : 'var(--color-base-700)',
                  background: highlighted ? 'var(--color-base-150)' : 'transparent',
                  fontFamily: "'Instrument Sans', sans-serif",
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {opt.value
                  ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  : <span className="w-2 h-2 flex-shrink-0" />}
                {opt.label}
                {active && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto flex-shrink-0" style={{ color: 'var(--color-base-600)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

export interface ChipSelectHandle {
  openDropdown: () => void;
}

export const ChipSelect = forwardRef<ChipSelectHandle, {
  label: string;
  color: string;
  options: ChipOption[];
  onChange: (v: string) => void;
}>(function ChipSelect({ label, color, options, onChange }, ref) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const doOpen = () => {
    const currentIdx = options.findIndex(o => o.label === label);
    setHighlightIdx(currentIdx >= 0 ? currentIdx : 0);
    setOpen(true);
  };
  const doClose = () => { setOpen(false); buttonRef.current?.focus(); };
  const doSelect = (opt: ChipOption) => { onChange(opt.value); setOpen(false); };

  useImperativeHandle(ref, () => ({
    openDropdown: () => { doOpen(); buttonRef.current?.focus(); },
  }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doOpen(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); doSelect(options[highlightIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doClose(); }
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? doClose() : doOpen()}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-opacity hover:opacity-80"
        style={{
          borderColor: color + '50',
          backgroundColor: color + '20',
          color,
          fontFamily: "'Instrument Sans', sans-serif",
        }}
      >
        {label}
        <svg
          width="9" height="9" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.6, flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={doClose} />
          <div
            className="absolute left-0 top-full mt-1 rounded-lg shadow-2xl overflow-hidden z-20"
            style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', minWidth: '140px' }}
          >
            {options.map((opt, i) => {
              const active = opt.label === label;
              const highlighted = i === highlightIdx;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); doSelect(opt); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{
                    color: active ? 'var(--color-base-900)' : 'var(--color-base-650)',
                    background: highlighted ? 'var(--color-base-200)' : 'transparent',
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});
