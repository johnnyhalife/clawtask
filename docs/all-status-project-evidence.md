# All-status defaults and project lists — local evidence

Baseline: origin/main b20328b, after the service-worker data fixes (PR 11).
Branch: fix/all-issues-project-scope. Worktree: /private/tmp/clawtask-all-projects.

## Confirmed causes

- All Issues initialized statuses to Todo, In Progress and Blocked. Home sent those
  statuses to the API, and filtered the same statuses again in the browser.
- The project sidebar already set tab=all and projectId. Actual baseline clicks
  worked with current accessibility refs. The API correctly scoped the project,
  but the inherited status defaults hid Done, Archived and Backlog. A project
  containing only Done and Archived showed count 0 and No tasks found.
- Detail independently hard-coded the same three statuses in its collection URL.
- Home ignored projectId when tab was absent or Pulse. Search and clear-search
  rebuilt URLs without project/tag scope. Tab changes reset explicit filters.
- The project name was only in the document title, not a visible list heading.

The fix leaves the lifecycle, adapter, API pagination and service worker unchanged.
Sidebar project controls are now encoded semantic links. Scope determines the
issue view, search keeps scope, and mounted Home selections are not reset on tabs.
Detail retains its existing global-default-list contract, now with every status.

## Browser fixture evidence

Disposable production builds at 127.0.0.1:3451 (baseline) and :3455 (fixed).
Isolated fixture homes under /private/tmp/clawtask-all-projects-evidence.
No agents, gateway settings, dispatches or real task data were seeded.

Fixture: Alpha has Done + Archived; Beta has all six statuses; one task has no
project. All nine tasks are unassigned. Actual browser clicks verified:

- Baseline Alpha: project URL set correctly, count 0. Beta: count 3, only open statuses.
- Fixed Alpha: /?tab=all&projectId=alpha, heading Issues · Alpha complete,
  count 2, only Alpha cards. Expanding Archived displayed its archived card.
- Fixed Beta: projectId=beta, heading Issues · Beta mixed, count 6,
  no Alpha or no-project cards. Expanding Backlog displayed its backlog card.
- Explicit Done filter: Beta count 1; switching Alpha gave count 1;
  Pulse then Alpha retained that selection. Clear all restored Alpha count 2.
- Project search submitted with Enter: projectId=alpha&q=done, count 1.
  Clear-search removed q, retained projectId=alpha and restored count 2.
- All Issues cleared project scope, count 9. Choosing grouping None displayed
  all nine cards, including both Archived cards and the no-project Backlog card.
- Saved grouping None applied to detail. Next moved FIX-001 (Done) to FIX-002
  (Archived); Previous returned to FIX-001. First-item Previous was disabled.

Backlog and Archived retain the existing collapsed-group defaults. No grouping
or expansion shows their cards; these are not hidden status filters.

## Gates and limits

Node 26.9.0, isolated HOME: npm test passed 136/136; typecheck and production
build passed; git diff --check passed. Four new behavioral project tests cover
scope, completed-only projects, explicit filters, search and collections beyond
500 rows. Existing navigation tests now expect completed-status neighbors.
The final build also removes the stale Previous/Next open issue labels.

No production browser/API access, production writes, Docker, gateway connection,
process termination, remote push or deployment. Original :3433/:3434 untouched.
Node 20 CI and production deployment remain separate checks.
