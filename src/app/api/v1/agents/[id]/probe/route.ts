import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { broadcastSse } from '@/lib/sse';
import { getAdapterService } from '@/lib/adapter';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as any;
  if (!agent) return err('NOT_FOUND', 'Agent not found', 404);

  try {
    const adapter = getAdapterService();
    const result = await adapter.probeAgent(agent);

    const status = result.ok ? 'ok' : 'error';
    db.prepare("UPDATE agents SET probeStatus = ?, probeLastAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(status, params.id);

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as any;
    const { apiKeyHash, ...rest } = updated;
    broadcastSse({ type: 'agent.probe', data: { ...rest, apiKey: '••••••' } });

    return ok({ ...rest, apiKey: '••••••', ...(result.error ? { probeError: result.error } : {}) });
  } catch (e: any) {
    db.prepare("UPDATE agents SET probeStatus = 'error', probeLastAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(params.id);

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as any;
    const { apiKeyHash, ...rest } = updated;
    broadcastSse({ type: 'agent.probe', data: { ...rest, apiKey: '••••••' } });

    return ok({ ...rest, apiKey: '••••••', probeError: e.message });
  }
}
