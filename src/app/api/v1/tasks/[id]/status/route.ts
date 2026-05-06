import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';
import { getAdapterService } from '@/lib/adapter';
import { resolveTaskId } from '@/lib/tasks';

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'archived'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return err('NOT_FOUND', 'Task not found', 404);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;

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
    .run(body.status, taskId);

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any);
  if (body.status === 'archived') {
    logActivity(db, { taskId, actorId, actorType, verb: 'archived', meta: { from: task.status } });
  } else {
    logActivity(db, { taskId, actorId, actorType, verb: 'status_changed', meta: { from: task.status, to: body.status } });
  }
  broadcastSse({ type: 'task.updated', data: updated });

  // If transitioning to an actionable status with an agent assignee, wake the adapter
  // (includes todo — tasks moved out of backlog should trigger dispatch immediately)
  const AGENT_TRIGGER_STATUSES = ['todo', 'in_progress', 'blocked'];
  if (AGENT_TRIGGER_STATUSES.includes(body.status) && updated.assigneeId && updated.assigneeType === 'agent') {
    const adapter = getAdapterService();
    adapter.assignTaskToAgent(updated, updated.assigneeId).catch(() => {});
  }

  return ok(updated);
}
