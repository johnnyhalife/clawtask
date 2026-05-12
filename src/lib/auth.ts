import bcrypt from 'bcryptjs';
import { getDb } from '@/db/db';
import { NextRequest } from 'next/server';

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 10);
}

async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

export type AuthActor =
  | { kind: 'agent'; id: string; openclawAgentId: string; displayName: string }
  | { kind: 'external'; id: string; name: string }
  | null;

export async function authenticateAgent(
  req: NextRequest
): Promise<{ id: string; openclawAgentId: string; displayName: string } | null> {
  const actor = await authenticateRequest(req);
  if (actor?.kind === 'agent') return { id: actor.id, openclawAgentId: actor.openclawAgentId, displayName: actor.displayName };
  return null;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthActor> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  const db = getDb();

  // Check agents
  const agents = db
    .prepare('SELECT id, openclawAgentId, displayName, apiKeyHash FROM agents')
    .all() as Array<{ id: string; openclawAgentId: string; displayName: string; apiKeyHash: string }>;
  for (const agent of agents) {
    if (await verifyApiKey(apiKey, agent.apiKeyHash)) {
      return { kind: 'agent', id: agent.id, openclawAgentId: agent.openclawAgentId, displayName: agent.displayName };
    }
  }

  // Check external systems
  const systems = db
    .prepare('SELECT id, name, apiKeyHash FROM external_systems')
    .all() as Array<{ id: string; name: string; apiKeyHash: string }>;
  for (const sys of systems) {
    if (await verifyApiKey(apiKey, sys.apiKeyHash)) {
      return { kind: 'external', id: sys.id, name: sys.name };
    }
  }

  return null;
}
