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
        endDate TEXT,
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
  // M003: create external_systems table if missing
  const extTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_systems'").get();
  if (!extTables) {
    db.exec(`CREATE TABLE IF NOT EXISTS external_systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      apiKeyHash TEXT NOT NULL,
      apiKey TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
  }

  // M004: loosen authorType CHECK to include 'external'
  const commentSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='comments'").get() as any)?.sql ?? '';
  if (commentSchema && !commentSchema.includes("'external'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE comments_new (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        authorId TEXT NOT NULL,
        authorType TEXT NOT NULL CHECK (authorType IN ('agent', 'human', 'external')),
        type TEXT NOT NULL DEFAULT 'message' CHECK (type IN ('message', 'thinking', 'tool')),
        content TEXT NOT NULL DEFAULT '',
        humanRequested INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`);
      db.exec('INSERT INTO comments_new SELECT * FROM comments');
      db.exec('DROP TABLE comments');
      db.exec('ALTER TABLE comments_new RENAME TO comments');
      db.exec('CREATE INDEX IF NOT EXISTS idx_comments_taskId ON comments(taskId)');
    })();
    db.pragma('foreign_keys = ON');
  }
  const activitySchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='activity'").get() as any)?.sql ?? '';
  if (activitySchema && !activitySchema.includes("'external'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE activity_new (
        id TEXT PRIMARY KEY,
        taskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        actorId TEXT NOT NULL,
        actorType TEXT NOT NULL CHECK (actorType IN ('agent', 'human', 'external')),
        verb TEXT NOT NULL,
        humanRequested INTEGER NOT NULL DEFAULT 0,
        meta TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`);
      db.exec('INSERT INTO activity_new SELECT * FROM activity');
      db.exec('DROP TABLE activity');
      db.exec('ALTER TABLE activity_new RENAME TO activity');
      db.exec('CREATE INDEX IF NOT EXISTS idx_activity_taskId ON activity(taskId)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON activity(createdAt)');
    })();
    db.pragma('foreign_keys = ON');
  }

  // M006: rename dueDate → endDate if still present
  const taskCols = (db.pragma('table_info(tasks)') as Array<{ name: string }>).map((c) => c.name);
  if (taskCols.includes('dueDate') && !taskCols.includes('endDate')) {
    db.exec('ALTER TABLE tasks RENAME COLUMN dueDate TO endDate');
  }

  // M007: add 'backlog' to tasks.status CHECK constraint and set it as default
  const taskSchemaCurrent = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as any)?.sql ?? '';
  if (taskSchemaCurrent && !taskSchemaCurrent.includes("'backlog'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE tasks_m007 (
        id TEXT PRIMARY KEY,
        issueId TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','todo','in_progress','blocked','done','archived')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        assigneeId TEXT,
        assigneeType TEXT CHECK (assigneeType IN ('agent','human',NULL)),
        projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
        parentTaskId TEXT,
        endDate TEXT,
        startDate TEXT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`);
      db.exec(`INSERT INTO tasks_m007 (id, issueId, title, description, status, priority, assigneeId, assigneeType, projectId, parentTaskId, endDate, startDate, createdAt, updatedAt)
        SELECT id, issueId, title, description, status, priority, assigneeId, assigneeType, projectId, parentTaskId, endDate, startDate, createdAt, updatedAt FROM tasks`);

      db.exec('DROP TABLE tasks');
      db.exec('ALTER TABLE tasks_m007 RENAME TO tasks');
    })();
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assigneeId ON tasks(assigneeId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parentTaskId ON tasks(parentTaskId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_updatedAt ON tasks(updatedAt)');
    db.pragma('foreign_keys = ON');
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
