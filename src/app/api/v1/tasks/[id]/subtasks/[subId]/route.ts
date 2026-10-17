import { validateTaskRuntime } from '@/lib/task-runtime';
import { assignmentTransaction, AssignmentConflict } from '@/lib/run-store';
import { NextRequest } from 'next/server';
import { applyStatusRules, notifyTaskState } from '@/lib/task-status';
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
  const runtimeError = validateTaskRuntime(body);
  if (runtimeError) return err('INVALID_RUNTIME', runtimeError, 400);
  if (!applyStatusRules(body,sub.status)) return err('INVALID_STATUS','Invalid task status',400);
  const allowed = ['modelOverride', 'thinkingOverride', 'title', 'description', 'priority', 'status', 'assigneeId', 'assigneeType', 'startDate', 'endDate'];

  const updates: string[] = [];
  const values: unknown[] = [];

  try {
    assignmentTransaction(db,params.subId,'assigneeId' in body || 'assigneeType' in body,()=>{
      for (const field of allowed) {
        if (field in body) {
          updates.push(`${field} = ?`);
          values.push(body[field] ?? null);
        }
      }

      if ('modelOverride' in body || 'thinkingOverride' in body) updates.push('runtimeRevision = runtimeRevision + 1');
      if (updates.length > 0) {
        updates.push("updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
        values.push(params.subId);
        db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
    });
  } catch (error) {
    if (error instanceof AssignmentConflict) return err('ASSIGNMENT_CONFLICT',error.message,409);
    throw error;
  }

  const updated = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.subId) as any);
  logActivity(db, { taskId: params.subId, actorId, actorType, verb: 'updated' });
  broadcastSse({ type: 'task.updated', data: updated });

  await notifyTaskState(updated);
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
