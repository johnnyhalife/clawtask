# Issue detail navigation

All Issues defaults to Todo, In Progress and Blocked, sorted by updated time descending.
Previous/Next follows that default collection and the saved clawtask:groupBy preference,
including status, priority, assignee, project, completed date and no grouping.
The shared list helpers define group order and sorting. Equal sort values use task UUID as a stable tie-breaker.
Detail does not retain temporary list search, project/tag filters, custom sort or custom status selections.

The task-list API accepts repeated statuses parameters (OR within the selection).
The existing singular status parameter still works and intersects with statuses when both are supplied.
Filtering happens before the count and pagination. Page must be a positive integer; limit is 1–500.
Both All Issues and detail fetch every matching page. Refresh cancels an older request and disables
navigation until the new complete collection is ready. An API failure leaves navigation disabled.
This is a single-process live collection, not a database snapshot across HTTP requests.

Creation, update, deletion and SSE reconnect refresh the collection. task.deleted contains the task UUID;
a detail page for that UUID returns to All Issues. Closed, missing, deleted and subtask identities have no
neighbors in the default top-level open collection. A route transition cannot use the previous task identity.
Left/right arrows only navigate when unmodified and not already handled, while outside editors and pickers.
At a boundary, the corresponding button is disabled and the arrow is not consumed.

Automated regression coverage is in tests/issue-navigation.test.ts and tests/task-filters.test.ts.

## Local verification — 2026-10-09

On Node 26.9.0, using HOME=/tmp/clawtask-pr7-validation-home: npm test passed 124/124;
npm run typecheck, npm run build and git diff --check passed. The build only generated
next-env.d.ts, which was restored. No adapter, lifecycle or Probe code was changed.
No browser smoke was run for this branch: no disposable app for this build was started;
the existing local apps were left untouched. Node 20 CI and React Doctor remain remote gates.
