import { assignmentTransaction, AssignmentConflict } from '@/lib/run-store';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb, nextIssueId } from '@/db/db';
import { ok, err } from '@/lib/response';
import { enrichTask } from '@/lib/tasks';
import { logActivity } from '@/lib/activity';
import { broadcastSse } from '@/lib/sse';
import { requireActor } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);

  const status = searchParams.get('status');
  const statuses = searchParams.getAll('statuses');
  const validStatuses = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'archived'];
  if (statuses.some(status => !validStatuses.includes(status))) return err('INVALID_STATUS', 'Invalid task status filter', 400);
  const priority = searchParams.get('priority');
  const projectId = searchParams.get('projectId');
  const assigneeId = searchParams.get('assigneeId');
  const tagId = searchParams.get('tagId');
  const parentTaskId = searchParams.get('parentTaskId');
  // mineFilter: 'assigned' | 'created' | 'activity'
  const mineFilter = searchParams.get('mineFilter');
  const sort = searchParams.get('sort') || 'updatedAt';
  const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const page = Number(searchParams.get('page') || '1');
  const limit = Number(searchParams.get('limit') || '50');
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) return err('INVALID_PAGINATION', 'page must be positive and limit must be 1–500', 400);
  const offset = (page - 1) * limit;

  // Resolve human id for mineFilter queries
  const humanRow = mineFilter
    ? (db.prepare('SELECT id FROM humans LIMIT 1').get() as { id: string } | undefined)
    : undefined;
  const humanId = humanRow?.id;

  const needsTagJoin = !!tagId;
  const needsActivityJoin = mineFilter === 'activity';
  const needsCreatedJoin = mineFilter === 'created';

  let query = `
    SELECT DISTINCT t.* FROM tasks t
    ${needsTagJoin ? 'JOIN task_tags tt ON tt.taskId = t.id' : ''}
    ${needsActivityJoin ? 'JOIN activity a ON a.taskId = t.id' : ''}
    ${needsCreatedJoin ? 'JOIN activity ac ON ac.taskId = t.id' : ''}
    WHERE t.parentTaskId IS NULL
  `;
  const params: (string | number)[] = [];

  if (statuses.length) { query += ' AND t.status IN (' + statuses.map(() => '?').join(',') + ')'; params.push(...statuses); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (projectId) { query += ' AND t.projectId = ?'; params.push(projectId); }
  if (assigneeId) { query += ' AND t.assigneeId = ?'; params.push(assigneeId); }
  if (tagId) { query += ' AND tt.tagId = ?'; params.push(tagId); }
  if (mineFilter === 'assigned' && humanId) {
    query += ' AND t.assigneeId = ? AND t.assigneeType = \'human\'';
    params.push(humanId);
  } else if (mineFilter === 'created' && humanId) {
    query += ' AND ac.actorId = ? AND ac.actorType = \'human\' AND ac.verb = \'created\'';
    params.push(humanId);
  } else if (mineFilter === 'activity' && humanId) {
    query += ' AND a.actorId = ? AND a.actorType = \'human\'';
    params.push(humanId);
  }
  if (parentTaskId === 'none') {
    // already filtered above
  }

  // Count the same filtered relation before pagination, including Mine joins.
  const total = (db.prepare('SELECT COUNT(*) as c FROM (' + query + ')').get(...params) as { c: number }).c;
  const validSorts = ['updatedAt', 'createdAt', 'priority', 'status', 'endDate'];
  const sortCol = validSorts.includes(sort) ? sort : 'updatedAt';
  query += ' ORDER BY t.' + sortCol + ' ' + order + ', t.id ASC LIMIT ? OFFSET ?';
  const rows = db.prepare(query).all(...params, limit, offset) as any[];
  const tasks = rows.map((r) => enrichTask(db, r));

  return ok({ tasks, total, page, limit });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();

  const actor = await requireActor(req);
  if (actor instanceof Response) return actor;
  const { actorId, actorType } = actor;

  if (!actorId) return err('NO_ACTOR', 'No actor found', 500);
  if (!body.title) return err('MISSING_TITLE', 'title is required', 400);

  // --- Name resolution ---
  // projectName → projectId
  if (!body.projectId && body.projectName) {
    const row = db.prepare('SELECT id FROM projects WHERE lower(name) = lower(?)').get(body.projectName) as { id: string } | undefined;
    if (row) body.projectId = row.id;
  }

  // assigneeName → assigneeId + assigneeType (checks agents first, then humans)
  if (!body.assigneeId && body.assigneeName) {
    const agent = db.prepare('SELECT id FROM agents WHERE lower(displayName) = lower(?) OR lower(openclawAgentId) = lower(?)').get(body.assigneeName, body.assigneeName) as { id: string } | undefined;
    if (agent) {
      body.assigneeId = agent.id;
      body.assigneeType = 'agent';
    } else {
      const human = db.prepare('SELECT id FROM humans WHERE lower(name) = lower(?) OR lower(displayName) = lower(?)').get(body.assigneeName, body.assigneeName) as { id: string } | undefined;
      if (human) {
        body.assigneeId = human.id;
        body.assigneeType = 'human';
      }
    }
  }

  // tagNames → tag ids (resolve existing; skip unknown)
  if (!body.tags && body.tagNames && Array.isArray(body.tagNames)) {
    body.tags = (body.tagNames as string[])
      .map((name: string) => (db.prepare('SELECT id FROM tags WHERE lower(name) = lower(?)').get(name) as { id: string } | undefined)?.id)
      .filter(Boolean);
  }
  // --- end name resolution ---

  if (body.status==='blocked') { body.assigneeId=null; body.assigneeType=null; }

  const id = uuidv4();
  const issueId = nextIssueId(db);

  try {
    assignmentTransaction(db,id,true,()=>{
      db.prepare(`
        INSERT INTO tasks (id, issueId, title, description, priority, status, projectId, parentTaskId, assigneeId, assigneeType, startDate, endDate, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(
        id,
        issueId,
        body.title,
        body.description || '',
        body.priority || 'medium',
        body.status || 'backlog',
        body.projectId || null,
        body.parentTaskId || null,
        body.assigneeId || null,
        body.assigneeType || null,
        body.startDate || null,
        body.endDate || null
      );

      // Tags
      if (body.tags && Array.isArray(body.tags)) {
        for (const tagId of body.tags) {
          db.prepare('INSERT OR IGNORE INTO task_tags (taskId, tagId) VALUES (?, ?)').run(id, tagId);
        }
      }
    });
  } catch (error) {
    if (error instanceof AssignmentConflict) return err('ASSIGNMENT_CONFLICT',error.message,409);
    throw error;
  }

  const task = enrichTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any);

  logActivity(db, { taskId: id, actorId: actorId!, actorType: actorType as any, verb: 'created' });
  broadcastSse({ type: 'task.created', data: task });

  // Notify adapter if task was created with an agent assignee
  if (body.assigneeType === 'agent' && body.assigneeId) {
    const { getAdapterService } = await import('@/lib/adapter');
    getAdapterService().assignTaskToAgent(task, body.assigneeId).catch(() => {});
  }

  return ok(task, 201);
}
