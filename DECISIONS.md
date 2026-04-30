# Clawtask — Design Decisions

This document records all major decisions made during the initial build of Clawtask.

---

## Technology Choices

### SQLite via better-sqlite3
**Decision:** Use better-sqlite3 for synchronous SQLite access.  
**Rationale:** Fastest in-process SQLite binding. Synchronous API simplifies Next.js API routes — no async/await overhead. WAL mode enabled for concurrent reads.

**Note:** better-sqlite3 requires native compilation. Tested on Node.js v25.9.0 (Darwin arm64). If you encounter build issues, run `npm rebuild better-sqlite3`.

### Next.js App Router
**Decision:** Use Next.js 14 App Router with `src/app/` structure.  
**Rationale:** Co-locates API routes and pages. Built-in TypeScript support. SSR for initial page load. Excellent DX.

### SSE over WebSockets for realtime UI
**Decision:** UI uses Server-Sent Events (SSE); agent adapter uses WebSockets.  
**Rationale:** SSE is simpler (HTTP, one-directional) for UI push. Nginx-compatible with `X-Accel-Buffering: no`. WebSockets are appropriate for bidirectional agent communication.

### In-process SSE state
**Decision:** SSE subscribers tracked as in-memory Set in `src/lib/sse.ts`.  
**Rationale:** Single-instance, single-user deployment. No Redis/pub-sub needed. If multiple Next.js instances needed (unlikely), extract to a pub-sub layer.

### Single default human, no auth
**Decision:** One human user, seeded at startup. No login.  
**Rationale:** Self-hosted, single-user tool. Auth adds complexity with no benefit. Tailnet security assumed as specified.

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
- **Inline tag creation in task form:** Tags must be created via the API or Settings before they appear in the task form. Inline creation (type name + enter) is not yet implemented in the create modal.
