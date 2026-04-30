import bcrypt from 'bcryptjs';
import { getDb } from '@/db/db';
import { NextRequest } from 'next/server';

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 10);
}

export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

export async function authenticateAgent(
  req: NextRequest
): Promise<{ id: string; openclawAgentId: string; displayName: string } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  const db = getDb();

  const agents = db
    .prepare('SELECT id, openclawAgentId, displayName, apiKeyHash FROM agents')
    .all() as Array<{
    id: string;
    openclawAgentId: string;
    displayName: string;
    apiKeyHash: string;
  }>;

  for (const agent of agents) {
    const valid = await verifyApiKey(apiKey, agent.apiKeyHash);
    if (valid) {
      return { id: agent.id, openclawAgentId: agent.openclawAgentId, displayName: agent.displayName };
    }
  }

  return null;
}
