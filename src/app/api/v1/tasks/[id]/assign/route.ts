import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { requireActor } from '@/lib/auth';
import { getAdapterService } from '@/lib/adapter';
import { resolveTaskId } from '@/lib/tasks';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return err('NOT_FOUND', 'Task not found', 404);

  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { actorId, actorType } = actor;

  const body = await req.json();
  if (!body.assigneeId || !body.assigneeType) return err('MISSING_FIELDS', 'assigneeId and assigneeType required', 400);

  db.prepare("UPDATE tasks SET assigneeId = ?, assigneeType = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .run(body.assigneeId, body.assigneeType, taskId);

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any);
  logActivity(db, { taskId, actorId, actorType, verb: 'assigned', meta: { assigneeId: body.assigneeId, assigneeType: body.assigneeType } });
  broadcastSse({ type: 'task.updated', data: updated });

  // Notify adapter if assigned to agent
  if (body.assigneeType === 'agent') {
    const adapter = getAdapterService();
    adapter.assignTaskToAgent(updated, body.assigneeId).catch(() => {});
  }

  return ok(updated);
}
