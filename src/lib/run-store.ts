import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface Dispatch {
  id: string; taskId: string; agentId: string; sessionKey: string;
  runtimeSettings?: string | null; runtimeSessionRevision?: string | null;
  commentId: string | null; runId: string | null; state: string; attempts: number;
}

export class AssignmentConflict extends Error {}

/** Assignment and durable admission commit together, or neither changes. */
export function assignmentTransaction<T>(db: Database.Database, taskId: string, explicit: boolean, mutate: () => T): T {
  return db.transaction(() => {
    const previous = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as any;
    const result = mutate();
    if (explicit) admitAssignment(db, db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId), previous);
    return result;
  })();
}

// Called only by explicit assignment mutations, never by automatic polling.
export function admitAssignment(db: Database.Database, task: any, previous?: any) {
  if (task.status==='blocked') return; // Status routes must always clear blocked assignment.
  const held = db.prepare("SELECT * FROM task_dispatches WHERE taskId=? AND state!='completed' ORDER BY seq").all(task.id) as Dispatch[];
  if (held.some(row => ['recovery','outcome_required'].includes(row.state))) {
    throw new AssignmentConflict('Task requires run recovery before reassignment');
  }
  if (held.some(row => row.agentId!==task.assigneeId || task.assigneeType!=='agent')) {
    throw new AssignmentConflict('Pending or active work belongs to another assignment');
  }
  if (!task.assigneeId || task.assigneeType!=='agent' || !['todo','in_progress'].includes(task.status)) return;
  const agent = db.prepare('SELECT openclawAgentId FROM agents WHERE id=?').get(task.assigneeId) as any;
  if (!agent) throw new AssignmentConflict('Assignment agent is missing');
  const sessionKey = 'agent:'+agent.openclawAgentId+':clawtask:'+task.id;
  const session = db.prepare('SELECT * FROM task_sessions WHERE taskId=?').get(task.id) as any;
  if (session && (session.agentId!==task.assigneeId || session.sessionKey!==sessionKey)) {
    throw new AssignmentConflict('Original session belongs to another agent');
  }
  if (held.length || (previous?.assigneeId===task.assigneeId && previous?.assigneeType===task.assigneeType)) return;
  const latest = db.prepare('SELECT * FROM task_dispatches WHERE taskId=? ORDER BY seq DESC LIMIT 1').get(task.id) as any;
  // Unassigned comments have no outbox row. Resume with the latest new human input,
  // not an agent result, an already-consumed comment, or the original block instruction.
  const comment = latest ? db.prepare(
    "SELECT c.id FROM comments c WHERE c.taskId=? AND c.authorType='human' AND trim(c.content)!='' AND c.createdAt>=? AND NOT EXISTS(SELECT 1 FROM task_dispatches d WHERE d.commentId=c.id) ORDER BY c.createdAt DESC,c.rowid DESC LIMIT 1"
  ).get(task.id,latest.createdAt) as any : null;
  db.prepare("INSERT INTO task_dispatches(id,taskId,agentId,sessionKey,commentId,state) VALUES(?,?,?,?,?,'pending')")
    .run(uuidv4(),task.id,task.assigneeId,sessionKey,comment?.id ?? null);
}

// Call inside the comment transaction, before the API acknowledges admission.
export function admitFollowup(db: Database.Database, task: any, comment: any) {
  if (!task.assigneeId || task.assigneeType !== 'agent' || !comment.content.trim()) return;
  const agent = db.prepare('SELECT openclawAgentId FROM agents WHERE id=?').get(task.assigneeId) as any;
  if (!agent) throw new Error('Follow-up agent is missing');
  db.prepare('INSERT OR IGNORE INTO task_dispatches(id,taskId,agentId,sessionKey,commentId,state) VALUES(?,?,?,?,?,?)').run(uuidv4(),task.id,task.assigneeId,'agent:'+agent.openclawAgentId+':clawtask:'+task.id,comment.id,'pending');
}
