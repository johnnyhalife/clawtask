# OpenCode Adapter — Spec & Milestones

Multi-adapter support for Clawtask. Adds an OpenCode server adapter alongside the existing OpenClaw adapter, with a clean shared interface, canonical API-callback comment model, per-agent locking, and session liveness monitoring.

---

## Architectural Decisions

### Canonical comment model
Comments always arrive inbound via `POST /api/v1/tasks/:id/comments`. The adapter never writes comments directly — it only dispatches and steers. Both adapters follow this contract.

The existing stream-to-comment code in the OpenClaw adapter (delta accumulation, runId filtering, WS stream handler) is dead — the dispatch prompt instructs the agent to call the API, so streaming was never exercised. It will be removed in M3.

### IAgentAdapter interface
```ts
interface IAgentAdapter {
  dispatch(task, agent): Promise<void>               // assign or respawn
  steer(task, agent, message: string): Promise<void> // in-flight nudge
  stop(taskId, agent): Promise<void>                 // cancel
  probe(agent): Promise<{ ok: boolean }>             // health check
}
```

### Lock model
- One task at a time per agent (per-agent queue, unchanged).
- Lock acquired on dispatch. Lock released when task transitions to `done` or `blocked`.
- Release trigger: status route calls `adapter.onTaskCompleted(agentId)` when task → `done`. Probe calls it when task → `blocked`.
- On release: adapter dequeues and dispatches next pending task for that agent.

### Human comment routing
```
task.status === 'in_progress' → adapter.steer(task, agent, comment.content)
task.status === 'done'        → reopen to in_progress + adapter.dispatch(...)
task.status === 'blocked'     → reopen to in_progress + adapter.dispatch(...)
```

For OpenCode, steer first checks `GET /session/:id`. If session is dead, falls back to respawn instead.

### OpenCode session liveness
- Session ID stored in `adapter_state` on dispatch (durable, survives restarts).
- Periodic probe (`GET /session/:id`) runs while task is `in_progress`.
- On death: task → `blocked`, lock released, probe unscheduled.
- Probe lifecycle mirrors the lock: start on dispatch, stop on any release (done, blocked, cancel).
- Probe interval: 60s flat to start.

### Boot behavior
- **OpenClaw**: reconnect all `probeStatus = ok` agents. No intervention on in-progress tasks (WS drop is immediately observable at runtime).
- **OpenCode**: for each `in_progress` task with an `adapter_state` row, probe the session. Dead → `blocked`. Alive → reschedule probe and continue.

### Adapter singleton constraint
One OpenCode adapter per Clawtask instance. Enforced at agent registration: `POST /api/v1/agents` with `adapterType: 'opencode'` returns 409 if any other agent already uses OpenCode.

### OpenCode-specific config
`opencodeServerUrl` stored in the config table. Exposed in Settings UI. Used by the OpenCode adapter for all HTTP calls.

---

## Milestones

Ordered from least to most blast radius. Each milestone is independently shippable.

---

### M0 — Fix adapter singleton (prerequisite)
**Blast radius:** Low. Infrastructure only.

The Next.js App Router isolates module state per request. The adapter singleton breaks under this model — each route gets a different instance. Fix: custom `server.ts` that calls `adapter.init()` once at process start, then delegates to Next.js. All routes share the same Node process.

**Files:** `server.ts` (new), `package.json` (update `dev`/`start` scripts), `next.config.js`.
**Behavior change:** None. Fixes A1 from ISSUES.md.

---

### M1 — Schema migration
**Blast radius:** Zero. Purely additive.

- Add `adapterType TEXT NOT NULL DEFAULT 'openclaw'` to `agents` table.
- Add `adapter_state` table:
  ```sql
  CREATE TABLE adapter_state (
    taskId      TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    adapterType TEXT NOT NULL,
    sessionId   TEXT,
    probeStatus TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'dead'
    lastProbeAt TEXT,
    updatedAt   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  ```
- Add `opencodeServerUrl` to the allowed keys list in `config` route (no masking needed).

**Files:** `src/db/schema.sql`, `src/db/db.ts` (migration), `src/app/api/v1/config/route.ts`.
**Behavior change:** None.

---

### M2 — Extract IAgentAdapter interface + wrap OpenClaw
**Blast radius:** Low. Pure refactor, zero behavior change.

- Define `IAgentAdapter` in `src/lib/adapter-interface.ts`.
- Extract OpenClaw logic from `AdapterService` into `OpenClawAdapter` implementing `IAgentAdapter`.
- `AdapterService` becomes a thin router: maps `agent.adapterType` → adapter impl, delegates all calls.
- OpenClaw adapter still owns: device identity, WS lifecycle, reconnect loop, handshake, `processNextTask`, per-agent connection map.

**Files:** `src/lib/adapter-interface.ts` (new), `src/lib/adapters/openclaw.ts` (new), `src/lib/adapter.ts` (refactored to router).
**Behavior change:** None.

---

### M3 — Lock release fix + dead code removal
**Blast radius:** Low. One new call site, one deletion.

- Add `adapter.onTaskCompleted(agentId)` method to `AdapterService`. Calls `processNextTask` for the agent.
- Call it from `POST /api/v1/tasks/:id/status` when status transitions to `done`.
- Remove dead stream-to-comment code from `OpenClawAdapter`: delta accumulator, runId filtering, WS `stream: assistant` handler. The dispatch prompt is canonical; streaming was never exercised.

**Files:** `src/lib/adapter.ts`, `src/lib/adapters/openclaw.ts`, `src/app/api/v1/tasks/[id]/status/route.ts`.
**Behavior change:** Lock release now triggered by the status API call instead of WS stream events. In practice identical — the agent always called the status API.

---

### M4 — Steer/respawn comment routing
**Blast radius:** Low-medium. Replaces existing `notifyHumanComment` logic.

Replace the current auto-reopen + re-dispatch flow with the three-branch model:

```
in_progress → adapter.steer(task, agent, comment.content)
done        → reopen to in_progress + adapter.dispatch(task, agent, { context: comment.content })
blocked     → reopen to in_progress + adapter.dispatch(task, agent, { context: comment.content })
```

- `steer()` on `OpenClawAdapter`: sends a follow-up message to the existing session via `agent.send`. No session check needed — WS liveness is observable.
- `dispatch()` on respawn: includes prior human comment as context in the wake prompt.

**Files:** `src/lib/adapters/openclaw.ts`, `src/app/api/v1/tasks/[id]/comments/route.ts`.
**Behavior change:** In-flight human comments now use steer instead of re-dispatch. Done/blocked comments respawn cleanly.

---

### M5 — OpenCode adapter core
**Blast radius:** Low. New code, additive. No UI yet.

Implement `OpenCodeAdapter`:

- `dispatch(task, agent)`: `POST <opencodeServerUrl>/run` with task payload. Store returned session ID in `adapter_state`. Fire and forget.
- `steer(task, agent, message)`: `POST <opencodeServerUrl>/session/:sessionId/message`.
- `stop(task, agent)`: `POST <opencodeServerUrl>/session/:sessionId/stop`. Clear `adapter_state` row.
- `probe(agent)`: `GET <opencodeServerUrl>/health`.
- Register in `AdapterService` router: if `agent.adapterType === 'opencode'` → use `OpenCodeAdapter`.

Wake prompt identical to OpenClaw: includes API key, task URL, instructions to post comments via API and call `/status done` when finished.

**Files:** `src/lib/adapters/opencode.ts` (new), `src/lib/adapter.ts` (register new impl).
**Behavior change:** None for existing agents. New code path only.

---

### M6 — Agent registration + settings UI
**Blast radius:** Medium. API + UI changes.

**API:**
- `POST /api/v1/agents`: accept `adapterType` (`'openclaw'` | `'opencode'`), default `'openclaw'`. If `'opencode'`: 409 if another OpenCode agent exists. `openclawAgentId` optional for OpenCode agents.
- `GET /api/v1/agents`: include `adapterType` in response.
- `PATCH /api/v1/config`: `opencodeServerUrl` already allowed from M1.

**Settings UI:**
- Agent registration form: adapter picker (OpenClaw / OpenCode). OpenCode selection hides `openclawAgentId` field, shows note if singleton slot is taken.
- New "OpenCode Server" section in Settings: URL field, sourced from `opencodeServerUrl` config.

**Files:** `src/app/api/v1/agents/route.ts`, `src/app/api/v1/agents/[id]/route.ts`, settings UI components.
**Behavior change:** Additive. Existing OpenClaw agents unaffected.

---

### M7 — OpenCode steer with session check
**Blast radius:** Low. OpenCode-specific, contained in adapter impl.

Before steering an OpenCode agent on an in-flight task:
1. `GET <opencodeServerUrl>/session/:sessionId`
2. Alive → steer (`POST /session/:sessionId/message`)
3. Dead → fall back to respawn: reopen task to `in_progress`, `adapter.dispatch()`

This handles the case where the OpenCode session expired between task dispatch and human comment, without the stuck-task probe having fired yet.

**Files:** `src/lib/adapters/opencode.ts`.
**Behavior change:** OpenCode-only.

---

### M8 — Periodic probe + blocked state
**Blast radius:** Medium. New subsystem, new automated path into an existing state.

> Note: `blocked` is already a valid `tasks.status` value in the schema. No migration needed. M8 introduces the first programmatic path into it — previously it could only be set manually.

- On `dispatch()` in `OpenCodeAdapter`: schedule probe interval (60s). Store `intervalId` in memory (keyed by `taskId`).
- Probe: `GET /session/:sessionId`. On death:
  1. Clear interval.
  2. Update `adapter_state` probeStatus → `dead`, `lastProbeAt`.
  3. `db.UPDATE tasks SET status = 'blocked'`.
  4. `broadcastSse({ type: 'task.updated' })`.
  5. `adapter.onTaskCompleted(agentId)` — release lock, process next.
- On any lock release (done, blocked, cancel): `clearInterval` for that task's probe. Delete `adapter_state` row.
- `POST /api/v1/tasks/:id/cancel`: also triggers probe cleanup.

**Files:** `src/lib/adapters/opencode.ts`, `src/app/api/v1/tasks/[id]/cancel/route.ts`, `src/lib/adapter.ts`.
**Behavior change:** OpenCode tasks that die mid-run now surface as `blocked` instead of staying stuck in `in_progress`.

---

### M9 — Boot recovery for OpenCode
**Blast radius:** Low. Boot-time only, contained in adapter init.

In `OpenCodeAdapter.init()` (called from `AdapterService.init()`):
1. Query: `SELECT t.*, a.* FROM tasks t JOIN adapter_state a ON a.taskId = t.id WHERE t.status = 'in_progress' AND a.adapterType = 'opencode'`.
2. For each row: `GET /session/:sessionId`.
3. Alive → reschedule probe. Continue.
4. Dead → task → `blocked`, `adapter.onTaskCompleted(agentId)`, delete `adapter_state` row.

OpenClaw boot behavior unchanged: reconnect all `probeStatus = ok` agents, no task state intervention.

**Files:** `src/lib/adapters/opencode.ts`, `src/lib/adapter.ts`.
**Behavior change:** OpenCode in-progress tasks that were running when the server restarted now resolve correctly on next boot.

---

## File Map

| File | Change |
|---|---|
| `server.ts` | New — custom server, singleton init |
| `src/db/schema.sql` | Add `adapter_state` table |
| `src/db/db.ts` | Migration: `adapterType` on agents, `adapter_state` |
| `src/lib/adapter-interface.ts` | New — `IAgentAdapter` |
| `src/lib/adapter.ts` | Refactor to router + `onTaskCompleted` |
| `src/lib/adapters/openclaw.ts` | New — extracted OpenClaw impl, stream code removed |
| `src/lib/adapters/opencode.ts` | New — OpenCode impl, probe loop |
| `src/app/api/v1/config/route.ts` | Add `opencodeServerUrl` |
| `src/app/api/v1/agents/route.ts` | `adapterType` field, singleton validation |
| `src/app/api/v1/agents/[id]/route.ts` | Expose `adapterType` |
| `src/app/api/v1/tasks/[id]/status/route.ts` | Call `onTaskCompleted` on done |
| `src/app/api/v1/tasks/[id]/comments/route.ts` | Steer/respawn routing |
| `src/app/api/v1/tasks/[id]/cancel/route.ts` | Probe cleanup |
| Settings UI components | Adapter picker, OpenCode URL field |
