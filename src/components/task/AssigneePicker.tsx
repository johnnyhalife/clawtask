'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { executeAssigneeChange, type AssigneeType } from '@/lib/assignee-change';
import { apiPatch } from '@/hooks/useApi';
import { ActorAvatar } from '@/components/ui/ActorDisplay';

type Assignee = { id: string; displayName: string };
type AssigneePatch = (url: string, body: { assigneeId: string | null; assigneeType: AssigneeType }) => Promise<unknown>;

export type AssigneePickerHandle = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

export type AssigneePickerProps = {
  taskId: string;
  assigneeId: string | null;
  assigneeType: AssigneeType;
  assigneeName?: string | null;
  humans: Assignee[];
  agents: Assignee[];
  disabled?: boolean;
  layout: 'desktop' | 'mobile';
  onRefresh: () => Promise<void> | void;
  onOpenChange?: (open: boolean) => void;
  patch?: AssigneePatch;
};

function feedback(loading: boolean, error: string | null) {
  if (!loading && !error) return null;
  return (
    <div className="mt-1 text-xs" aria-live="polite" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
      {loading && <span role="status" style={{ color: 'var(--color-base-500)' }}>Updating assignee…</span>}
      {error && <span role="alert" style={{ color: '#F87171' }}>{error}</span>}
    </div>
  );
}

export const AssigneePicker = forwardRef<AssigneePickerHandle, AssigneePickerProps>(function AssigneePicker({
  taskId,
  assigneeId,
  assigneeType,
  assigneeName,
  humans,
  agents,
  disabled = false,
  layout,
  onRefresh,
  onOpenChange,
  patch = apiPatch,
}, ref) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = [
    { id: null as string | null, type: null as AssigneeType, label: 'Unassigned', isAgent: false },
    ...humans.map(human => ({ id: human.id, type: 'human' as const, label: human.displayName, isAgent: false })),
    ...agents.map(agent => ({ id: agent.id, type: 'agent' as const, label: agent.displayName, isAgent: true })),
  ];

  const setPickerOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const select = async (nextId: string | null, nextType: AssigneeType) => {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);
    const result = await executeAssigneeChange({ taskId, assigneeId: nextId, assigneeType: nextType, patch });
    if (result.ok) {
      await onRefresh();
      setPickerOpen(false);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      if (loading || disabled) return;
      setHighlight(0);
      setPickerOpen(true);
      triggerRef.current?.focus();
    },
    close: () => setPickerOpen(false),
    isOpen: () => open,
  }), [disabled, loading, open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setHighlight(0);
        setPickerOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight(index => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[highlight];
      void select(option.id, option.type);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setPickerOpen(false);
    }
  };

  const currentLabel = assigneeId
    ? (assigneeType === 'human' ? 'You' : assigneeName)
    : 'No assignee';

  return (
    <div data-layout={layout} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Assignee"
        aria-expanded={open}
        aria-busy={loading}
        disabled={loading || disabled}
        onClick={() => { if (!loading && !disabled) { setHighlight(0); setPickerOpen(!open); } }}
        onKeyDown={onTriggerKeyDown}
        style={{ background: 'none', border: 'none', cursor: loading || disabled ? 'wait' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, opacity: loading || disabled ? 0.6 : 1 }}
      >
        {assigneeId ? <ActorAvatar name={assigneeName ?? ''} isAgent={assigneeType === 'agent'} size={20} /> : null}
        <span style={{ color: assigneeId ? 'var(--color-base-800)' : 'var(--color-base-500)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif" }}>{currentLabel}</span>
      </button>
      {open && (
        <>
          <div role="presentation" className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
          <div role="listbox" aria-label="Assignee options" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4, overflow: 'hidden' }}>
            {options.map((option, index) => {
              const active = option.id ? assigneeId === option.id : !assigneeId;
              const section = (index === 1 && humans.length > 0) || (index === 1 + humans.length && agents.length > 0);
              return (
                <div key={option.id ?? 'unassigned'}>
                  {section && <div className="px-3 pt-2 pb-0.5" style={{ color: 'var(--color-base-500)', fontSize: '0.7rem', fontFamily: "'Instrument Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{index === 1 ? 'Me' : 'Agents'}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={loading || disabled}
                    onClick={() => { void select(option.id, option.type); }}
                    onMouseEnter={() => setHighlight(index)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                    style={{ background: highlight === index || active ? 'var(--color-base-200)' : 'transparent', color: active ? 'var(--color-base-900)' : 'var(--color-base-650)', fontFamily: "'Instrument Sans', sans-serif" }}
                  >
                    {option.id ? <ActorAvatar name={option.label} isAgent={option.isAgent} size={16} /> : <span className="size-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-base-400)' }} />}
                    {option.label}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {feedback(loading, error)}
    </div>
  );
});
