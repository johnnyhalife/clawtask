# Clawtask — Design Decisions

This document records all major decisions made during the initial build of Clawtask.

---

## 2026-10-09 — Explicit reassignment is durable admission

Automatic polling excludes tasks with any dispatch history. Keep this guard: a blocked task must not repeat without an explicit assignment change. Assignment POST, task/subtask PATCH, and assigned task/subtask creation now commit assignment and pending admission together through run-store. Adapter notification only wakes the durable queue.

A completed blocked run can resume when a human sets todo and reassigns the original agent. Use the latest non-empty human comment received since the last dispatch if it has not already been admitted. This carries the unblock override through the existing followup prompt rather than repeating the original block instruction. Keep the saved session key and ID. Repeated identical assignments and pending/active work do not create another dispatch.

Recovery and outcome_required records require operator recovery; assignment returns 409 and rolls back instead of clearing them. Work and original sessions owned by another agent cannot be replaced. A busy agent can retain a pending assignment for another task and dispatch it only after the current owner releases. No schema migration or gateway changes are needed. See [local evidence](docs/blocked-reassignment-evidence.md).

## 2026-10-09 — Durable run ownership and session lifecycle

Persist comment admission and dispatch identity before sending work. Initial dispatch and human followups use the same per-agent owner. Timeout and unknown acceptance retain that owner. Gateway dedupe is bounded and is not an indefinite exactly-once guarantee, so recovery waits for a saved run instead of replaying a submission.

Task done is not run completion. Cleanup checks the original session identity, gateway active state and durable pending work. Restore must succeed before reopening or dispatching. Archive and restore serialize per task; comments received during a patch remain queued. Missing or replaced identity requires recovery rather than session replacement.

Waits have a persisted six-observation budget and cleanup has a three-attempt budget. Exhaustion is visible in API recovery fields and logs. The application intentionally pauses uncertain business work instead of repeating it. These local locks assume one application process.

The September 10 blocked-task fix remains unchanged in meaning and now applies through all status mutation routes. The transport reconnect and Map-iteration faults are separate; they are not the historical blocked-loop diagnosis. See [verified gateway contract and recovery rules](docs/gateway-session-lifecycle.md).

## 2026-10-09 — Additive schema and operator-owned release

Startup creates task_dispatches and task_sessions without altering historical task/comment/activity records. These tables persist recovery state; an image downgrade does not honor that state. Save the previous image digest and a consistent database backup before deployment. Drain accepted runs and followups, or establish an explicit recovery hold, before rollback. Do not automatically restore the database.

Johnny owns the main push and deployment, then triggers harmless production tasks manually. The live test includes blocked → done → archived: blocked is an unfinished task, even when its run has ended. See README.md for the checklist. Local testing is not proof of Node 20 CI or the production container.

## 2026-10-09 — One agent comment path

Agent comments use the authenticated API. The gateway socket handles dispatch and run control, not comment storage. This removes the second comment writer and keeps author identity, activity records, and browser events on one path. Historical comments are unchanged.

## 2026-10-16 — Task runtime preferences use non-admin session authority

Persist independent nullable task model/thinking overrides; null means agent configuration, not a copied current default. Prepare and verify the original session before pending work can become submitting. Freeze the preference snapshot under task revision and assignment checks; edits during preparation retry safely, edits after submission apply to future dispatches only. Never reconfigure or replay an accepted/uncertain owner.

Before no-execution initial creation, persist an unresolved creation intent. Bind a verified create acknowledgment synchronously before any subsequent fallible Gateway step. Describe/patch/readback failure must not discard that identity; a restarted retry rejects a replacement under the same key. Unknown or incomplete acknowledgment leaves the intent unresolved and blocks automatic adoption/recreation. This conservative hold requires operator investigation, not a synthetic identity or a new reset path.

Keep existing run/lifecycle authentication intact. Runtime preference mutations use a bounded separate connection signing/requesting only operator.write and validating the granted non-admin scope. An admin model patch can persist configured defaults under modelSelectionScope=agent/global; a config pre-read is not an atomic safeguard. The narrow transport neither pairs/upgrades nor falls back to admin. Unsupported or unverifiable metadata retains pending work. See [contract, semantics and limits](docs/task-runtime.md).

## Technology Choices

### SQLite via better-sqlite3
**Decision:** Use better-sqlite3 for synchronous SQLite access.
**Rationale:** Fastest in-process SQLite binding. Synchronous API simplifies Next.js API routes — no async/await overhead. WAL mode enabled for concurrent reads.

**Note:** better-sqlite3 requires native compilation. Tested on Node.js v25.9.0 (Darwin arm64). If you encounter build issues, run `npm rebuild better-sqlite3`.

### Next.js App Router
**Decision:** Use Next.js App Router with `src/app/` structure. Current dependency is Next.js 16.2.6.
**Rationale:** Co-locates API routes and pages. Built-in TypeScript support. SSR for initial page load. Excellent DX.

### SSE over WebSockets for realtime UI
**Decision:** UI uses Server-Sent Events (SSE); agent adapter uses WebSockets.
**Rationale:** SSE is simpler (HTTP, one-directional) for UI push. Nginx-compatible with `X-Accel-Buffering: no`. WebSockets are appropriate for bidirectional agent communication.

### In-process SSE state
**Decision:** SSE subscribers tracked as in-memory Set in `src/lib/sse.ts`.
**Rationale:** Single-instance, single-user deployment. No Redis/pub-sub needed. If multiple Next.js instances needed (unlikely), extract to a pub-sub layer.

### Single default human, token-based API access
**Decision:** One human user, seeded at startup. No interactive login. API actors use Bearer credentials; the UI bootstraps its configured human credential.
**Rationale:** Self-hosted, single-user tool on a trusted network. This is not a multi-user access-control boundary. This supersedes the original no-auth decision.

---

## Data Model Decisions

### Issue ID format
- Format: `<PREFIX>-<zero-padded-3-digit number>` e.g., `CWT-001`
- Counter persisted in the `config` table as `issueCounter`
- Monotonically increasing, never reused (counter only goes up, even after deletion)
- Default prefix: `CWT` (Clawtask)

### Subtasks share the tasks table
**Decision:** Subtasks are rows in the `tasks` table with `parentTaskId` set.
**Rationale:** Avoids schema duplication. Enforced at API layer: subtask creation/mutation routes enforce parent/child relationship.

### Tags as separate table with junction
**Decision:** Tags are a separate `tags` table with a `task_tags` junction.
**Rationale:** Tags can be reused, created inline, and queried globally. Avoids JSON blob storage.

### Activity log
**Decision:** Every state change writes to the `activity` table.
**Rationale:** Provides a full audit trail, feeds the Pulse view, and gives agents a feedback loop.

---

## API Design Decisions

### Agent auth via Bearer token
**Decision:** All API calls include `Authorization: Bearer <apiKey>`. Human/UI calls are unauthenticated.
**Rationale:** Agents operate programmatically. Humans operate in a private network. This keeps UI simple while giving agents verifiable identity.

### API key shown once
**Decision:** The plaintext API key is only returned at agent creation. After that, only the bcrypt hash is stored.
**Rationale:** Standard secret management practice. Key is shown once in the UI with a copy button.

### Response envelope
All responses:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "SOME_CODE", "message": "Human-readable" } }
```

---

## UI Decisions

### Dark theme inspired by Linear.app
**Decision:** Dark background (#0A0A0B), subtle borders (#1E1E21), muted text, blue accent (#3B82F6).
**Rationale:** The `~/ai-software-factory` directory did not exist at build time, so the Linear.app-inspired fallback was used as specified.

### Client-side filtering for Mine/Recent tabs
**Decision:** Mine and Recent views fetch all tasks then filter client-side.
**Rationale:** The data set is small (single user), and filtering is cheap. Avoids custom DB queries for simple rules (mine = human assignee or unassigned + not done; recent = updated < 24h).

### SSE hook in each view component
**Decision:** Each component that needs realtime data subscribes to SSE via `useSse()`.
**Rationale:** React hook pattern. Each component declares its own interest in events, keeping concerns separated.

### Task drawer as side panel (not modal)
**Decision:** Task detail opens as a right side drawer with backdrop, not a full modal.
**Rationale:** Preserves context (list remains visible behind backdrop). Standard pattern in Linear, Jira, GitHub.

### Merged comment + activity timeline
**Decision:** Comments and activity entries are merged and sorted by `createdAt` in the task drawer.
**Rationale:** Spec requires "Unified comment + activity timeline — oldest at top, newest at bottom."

---

## OpenClaw Adapter Decisions

### Singleton service, in-process
**Decision:** `AdapterService` is a singleton initialized on first use.
**Rationale:** Spec requires "Runs in-process as a singleton service." No child processes, no external daemon.

### One session per agent
**Decision:** Session key format: `agent:<openclawAgentId>:clawtask`
**Rationale:** Matches spec. Provides stable routing when OpenClaw resumes sessions.

### Task queue via DB polling
**Decision:** When an agent completes a task, the adapter queries the DB for the next queued task (ordered by priority then creation time).
**Rationale:** DB is the source of truth. No in-memory queue to lose on restart.

### Probe on demand, not at startup for pending agents
**Decision:** Agents with `probeStatus = pending` are not auto-connected at startup. Only `ok` agents get persistent WS connections.
**Rationale:** Prevents startup noise from newly registered but unconfigured agents. Users must explicitly probe from the Settings UI.

---

## File & Storage Decisions

### DB at `~/.clawtask/clawtask.db`
**Decision:** SQLite database stored in the user's home directory under `.clawtask/`.
**Rationale:** Spec requirement. Isolated from project directory, survives `rm -rf` on the project folder.

### Schema auto-applied on first DB connection
**Decision:** `getDb()` reads `schema.sql` and applies it idempotently on first connection.
**Rationale:** No separate migration runner needed for single-user installs. `CREATE TABLE IF NOT EXISTS` is safe to re-run.

---

## What Was Not Built / Scope Notes

- **Multi-tenancy:** Explicitly out of scope.
- **Email/external notifications:** Explicitly out of scope.
- **Authentication UI:** Not needed (no auth by design).
- **Pagination UI:** API supports pagination (`page`, `limit`). UI currently loads up to 100 tasks per view. Pagination controls are a future enhancement.
- **Inline tag creation in task form:** Not yet implemented — type name + enter in the create modal is planned but not built yet. This is in scope.

## 2026-10-16 — Ordinary key rotation requires an idle durable queue

Use the existing authenticated human actor only (401 for missing/invalid credentials; 403 for agent/external actors). The trusted-network human bootstrap remains unchanged. No emergency revocation or credential handoff is introduced.

Hash outside SQLite. Then a synchronous IMMEDIATE transaction checks existence, compares the original bcrypt hash as a credential version, checks every non-completed dispatch for the agent, and updates plaintext/hash together with a CAS predicate and affected-row check. The SQLite write lock serializes this boundary with assignment/followup admission, automatic admission and pending-to-submitting transitions. A durable pending row already blocks rotation while describe/restore or submission is in flight. No owner, outcome, session or work is cleared or replayed.

Pending, submitting, running, recovery and outcome_required all return 409 AGENT_BUSY, including queued work behind another task. Completed history and idle archived sessions do not block. Assignments admitted after rotation read the replacement for their prompt; admission before commit makes rotation fail. Undispatched legacy assignments have no delivered prompt and read the new key on later admission.

Overlapping rotations that read the same version yield at most one success; the loser receives 409 KEY_CONFLICT, with no replacement. Independently initiated rotation after a completed rotation can succeed and intentionally revoke that earlier key. A successful response guarantees a committed usable key at its linearization point, not immunity to subsequent explicit rotation/deletion. Clients must refresh and explicitly retry after a conflict; do not auto-retry. Deletion during hashing yields 404. SQLite failure never returns success. The adapter's existing plaintext local storage contract is unchanged; list/detail mask it, the hash is omitted, and rotation emits neither secrets nor activity/SSE/log output.
