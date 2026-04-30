# Clawtask

A lightweight, self-hosted task tracker purpose-built for AI agent workflows. Built with Next.js 14, SQLite, and the OpenClaw gateway protocol.

---

## What It Is

Clawtask is a single-user task management tool where tasks can be assigned to either humans or AI agents. When a task is assigned to an agent, Clawtask connects to the OpenClaw gateway over WebSocket, dispatches the task, streams the agent's output into a comment thread, and tracks task state transitions automatically.

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
                                                        └── Agent (e.g. main/clawdio)
```

- **UI**: Dark-theme React app inspired by Linear. Real-time updates via SSE.
- **API**: REST endpoints under `/api/v1/`. Agents authenticate with a Bearer API key.
- **Adapter**: Singleton `AdapterService` maintains persistent WebSocket connections to OpenClaw per agent. Handles task dispatch, stream-to-comment, and task lifecycle.
- **DB**: SQLite via `better-sqlite3`. WAL mode. Stored at `~/.clawtask/clawtask.db`.

### Task Lifecycle

```
todo  ──[assigned to agent]──▶  in_progress  ──[agent marks done]──▶  done
                                     │
                              [human comments]
                                     │
                              [auto-reopens if done, re-dispatches to agent]
```

1. **Assignment**: Assigning a task to a registered agent triggers `assignTaskToAgent` in the adapter. This dispatches a prompt to the agent's OpenClaw session.
2. **Streaming**: The agent's output streams back via the gateway WS. Each agent turn (delimited by `stream: "job", state: "done"`) creates a new comment on the task.
3. **Completion**: The agent calls `POST /api/v1/tasks/:id/status` with `{ "status": "done" }` when finished.
4. **Human follow-up**: When a human posts a comment on a task, the adapter sends it to the agent as a follow-up (not a re-execution). If the task was `done`, it auto-reopens to `in_progress` before notifying the agent.
5. **Cancellation**: Cancel button resets task to `todo`, removes assignee, and posts a system comment informing the agent to stop.

### Agent Communication

The adapter sends structured prompts to the agent over the OpenClaw gateway WS using the `agent` method. Session keys follow the format:

```
agent:<openclawAgentId>:clawtask:<taskId>
```

Agents authenticate to the Clawtask API using Bearer tokens issued at registration (shown once, hashed in DB).

### Stream-to-Comment Mapping

The adapter listens for `stream: "assistant"` frames on the gateway WS. Chunks are accumulated into a single comment per agent turn. Turn boundaries are detected via `stream: "job", state: "done"` frames — each turn starts a new comment. RunId filtering ensures only output from the active task run lands in comments.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18 (tested on v25.9.0, Darwin arm64)
- OpenClaw gateway running locally
- An OpenClaw agent configured (e.g. `main`)

### Install & Run

```bash
git clone https://github.com/johnnyhalife/clawtask
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

- **Single-user only**: One human, no authentication. Designed for private network / Tailscale deployment.
- **Single OpenClaw instance**: The adapter connects to one gateway. Multi-gateway not supported.
- **No horizontal scaling**: The SSE subscriber set and adapter singleton are in-process. Running multiple Next.js instances will break realtime and dispatch.
- **Agent must use the API**: The adapter dispatches tasks via a prompt that includes the API key and endpoint. The agent is expected to call the Clawtask API itself to post comments and update status. Agents that don't follow instructions may leave tasks stuck in `in_progress`.
- **No true agent interruption**: Cancel resets DB state and posts a stop comment, but cannot forcibly kill a running agent turn mid-stream. The agent will see the cancellation when it next polls task state.
- **Next.js dev server singleton caveat**: The `AdapterService` is stored in `globalThis`. Hot-reloads in dev mode do not re-initialize it. If adapter code changes, restart the dev server manually.

---

## Known Issues

- **Comment separation requires `stream: "job"` frames**: If OpenClaw does not emit `job` stream events for a given model/session, all agent output will concatenate into a single comment. This has been tested with Claude (Anthropic) on OpenClaw.
- **Task stuck `in_progress` if agent crashes**: If the agent fails mid-task without calling the status API, the task remains `in_progress` indefinitely. Workaround: use Cancel to reset, or update status manually via the API.
- **Probe status not live**: Agent probe status is only updated when you click Probe in Settings. It does not automatically reflect WS disconnections.

---

## Design Decisions

See [DECISIONS.md](./DECISIONS.md) for the full record of architectural and implementation choices made during development.

---

## Tech Stack

- [Next.js 14](https://nextjs.org/) — App Router, API routes, SSR
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Synchronous SQLite
- [ws](https://github.com/websockets/ws) — WebSocket client for gateway adapter
- [OpenClaw](https://openclaw.ai) — AI agent gateway
