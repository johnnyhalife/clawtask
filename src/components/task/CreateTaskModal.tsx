'use client';

import { useState, useRef, useEffect } from 'react';
import NextImage from 'next/image';
import { Project, Tag, Agent } from '@/types';
import { apiPost, useApi } from '@/hooks/useApi';
import { TypeaheadChipSelect, STATUS_OPTIONS, PRIORITY_OPTIONS, AGENT_COLOR } from './ChipSelect';
import { useIsMobile } from '@/hooks/useIsMobile';

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: (taskId: string, issueId: string) => void;
  defaultProjectId?: string;
}

// Tags toolbar pill — opens a search + create dropdown above the toolbar
function TagsToolbarPill({
  localTags,
  selectedTags,
  onToggle,
  onCreate,
  creating,
  tabIndex,
}: {
  localTags: Tag[];
  selectedTags: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  creating: boolean;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  const filtered = localTags.filter(t => t.name.toLowerCase().includes(input.toLowerCase()));
  const exactMatch = localTags.some(t => t.name.toLowerCase() === input.toLowerCase());
  const showCreate = input.trim().length > 0 && !exactMatch;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setInput(''); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const match = localTags.find(t => t.name.toLowerCase() === input.toLowerCase());
      if (match) { onToggle(match.id); setInput(''); }
      else if (input.trim()) { onCreate(input.trim()).then(() => setInput('')); }
    }
  };

  const count = selectedTags.length;
  const hasSelected = count > 0;

  // tag icon
  const tagIcon = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );

  return (
    <div className="relative">
      <button
        type="button"
        tabIndex={tabIndex}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
        style={{
          background: hasSelected ? 'rgba(49,137,255,0.12)' : 'var(--color-base-150)',
          border: '1px solid var(--color-base-300)',
          color: hasSelected ? '#3189FF' : 'var(--color-base-600)',
          fontFamily: "'Instrument Sans', sans-serif",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-200)')}
        onMouseLeave={e => (e.currentTarget.style.background = hasSelected ? 'rgba(49,137,255,0.12)' : 'var(--color-base-150)')}
      >
        {tagIcon}
        {hasSelected ? `Tags · ${count}` : 'Tags'}
      </button>

      {open && (
        <>
          <div role="presentation" className="fixed inset-0 z-10" onClick={() => { setOpen(false); setInput(''); }} />
          <div
            ref={dropdownRef}
            className="absolute left-0 bottom-full mb-1 rounded-lg shadow-2xl z-20 flex flex-col"
            style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', width: 220 }}
          >
            {/* Selected chips */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pt-2.5 pb-1">
                {selectedTags.map(id => {
                  const tag = localTags.find(t => t.id === id);
                  if (!tag) return null;
                  return (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
                      style={{ borderColor: tag.color + '50', backgroundColor: tag.color + '20', color: tag.color, fontFamily: "'Instrument Sans', sans-serif" }}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); onToggle(tag.id); }}
                        className="leading-none opacity-60 hover:opacity-100"
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search input */}
            <div className="px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search or create…"
                className="w-full px-2.5 py-1.5 rounded-md text-xs outline-none"
                style={{ background: 'var(--color-base-100)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif" }}
                autoComplete="off"
              />
            </div>

            {/* List */}
            <div style={{ maxHeight: 160, overflowY: 'auto', borderTop: '1px solid var(--color-base-300)' }}>
              {filtered.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onToggle(tag.id); setInput(''); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif" }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="size-2 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                  <span style={{ color: selectedTags.includes(tag.id) ? 'var(--color-base-900)' : 'var(--color-base-700)' }}>{tag.name}</span>
                  {selectedTags.includes(tag.id) && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3189FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto flex-shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
              {showCreate && (
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={e => { e.preventDefault(); onCreate(input.trim()).then(() => setInput('')); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ color: '#3189FF', fontFamily: "'Instrument Sans', sans-serif", background: 'transparent', border: 'none', borderTop: '1px solid var(--color-base-300)', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  + {creating ? 'Creating…' : `Create "${input.trim()}"`}
                </button>
              )}
              {filtered.length === 0 && !showCreate && (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>No tags yet</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Bottom toolbar combo — dark pill, opens a simple dropdown (no typeahead)
function ToolbarDropdown({
  icon, options, value, onChange, tabIndex,
}: {
  icon: React.ReactNode;
  options: { value: string; label: string; color: string }[];
  value: string;
  onChange: (v: string) => void;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <div className="relative">
      <button
        type="button"
        tabIndex={tabIndex}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
        style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', color: current.color, fontFamily: "'Instrument Sans', sans-serif" }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-base-200)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-base-150)')}
      >
        {icon}
        {current.label}
      </button>
      {open && (
        <>
          <div role="presentation" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 bottom-full mb-1 rounded-lg shadow-2xl overflow-hidden z-20"
            style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', minWidth: '140px' }}
          >
            {options.map(opt => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                  style={{ color: active ? 'var(--color-base-900)' : 'var(--color-base-650)', background: active ? 'var(--color-base-200)' : 'transparent', fontFamily: "'Instrument Sans', sans-serif" }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = active ? 'var(--color-base-200)' : 'transparent')}
                >
                  <span className="size-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function CreateTaskModal({ onClose, onCreated, defaultProjectId }: CreateTaskModalProps) {
  const { data: config } = useApi<Record<string, string>>('/api/v1/config');
  const { data: projects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags } = useApi<Tag[]>('/api/v1/tags');
  const { data: agents } = useApi<Agent[]>('/api/v1/agents');
  const { data: humans } = useApi<{ id: string; displayName: string }[]>('/api/v1/humans');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('backlog');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeType, setAssigneeType] = useState<'agent' | 'human' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [localTags, setLocalTags] = useState<Tag[]>([]);
  const [creatingTag, setCreatingTag] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (tags) setLocalTags(tags); }, [tags]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCreateTag = async (name: string) => {
    if (!name.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const res = await apiPost<Tag>('/api/v1/tags', { name: name.trim() });
      const newTag = res as Tag;
      setLocalTags(prev => prev.some(t => t.id === newTag.id) ? prev : [...prev, newTag]);
      setSelectedTags(prev => prev.includes(newTag.id) ? prev : [...prev, newTag.id]);
    } catch (_) {}
    finally { setCreatingTag(false); }
  };

  const toggleTag = (id: string) =>
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const created = await apiPost<{ id: string; issueId: string }>('/api/v1/tasks', {
        title: title.trim(),
        description: description.trim(),
        priority, status,
        projectId: projectId || null,
        tags: selectedTags,
        assigneeId: assigneeId || null,
        assigneeType: assigneeType || null,
      });
      window.dispatchEvent(new CustomEvent('clawtask:refresh-sidebar'));
      onCreated(created.id, created.issueId);
    } catch (err: any) {
      setError(err.message);
    } finally { setSubmitting(false); }
  };

  // Workspace chip
  const appName = config?.appName ?? 'Clawtask';
  const workspaceLogo = config?.workspaceLogo;
  const initials = appName.split(/\s+/).slice(0, 3).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 3);

  // Assignee options + derived label/color
  const readyAgents = (agents || []).filter(a => a.probeStatus === 'ok');
  const assigneeOptions = [
    { value: '', label: 'Assignee', color: 'var(--color-base-400)' },
    ...(humans ?? []).map(h => ({ value: `human:${h.id}`, label: h.displayName, color: 'var(--color-base-700)' })),
    ...readyAgents.map(a => ({ value: `agent:${a.id}`, label: a.displayName, color: AGENT_COLOR })),
  ];
  const selectedAssigneeLabel = assigneeId
    ? ((humans ?? []).find(h => h.id === assigneeId)?.displayName
      ?? readyAgents.find(a => a.id === assigneeId)?.displayName
      ?? 'Assignee')
    : 'Assignee';
  const assigneeLabel = selectedAssigneeLabel;
  const assigneeColor = assigneeType === 'human' ? 'var(--color-base-700)' : assigneeType === 'agent' ? AGENT_COLOR : 'var(--color-base-500)';

  // Project options + derived label/color
  const projectOptions = [
    { value: '', label: 'None', color: 'var(--color-base-400)' },
    ...(projects || []).map(p => ({ value: p.id, label: p.name, color: p.color })),
  ];
  const currentProject = (projects || []).find(p => p.id === projectId);
  const projectLabel = currentProject?.name ?? 'None';
  const projectColor = currentProject?.color ?? '#52525A';

  // Status icon
  const statusCfg = STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[0];
  const statusIcon = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      {status === 'done' && <polyline points="20 6 9 17 4 12" />}
      {status === 'in_progress' && <polyline points="12 8 12 12 14 14" />}
    </svg>
  );

  // Priority icon
  const priorityIcon = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const isMobile = useIsMobile();

  // Mobile: full-screen modal
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[150] flex flex-col"
        style={{ background: 'var(--color-base)', height: '100dvh', overflowY: 'auto' }}
      >
        {/* Mobile header */}
        <div
          className="flex items-center gap-2 px-4 flex-shrink-0"
          style={{ height: 48, borderBottom: '1px solid var(--color-base-200)' }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={{ color: 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.9rem', fontWeight: 600, flex: 1 }}>
            New Issue
          </span>
        </div>

        {/* Title + meta */}
        <div className="flex-shrink-0 px-4 pt-5 pb-4" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            ref={titleRef}
            placeholder="Issue title"
            autoFocus
            className="w-full bg-transparent outline-none"
            style={{
              color: 'var(--color-base-900)',
              fontFamily: "'Instrument Sans', sans-serif",
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: 14,
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px' }}>For</span>
            <TypeaheadChipSelect
              label={assigneeLabel}
              color={assigneeColor}
              placeholder="Assignee…"
              options={assigneeOptions}
              onChange={v => {
                if (!v) { setAssigneeId(''); setAssigneeType(''); }
                else { const [type, ...rest] = v.split(':'); setAssigneeType(type as 'agent' | 'human'); setAssigneeId(rest.join(':')); }
              }}
            />
            <span style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px' }}>in</span>
            <TypeaheadChipSelect
              label={projectLabel}
              color={projectColor}
              placeholder="Project…"
              options={projectOptions}
              onChange={v => setProjectId(v)}
            />
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 px-4 py-3" style={{ minHeight: 0 }}>
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add description…"
            className="w-full bg-transparent outline-none resize-none"
            style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.875rem', minHeight: '120px', height: '100%' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
            }}
          />
        </div>

        {/* Bottom toolbar + submit */}
        <div
          className="flex-shrink-0"
          style={{
            borderTop: '1px solid var(--color-base-200)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
            <ToolbarDropdown icon={statusIcon} options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            <ToolbarDropdown icon={priorityIcon} options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
            <TagsToolbarPill
              localTags={localTags}
              selectedTags={selectedTags}
              onToggle={toggleTag}
              onCreate={handleCreateTag}
              creating={creatingTag}
            />
          </div>
          <div className="px-4 py-3">
            {error && (
              <p style={{ color: '#F87171', fontFamily: "'Instrument Sans', sans-serif", fontSize: '12px', marginBottom: 8 }}>{error}</p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="w-full py-3 rounded-lg text-sm font-semibold"
              style={{
                background: 'var(--color-base-900)',
                color: 'var(--color-base)',
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 700,
                opacity: submitting || !title.trim() ? 0.4 : 1,
                cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
                border: 'none',
                minHeight: '44px',
              }}
            >
              {submitting ? 'Creating…' : 'Create Issue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--color-base)', border: '1px solid var(--color-base-300)', maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          {workspaceLogo ? (
            <NextImage src={workspaceLogo} alt={appName} width={20} height={20} className="size-5 rounded object-cover flex-shrink-0" unoptimized />
          ) : (
            <div
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-bold"
              style={{ background: '#3189FF', color: '#fff', fontFamily: "'Darker Grotesque', sans-serif", lineHeight: 1.4 }}
            >
              {initials}
            </div>
          )}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-base-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{ color: 'var(--color-base-700)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px', fontWeight: 500 }}>
            New issue
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              style={{ color: 'var(--color-base-400)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-400)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Title + meta row */}
        <div className="px-6 pt-7 pb-5" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            ref={titleRef}
            placeholder="Issue title"
            autoFocus
            className="w-full bg-transparent outline-none"
            style={{
              color: 'var(--color-base-900)',
              fontFamily: "'Instrument Sans', sans-serif",
              fontSize: '1.3rem',
              fontWeight: 600,
              marginBottom: '20px',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
              if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); submitRef.current?.focus(); }
            }}
          />
          {/* For [Assignee] in [Project] */}
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px' }}>For</span>
            <TypeaheadChipSelect
              label={assigneeLabel}
              color={assigneeColor}
              placeholder="Assignee…"
              options={assigneeOptions}
              onChange={v => {
                if (!v) { setAssigneeId(''); setAssigneeType(''); }
                else { const [type, ...rest] = v.split(':'); setAssigneeType(type as 'agent' | 'human'); setAssigneeId(rest.join(':')); }
              }}
            />
            <span style={{ color: 'var(--color-base-500)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px' }}>in</span>
            <TypeaheadChipSelect
              label={projectLabel}
              color={projectColor}
              placeholder="Project…"
              options={projectOptions}
              onChange={v => setProjectId(v)}
            />
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: '120px' }}>
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add description…"
            className="w-full h-full bg-transparent outline-none resize-none"
            style={{ color: 'var(--color-base-800)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '0.875rem', minHeight: '100px' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
              if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); submitRef.current?.focus(); }
            }}
          />
        </div>

        {/* Bottom toolbar */}
        <div style={{ borderTop: '1px solid var(--color-base-200)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-base-200)' }}>
            <ToolbarDropdown
              icon={statusIcon}
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              tabIndex={-1}
            />
            <ToolbarDropdown
              icon={priorityIcon}
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
              tabIndex={-1}
            />
            <TagsToolbarPill
              localTags={localTags}
              selectedTags={selectedTags}
              onToggle={toggleTag}
              onCreate={handleCreateTag}
              creating={creatingTag}
              tabIndex={-1}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5">
            {error ? (
              <span style={{ color: '#F87171', fontFamily: "'Instrument Sans', sans-serif", fontSize: '12px' }}>{error}</span>
            ) : (
              <button
                type="button"
                onClick={onClose}
                style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif", fontSize: '13px' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-650)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-400)')}
              >
                Discard Draft
              </button>
            )}
            <button
              ref={submitRef}
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity"
              onKeyDown={e => {
                if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); titleRef.current?.focus(); }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); descriptionRef.current?.focus(); }
              }}
              style={{
                background: 'var(--color-base-900)',
                color: 'var(--color-base)',
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 700,
                opacity: submitting || !title.trim() ? 0.4 : 1,
                cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating…' : 'Create Issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
