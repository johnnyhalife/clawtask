import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';

const VALID_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any;
  if (!task) return err('NOT_FOUND', 'Task not found', 404);

  const agent = await authenticateAgent(req);
  const actorId = agent
    ? agent.id
    : (db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined)?.id;
  const actorType: 'agent' | 'human' = agent ? 'agent' : 'human';
  if (!actorId) return err('NO_ACTOR', 'No actor found', 500);

  const body = await req.json();
  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return err('INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  db.prepare("UPDATE tasks SET status = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .run(body.status, params.id);

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any);
  logActivity(db, { taskId: params.id, actorId, actorType, verb: 'status_changed', meta: { from: task.status, to: body.status } });
  broadcastSse({ type: 'task.updated', data: updated });

  return ok(updated);
}
