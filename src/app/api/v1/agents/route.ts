import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { hashApiKey } from '@/lib/auth';

function sanitizeAgent(agent: any) {
  const { apiKeyHash, ...rest } = agent;
  return { ...rest, apiKey: '••••••' };
}

export async function GET() {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM agents ORDER BY createdAt DESC').all() as any[];
  return ok(agents.map(sanitizeAgent));
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  if (!body.openclawAgentId) return err('MISSING_FIELD', 'openclawAgentId is required', 400);
  if (!body.displayName) return err('MISSING_FIELD', 'displayName is required', 400);

  const existing = db.prepare('SELECT id FROM agents WHERE openclawAgentId = ?').get(body.openclawAgentId);
  if (existing) return err('DUPLICATE', 'An agent with this openclawAgentId already exists', 409);

  const apiKey = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await hashApiKey(apiKey);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO agents (id, openclawAgentId, displayName, apiKeyHash, apiKey, probeStatus)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(id, body.openclawAgentId, body.displayName, apiKeyHash, apiKey);

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
  const { apiKeyHash: _, ...rest } = agent;

  // Return apiKey plaintext once
  return ok({ ...rest, apiKey }, 201);
}
