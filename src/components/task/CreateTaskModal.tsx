'use client';

import { useState, useEffect } from 'react';
import { Project, Tag, Agent, Human } from '@/types';
import { apiPost, useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: () => void;
  defaultProjectId?: string;
}

export function CreateTaskModal({ onClose, onCreated, defaultProjectId }: CreateTaskModalProps) {
  const { data: projects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags } = useApi<Tag[]>('/api/v1/tags');
  const { data: agents } = useApi<Agent[]>('/api/v1/agents');
  const { data: config } = useApi<Record<string, string>>('/api/v1/config');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('todo');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeType, setAssigneeType] = useState<'agent' | 'human' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const humanId = config ? 'human' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/api/v1/tasks', {
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        projectId: projectId || null,
        tags: selectedTags,
        assigneeId: assigneeId || null,
        assigneeType: assigneeType || null,
      });
      // Refresh sidebar projects/tags
      window.dispatchEvent(new CustomEvent('clawtask:refresh-sidebar'));
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-[#131316] border border-zinc-800 rounded-lg shadow-2xl w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-100">New Task</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">✕</button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description (Markdown supported)"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Priority</label>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Status</label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Project</label>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {(projects || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Assignee</label>
              <Select
                value={`${assigneeType}:${assigneeId}`}
                onChange={(e) => {
                  const [type, id] = e.target.value.split(':');
                  setAssigneeType(type as 'agent' | 'human' | '');
                  setAssigneeId(id || '');
                }}
              >
                <option value=":">Unassigned</option>
                <optgroup label="Agents">
                  {(agents || []).filter(a => a.probeStatus === 'ok').map((a) => (
                    <option key={a.id} value={`agent:${a.id}`}>🤖 {a.displayName}</option>
                  ))}
                </optgroup>
              </Select>
            </div>

            {(tags || []).length > 0 && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {(tags || []).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border transition-all"
                      style={{
                        borderColor: tag.color + '80',
                        backgroundColor: selectedTags.includes(tag.id) ? tag.color + '30' : 'transparent',
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
