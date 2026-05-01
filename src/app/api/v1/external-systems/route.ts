import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';
import { hashApiKey } from '@/lib/auth';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, createdAt FROM external_systems ORDER BY createdAt DESC').all();
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  if (!body.name?.trim()) return err('MISSING_FIELD', 'name is required', 400);

  const existing = db.prepare('SELECT id FROM external_systems WHERE name = ?').get(body.name.trim());
  if (existing) return err('DUPLICATE', 'An external system with this name already exists', 409);

  const apiKey = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await hashApiKey(apiKey);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO external_systems (id, name, apiKeyHash, apiKey)
    VALUES (?, ?, ?, ?)
  `).run(id, body.name.trim(), apiKeyHash, apiKey);

  return ok({ id, name: body.name.trim(), apiKey, createdAt: new Date().toISOString() }, 201);
}
