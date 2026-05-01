import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';

const MASKED_KEYS = new Set(['gatewayAuthToken']);

function getConfig(db: ReturnType<typeof getDb>) {
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [
    r.key,
    MASKED_KEYS.has(r.key) && r.value ? '••••••••••••••••' : r.value,
  ]));
}

export async function GET() {
  const db = getDb();
  return ok(getConfig(db));
}

export async function PATCH(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const allowed = ['issuePrefix', 'appName', 'humanName', 'humanDisplayName', 'gatewayUrl', 'gatewayAuthToken'];

  for (const key of allowed) {
    if (key in body && body[key] !== undefined) {
      db.prepare("INSERT OR REPLACE INTO config (key, value, updatedAt) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .run(key, String(body[key]));
    }
  }

  // Sync humanDisplayName to humans table
  if (body.humanDisplayName) {
    db.prepare("UPDATE humans SET displayName = ? WHERE id = (SELECT id FROM humans LIMIT 1)").run(body.humanDisplayName);
  }
  if (body.humanName) {
    db.prepare("UPDATE humans SET name = ? WHERE id = (SELECT id FROM humans LIMIT 1)").run(body.humanName);
  }

  // Sync gatewayUrl to adapter
  if (body.gatewayUrl) {
    const { getAdapterService } = await import('@/lib/adapter');
    getAdapterService().updateGatewayUrl(body.gatewayUrl);
  }

  return ok(getConfig(db));
}
