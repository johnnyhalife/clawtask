import Database from 'better-sqlite3';

interface TaskRow {
  id: string;
  issueId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  projectId: string | null;
  parentTaskId: string | null;
  assigneeId: string | null;
  assigneeType: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export function enrichTask(db: Database.Database, row: TaskRow) {
  // Tags
  const tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN task_tags tt ON tt.tagId = t.id
    WHERE tt.taskId = ?
  `).all(row.id);

  // Project
  const project = row.projectId
    ? db.prepare('SELECT * FROM projects WHERE id = ?').get(row.projectId)
    : null;

  // Assignee
  let assignee = null;
  if (row.assigneeId && row.assigneeType === 'agent') {
    assignee = db
      .prepare('SELECT id, openclawAgentId, displayName, probeStatus FROM agents WHERE id = ?')
      .get(row.assigneeId);
  } else if (row.assigneeId && row.assigneeType === 'human') {
    assignee = db.prepare('SELECT id, name, displayName FROM humans WHERE id = ?').get(row.assigneeId);
  }

  return { ...row, tags, project, assignee };
}

/**
 * Resolve a task by UUID or issueId slug (case-insensitive).
 * e.g. "cwt-012" resolves the same as "CWT-012" or the full UUID.
 */
export function resolveTaskId(db: Database.Database, idOrSlug: string): string | undefined {
  return resolveTask(db, idOrSlug)?.id;
}

export function resolveTask(db: Database.Database, idOrSlug: string): TaskRow | undefined {
  const byId = db.prepare('SELECT * FROM tasks WHERE id = ?').get(idOrSlug) as TaskRow | undefined;
  if (byId) return byId;
  return db.prepare('SELECT * FROM tasks WHERE UPPER(issueId) = UPPER(?)').get(idOrSlug) as TaskRow | undefined;
}

export function getTaskWithDetails(db: Database.Database, taskId: string) {
  const task = resolveTask(db, taskId);
  if (!task) return null;

  const enriched = enrichTask(db, task);

  // Subtasks
  const subtaskRows = db
    .prepare('SELECT * FROM tasks WHERE parentTaskId = ? ORDER BY createdAt ASC')
    .all(taskId) as TaskRow[];
  const subtasks = subtaskRows.map((s) => enrichTask(db, s));

  return { ...enriched, subtasks };
}
