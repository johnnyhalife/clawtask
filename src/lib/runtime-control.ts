import { validateTaskRuntime, type TaskRuntime } from './task-runtime';

type Request = (method: string, params: any) => Promise<any>;
export interface CreationHandoff { begin: () => void; bind: (sessionId: string) => void }
export interface RuntimeTarget { sessionKey: string; agentId: string; dispatchId: string; session: any; creation?: CreationHandoff }

function idle(session: any, key: string, id?: string) {
  if (!session || session.key !== key || typeof session.sessionId !== 'string' || !session.sessionId ||
      (id && session.sessionId !== id) || session.archived !== false || session.hasActiveRun !== false ||
      (session.status !== undefined && !['done', 'failed', 'interrupted', 'killed', 'timeout'].includes(session.status))) throw new Error('runtime_identity_or_activity');
}

/** Runs only over the authenticated non-admin transport. Never submits model work. */
export async function prepareTaskRuntime(request: Request, target: RuntimeTarget, settings: TaskRuntime) {
  if (validateTaskRuntime(settings)) throw new Error('runtime_settings_invalid');
  const { sessionKey: key, agentId } = target;
  let session = target.session;
  if (!session) {
    // Commit intent before sending: a lost/partial acknowledgment must never permit adoption.
    if (!target.creation) throw new Error('runtime_creation_handoff_missing');
    target.creation.begin();
    // No prompt/title task: creation must not start any model work.
    const created = await request('sessions.create', { key, agentId, idempotencyKey: 'clawtask-runtime:' + target.dispatchId });
    if (created?.ok !== true || created.runStarted !== false || created.key !== key || typeof created.sessionId !== 'string' || !created.sessionId.trim()) throw new Error('runtime_create_unconfirmed');
    // Synchronous durable handoff BEFORE any subsequent await or fallible verification.
    target.creation.bind(created.sessionId);
    session = (await request('sessions.describe', { key, agentId }))?.session;
    idle(session, key, created.sessionId);
  } else {
    // Do not trust a stale admin-connection snapshot as a mutation precondition.
    session = (await request('sessions.describe', { key, agentId }))?.session;
    idle(session, key, target.session.sessionId);
  }
  const patched = await request('sessions.patch', {
    key, agentId, expectedSessionId: session.sessionId,
    ...(typeof session.lifecycleRevision === 'string' ? { expectedLifecycleRevision: session.lifecycleRevision } : {}),
    model: settings.modelOverride, thinkingLevel: settings.thinkingOverride,
  });
  const resolved = patched?.resolved;
  if (patched?.ok !== true || patched.key !== key || patched.entry?.sessionId !== session.sessionId ||
      typeof resolved?.modelProvider !== 'string' || !resolved.modelProvider || typeof resolved?.model !== 'string' || !resolved.model ||
      !resolved.agentRuntime || typeof resolved.agentRuntime.id !== 'string') throw new Error('runtime_patch_unconfirmed');
  const model = resolved.modelProvider + '/' + resolved.model;
  if (settings.modelOverride !== null && model !== settings.modelOverride) throw new Error('runtime_model_mismatch');
  if (settings.thinkingOverride !== null && (resolved.thinkingLevel !== settings.thinkingOverride ||
      !Array.isArray(resolved.thinkingLevels) || !resolved.thinkingLevels.some((level: any) => level.id === settings.thinkingOverride))) throw new Error('runtime_thinking_unsupported');
  // Raw committed entry proves clears; public describe projects "default" model provenance as null.
  if (settings.modelOverride === null && patched.entry.modelOverrideSource !== 'default') throw new Error('runtime_default_unconfirmed');
  if (settings.thinkingOverride === null && patched.entry.thinkingLevel != null) throw new Error('runtime_default_unconfirmed');
  const observed = (await request('sessions.describe', { key, agentId }))?.session;
  idle(observed, key, session.sessionId);
  if (patched.entry.lifecycleRevision !== undefined && observed.lifecycleRevision !== patched.entry.lifecycleRevision) throw new Error('runtime_lifecycle_changed');
  if (observed.modelProvider !== resolved.modelProvider || observed.model !== resolved.model ||
      observed.agentRuntime?.id !== resolved.agentRuntime.id ||
      (settings.modelOverride === null && observed.modelOverrideSource !== null) ||
      (settings.thinkingOverride === null ? observed.thinkingLevel != null : observed.thinkingLevel !== settings.thinkingOverride)) throw new Error('runtime_readback_mismatch');
  // Both independent defaults must resolve before execution, even with no explicit thinking override.
  const effectiveThinking = observed.thinkingLevel ?? observed.thinkingDefault;
  if (typeof effectiveThinking !== 'string' || effectiveThinking !== resolved.thinkingLevel) throw new Error('runtime_thinking_unverified');
  return observed;
}
