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
    ? db.prepare('SELECT id, issueId, title, status, priority FROM tasks WHERE id = ?').get(row.taskId)
    : null;

  const parsedMeta = JSON.parse(row.meta || '{}');

  // For commented verb, attach a snippet of the comment content
  if (row.verb === 'commented' && row.taskId) {
    const latestComment = db
      .prepare("SELECT content FROM comments WHERE taskId = ? AND type = 'message' ORDER BY createdAt DESC LIMIT 1")
      .get(row.taskId) as { content: string } | undefined;
    if (latestComment) parsedMeta.snippet = latestComment.content.slice(0, 120);
  }

  // For assigned verb, resolve the assignee display name
  if (row.verb === 'assigned' && parsedMeta.assigneeId) {
    const assignee =
      parsedMeta.assigneeType === 'agent'
        ? db.prepare('SELECT displayName FROM agents WHERE id = ?').get(parsedMeta.assigneeId) as { displayName: string } | undefined
        : db.prepare('SELECT displayName FROM humans WHERE id = ?').get(parsedMeta.assigneeId) as { displayName: string } | undefined;
    if (assignee) parsedMeta.assigneeName = assignee.displayName;
  }

  // For tagged/untagged, resolve tag name
  if ((row.verb === 'tagged' || row.verb === 'untagged') && parsedMeta.tagId) {
    const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(parsedMeta.tagId) as { name: string } | undefined;
    if (tag) parsedMeta.tagName = tag.name;
  }

  // For project_changed, resolve project name
  if (row.verb === 'project_changed' && parsedMeta.to) {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(parsedMeta.to) as { name: string } | undefined;
    if (project) parsedMeta.projectName = project.name;
  }

  return {
    ...row,
    humanRequested: row.humanRequested === 1,
    meta: parsedMeta,
    actor,
    task,
  };
}
