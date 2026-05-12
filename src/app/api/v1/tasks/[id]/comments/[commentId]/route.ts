import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { broadcastSse } from '@/lib/sse';
import { authenticateAgent } from '@/lib/auth';

function enrichComment(db: ReturnType<typeof getDb>, row: any) {
  const author =
    row.authorType === 'agent'
      ? db.prepare('SELECT id, openclawAgentId, displayName FROM agents WHERE id = ?').get(row.authorId)
      : db.prepare('SELECT id, name, displayName FROM humans WHERE id = ?').get(row.authorId);
  return { ...row, humanRequested: row.humanRequested === 1, author };
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; commentId: string }> }
) {
  const params = await props.params;
  const db = getDb();
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND taskId = ?').get(params.commentId, params.id) as any;
  if (!comment) return err('NOT_FOUND', 'Comment not found', 404);

  const [agent, body] = await Promise.all([authenticateAgent(req), req.json()]);

  // Only allow content update
  if (body.content !== undefined) {
    db.prepare("UPDATE comments SET content = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(body.content, params.commentId);
  }

  const updated = enrichComment(db, db.prepare('SELECT * FROM comments WHERE id = ?').get(params.commentId));
  broadcastSse({ type: 'comment.updated', data: updated });

  return ok(updated);
}
