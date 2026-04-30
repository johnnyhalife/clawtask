'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApi, apiPatch, apiPost, apiDelete } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';
import { Agent } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type SettingsTab = 'general' | 'adapter' | 'agents';

// ----- General Tab -----
function GeneralSettings() {
  const { data: config, reload } = useApi<Record<string, string>>('/api/v1/config');
  const [form, setForm] = useState({ appName: '', issuePrefix: '', humanName: '', humanDisplayName: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        appName: config.appName || 'Clawtask',
        issuePrefix: config.issuePrefix || 'CWT',
        humanName: config.humanName || 'human',
        humanDisplayName: config.humanDisplayName || 'You',
      });
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

  return (
    <form onSubmit={handleSave} className="max-w-md space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">App Name</label>
        <Input
          value={form.appName}
          onChange={(e) => setForm({ ...form, appName: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Issue Prefix</label>
        <Input
          value={form.issuePrefix}
          onChange={(e) => setForm({ ...form, issuePrefix: e.target.value.toUpperCase() })}
          maxLength={10}
        />
        <p className="text-xs text-zinc-600 mt-1">Issues will be numbered like {form.issuePrefix || 'CWT'}-001</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Human Name</label>
        <Input
          value={form.humanName}
          onChange={(e) => setForm({ ...form, humanName: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Human Display Name</label>
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
        <label className="block text-sm font-medium text-zinc-300 mb-1">Gateway URL</label>
        <Input
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="ws://localhost:2222"
        />
        <p className="text-xs text-zinc-600 mt-1">OpenClaw gateway WebSocket URL used for all agent connections</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-zinc-600" />
        <span className="text-xs text-zinc-500">Connection status shown per agent in the Agents tab</span>
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
    pending: 'bg-zinc-500',
    ok: 'bg-green-500',
    error: 'bg-red-500',
  }[agent.probeStatus];

  const isReady = agent.probeStatus === 'ok';

  return (
    <tr className="border-b border-zinc-800">
      <td className="py-3 px-4 text-sm font-mono text-zinc-400">{agent.openclawAgentId}</td>
      <td className="py-3 px-4">
        {editing ? (
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="!py-1 !text-xs w-40"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        ) : (
          <span className="text-sm text-zinc-200">{agent.displayName}</span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${probeDot}`} />
          <span className="text-xs text-zinc-500">{agent.probeStatus}</span>
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
            <code className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 break-all">
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
            <tr className="border-b border-zinc-800">
              <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">OpenClaw Agent ID</th>
              <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Display Name</th>
              <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
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
                <td colSpan={4} className="py-8 text-center text-sm text-zinc-600">
                  No agents registered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Agent */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Register New Agent</h3>
        <form onSubmit={handleAdd} className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">OpenClaw Agent ID</label>
            <Input
              value={newAgent.openclawAgentId}
              onChange={(e) => setNewAgent({ ...newAgent, openclawAgentId: e.target.value })}
              placeholder="main"
              className="w-44"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Display Name</label>
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

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'adapter', label: 'OpenClaw Adapter' },
    { key: 'agents', label: 'Agents' },
  ];

  return (
    <div className="flex h-screen bg-[#0A0A0B] overflow-hidden">
      {/* Simple sidebar for settings */}
      <aside className="w-60 flex-shrink-0 bg-[#131316] border-r border-zinc-800 flex flex-col h-full">
        <div className="px-4 py-4 border-b border-zinc-800">
          <Link href="/" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
            ← Back
          </Link>
        </div>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Settings</h2>
          <nav className="space-y-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto p-8">
        <h1 className="text-lg font-semibold text-zinc-100 mb-6">
          {tabs.find((t) => t.key === activeTab)?.label}
        </h1>
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'adapter' && <AdapterSettings />}
        {activeTab === 'agents' && <AgentsSettings />}
      </div>
    </div>
  );
}
