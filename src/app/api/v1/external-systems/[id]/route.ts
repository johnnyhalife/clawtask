import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const row = db.prepare('SELECT id FROM external_systems WHERE id = ?').get(params.id);
  if (!row) return err('NOT_FOUND', 'External system not found', 404);
  db.prepare('DELETE FROM external_systems WHERE id = ?').run(params.id);
  return ok({ deleted: true });
}
