import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

function sanitizeAgent(agent: any) {
  const { apiKeyHash, ...rest } = agent;
  return { ...rest, apiKey: '••••••' };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as any;
  if (!agent) return err('NOT_FOUND', 'Agent not found', 404);
  return ok(sanitizeAgent(agent));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as any;
  if (!agent) return err('NOT_FOUND', 'Agent not found', 404);

  const body = await req.json();
  // Only displayName can be updated
  if (body.displayName !== undefined) {
    db.prepare('UPDATE agents SET displayName = ? WHERE id = ?').run(body.displayName, params.id);
  }

  return ok(sanitizeAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id)));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id);
  if (!agent) return err('NOT_FOUND', 'Agent not found', 404);
  db.prepare('DELETE FROM agents WHERE id = ?').run(params.id);
  return ok({ deleted: true });
}
