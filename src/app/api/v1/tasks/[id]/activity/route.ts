import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';
import { enrichActivity } from '@/lib/activity';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM activity WHERE taskId = ? ORDER BY createdAt ASC')
    .all(params.id) as any[];
  return ok(rows.map((r) => enrichActivity(db, r)));
}
