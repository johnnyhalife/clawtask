'use client';

import { useState } from 'react';
import { apiPatch } from '@/hooks/useApi';
import { THINKING_LEVELS, validateTaskRuntime, type TaskRuntime } from '@/lib/task-runtime';

export function TaskRuntimeFields({ value, onChange, disabled = false }: {
  value: TaskRuntime; onChange: (next: TaskRuntime) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 text-xs" style={{ color: 'var(--color-base-800)' }}>
    <legend className="font-semibold mb-2">Agent runtime</legend>
    <label className="block">Model
      <select aria-label="Model mode" value={value.modelOverride === null ? 'default' : 'override'}
        onChange={e => onChange({ ...value, modelOverride: e.target.value === 'default' ? null : '' })}
        className="block w-full p-2 rounded" style={{ background: 'var(--color-base-150)' }}>
        <option value="default">Default (agent configuration)</option><option value="override">Override</option>
      </select>
    </label>
    {value.modelOverride !== null && <input aria-label="Model override" placeholder="provider/model" value={value.modelOverride}
      onChange={e => onChange({ ...value, modelOverride: e.target.value })} autoComplete="off"
      className="block w-full min-w-0 p-2 rounded" style={{ background: 'var(--color-base-150)' }} />}
    <label className="block">Thinking
      <select aria-label="Thinking override" value={value.thinkingOverride ?? ''}
        onChange={e => onChange({ ...value, thinkingOverride: e.target.value || null })}
        className="block w-full p-2 rounded" style={{ background: 'var(--color-base-150)' }}>
        <option value="">Default (agent configuration)</option>
        {THINKING_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
      </select>
    </label>
    <p style={{ color: 'var(--color-base-500)', whiteSpace: 'normal' }}>Defaults are independent. Overrides must be supported by the selected Gateway model.</p>
  </fieldset>;
}

/** Drafts never masquerade as persisted state. Only a successful PATCH closes the editor. */
export function TaskRuntimeSettings({ task, onSaved }: {
  task: { id: string; modelOverride?: string | null; thinkingOverride?: string | null }; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<TaskRuntime | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const open = () => { setError(''); setDraft({ modelOverride: task.modelOverride ?? null, thinkingOverride: task.thinkingOverride ?? null }); };
  const save = async () => {
    if (!draft || pending) return;
    const invalid = validateTaskRuntime(draft);
    if (invalid) { setError(invalid); return; }
    setPending(true); setError('');
    try { await apiPatch('/api/v1/tasks/' + task.id, draft); setDraft(null); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Runtime settings were not saved'); }
    finally { setPending(false); }
  };
  return <section aria-label="Task runtime settings" className="py-2 space-y-2 min-w-0 text-xs" style={{ color: 'var(--color-base-800)', whiteSpace: 'normal' }}>
    <p className="break-words">Model: {task.modelOverride ?? 'Default'} · Thinking: {task.thinkingOverride ?? 'Default'}</p>
    {draft ? <>
      <TaskRuntimeFields value={draft} onChange={setDraft} disabled={pending} />
      <p style={{ color: 'var(--color-base-500)' }}>Applies before submission. An active run is unchanged.</p>
      {error && <p role="alert" style={{ color: '#F87171' }}>{error}</p>}
      <div className="flex gap-3"><button type="button" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save runtime'}</button>
        <button type="button" disabled={pending} onClick={() => setDraft(null)}>Cancel</button></div>
    </> : <button type="button" onClick={open}>Edit runtime</button>}
  </section>;
}
