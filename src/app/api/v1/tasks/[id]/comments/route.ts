import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';
import { getAdapterService } from '@/lib/adapter';

function enrichComment(db: ReturnType<typeof getDb>, row: any) {
  const author =
    row.authorType === 'agent'
      ? db.prepare('SELECT id, openclawAgentId, displayName FROM agents WHERE id = ?').get(row.authorId)
      : db.prepare('SELECT id, name, displayName FROM humans WHERE id = ?').get(row.authorId);
  return { ...row, humanRequested: row.humanRequested === 1, author };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt ASC')
    .all(params.id) as any[];
  return ok(rows.map((r) => enrichComment(db, r)));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any;
  if (!task) return err('NOT_FOUND', 'Task not found', 404);

  const agent = await authenticateAgent(req);
  const human = db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined;
  const actorId = agent ? agent.id : human?.id;
  const actorType: 'agent' | 'human' = agent ? 'agent' : 'human';
  if (!actorId) return err('NO_ACTOR', 'No actor found', 500);

  const body = await req.json();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO comments (id, taskId, authorId, authorType, type, content, humanRequested, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).run(
    id,
    params.id,
    actorId,
    actorType,
    body.type || 'message',
    body.content || '',
    body.humanRequested ? 1 : 0
  );

  const comment = enrichComment(db, db.prepare('SELECT * FROM comments WHERE id = ?').get(id));
  logActivity(db, { taskId: params.id, actorId, actorType, verb: 'commented', humanRequested: body.humanRequested });
  broadcastSse({ type: 'comment.added', data: comment });

  // If human posted a comment and task is assigned to an agent, notify adapter
  if (actorType === 'human' && task.assigneeId && task.assigneeType === 'agent') {
    const adapter = getAdapterService();
    adapter.notifyHumanComment(task, comment).catch(() => {});
  }

  return ok(comment, 201);
}
