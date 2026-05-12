'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { useApi, apiPatch, apiPost, apiDelete } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Agent } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/components/ui/ThemeProvider';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ThemeSegmentedControl } from '@/components/ui/ThemeSegmentedControl';
import { useIsMobile } from '@/hooks/useIsMobile';
import { BottomNav } from '@/components/layout/BottomNav';

type SettingsTab = 'general' | 'adapter' | 'agents' | 'projects' | 'external';

// ----- General Tab -----
function GeneralSettings() {
  const { data: config, reload } = useApi<Record<string, string>>('/api/v1/config');
  const [form, setForm] = useState({ appName: '', issuePrefix: '', humanName: '', humanDisplayName: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setForm({
        appName: config.appName || 'Clawtask',
        issuePrefix: config.issuePrefix || 'CWT',
        humanName: config.humanName || 'human',
        humanDisplayName: config.humanDisplayName || 'You',
      });
      setLogoPreview(config.workspaceLogo || null);
    }
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch('/api/v1/config', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/config/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        setLogoPreview(data.data.logoUrl + '?t=' + Date.now());
        reload();
      }
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoRemove = async () => {
    await fetch('/api/v1/config/logo', { method: 'DELETE' });
    setLogoPreview(null);
    reload();
  };

  return (
    <form onSubmit={handleSave} className="max-w-md space-y-6">
      {/* Workspace Logo */}
      <div>
        <label htmlFor="workspace-logo" className="block text-sm font-medium style-base-800 mb-2">Workspace Logo</label>
        <div className="flex items-center gap-4">
          <div
            className="size-12 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)' }}
          >
            {logoPreview ? (
              <NextImage src={logoPreview} alt="logo" width={48} height={48} className="w-full h-full object-cover rounded-lg" unoptimized />
            ) : (
              <span className="style-base-500 text-xs">None</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
              style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', color: 'var(--color-base-800)' }}
            >
              {logoUploading ? 'Uploading...' : '↑ Upload image'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
                disabled={logoUploading}
              />
            </label>
            {logoPreview && (
              <button
                type="button"
                onClick={handleLogoRemove}
                className="text-xs style-base-600 hover:text-red-400 text-left transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-xs style-base-500 mt-1.5">JPEG, PNG, WebP, SVG · max 2MB</p>
      </div>

      <div>
        <label htmlFor="workspace-name" className="block text-sm font-medium style-base-800 mb-1">Workspace Name</label>
        <Input
          id="workspace-name"
          value={form.appName}
          onChange={(e) => setForm(prev => ({ ...prev, appName: e.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="issue-prefix" className="block text-sm font-medium style-base-800 mb-1">Issue Prefix</label>
        <Input
          id="issue-prefix"
          value={form.issuePrefix}
          onChange={(e) => setForm(prev => ({ ...prev, issuePrefix: e.target.value.toUpperCase() }))}
          maxLength={10}
        />
        <p className="text-xs style-base-500 mt-1">Issues will be numbered like {form.issuePrefix || 'CWT'}-001</p>
      </div>
      <div>
        <label htmlFor="human-name" className="block text-sm font-medium style-base-800 mb-1">Human Name</label>
        <Input
          id="human-name"
          value={form.humanName}
          onChange={(e) => setForm(prev => ({ ...prev, humanName: e.target.value }))}
        />
      </div>
      <div>
        <label htmlFor="human-display-name" className="block text-sm font-medium style-base-800 mb-1">Human Display Name</label>
        <Input
          id="human-display-name"
          value={form.humanDisplayName}
          onChange={(e) => setForm(prev => ({ ...prev, humanDisplayName: e.target.value }))}
        />
      </div>
      <Button type="submit" variant="primary" disabled={saving}>
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
      </Button>
    </form>
  );
}

// ----- Adapter Tab -----
function AdapterSettings() {
  const { data: config, reload } = useApi<Record<string, string>>('/api/v1/config');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayAuthToken, setGatewayAuthToken] = useState('');
  const [tokenPlaceholder, setTokenPlaceholder] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setGatewayUrl(config.gatewayUrl || 'ws://localhost:2222');
      // If a token is stored, show a masked placeholder; don't populate the field
      setTokenPlaceholder(config.gatewayAuthToken ? '••••••••••••••••' : '');
      setGatewayAuthToken('');
    }
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const patch: Record<string, string> = { gatewayUrl };
      // Only send token if the user typed something new
      if (gatewayAuthToken.trim()) patch.gatewayAuthToken = gatewayAuthToken.trim();
      await apiPatch('/api/v1/config', patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-md space-y-6">
      <div>
        <label htmlFor="gateway-url" className="block text-sm font-medium style-base-800 mb-1">Gateway URL</label>
        <Input
          id="gateway-url"
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="ws://host.docker.internal:18789/ws"
        />
        <p className="text-xs style-base-500 mt-1">OpenClaw gateway WebSocket URL used for all agent connections</p>
      </div>

      <div>
        <label htmlFor="auth-token" className="block text-sm font-medium style-base-800 mb-1">Auth Token</label>
        <Input
          id="auth-token"
          type="password"
          value={gatewayAuthToken}
          onChange={(e) => setGatewayAuthToken(e.target.value)}
          placeholder={tokenPlaceholder || 'Enter token to set or update'}
        />
        <p className="text-xs style-base-500 mt-1">Leave blank to keep the existing token unchanged</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="size-2 rounded-full bg-[var(--color-base-500)]" />
        <span className="text-xs style-base-600">Connection status shown per agent in the Agents tab</span>
      </div>

      <Button type="submit" variant="primary" disabled={saving}>
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
      </Button>
    </form>
  );
}

// ----- Agents Tab -----
interface NewAgentForm {
  openclawAgentId: string;
  displayName: string;
}

function AgentRow({ agent, onUpdated, onDeleted }: { agent: Agent; onUpdated: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(agent.displayName);
  const [probing, setProbing] = useState(false);

  // Keep local edit state in sync if the agent prop changes externally
  useEffect(() => { setDisplayName(agent.displayName); }, [agent.displayName]);

  const handleSave = async () => {
    await apiPatch(`/api/v1/agents/${agent.id}`, { displayName });
    setEditing(false);
    onUpdated();
  };

  const handleProbe = async () => {
    setProbing(true);
    try {
      await apiPost(`/api/v1/agents/${agent.id}/probe`, {});
      onUpdated();
    } finally {
      setProbing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent ${agent.displayName}?`)) return;
    await apiDelete(`/api/v1/agents/${agent.id}`);
    onDeleted();
  };

  const probeDot = {
    pending: 'bg-[var(--color-base-500)]',
    ok: 'bg-green-500',
    error: 'bg-red-500',
  }[agent.probeStatus];

  const isReady = agent.probeStatus === 'ok';

  return (
    <tr className="border-b border-[var(--color-base-300)]">
      <td className="py-3 px-4 text-sm font-mono style-base-600">{agent.openclawAgentId}</td>
      <td className="py-3 px-4">
        {editing ? (
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="!py-1 !text-xs w-40"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        ) : (
          <span className="text-sm style-base-800">{agent.displayName}</span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={`size-2 rounded-full ${probeDot}`} />
          <span className="text-xs style-base-600">{agent.probeStatus}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={handleSave}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDisplayName(agent.displayName); }}>Cancel</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={!isReady}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={handleProbe} disabled={probing}>
                {probing ? '...' : 'Probe'}
              </Button>
              <Button size="sm" variant="danger" onClick={handleDelete} disabled={!isReady}>Delete</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function AgentsSettings() {
  const { data: agents, reload } = useApi<Agent[]>('/api/v1/agents');
  const [newAgent, setNewAgent] = useState<NewAgentForm>({ openclawAgentId: '', displayName: '' });
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useSse((event) => {
    if (event.type === 'agent.probe') reload();
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgent.openclawAgentId || !newAgent.displayName) return;
    setAdding(true);
    try {
      const result = await apiPost<Agent & { apiKey: string }>('/api/v1/agents', newAgent);
      setNewKey((result as any).apiKey);
      setNewAgent({ openclawAgentId: '', displayName: '' });
      reload();
    } finally {
      setAdding(false);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* API Key modal */}
      {newKey && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 max-w-lg">
          <div className="text-sm font-medium text-amber-400 mb-2">⚠️ Save this API key, shown once!</div>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-[var(--color-base-150)] border border-[var(--color-base-300)] rounded px-3 py-2 text-xs font-mono style-base-800 break-all">
              {newKey}
            </code>
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              {copied ? '✓' : 'Copy'}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-base-300)]">
              <th className="py-2 px-4 text-xs font-medium style-base-600 uppercase tracking-wider">OpenClaw Agent ID</th>
              <th className="py-2 px-4 text-xs font-medium style-base-600 uppercase tracking-wider">Display Name</th>
              <th className="py-2 px-4 text-xs font-medium style-base-600 uppercase tracking-wider">Status</th>
              <th className="py-2 px-4 text-xs font-medium style-base-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(agents || []).map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onUpdated={reload}
                onDeleted={reload}
              />
            ))}
            {(!agents || agents.length === 0) && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm style-base-500">
                  No agents registered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Agent */}
      <div className="border-t border-[var(--color-base-300)] pt-6">
        <h3 className="text-sm font-semibold style-base-800 mb-3">Register New Agent</h3>
        <form onSubmit={handleAdd} className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="agent-openclaw-id" className="block text-xs style-base-600 mb-1">OpenClaw Agent ID</label>
            <Input
              id="agent-openclaw-id"
              value={newAgent.openclawAgentId}
              onChange={(e) => setNewAgent(prev => ({ ...prev, openclawAgentId: e.target.value }))}
              placeholder="main"
              className="w-44"
            />
          </div>
          <div>
            <label htmlFor="agent-display-name" className="block text-xs style-base-600 mb-1">Display Name</label>
            <Input
              id="agent-display-name"
              value={newAgent.displayName}
              onChange={(e) => setNewAgent(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder="Clawdio"
              className="w-44"
            />
          </div>
          <Button type="submit" variant="primary" disabled={adding || !newAgent.openclawAgentId || !newAgent.displayName}>
            {adding ? 'Registering...' : '+ Add Agent'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ----- External Systems Tab -----
function ExternalSystemsSettings() {
  const { data: systems, reload } = useApi<{ id: string; name: string; createdAt: string }[]>('/api/v1/external-systems');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      const result = await apiPost<{ id: string; name: string; apiKey: string }>('/api/v1/external-systems', { name: name.trim() });
      setNewKey((result as any).apiKey);
      setNewName((result as any).name);
      setName('');
      reload();
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/v1/external-systems/${id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <div className="space-y-6">
      {newKey && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 max-w-lg">
          <div className="text-sm font-medium text-amber-400 mb-1">⚠️ Save this API key for <strong>{newName}</strong>, shown once!</div>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 bg-[var(--color-base-150)] border border-[var(--color-base-300)] rounded px-3 py-2 text-xs font-mono break-all">{newKey}</code>
            <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(newKey!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? '✓' : 'Copy'}</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-base-300)]">
              <th className="py-2 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-base-500)' }}>Name</th>
              <th className="py-2 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-base-500)' }}>Created</th>
              <th className="py-2 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-base-500)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(systems || []).map(sys => (
              <tr key={sys.id} className="border-b border-[var(--color-base-200)]">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-base-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>
                    <span style={{ color: 'var(--color-base-800)', fontSize: '0.85rem', fontFamily: "'Instrument Sans', sans-serif" }}>{sys.name}</span>
                  </div>
                </td>
                <td suppressHydrationWarning className="py-3 px-4" style={{ color: 'var(--color-base-500)', fontSize: '0.8rem', fontFamily: "'Roboto Mono', monospace" }}>{new Date(sys.createdAt).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(sys.id)}>Delete</Button>
                </td>
              </tr>
            ))}
            {(!systems || systems.length === 0) && (
              <tr><td colSpan={3} className="py-8 text-center text-sm" style={{ color: 'var(--color-base-500)' }}>No external systems yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--color-base-300)] pt-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-base-800)' }}>Add External System</h3>
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <div>
            <label htmlFor="system-name" className="block text-xs mb-1" style={{ color: 'var(--color-base-600)' }}>System Name</label>
            <Input id="system-name" value={name} onChange={e => setName(e.target.value)} placeholder="Temporal" className="w-48" />
          </div>
          <Button type="submit" variant="primary" disabled={adding || !name.trim()}>{adding ? 'Adding...' : '+ Add System'}</Button>
        </form>
      </div>
    </div>
  );
}

// ----- Projects Tab -----
const PRESET_COLORS = ['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981','#EF4444','#06B6D4','#F97316'];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: value === c ? '2px solid white' : '2px solid transparent', boxShadow: value === c ? `0 0 0 2px ${c}` : 'none', flexShrink: 0 }}
        />
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 18, height: 18, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'none' }}
        title="Custom color"
      />
    </div>
  );
}

function ProjectsSettings() {
  const [projects, setProjects] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const load = () =>
    fetch('/api/v1/projects').then(r => r.json()).then(d => { if (d.ok) setProjects(d.data); });

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) return;
    await apiPost('/api/v1/projects', { name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
    load();
  };

  const save = async (id: string) => {
    await apiPatch(`/api/v1/projects/${id}`, { name: editName.trim(), color: editColor });
    setEditingId(null);
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/v1/projects/${id}`);
    load();
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditColor(p.color);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ color: 'var(--color-base-900)', fontSize: '0.9rem', fontWeight: 600, marginBottom: 20 }}>Projects</h2>

      {/* Existing projects */}
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {projects.length === 0 && (
          <p style={{ color: 'var(--color-base-500)', fontSize: '0.8rem' }}>No projects yet.</p>
        )}
        {projects.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--color-base-100)', border: '1px solid var(--color-base-200)' }}>
            {editingId === p.id ? (
              <>
                <ColorPicker value={editColor} onChange={setEditColor} />
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save(p.id); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                  style={{ flex: 1, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 4, padding: '3px 8px', color: 'var(--color-base-900)', fontSize: '0.82rem' }}
                />
                <button onClick={() => save(p.id)} style={{ fontSize: '0.75rem', color: '#3B82F6', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Save</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: '0.75rem', color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ flex: 1, color: 'var(--color-base-800)', fontSize: '0.82rem' }}>{p.name}</span>
                <button onClick={() => startEdit(p)} style={{ fontSize: '0.72rem', color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Edit</button>
                <button onClick={() => remove(p.id)} style={{ fontSize: '0.72rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* New project */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 6, background: 'var(--color-base-100)', border: '1px solid var(--color-base-200)' }}>
        <p style={{ color: 'var(--color-base-700)', fontSize: '0.78rem', fontWeight: 600, margin: 0 }}>New Project</p>
        <ColorPicker value={newColor} onChange={setNewColor} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); }}
            placeholder="Project name"
            style={{ flex: 1, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)', borderRadius: 4, padding: '5px 10px', color: 'var(--color-base-900)', fontSize: '0.82rem' }}
          />
          <button onClick={create} disabled={!newName.trim()}
            style={{ padding: '5px 14px', borderRadius: 4, background: '#3B82F6', color: 'white', border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5, fontSize: '0.82rem', fontWeight: 600 }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Main Settings Page -----
export function SettingsPageClient() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { data: config } = useApi<Record<string, string>>('/api/v1/config');
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  usePageTitle('Settings');

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'adapter', label: 'OpenClaw Adapter' },
    { key: 'agents', label: 'Agents' },
    { key: 'external', label: 'External Systems' },
    { key: 'projects', label: 'Projects' },
  ];

  if (isMobile) {
    return (
      <div className="flex flex-col overflow-hidden" style={{ background: 'var(--color-base)', height: '100dvh' }}>
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center px-4" style={{ height: 44, background: 'var(--color-base)', borderBottom: '1px solid var(--color-base-300)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-base-500)', textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <span style={{ color: 'var(--color-base-700)', fontSize: '0.9rem', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600, marginLeft: 8, flex: 1 }}>Settings</span>
          <ThemeSegmentedControl />
        </div>

        {/* Horizontal scrollable tab pills */}
        <div
          className="flex-shrink-0"
          style={{
            overflowX: 'auto',
            borderBottom: '1px solid var(--color-base-300)',
            background: 'var(--color-base)',
            padding: '8px 12px',
            display: 'flex',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                background: activeTab === tab.key ? 'rgba(128,128,128,0.15)' : 'transparent',
                color: activeTab === tab.key ? 'var(--color-base-900)' : 'var(--color-base-600)',
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: activeTab === tab.key ? 600 : 500,
                fontSize: '0.8125rem',
                border: activeTab === tab.key ? '1px solid var(--color-base-350)' : '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-5"
          style={{
            background: 'var(--color-base)',
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 24px)',
          }}
        >
          <h1 className="text-base font-semibold mb-5" style={{ color: 'var(--color-base-900)', fontFamily: "'Darker Grotesque', sans-serif" }}>
            {tabs.find((t) => t.key === activeTab)?.label}
          </h1>
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'adapter' && <AdapterSettings />}
          {activeTab === 'agents' && <AgentsSettings />}
          {activeTab === 'external' && <ExternalSystemsSettings />}
          {activeTab === 'projects' && <ProjectsSettings />}
        </div>

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center px-6" style={{ height: 48, background: 'var(--color-base)', borderBottom: '1px solid var(--color-base-300)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-base-500)', fontSize: '0.82rem', textDecoration: 'none', fontFamily: "'Instrument Sans', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-800)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </Link>
          <span style={{ margin: '0 10px', color: 'var(--color-base-300)' }}>/</span>
          <span style={{ color: 'var(--color-base-700)', fontSize: '0.82rem', fontFamily: "'Instrument Sans', sans-serif", fontWeight: 600 }}>Settings</span>
          <div className="ml-auto">
            <ThemeSegmentedControl />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Settings sub-nav */}
          <div className="flex-shrink-0 w-44 overflow-y-auto py-4 px-2" style={{ borderRight: '1px solid var(--color-base-300)', background: 'var(--color-base)' }}>
            <div className="px-2 mb-2">
              <span className="section-label">Settings</span>
            </div>
            <nav className="space-y-px">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors"
                  style={{
                    background: activeTab === tab.key ? 'rgba(128,128,128,0.1)' : 'transparent',
                    color: activeTab === tab.key ? 'var(--color-base-900)' : 'var(--color-base-600)',
                    fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500, fontSize: '0.8125rem',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (activeTab !== tab.key) Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(128,128,128,0.06)', color: 'var(--color-base-800)' }); }}
                  onMouseLeave={e => { if (activeTab !== tab.key) Object.assign((e.currentTarget as HTMLElement).style, { background: 'transparent', color: 'var(--color-base-600)' }); }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-8" style={{ background: 'var(--color-base)' }}>
            <h1 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-base-900)', fontFamily: "'Darker Grotesque', sans-serif" }}>
              {tabs.find((t) => t.key === activeTab)?.label}
            </h1>
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'adapter' && <AdapterSettings />}
            {activeTab === 'agents' && <AgentsSettings />}
          {activeTab === 'external' && <ExternalSystemsSettings />}
            {activeTab === 'projects' && <ProjectsSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
