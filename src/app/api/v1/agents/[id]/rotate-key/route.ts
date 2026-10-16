import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/db/db';
import { hashApiKey, requireActor } from '@/lib/auth';
import { ok, err } from '@/lib/response';

// Ordinary rotation never invalidates credentials in a delivered prompt or
// admitted queue. No ownership/session/outcome records are reset or replayed.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.actorType !== 'human') return err('FORBIDDEN', 'Only an authenticated human can rotate agent keys', 403);

  const { id } = await props.params;
  const db = getDb();
  const previous = db.prepare('SELECT apiKeyHash FROM agents WHERE id = ?').get(id) as { apiKeyHash: string } | undefined;
  if (!previous) return err('NOT_FOUND', 'Agent not found', 404);

  // Never hold a SQLite transaction across asynchronous bcrypt work.
  const apiKey = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await hashApiKey(apiKey);
  const result = db.transaction(() => {
    const current = db.prepare('SELECT apiKeyHash FROM agents WHERE id = ?').get(id) as { apiKeyHash: string } | undefined;
    if (!current) return 'missing';
    if (current.apiKeyHash !== previous.apiKeyHash) return 'conflict';
    // The SQLite write lock is the shared boundary with assignment/follow-up
    // transactions, automatic admission and pending -> submitting transitions.
    // All non-completed rows block, including queued and outcome-required work.
    if (db.prepare("SELECT 1 FROM task_dispatches WHERE agentId = ? AND state != 'completed' LIMIT 1").get(id)) return 'busy';
    const updated = db.prepare('UPDATE agents SET apiKey = ?, apiKeyHash = ? WHERE id = ? AND apiKeyHash = ?')
      .run(apiKey, apiKeyHash, id, previous.apiKeyHash);
    return updated.changes === 1 ? 'rotated' : 'conflict';
  }).immediate();

  if (result === 'missing') return err('NOT_FOUND', 'Agent no longer exists; refresh the agent list', 404);
  if (result === 'busy') return err('AGENT_BUSY', 'Agent has pending, active or unresolved work. Finish or reconcile it before rotating the key.', 409);
  if (result === 'conflict') return err('KEY_CONFLICT', 'The agent key changed during rotation. Refresh and explicitly retry if another rotation is intended.', 409);
  // Plaintext is disclosed only here; never log or broadcast the key or hash.
  return ok({ id, apiKey });
}
