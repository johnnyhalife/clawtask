'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApi, apiPatch, apiPost, apiDelete } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Agent } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/components/ui/ThemeProvider';

type SettingsTab = 'general' | 'adapter' | 'agents';

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
        <label className="block text-sm font-medium style-base-800 mb-2">Workspace Logo</label>
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)' }}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="logo" className="w-full h-full object-cover rounded-lg" />
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
        <label className="block text-sm font-medium style-base-800 mb-1">Workspace Name</label>
        <Input
          value={form.appName}
          onChange={(e) => setForm({ ...form, appName: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium style-base-800 mb-1">Issue Prefix</label>
        <Input
          value={form.issuePrefix}
          onChange={(e) => setForm({ ...form, issuePrefix: e.target.value.toUpperCase() })}
          maxLength={10}
        />
        <p className="text-xs style-base-500 mt-1">Issues will be numbered like {form.issuePrefix || 'CWT'}-001</p>
      </div>
      <div>
        <label className="block text-sm font-medium style-base-800 mb-1">Human Name</label>
        <Input
          value={form.humanName}
          onChange={(e) => setForm({ ...form, humanName: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium style-base-800 mb-1">Human Display Name</label>
        <Input
          value={form.humanDisplayName}
          onChange={(e) => setForm({ ...form, humanDisplayName: e.target.value })}
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setGatewayUrl(config.gatewayUrl || 'ws://localhost:2222');
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch('/api/v1/config', { gatewayUrl });
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
        <label className="block text-sm font-medium style-base-800 mb-1">Gateway URL</label>
        <Input
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="ws://localhost:2222"
        />
        <p className="text-xs style-base-500 mt-1">OpenClaw gateway WebSocket URL used for all agent connections</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[var(--color-base-500)]" />
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
          <div className={`w-2 h-2 rounded-full ${probeDot}`} />
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
          <div className="text-sm font-medium text-amber-400 mb-2">⚠️ Save this API key — shown once!</div>
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
            <label className="block text-xs style-base-600 mb-1">OpenClaw Agent ID</label>
            <Input
              value={newAgent.openclawAgentId}
              onChange={(e) => setNewAgent({ ...newAgent, openclawAgentId: e.target.value })}
              placeholder="main"
              className="w-44"
            />
          </div>
          <div>
            <label className="block text-xs style-base-600 mb-1">Display Name</label>
            <Input
              value={newAgent.displayName}
              onChange={(e) => setNewAgent({ ...newAgent, displayName: e.target.value })}
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

// ----- Main Settings Page -----
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { data: config } = useApi<Record<string, string>>('/api/v1/config');
  const { theme, toggle: toggleTheme } = useTheme();

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'adapter', label: 'OpenClaw Adapter' },
    { key: 'agents', label: 'Agents' },
  ];

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
            <button
              type="button"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
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
                  onMouseEnter={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.06)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-base-800)'; } }}
                  onMouseLeave={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--color-base-600)'; } }}
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
          </div>
        </div>
      </div>
    </div>
  );
}
