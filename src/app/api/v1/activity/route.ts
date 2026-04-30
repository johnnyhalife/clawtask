import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';
import { enrichActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;

  const rows = db
    .prepare('SELECT * FROM activity ORDER BY createdAt DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as any[];

  const total = (db.prepare('SELECT COUNT(*) as c FROM activity').get() as { c: number }).c;

  return ok({ activity: rows.map((r) => enrichActivity(db, r)), total, page, limit });
}
