import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const DB_DIR = path.join(os.homedir(), '.clawtask');
const DB_PATH = path.join(DB_DIR, 'clawtask.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function migrate() {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // Seed default config if not present
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

  // Seed default human if not present
  const humanCount = (db.prepare('SELECT COUNT(*) as c FROM humans').get() as { c: number }).c;
  if (humanCount === 0) {
    const humanConfig = db
      .prepare("SELECT value FROM config WHERE key = 'humanDisplayName'")
      .get() as { value: string } | undefined;
    const displayName = humanConfig?.value || 'You';
    db.prepare('INSERT INTO humans (id, name, displayName) VALUES (?, ?, ?)').run(
      uuidv4(),
      'human',
      displayName
    );
  }

  console.log('Migration complete. DB at:', DB_PATH);
  db.close();
}

migrate();
