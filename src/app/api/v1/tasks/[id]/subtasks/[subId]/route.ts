import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { requireActor } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; subId: string }> }
) {
  const params = await props.params;
  const db = getDb();
  const sub = db.prepare('SELECT * FROM tasks WHERE id = ? AND parentTaskId = ?').get(params.subId, params.id) as any;
  if (!sub) return err('NOT_FOUND', 'Subtask not found', 404);

  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { actorId, actorType } = actor;

  const body = await req.json();
  const allowed = ['title', 'description', 'priority', 'status', 'assigneeId', 'assigneeType', 'startDate', 'endDate'];

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] ?? null);
    }
  }

  if (updates.length > 0) {
    updates.push("updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(params.subId);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.subId) as any);
  logActivity(db, { taskId: params.subId, actorId, actorType, verb: 'updated' });
  broadcastSse({ type: 'task.updated', data: updated });

  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; subId: string }> }
) {
  const params = await props.params;
  const db = getDb();
  const sub = db.prepare('SELECT * FROM tasks WHERE id = ? AND parentTaskId = ?').get(params.subId, params.id);
  if (!sub) return err('NOT_FOUND', 'Subtask not found', 404);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.subId);
  return ok({ deleted: true });
}
