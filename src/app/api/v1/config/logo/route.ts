import { NextRequest } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { getDb } from '@/db/db';
import { ok, err } from '@/lib/response';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return err('MISSING_FILE', 'No file provided', 400);
  if (!ALLOWED_TYPES.includes(file.type)) return err('INVALID_TYPE', 'Only JPEG, PNG, WebP, GIF, SVG allowed', 400);
  if (file.size > MAX_SIZE) return err('TOO_LARGE', 'File must be under 2MB', 400);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filename = `workspace-logo.${ext}`;

  mkdirSync(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const logoUrl = `/uploads/${filename}`;
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO config (key, value, updatedAt) VALUES ('workspaceLogo', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
    .run(logoUrl);

  return ok({ logoUrl });
}

export async function DELETE() {
  const db = getDb();
  db.prepare("DELETE FROM config WHERE key = 'workspaceLogo'").run();
  return ok({ removed: true });
}
