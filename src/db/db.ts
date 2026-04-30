import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DB_DIR = path.join(os.homedir(), '.clawtask');
const DB_PATH = path.join(DB_DIR, 'clawtask.db');

declare global {
  // eslint-disable-next-line no-var
  var __clawtask_db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__clawtask_db) return globalThis.__clawtask_db;

  fs.mkdirSync(DB_DIR, { recursive: true });

  const _db = new Database(DB_PATH);
  globalThis.__clawtask_db = _db;
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Run schema on first connection (idempotent)
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    _db.exec(schema);
  }

  // Migrations
  runMigrations(_db);

  // Seed defaults
  seedDefaults(_db);

  return _db;
}

function runMigrations(db: Database.Database) {
  // M002: add 'archived' to tasks.status CHECK constraint
  const taskSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as any)?.sql ?? '';
  if (taskSchema && !taskSchema.includes("'archived'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        issueId TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done','archived')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        assigneeId TEXT,
        assigneeType TEXT CHECK (assigneeType IN ('agent','human',NULL)),
        projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
        parentTaskId TEXT,
        dueDate TEXT,
        startDate TEXT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`);
      db.exec('INSERT INTO tasks_new SELECT * FROM tasks');
      db.exec('DROP TABLE tasks');
      db.exec('ALTER TABLE tasks_new RENAME TO tasks');
    })();
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigneeId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(projectId)');
    db.pragma('foreign_keys = ON');
  }

  // M001: add plaintext apiKey column to agents
  const cols = (db.pragma('table_info(agents)') as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes('apiKey')) {
    db.exec(`ALTER TABLE agents ADD COLUMN apiKey TEXT NOT NULL DEFAULT ''`);
  }
  // Backfill: any agent with empty apiKey gets a fresh key+hash pair (sync both)
  const stale = db
    .prepare(`SELECT id FROM agents WHERE apiKey = '' OR apiKey IS NULL`)
    .all() as Array<{ id: string }>;
  if (stale.length > 0) {
    // bcryptjs is async; use sync variant for migration
    const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
    for (const { id } of stale) {
      const freshKey = crypto.randomBytes(32).toString('hex');
      const freshHash = bcrypt.hashSync(freshKey, 10);
      db.prepare(`UPDATE agents SET apiKey = ?, apiKeyHash = ? WHERE id = ?`).run(freshKey, freshHash, id);
    }
  }
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
