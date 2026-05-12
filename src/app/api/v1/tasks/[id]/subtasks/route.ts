import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb, nextIssueId } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';

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

  const agent = await authenticateAgent(req);
  const actorId = agent
    ? agent.id
    : (db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined)?.id;
  const actorType: 'agent' | 'human' = agent ? 'agent' : 'human';
  if (!actorId) return err('NO_ACTOR', 'No actor found', 500);

  const body = await req.json();
  if (!body.title) return err('MISSING_TITLE', 'title is required', 400);

  const id = uuidv4();
  const issueId = nextIssueId(db);

  // Inherit from parent unless overridden
  db.prepare(`
    INSERT INTO tasks (id, issueId, title, description, priority, status, parentTaskId, assigneeId, assigneeType, startDate, endDate, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    body.endDate || null
  );

  const subtask = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any);
  logActivity(db, { taskId: id, actorId, actorType, verb: 'created', meta: { parentTaskId: params.id } });
  broadcastSse({ type: 'task.created', data: subtask });

  return ok(subtask, 201);
}
