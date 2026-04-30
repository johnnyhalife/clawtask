import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DB_DIR = path.join(os.homedir(), '.clawtask');
const DB_PATH = path.join(DB_DIR, 'clawtask.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Run schema on first connection (idempotent)
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    _db.exec(schema);
  }

  // Seed defaults
  seedDefaults(_db);

  return _db;
}

function seedDefaults(db: Database.Database) {
  const configInsert = db.prepare(`
    INSERT OR IGNORE INTO config (key, value, updatedAt)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `);

  const defaults: Record<string, string> = {
    issuePrefix: 'CWT',
    issueCounter: '0',
    appName: 'Clawtask',
    humanName: 'human',
    humanDisplayName: 'You',
    gatewayUrl: 'ws://localhost:2222',
  };

  for (const [key, value] of Object.entries(defaults)) {
    configInsert.run(key, value);
  }

  // Seed default human
  const humanCount = (db.prepare('SELECT COUNT(*) as c FROM humans').get() as { c: number }).c;
  if (humanCount === 0) {
    const { v4: uuidv4 } = require('uuid');
    const humanDisplayName = (
      db
        .prepare("SELECT value FROM config WHERE key = 'humanDisplayName'")
        .get() as { value: string } | undefined
    )?.value || 'You';
    db.prepare('INSERT INTO humans (id, name, displayName) VALUES (?, ?, ?)').run(
      uuidv4(),
      'human',
      humanDisplayName
    );
  }
}

export function nextIssueId(db: Database.Database): string {
  const prefix = (
    db.prepare("SELECT value FROM config WHERE key = 'issuePrefix'").get() as
      | { value: string }
      | undefined
  )?.value || 'CWT';

  const counter = (
    db.prepare("SELECT value FROM config WHERE key = 'issueCounter'").get() as
      | { value: string }
      | undefined
  )?.value || '0';

  const next = parseInt(counter, 10) + 1;
  db.prepare(
    "UPDATE config SET value = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = 'issueCounter'"
  ).run(String(next));

  return `${prefix}-${String(next).padStart(3, '0')}`;
}
