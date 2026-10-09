# Clawtask contributor guide

## Scope

Single-user Next.js application, one SQLite database, one application process, and one OpenClaw gateway. Read CONTRIBUTING.md and DECISIONS.md before changes.

## Required checks

Run npm test, npm run typecheck, npm run build, and git diff --check. Tests must use isolated databases and fake gateways. Real gateway tests require authorization and harmless test tasks. Never use production data for local tests.

## Lifecycle rules

- Agent comments use the authenticated API only. Gateway stream output never writes comments. Keep browser SSE updates.
- Save dispatch identity before submission. One active or uncertain dispatch owns each agent.
- Timeout, connection loss, or unknown acceptance does not release ownership or permit resubmission.
- Human comments and pending followups are saved atomically. Process followups in admission order.
- Archive only done tasks after terminal run evidence, no pending work, and an idle gateway session. Task status remains done.
- Restore and confirm the original session before reopening and dispatching a followup. Never create a replacement session in recovery.
- Blocked clears both assignee fields on every status route and does not dispatch. A blocked task session stays unarchived until the task is marked done.
- Preserve stale-socket guards and one reconnect timer per connection.
- Log IDs, events, and fixed failure codes, never credentials or prompt/comment contents.

## Schema and recovery

Startup adds task_dispatches and task_sessions with CREATE TABLE IF NOT EXISTS. It does not delete historical records. See docs/gateway-session-lifecycle.md for observation budgets, identity constraints, and manual recovery boundaries.

## Release ownership

Johnny owns pushes to main and deployment. Do not push, publish, build Docker images, or deploy without explicit authorization. The main publish workflow can publish latest before the separate quality workflow completes; image publication is not test evidence.

Before deployment, record the previous image digest and take a consistent SQLite backup. Use README.md live-test checklist. Before rollback, stop new dispatches and establish that accepted runs have ended and followups are drained or explicitly held for recovery. Never clear owners to make rollback appear safe.
