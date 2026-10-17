import { validateTaskRuntime } from '@/lib/task-runtime';
import { assignmentTransaction, AssignmentConflict } from '@/lib/run-store';
import { notifyTaskState } from '@/lib/task-status';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb, nextIssueId } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { requireActor } from '@/lib/auth';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tasks WHERE parentTaskId = ? ORDER BY createdAt ASC').all(params.id) as any[];
  const subtasks = rows.map((r) => enrichTask(db, r));
  return ok(subtasks);
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any;
  if (!parent) return err('NOT_FOUND', 'Parent task not found', 404);

  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { actorId, actorType } = actor;

  const body = await req.json();
  const runtimeError = validateTaskRuntime(body);
  if (runtimeError) return err('INVALID_RUNTIME', runtimeError, 400);
  if (!body.title) return err('MISSING_TITLE', 'title is required', 400);

  if ((body.status ?? parent.status)==='blocked') { body.assigneeId=null; body.assigneeType=null; }

  const id = uuidv4();
  const issueId = nextIssueId(db);

  // Inherit from parent unless overridden
  try {
    assignmentTransaction(db,id,true,()=>{
      db.prepare(`
        INSERT INTO tasks (id, issueId, title, description, priority, status, parentTaskId, assigneeId, assigneeType, startDate, endDate, modelOverride, thinkingOverride, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(
        id,
        issueId,
        body.title,
        body.description || '',
        body.priority ?? parent.priority,
        body.status ?? parent.status,
        params.id,
        body.assigneeId !== undefined ? body.assigneeId : parent.assigneeId,
        body.assigneeType !== undefined ? body.assigneeType : parent.assigneeType,
        body.startDate || null,
        body.endDate || null,
        body.modelOverride ?? null,
        body.thinkingOverride ?? null
      );
    });
  } catch (error) {
    if (error instanceof AssignmentConflict) return err('ASSIGNMENT_CONFLICT',error.message,409);
    throw error;
  }

  const subtask = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any);
  logActivity(db, { taskId: id, actorId, actorType, verb: 'created', meta: { parentTaskId: params.id } });
  broadcastSse({ type: 'task.created', data: subtask });

  await notifyTaskState(subtask);
  return ok(subtask, 201);
}
