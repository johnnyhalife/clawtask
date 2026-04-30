import { NextRequest } from 'next/server';
import { resolveTaskId } from '@/lib/tasks';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';
import { enrichActivity } from '@/lib/activity';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const taskId = resolveTaskId(db, params.id);
  if (!taskId) return ok([]);
  const rows = db
    .prepare('SELECT * FROM activity WHERE taskId = ? ORDER BY createdAt ASC')
    .all(taskId) as any[];
  return ok(rows.map((r) => enrichActivity(db, r)));
}
