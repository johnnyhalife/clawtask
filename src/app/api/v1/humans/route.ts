import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok } from '@/lib/response';

export async function GET(_req: NextRequest) {
  const db = getDb();
  const humans = db.prepare('SELECT id, name, displayName FROM humans ORDER BY displayName').all();
  return ok(humans);
}
