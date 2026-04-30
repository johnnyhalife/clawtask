import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { broadcastSse } from './sse';

export function logActivity(
  db: Database.Database,
  opts: {
    taskId?: string;
    actorId: string;
    actorType: 'agent' | 'human';
    verb: string;
    humanRequested?: boolean;
    meta?: Record<string, unknown>;
  }
) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO activity (id, taskId, actorId, actorType, verb, humanRequested, meta, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).run(
    id,
    opts.taskId || null,
    opts.actorId,
    opts.actorType,
    opts.verb,
    opts.humanRequested ? 1 : 0,
    JSON.stringify(opts.meta || {})
  );

  const activity = db.prepare('SELECT * FROM activity WHERE id = ?').get(id);
  broadcastSse({ type: 'activity.added', data: enrichActivity(db, activity as ActivityRow) });

  return id;
}

interface ActivityRow {
  id: string;
  taskId: string | null;
  actorId: string;
  actorType: string;
  verb: string;
  humanRequested: number;
  meta: string;
  createdAt: string;
}

export function enrichActivity(db: Database.Database, row: ActivityRow) {
  const actor =
    row.actorType === 'agent'
      ? db.prepare('SELECT id, openclawAgentId, displayName, probeStatus FROM agents WHERE id = ?').get(row.actorId)
      : db.prepare('SELECT id, name, displayName FROM humans WHERE id = ?').get(row.actorId);

  const task = row.taskId
    ? db.prepare('SELECT id, issueId, title FROM tasks WHERE id = ?').get(row.taskId)
    : null;

  return {
    ...row,
    humanRequested: row.humanRequested === 1,
    meta: JSON.parse(row.meta || '{}'),
    actor,
    task,
  };
}
