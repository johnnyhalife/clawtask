# Contributing to Clawtask

Clawtask is a lightweight, self-hosted task tracker for AI agent workflows. Contributions are welcome, but this project optimizes for small, reviewable changes over large rewrites.

## Development setup

Prerequisites:

- Node.js 20 or newer
- npm
- A local OpenClaw gateway if you are testing agent dispatch

```bash
git clone https://github.com/johnnyhalife/clawtask.git
cd clawtask
npm install
npm run dev
```

The app runs at `http://localhost:3333`.

The SQLite database is created automatically at `~/.clawtask/clawtask.db`.

## Change discipline

Keep changes small and explicit.

- One logical change per commit.
- One logical change per pull request.
- Do not mix refactors with behavior changes.
- Document user-visible behavior changes in `CHANGELOG.md` under `Unreleased`.
- Record architectural decisions in `DECISIONS.md` when the reason matters beyond the diff.
- Avoid drive-by formatting changes unless the PR is explicitly about formatting.

If a change cannot be described in one sentence, split it.

## Commit messages

Use Conventional Commits:

```text
<type>(<scope>): <subject>
```

Examples:

```text
feat(tasks): add queued status filter
fix(adapter): ignore stale run output
docs(readme): clarify gateway setup
chore(deps): bump react-markdown
```

Preferred types:

- `feat` — user-visible feature
- `fix` — user-visible bug fix
- `docs` — documentation only
- `test` — tests only
- `refactor` — code restructure without behavior change
- `build` — build or dependency changes
- `ci` — GitHub Actions or release automation
- `chore` — maintenance

Use a breaking marker when required:

```text
feat(api)!: change task status response

BREAKING CHANGE: `/api/v1/tasks/:id/status` now returns the updated task.
```

## Pull request expectations

A PR should answer four questions:

1. What was the change trying to accomplish?
2. What actually changed?
3. How was it tested?
4. Does it change user-visible behavior, API behavior, data shape, or deployment behavior?

If the answer to #4 is yes, update the relevant docs or changelog.

## Quality gates

Before opening a PR, run:

```bash
npm run typecheck
npm run build
```

If you touched behavior, also test the relevant flow manually in the app.

For agent-related changes, verify at least one task assignment round trip:

1. Register/probe an OpenClaw agent.
2. Assign a task to that agent.
3. Confirm output streams into the task comment thread.
4. Confirm task status transitions correctly.

## Scope boundaries

Current scope:

- Single-user deployment
- Single OpenClaw gateway
- SQLite persistence
- In-process SSE and adapter service

Out of scope unless explicitly discussed first:

- Multi-tenancy
- Public internet auth model
- Horizontal scaling
- External notification systems
- Multi-gateway orchestration

## Review principle

The computer should clear the cosmetics before a human reviews the decision.

Formatting, type checks, build health, and narrow scope should be handled before review. Human review should focus on intent versus outcome: what the change was trying to accomplish, what it actually did, and whether that moves the system in the right direction.
