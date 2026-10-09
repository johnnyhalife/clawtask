# Clawtask

A lightweight, self-hosted task tracker purpose-built for AI agent workflows. Built with Next.js 16.2.6, SQLite, and the OpenClaw gateway protocol.

---

## What It Is

Clawtask is a single-user task management tool where tasks can be assigned to either humans or AI agents. When a task is assigned to an agent, Clawtask connects to the OpenClaw gateway over WebSocket, dispatches the task and tracks run ownership. Agents post comments and status through the authenticated API; browser updates use SSE.

Think Linear — but with agents as first-class assignees.

---

## How It Works

### Architecture

```
Browser  ──SSE──▶  Next.js App Router  ──SQLite──  ~/.clawtask/clawtask.db
                        │
                        └── AdapterService (singleton, in-process)
                                │
                                └── WebSocket  ──▶  OpenClaw Gateway
                                                        │
                                                        └── Agent (e.g. main)
```

- **UI**: Dark-theme React app inspired by Linear. Real-time updates via SSE.
- **API**: REST endpoints under `/api/v1/`. Agents authenticate with a Bearer API key.
- **Adapter**: Singleton `AdapterService` maintains persistent WebSocket connections to OpenClaw per agent. Handles durable task dispatch, bounded run reconciliation, and session archive/restore.
- **DB**: SQLite via `better-sqlite3`. WAL mode. Stored at `~/.clawtask/clawtask.db`.

### Task Lifecycle

```
todo  ──[assigned to agent]──▶  in_progress  ──[agent marks done]──▶  done
                                     │
                              [human comments]
                                     │
                              [queue → restore same session → reopen → follow-up]
```

1. **Assignment**: Assigning a task to a registered agent triggers `assignTaskToAgent` in the adapter. This dispatches a prompt to the agent's OpenClaw session.
2. **Comments**: Agents post comments through the authenticated API. Gateway stream frames never write comments.
3. **Completion**: The agent calls `POST /api/v1/tasks/:id/status` with `{ "status": "done" }` when finished.
4. **Human follow-up**: The API saves the comment and pending dispatch atomically. Followups wait behind the agent's current run. A done task reopens only after the original session is restored.
5. **Cancellation**: Cancel button resets task to `todo`, removes assignee, and posts a system comment informing the agent to stop.

### Agent Communication

The adapter sends structured prompts to the agent over the OpenClaw gateway WS using the `agent` method. Session keys follow the format:

```
agent:<openclawAgentId>:clawtask:<taskId>
```

Agents authenticate to the Clawtask API using Bearer tokens issued at registration (shown once, hashed in DB).

### Comments and session cleanup

Agents use the authenticated comments API. Run completion is observed through agent.wait; done task sessions archive only when the gateway reports no active work. See [lifecycle and recovery rules](docs/gateway-session-lifecycle.md).

---

## Getting Started

### Prerequisites

- Node.js compatible with Next.js 16. Local lifecycle verification used Node 26.9.0 on Darwin arm64; quality CI uses Node 20.
- OpenClaw gateway running locally
- An OpenClaw agent configured (e.g. `main`)

### Install & Run

```bash
git clone https://github.com/your-org/clawtask
cd clawtask
npm install
npm run dev
```

App runs at `http://localhost:3333`.

The SQLite database is created automatically at `~/.clawtask/clawtask.db` on first run.

### Register an Agent

1. Go to **Settings** in the sidebar.
2. Click **Add Agent**.
3. Enter the agent's `openclawAgentId` (e.g. `main`).
4. Click **Probe** to verify connectivity.
5. Copy the API key — it's shown only once.

### Assign a Task to an Agent

Create a task, open it, set the assignee to your registered agent. The adapter dispatches it immediately.

---

## API Reference

All responses follow the envelope:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/tasks` | List tasks (filterable by status, assignee, etc.) |
| `POST` | `/api/v1/tasks` | Create task |
| `GET` | `/api/v1/tasks/:id` | Get task |
| `PATCH` | `/api/v1/tasks/:id` | Update task fields (triggers agent dispatch on assignee change) |
| `DELETE` | `/api/v1/tasks/:id` | Delete task |
| `POST` | `/api/v1/tasks/:id/status` | Set task status |
| `POST` | `/api/v1/tasks/:id/assign` | Assign task |
| `POST` | `/api/v1/tasks/:id/cancel` | Cancel in-progress task |
| `GET/POST` | `/api/v1/tasks/:id/comments` | List or post comments |
| `GET` | `/api/v1/tasks/:id/activity` | Activity log |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/agents` | List agents |
| `POST` | `/api/v1/agents` | Register agent |
| `POST` | `/api/v1/agents/:id/probe` | Probe agent connectivity |

### Realtime

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/sse` | SSE stream for real-time UI updates |

---

## Caveats

- **Single-user only**: One human, no interactive login. API writes use Bearer credentials. Keep the app on a trusted network; this is not a multi-user security boundary.
- **Single OpenClaw instance**: The adapter connects to one gateway. Multi-gateway not supported.
- **No horizontal scaling**: The SSE subscriber set and adapter singleton are in-process. Running multiple Next.js instances will break realtime and dispatch.
- **Agent must use the API**: The adapter dispatches tasks via a prompt that includes the API key and endpoint. The agent is expected to call the Clawtask API itself to post comments and update status. Agents that don't follow instructions may leave tasks stuck in `in_progress`.
- **No true agent interruption**: Cancel resets DB state and posts a stop comment, but cannot forcibly kill a running agent turn mid-stream. The agent will see the cancellation when it next polls task state.
- **Next.js dev server singleton caveat**: The `AdapterService` is stored in `globalThis`. Hot-reloads in dev mode do not re-initialize it. If adapter code changes, restart the dev server manually.

---

## Known Issues

- **Uncertain runs pause**: Timeout or unknown acceptance retains ownership. Bounded gateway observations can expire; recovery needs operator verification, not automatic resubmission. See dispatch/sessionCleanup in task API responses.
- **Run ends without a task outcome**: Work pauses for review. Inspect dispatch and sessionCleanup fields. Cancel or a status change does not prove a gateway run ended and does not clear retained ownership.
- **Probe status not live**: Agent probe status is only updated when you click Probe in Settings. It does not automatically reflect WS disconnections.

---

## Design Decisions

See [DECISIONS.md](./DECISIONS.md) for the full record of architectural and implementation choices made during development.

---

## Tech Stack

- [Next.js 16](https://nextjs.org/) — App Router, API routes, SSR
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Synchronous SQLite
- [ws](https://github.com/websockets/ws) — WebSocket client for gateway adapter
- [OpenClaw](https://openclaw.ai) — AI agent gateway


## Database upgrade

Startup adds two tables: task_dispatches for durable work admission and run ownership, and task_sessions for original gateway identity and cleanup state. Existing tasks, comments, and activity are unchanged. No separate migration command is required. Startup does not scan and archive historical done tasks.

## Manual production verification

Johnny owns the main push and deployment. Before deployment, save the current image digest and take a consistent SQLite backup, including WAL state if applicable. Confirm quality CI passes for the exact deployed commit. Publishing latest alone does not establish this.

1. Confirm application health and gateway probe.
2. Johnny creates a harmless task and assigns it manually. Require one API comment and done status.
3. Confirm one dispatch, one comment, and archive only after the run ends. Clawtask must stay done.
4. Johnny adds one human followup. Confirm restore before dispatch, the same session ID and transcript, one reply, and archive after completion.
5. Confirm the browser receives comments without reload.
6. Run a harmless blocked task. Confirm both assignee fields clear, no repeat dispatch, and its session stays unarchived.
7. Johnny marks that blocked task done. Confirm its original session archives.
8. Confirm a second queued task starts only after the active run ends.

If a check fails, pause new assignments and followups. Verify all accepted runs and pending dispatches before reverting to the saved image digest. The old app can leave the additive tables in place, but it does not honor their ownership or recovery rules. Do not restore the database automatically or discard uncertain work. Keep failure evidence for diagnosis.

Local evidence and limits: docs/plans/session-lifecycle.md. Node 20 CI and container behavior are separate from the completed Node 26 local checks.
