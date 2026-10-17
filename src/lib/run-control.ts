import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Dispatch } from './run-store';
import { validateTaskRuntime, type TaskRuntime } from './task-runtime';
import type { CreationHandoff } from './runtime-control';
type RuntimePreparation = (conn: any, row: Dispatch, session: any, settings: TaskRuntime, creation: CreationHandoff) => Promise<any>;
class RuntimePreparationFailed extends Error {}

interface Transport {
  agentId: string; openclawAgentId: string;
  currentTaskId: string | null; currentRunId: string | null;
}
type Request = (conn: any, method: string, params: any, timeout?: number) => Promise<any>;
const OWNED = "state IN ('submitting','running','recovery')";

/** One local owner per agent, one serialized lifecycle operation per task. */
export class RunControl {
  private pumps = new Set<string>();
  private repump = new Set<string>();
  private locks = new Map<string, Promise<unknown>>();
  constructor(private db: Database.Database, private request: Request,
    private available: (conn: any) => boolean, private message: (task: any, comment: any, conn: any) => string,
    private reopened: (taskId: string) => void = () => {},
    private runtime: RuntimePreparation = async () => { throw new Error('runtime_transport_unavailable'); }) {}

  private log(event: string, row: {taskId: string; runId?: string | null}, code?: string) {
    console.info('[adapter]', JSON.stringify({event,taskId:row.taskId,runId:row.runId ?? undefined,code}));
  }
  private async serialized<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.locks.set(id,current);
    try { return await current; } finally { if (this.locks.get(id)===current) this.locks.delete(id); }
  }
  private owner(agentId: string) {
    return this.db.prepare('SELECT * FROM task_dispatches WHERE agentId=? AND '+OWNED).get(agentId) as Dispatch | undefined;
  }
  private session(taskId: string) { return this.db.prepare('SELECT * FROM task_sessions WHERE taskId=?').get(taskId) as any; }
  private remember(row: Dispatch) {
    const previous = this.session(row.taskId);
    if (previous && (previous.sessionKey!==row.sessionKey || previous.agentId!==row.agentId)) throw new Error('session_owner_changed');
    this.db.prepare('INSERT OR IGNORE INTO task_sessions(taskId,agentId,sessionKey) VALUES(?,?,?)').run(row.taskId,row.agentId,row.sessionKey);
  }
  private async describe(conn: Transport, row: any, requireExisting: boolean, allowIdentityBinding = false) {
    if (this.session(row.taskId)?.creationPending) throw new RuntimePreparationFailed();
    // `key` is sufficient to identify the session on current Gateways. Older
    // Gateways may require the redundant agent id, so retry only when the
    // portable request is rejected.
    let result: any;
    try {
      result = await this.request(conn,'sessions.describe',{key:row.sessionKey});
    } catch {
      result = await this.request(conn,'sessions.describe',{key:row.sessionKey,agentId:conn.openclawAgentId});
    }
    if (!result || !('session' in result)) throw new Error('invalid_describe');
    const session=result.session;
    if (session===null && !requireExisting) return null;
    if (!session || typeof session.sessionId!=='string' || typeof session.archived!=='boolean') throw new Error('missing_session_or_contract');
    // OpenClaw projects active work as queued/running; its terminal predicate
    // recognizes exactly these five terminal states. Never infer idle from an
    // arbitrary string. A supplied boolean and status must both be valid and
    // agree: the supported active projection overrides stale terminal status.
    const booleanPresent = session.hasActiveRun !== undefined;
    const statusPresent = session.status !== undefined;
    if (booleanPresent && typeof session.hasActiveRun!=='boolean') throw new Error('missing_session_or_contract');
    let statusActive: boolean | undefined;
    if (statusPresent) {
      if (['queued','running'].includes(session.status)) statusActive=true;
      else if (['done','failed','interrupted','killed','timeout'].includes(session.status)) statusActive=false;
      else throw new Error('missing_session_or_contract');
    }
    if ((!booleanPresent && !statusPresent) ||
        (booleanPresent && statusPresent && session.hasActiveRun!==statusActive)) throw new Error('missing_session_or_contract');
    const hasActiveRun = booleanPresent ? session.hasActiveRun : statusActive;
    const stored=this.session(row.taskId);
    if (!stored?.sessionId && !allowIdentityBinding && this.db.prepare("SELECT 1 FROM task_dispatches WHERE taskId=? AND state!='pending' LIMIT 1").get(row.taskId)) throw new Error('original_identity_unobserved');
    if (stored?.sessionId && stored.sessionId!==session.sessionId) throw new Error('session_identity_changed');
    this.db.prepare('UPDATE task_sessions SET sessionId=? WHERE taskId=? AND (sessionId IS NULL OR sessionId=?)').run(session.sessionId,row.taskId,session.sessionId);
    return {...session,hasActiveRun};
  }
  private pending(taskId: string) {
    return !!this.db.prepare("SELECT 1 FROM task_dispatches WHERE taskId=? AND state IN ('pending','submitting','running','recovery') LIMIT 1").get(taskId);
  }

  /** Called by all task status routes. Does not infer completion from task status. */
  statusChanged(task: any) {
    if (task.status!=='done') return;
    if (!this.session(task.id) && task.assigneeType==='agent' && task.assigneeId) {
      const agent=this.db.prepare('SELECT openclawAgentId FROM agents WHERE id=?').get(task.assigneeId) as any;
      if (agent) this.db.prepare('INSERT OR IGNORE INTO task_sessions(taskId,agentId,sessionKey) VALUES(?,?,?)').run(task.id,task.assigneeId,'agent:'+agent.openclawAgentId+':clawtask:'+task.id);
    }
    this.db.prepare('UPDATE task_sessions SET cleanupPending=1 WHERE taskId=?').run(task.id);
  }

  async cleanup(conn: Transport, taskId: string) {
    return this.serialized(taskId,async()=>{
      const row=this.session(taskId);
      const task=this.db.prepare('SELECT status FROM tasks WHERE id=?').get(taskId) as any;
      if (!row?.cleanupPending || row.agentId!==conn.agentId || row.cleanupAttempts>=3 || task?.status!=='done' || this.pending(taskId) || !this.available(conn)) return;
      let counted=false;
      try {
        const session=await this.describe(conn,row,true);
        // Missing active state is never treated as idle. Gateway includes queued work.
        if (session.hasActiveRun || this.pending(taskId) || !this.available(conn)) return;
        const fresh=this.db.prepare('SELECT status FROM tasks WHERE id=?').get(taskId) as any;
        if (fresh?.status!=='done') return;
        this.db.prepare('UPDATE task_sessions SET cleanupAttempts=cleanupAttempts+1 WHERE taskId=?').run(taskId);
        counted=true;
        if (!session.archived) {
          const patched=await this.request(conn,'sessions.patch',{key:row.sessionKey,agentId:conn.openclawAgentId,expectedSessionId:session.sessionId,archived:true},360000);
          if (patched?.ok!==true || patched.entry?.sessionId!==session.sessionId || patched.entry?.archivedAt===undefined) throw new Error('archive_unconfirmed');
        }
        this.db.prepare('UPDATE task_sessions SET cleanupPending=0,errorCode=NULL WHERE taskId=?').run(taskId);
        this.log('archived',row);
      } catch {
        // Keep done and keep explicit recovery state. Never print gateway text or prompts.
        this.db.prepare("UPDATE task_sessions SET errorCode='archive_failed',cleanupAttempts=cleanupAttempts+? WHERE taskId=?").run(counted?0:1,taskId);
        this.log('cleanup_failed',row,'archive_failed');
      }
    });
  }

  private async prepare(conn: Transport, row: Dispatch) {
    return this.serialized<false | { session: any; settings: TaskRuntime; revision: number }>(row.taskId,async()=>{
      this.remember(row);
      const task=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(row.taskId) as any;
      if (!task || task.assigneeId!==conn.agentId || task.assigneeType!=='agent' || !['todo','in_progress','done'].includes(task.status)) return false;
      const stored=this.session(row.taskId);
      // A followup must target the original session. Never create its replacement.
      let session=await this.describe(conn,row,!!row.commentId || !!stored.sessionId);
      const settings: TaskRuntime = { modelOverride: task.modelOverride ?? null, thinkingOverride: task.thinkingOverride ?? null };
      if (validateTaskRuntime(settings)) throw new RuntimePreparationFailed();
      if (session?.hasActiveRun) throw new Error('session_active');
      if (session?.archived) {
        const patched=await this.request(conn,'sessions.patch',{key:row.sessionKey,agentId:conn.openclawAgentId,expectedSessionId:session.sessionId,archived:false},360000);
        if (patched?.ok!==true || patched.entry?.sessionId!==session.sessionId || patched.entry?.archivedAt!==undefined) throw new Error('restore_unconfirmed');
        const restored=await this.describe(conn,row,true);
        if (restored.archived || restored.hasActiveRun) throw new Error('restore_unconfirmed');
        session=restored;
        this.db.prepare('UPDATE task_sessions SET cleanupAttempts=0,cleanupPending=0,errorCode=NULL WHERE taskId=?').run(row.taskId);
        this.log('restored',row);
      }
      if (!this.available(conn)) throw new Error('transport_lost');
      try {
        const creation: CreationHandoff = {
          begin: () => {
            const changed=this.db.prepare("UPDATE task_sessions SET creationPending=1 WHERE taskId=? AND agentId=? AND sessionKey=? AND sessionId IS NULL AND creationPending=0 AND EXISTS(SELECT 1 FROM task_dispatches WHERE id=? AND state='pending')")
              .run(row.taskId,row.agentId,row.sessionKey,row.id).changes;
            if (changed!==1) throw new Error('runtime_creation_conflict');
          },
          bind: id => {
            const changed=this.db.prepare("UPDATE task_sessions SET sessionId=?,creationPending=0 WHERE taskId=? AND agentId=? AND sessionKey=? AND sessionId IS NULL AND creationPending=1 AND EXISTS(SELECT 1 FROM task_dispatches WHERE id=? AND state='pending')")
              .run(id,row.taskId,row.agentId,row.sessionKey,row.id).changes;
            if (changed!==1) throw new Error('runtime_creation_bind_failed');
          },
        };
        const prepared = await this.runtime(conn,row,session,settings,creation);
        if (!prepared || typeof prepared.sessionId !== 'string' || (session && prepared.sessionId!==session.sessionId)) throw new Error('runtime_identity_changed');
        session=prepared;
        const bound=this.session(row.taskId);
        if (bound?.creationPending || bound?.sessionId!==session.sessionId) throw new Error('runtime_identity_unbound');
      } catch { throw new RuntimePreparationFailed(); }
      if (!this.available(conn)) throw new RuntimePreparationFailed();
      // Status or assignee can change while describe/restore is in flight.
      const fresh=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(row.taskId) as any;
      if (fresh?.assigneeId!==conn.agentId || fresh.assigneeType!=='agent' || !['todo','in_progress','done'].includes(fresh.status)) return false;
      if (fresh.runtimeRevision !== task.runtimeRevision) throw new RuntimePreparationFailed();
      if (row.commentId && fresh.status==='done') {
        this.db.prepare("UPDATE tasks SET status='in_progress',updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='done'").run(row.taskId);
        this.reopened(row.taskId);
      }
      return { session, settings, revision: task.runtimeRevision };
    });
  }

  private claimNext(conn: Transport): Dispatch | undefined {
    return this.db.transaction(()=>{
      let row=this.db.prepare("SELECT d.* FROM task_dispatches d JOIN tasks t ON t.id=d.taskId WHERE d.agentId=? AND d.state='pending' AND t.assigneeId=d.agentId AND t.assigneeType='agent' AND t.status IN ('todo','in_progress','done') ORDER BY d.seq LIMIT 1").get(conn.agentId) as Dispatch | undefined;
      if (!row) {
        const task=this.db.prepare("SELECT t.* FROM tasks t WHERE assigneeId=? AND assigneeType='agent' AND status IN ('todo','in_progress') AND NOT EXISTS(SELECT 1 FROM task_dispatches d WHERE d.taskId=t.id) ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,createdAt LIMIT 1").get(conn.agentId) as any;
        if (!task) return;
        const id=uuidv4();
        this.db.prepare("INSERT INTO task_dispatches(id,taskId,agentId,sessionKey,state) VALUES(?,?,?,?,'pending')").run(id,task.id,conn.agentId,'agent:'+conn.openclawAgentId+':clawtask:'+task.id);
        row=this.db.prepare('SELECT * FROM task_dispatches WHERE id=?').get(id) as Dispatch;
      }
      return row;
    })();
  }

  /** Each pump uses at most three waits. Reconnect reconciles, never resubmits. */
  async pump(conn: Transport) {
    if (!this.available(conn)) return;
    if (this.pumps.has(conn.agentId)) {this.repump.add(conn.agentId);return;}
    this.pumps.add(conn.agentId);
    try {
      let row=this.owner(conn.agentId);
      if (!row && conn.currentTaskId) return; // Never replace a different in-memory owner.
      while (this.available(conn)) {
        row=row ?? this.claimNext(conn);
        if (!row) break;
        if (row.state==='pending') {
          let prepared;
          try { prepared=await this.prepare(conn,row); if (!prepared) break; }
          catch (error) {
            const code=error instanceof RuntimePreparationFailed ? 'runtime_preparation_failed' : 'restore_or_identity_failed';
            this.db.prepare('UPDATE task_dispatches SET errorCode=? WHERE id=?').run(code,row.id);
            this.log('followup_retained',row,code);
            break;
          }
          if (!this.available(conn)) break;
          // Freeze settings at submission; edits while preparing invalidate this attempt.
          // This synchronous transaction shares admission's SQLite write boundary.
          const frozen=JSON.stringify(prepared.settings);
          const revision=prepared.session.lifecycleRevision ?? null;
          const claimed=this.db.transaction(()=>this.db.prepare(
            "UPDATE task_dispatches SET state='submitting',runId=id,errorCode=NULL,runtimeSettings=?,runtimeSessionRevision=? WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM tasks WHERE id=task_dispatches.taskId AND runtimeRevision=? AND assigneeId=? AND assigneeType='agent' AND status IN ('todo','in_progress','done'))"
          ).run(frozen,revision,row!.id,prepared.revision,conn.agentId).changes)();
          if (claimed!==1) break;
          row={...row,state:'submitting',runId:row.id,runtimeSettings:frozen,runtimeSessionRevision:revision};
          conn.currentTaskId=row.taskId;conn.currentRunId=row.runId;
          try {
            const task=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(row.taskId);
            const comment=row.commentId ? this.db.prepare('SELECT * FROM comments WHERE id=?').get(row.commentId) : null;
            const accepted=await this.request(conn,'agent',{message:this.message(task,comment,conn),idempotencyKey:row.id,sessionKey:row.sessionKey,agentId:conn.openclawAgentId,...row.runtimeSessionRevision ? {expectedExistingSessionLifecycleRevision:row.runtimeSessionRevision} : {},...this.session(row.taskId)?.sessionId ? {expectedExistingSessionId:this.session(row.taskId).sessionId} : {}},15000);
            if (typeof accepted?.runId!=='string' || accepted.runId!==row.id) throw new Error('invalid_acceptance');
            this.db.prepare("UPDATE task_dispatches SET state='running',runId=? WHERE id=? AND runId=?").run(accepted.runId,row.id,row.id);
            row={...row,state:'running'};this.log('accepted',row);
            await this.describe(conn,row,true,true);
          } catch {
            this.retain(row,'acceptance_uncertain');break;
          }
        } else { conn.currentTaskId=row.taskId;conn.currentRunId=row.runId ?? row.id; }
        if (!await this.wait(conn,row)) break;
        row=undefined;
      }
      // Only explicitly tracked cleanup is recovered. Never sweep historical done tasks.
      if (this.available(conn)) {
        const rows=this.db.prepare('SELECT taskId FROM task_sessions WHERE agentId=? AND cleanupPending=1 AND cleanupAttempts<3').all(conn.agentId) as any[];
        for (const row of rows) await this.cleanup(conn,row.taskId);
      }
    } finally {
      this.pumps.delete(conn.agentId);
      if (this.repump.delete(conn.agentId) && this.available(conn)) await this.pump(conn);
    }
  }
  private retain(row: Dispatch, code: string) {
    this.db.prepare("UPDATE task_dispatches SET state='recovery',errorCode=? WHERE id=? AND runId=? AND "+OWNED).run(code,row.id,row.runId);
    this.log('ownership_retained',row,code);
  }
  private async wait(conn: Transport, row: Dispatch) {
    if (row.attempts>=6) {this.retain(row,'recovery_required');return false;}
    for (let attempt=0;attempt<Math.min(3,6-row.attempts) && this.available(conn);attempt++) {
      try {
        this.db.prepare('UPDATE task_dispatches SET attempts=attempts+1 WHERE id=?').run(row.id);
        const result=await this.request(conn,'agent.wait',{runId:row.runId ?? row.id,timeoutMs:300000},360000);
        this.log('wait',row);
        if (!this.available(conn) || this.owner(conn.agentId)?.id!==row.id || conn.currentRunId!==row.runId) return false;
        // timeout can mean observation timeout OR terminal timeout: both retain ownership.
        if (result?.runId!==row.runId || !['ok','error'].includes(result?.status) || result.yielded===true || typeof result.endedAt!=='number') continue;
        const task=this.db.prepare('SELECT status FROM tasks WHERE id=?').get(row.taskId) as any;
        const outcome=task && ['done','blocked','archived'].includes(task.status);
        this.db.prepare('UPDATE task_dispatches SET state=?,errorCode=? WHERE id=? AND runId=? AND '+OWNED).run(outcome?'completed':'outcome_required',outcome?null:'terminal_without_task_outcome',row.id,row.runId);
        this.log(outcome?'completed':'outcome_required',row);
        conn.currentTaskId=null;conn.currentRunId=null;
        if (task?.status==='done') { this.statusChanged({...task,id:row.taskId});await this.cleanup(conn,row.taskId); }
        return true;
      } catch { this.retain(row,'wait_or_transport_failed');return false; }
    }
    this.retain(row,'wait_budget_exhausted');return false;
  }
}
