import { NextRequest } from 'next/server';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(params.id);
  if (!tag) return err('NOT_FOUND', 'Tag not found', 404);
  return ok(tag);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(params.id);
  if (!tag) return err('NOT_FOUND', 'Tag not found', 404);

  const body = await req.json();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color); }

  if (updates.length > 0) {
    values.push(params.id);
    db.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return ok(db.prepare('SELECT * FROM tags WHERE id = ?').get(params.id));
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(params.id);
  if (!tag) return err('NOT_FOUND', 'Tag not found', 404);
  db.prepare('DELETE FROM tags WHERE id = ?').run(params.id);
  return ok({ deleted: true });
}
