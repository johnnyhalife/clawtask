import bcrypt from 'bcryptjs';
import { getDb } from '@/db/db';
import { NextRequest, NextResponse } from 'next/server';

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

export type ResolvedActor = {
  actorId: string;
  actorType: 'agent' | 'human' | 'external';
};

/**
 * Resolve the actor from the request's Authorization header.
 * Returns null if no header present OR if token does not match anything.
 * Three-step check:
 *   1. No header → null (caller decides: 401 for writes, skip for reads)
 *   2. Token matches CLAWTASK_UI_TOKEN env-var → human actor
 *   3. Token matches DB agent/external key → agent/external actor
 *   4. Token present but unrecognised → null (caller should 401)
 */
export async function resolveActor(req: NextRequest): Promise<ResolvedActor | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  const db = getDb();

  // Step 2: UI human token (env-var)
  const uiToken = process.env.CLAWTASK_UI_TOKEN;
  if (uiToken && apiKey === uiToken) {
    const human = db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined;
    if (human) return { actorId: human.id, actorType: 'human' };
  }

  // Step 3a: DB agent keys
  const agents = db
    .prepare('SELECT id, apiKeyHash FROM agents')
    .all() as Array<{ id: string; apiKeyHash: string }>;
  for (const agent of agents) {
    if (await verifyApiKey(apiKey, agent.apiKeyHash)) {
      return { actorId: agent.id, actorType: 'agent' };
    }
  }

  // Step 3b: DB external system keys
  const systems = db
    .prepare('SELECT id, apiKeyHash FROM external_systems')
    .all() as Array<{ id: string; apiKeyHash: string }>;
  for (const sys of systems) {
    if (await verifyApiKey(apiKey, sys.apiKeyHash)) {
      return { actorId: sys.id, actorType: 'external' };
    }
  }

  // Token present but unrecognised
  return null;
}

/**
 * Require a valid actor for a write route.
 * Returns { actorId, actorType } or a 401 NextResponse.
 * Usage:
 *   const actor = await requireActor(req);
 *   if (actor instanceof NextResponse) return actor;
 */
export async function requireActor(req: NextRequest): Promise<ResolvedActor | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authorization header required' } }, { status: 401 });
  }
  const actor = await resolveActor(req);
  if (!actor) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }
  return actor;
}

// ---------------------------------------------------------------------------
// Legacy helpers — kept for backwards compat during transition
// ---------------------------------------------------------------------------

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
