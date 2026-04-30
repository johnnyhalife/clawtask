import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';

/**
 * Returns all task IDs the human has any activity on (created, commented, etc.)
 * Used by My Issues > Created and Activity sub-tabs for client-side filtering.
 */
export async function GET(_req: NextRequest) {
  const db = getDb();
  const human = db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined;
  if (!human) return ok([]);

  const created = (db.prepare(`
    SELECT DISTINCT taskId FROM activity
    WHERE actorId = ? AND actorType = 'human' AND verb = 'created' AND taskId IS NOT NULL
  `).all(human.id) as { taskId: string }[]).map(r => r.taskId);

  const activity = (db.prepare(`
    SELECT DISTINCT taskId FROM activity
    WHERE actorId = ? AND actorType = 'human' AND taskId IS NOT NULL
  `).all(human.id) as { taskId: string }[]).map(r => r.taskId);

  return ok({ created, activity });
}
