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
  let assigneeChanged = false;
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
      if (field === 'assigneeId' && body[field] !== task.assigneeId) {
        assigneeChanged = true;
        if (body[field]) {
          const assigneeType = body.assigneeType ?? task.assigneeType ?? 'human';
          logActivity(db, { taskId: params.id, actorId, actorType, verb: 'assigned', meta: { assigneeId: body[field], assigneeType } });
        } else {
          logActivity(db, { taskId: params.id, actorId, actorType, verb: 'unassigned', meta: { prevAssigneeId: task.assigneeId, prevAssigneeType: task.assigneeType } });
        }
      }
      if (field === 'projectId' && body[field] !== task.projectId) {
        logActivity(db, { taskId: params.id, actorId, actorType, verb: 'project_changed', meta: { from: task.projectId ?? null, to: body[field] ?? null } });
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
    const prevTags = (db.prepare('SELECT tagId FROM task_tags WHERE taskId = ?').all(params.id) as any[]).map(r => r.tagId);
    const nextTags: string[] = body.tags;
    const added = nextTags.filter(t => !prevTags.includes(t));
    const removed = prevTags.filter(t => !nextTags.includes(t));
    db.prepare('DELETE FROM task_tags WHERE taskId = ?').run(params.id);
    for (const tagId of nextTags) {
      db.prepare('INSERT OR IGNORE INTO task_tags (taskId, tagId) VALUES (?, ?)').run(params.id, tagId);
    }
    for (const tagId of added) {
      logActivity(db, { taskId: params.id, actorId, actorType, verb: 'tagged', meta: { tagId } });
    }
    for (const tagId of removed) {
      logActivity(db, { taskId: params.id, actorId, actorType, verb: 'untagged', meta: { tagId } });
    }
  }

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any);
  broadcastSse({ type: 'task.updated', data: updated });

  // If assignee changed to an agent, trigger dispatch
  if (assigneeChanged && updated.assigneeType === 'agent' && updated.assigneeId) {
    const { getAdapterService } = await import('@/lib/adapter');
    getAdapterService().assignTaskToAgent(updated, updated.assigneeId).catch(() => {});
  }

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
  if (!task) return err('NOT_FOUND', 'Task not found', 404);

  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  return ok({ deleted: true });
}
