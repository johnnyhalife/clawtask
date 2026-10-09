# Issue detail navigation

All Issues includes every status by default (Backlog, Todo, In Progress, Blocked, Done and Archived), sorted by updated time descending.
Previous/Next follows that default collection and the saved clawtask:groupBy preference,
including status, priority, assignee, project, completed date and no grouping.
The shared list helpers define group order and sorting. Equal sort values use task UUID as a stable tie-breaker.
Detail does not retain temporary list search, project/tag filters, custom sort or custom status selections.
Done, Archived and Backlog remain eligible neighbors in the default collection.

## Project issue lists

Sidebar projects link to /?tab=all&projectId=<encoded ID>. Project/tag parameters select
the issue list even when tab is absent or inconsistent. The API scopes before pagination.
A visible heading and the active project link identify the selected project. Search and
clearing search keep that scope. Explicit status, priority, assignee, sort and grouping
selections remain in the mounted Home view across project and Pulse navigation.
A reload or detail round trip still starts with default filters; only grouping is persisted.
Backlog and Archived groups retain their existing collapsed defaults; expand them or use
no grouping to see the cards. All Issues clears project/tag scope, not explicit filters.

The task-list API accepts repeated statuses parameters (OR within the selection).
The existing singular status parameter still works and intersects with statuses when both are supplied.
Filtering happens before the count and pagination. Page must be a positive integer; limit is 1–500.
Both All Issues and detail fetch every matching page. Refresh cancels an older request and disables
navigation until the new complete collection is ready. An API failure leaves navigation disabled.
This is a single-process live collection, not a database snapshot across HTTP requests.

Creation, update, deletion and SSE reconnect refresh the collection. task.deleted contains the task UUID;
a detail page for that UUID returns to All Issues. Missing, deleted and subtask identities have no
neighbors in the default top-level all-status collection. A route transition cannot use the previous task identity.
Left/right arrows only navigate when unmodified and not already handled, while outside editors and pickers.
At a boundary, the corresponding button is disabled and the arrow is not consumed.

Automated regression coverage is in tests/issue-navigation.test.ts, tests/task-filters.test.ts
and tests/project-issues.test.ts. See [current local evidence](all-status-project-evidence.md)
for the all-status and project fixes, browser clicks and quality gates.

## Earlier navigation baseline verification — 2026-10-09

On Node 26.9.0, using HOME=/tmp/clawtask-pr7-validation-home: npm test passed 124/124;
npm run typecheck, npm run build and git diff --check passed. The build only generated
next-env.d.ts, which was restored. No adapter, lifecycle or Probe code was changed.
No browser smoke was run for that earlier branch: no disposable app for this build was started;
the existing local apps were left untouched. Node 20 CI and React Doctor remain remote gates.
