import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

export async function GET() {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY name ASC').all();
  return ok(projects);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  if (!body.name) return err('MISSING_NAME', 'name is required', 400);

  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, name, color) VALUES (?, ?, ?)').run(
    id,
    body.name,
    body.color || '#3B82F6'
  );
  return ok(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), 201);
}
