import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { requireActor } from '@/lib/auth';
import { getAdapterService } from '@/lib/adapter';
import { resolveTaskId } from '@/lib/tasks';

function enrichComment(db: ReturnType<typeof getDb>, row: any) {
  const author =
    row.authorType === 'agent'
      ? db.prepare('SELECT id, openclawAgentId, displayName FROM agents WHERE id = ?').get(row.authorId)
      : db.prepare('SELECT id, name, displayName FROM humans WHERE id = ?').get(row.authorId);
  return { ...row, humanRequested: row.humanRequested === 1, author };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return err('NOT_FOUND', 'Task not found', 404);
  const url = new URL(req.url);
  const order = url.searchParams.get('order') === 'desc' ? 'DESC' : 'ASC';
  const limit = parseInt(url.searchParams.get('limit') ?? '0', 10);
  const authorType = url.searchParams.get('authorType');
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : '';
  const authorClause = authorType ? ` AND authorType = '${authorType === 'agent' ? 'agent' : 'human'}'` : '';
  const rows = db
    .prepare(`SELECT * FROM comments WHERE taskId = ? AND content != ''${authorClause} ORDER BY createdAt ${order}${limitClause}`)
    .all(taskId) as any[];
  return ok(rows.map((r) => enrichComment(db, r)));
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return err('NOT_FOUND', 'Task not found', 404);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;

  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { actorId, actorType } = actor;

  const body = await req.json();
  const rawContent: string = body.content || '';
  const commentType: string = body.type || 'message';

  const segments: string[] = [rawContent];

  let lastComment: any = null;
  for (const segment of segments) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO comments (id, taskId, authorId, authorType, type, content, humanRequested, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `).run(id, taskId, actorId, actorType, commentType, segment, body.humanRequested ? 1 : 0);
    lastComment = enrichComment(db, db.prepare('SELECT * FROM comments WHERE id = ?').get(id));
    broadcastSse({ type: 'comment.added', data: lastComment });
  }

  const comment = lastComment;
  logActivity(db, { taskId, actorId, actorType, verb: 'commented', humanRequested: body.humanRequested });

  // If human posted a comment and task is assigned to an agent, notify adapter
  // Skip empty comments — they are likely unauthenticated agent posts that fell back to human; notifying would create a loop
  if (actorType === 'human' && rawContent.trim() !== '' && task.assigneeId && task.assigneeType === 'agent') {
    const adapter = getAdapterService();
    adapter.notifyHumanComment(task, comment).catch(() => {});
  }

  return ok(comment, 201);
}
