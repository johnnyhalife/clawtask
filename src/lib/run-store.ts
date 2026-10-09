import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface Dispatch {
  id: string; taskId: string; agentId: string; sessionKey: string;
  commentId: string | null; runId: string | null; state: string; attempts: number;
}

// Call inside the comment transaction, before the API acknowledges admission.
export function admitFollowup(db: Database.Database, task: any, comment: any) {
  if (!task.assigneeId || task.assigneeType !== 'agent' || !comment.content.trim()) return;
  const agent = db.prepare('SELECT openclawAgentId FROM agents WHERE id=?').get(task.assigneeId) as any;
  if (!agent) throw new Error('Follow-up agent is missing');
  db.prepare('INSERT OR IGNORE INTO task_dispatches(id,taskId,agentId,sessionKey,commentId,state) VALUES(?,?,?,?,?,?)').run(uuidv4(),task.id,task.assigneeId,'agent:'+agent.openclawAgentId+':clawtask:'+task.id,comment.id,'pending');
}
