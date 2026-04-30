import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { resolveTaskId } from '@/lib/tasks';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return err('NOT_FOUND', 'Task not found', 404);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) return err('NOT_FOUND', 'Task not found', 404);
  if (task.status !== 'in_progress') return err('NOT_IN_FLIGHT', 'Task is not in progress', 400);

  const humanRow = db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined;
  if (!humanRow) return err('NO_ACTOR', 'No actor found', 500);

  // Post a system comment so agent sees cancellation if it checks back
  const commentId = uuidv4();
  db.prepare(`
    INSERT INTO comments (id, taskId, authorId, authorType, type, content, humanRequested, createdAt, updatedAt)
    VALUES (?, ?, ?, 'human', 'message', ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).run(commentId, taskId, humanRow.id, '⚠️ Task cancelled by user. Stop all work immediately and do not post further updates.');

  // Reset task state
  db.prepare(`
    UPDATE tasks
    SET status = 'todo', assigneeId = NULL, assigneeType = NULL,
        updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(taskId);

  logActivity(db, { taskId, actorId: humanRow.id, actorType: 'human', verb: 'cancelled', meta: { from: 'in_progress' } });

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any);
  broadcastSse({ type: 'task.updated', data: updated });

  return ok(updated);
  } catch (e: any) {
    console.error('[cancel] error:', e?.message, e?.stack);
    return err('INTERNAL', e?.message ?? 'Unknown error', 500);
  }
}
