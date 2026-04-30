import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { getTaskWithDetails, enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const task = getTaskWithDetails(db, params.id);
  if (!task) return err('NOT_FOUND', 'Task not found', 404);
  return ok(task);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  const allowed = ['title', 'description', 'priority', 'status', 'projectId', 'assigneeId', 'assigneeType', 'startDate', 'endDate', 'parentTaskId'];

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] ?? null);

      if (field === 'status' && body[field] !== task.status) {
        logActivity(db, { taskId: params.id, actorId, actorType, verb: 'status_changed', meta: { from: task.status, to: body[field] } });
      }
      if (field === 'priority' && body[field] !== task.priority) {
        logActivity(db, { taskId: params.id, actorId, actorType, verb: 'priority_changed', meta: { from: task.priority, to: body[field] } });
      }
    }
  }

  if (updates.length > 0) {
    updates.push("updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    values.push(params.id);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  // Tags
  if (body.tags && Array.isArray(body.tags)) {
    db.prepare('DELETE FROM task_tags WHERE taskId = ?').run(params.id);
    for (const tagId of body.tags) {
      db.prepare('INSERT OR IGNORE INTO task_tags (taskId, tagId) VALUES (?, ?)').run(params.id, tagId);
    }
  }

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any);
  logActivity(db, { taskId: params.id, actorId, actorType, verb: 'updated' });
  broadcastSse({ type: 'task.updated', data: updated });

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
  if (!task) return err('NOT_FOUND', 'Task not found', 404);

  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  return ok({ deleted: true });
}
