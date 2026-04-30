import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

const TAG_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export async function GET() {
  const db = getDb();
  return ok(db.prepare('SELECT * FROM tags ORDER BY name ASC').all());
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  if (!body.name) return err('MISSING_NAME', 'name is required', 400);

  const id = uuidv4();
  const color = body.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  db.prepare('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)').run(id, body.name, color);

  const tag = db.prepare('SELECT * FROM tags WHERE name = ?').get(body.name);
  return ok(tag, 201);
}
