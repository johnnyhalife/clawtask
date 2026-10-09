# Clawtask session lifecycle — execution plan

Status: Approved on 2026-10-09. Steps 4–7 implemented and fake-gateway acceptance tests passed. Step 8 real-gateway/browser integration remains with the parent agent.

## Execution record — Step 1

- Branch: feat/session-lifecycle.
- Temporary test HOME: /tmp/clawtask-session-test.tp9L77/home.
- Runtime: Node v26.9.0. CI uses Node 20. No matching Node 20 binary was found at the checked Homebrew path.
- npm run typecheck: passed.
- npm run build: failed in the CSS/PostCSS step.
- package.json requests Tailwind ^3.4.3. package-lock.json locks 3.4.19. The installed copy is 4.3.0.
- The PostCSS configuration uses the Tailwind 3 plugin form. The installed Tailwind 4 package rejects that form.
- No source files, dependencies, gateway state, or production state changed. The application has not started.
- Proposed recovery: use npm ci to restore the locked dependencies, then repeat the isolated baseline. Do not change Tailwind configuration to accommodate the stale installed version.
- Johnny approved dependency recovery. npm ci completed successfully. Tailwind is now 3.4.19.
- Repeated npm run typecheck and npm run build: both passed. SQLite binding works.
- Local app started at http://127.0.0.1:3433, bound to loopback, with isolated HOME and test token. Process handle: warm-trail.
- GET /api/health: 200. Created local baseline task CWT-001. API comments stored correctly. Direct SSE verification received comment.added with the matching comment ID.
- Browser status and tabs queries worked. Opening http://127.0.0.1:3433/issues/cwt-001 failed with: browser navigation blocked by policy. No browser rendering result was obtained. Do not bypass this policy with another driver.
- npm ci reported 15 dependency vulnerabilities: 1 low, 2 moderate, 11 high, 1 critical. No npm audit fix or dependency upgrade was run. Exact findings require a separate audit review.
- No implementation source changes. No gateway tests, publication, or production writes. The local test server remains running.
- Johnny repaired configuration and allowed the loopback browser origin. Browser opened CWT-001. An API comment appeared once without reloading the page. Baseline gate passed.
- Added npm test with Node test runner and existing tsx. Tests use a temporary SQLite database. No model call or real gateway access.
- Removed handleAgentOutput, stream comment writes, and currentCommentId state. Exported AdapterService for test access without constructor side effects.
- Before the change, socket regression failed with five stored comments. After the change: 4/4 tests passed, type check passed.
- Updated CHANGELOG and DECISIONS for the comment-path change. The local server still runs the baseline build; it does not yet include changed code.
- Next: run-control, queue recovery, status rules, and lifecycle changes. Gateway API shape must be verified before implementation.

## Execution record — Steps 4–7

- Added durable dispatch outbox, unique per-agent owned-run constraint and tracked session cleanup state. Human comment and pending dispatch admission share one transaction.
- Initial and human followup work use one pump and matching-run completion path. Three waits per pump, six persisted observations per attempt; timeout, pending, yielded and uncertain acceptance retain ownership. Recovery never resubmits an uncertain accepted attempt.
- Terminal run without task outcome is outcome_required, not automatic redispatch. Task API responses expose dispatch and sessionCleanup evidence.
- Status POST, task PATCH and subtask PATCH share blocked rules and lifecycle notifications. Blocked still clears both assignee fields and never dispatches.
- Archive/restore use sessions.describe and sessions.patch with expectedSessionId. The installed schema and handlers support the planned contract. Active-state absence, missing/replaced identity and failed restore stop agent submission. Original identity is not adopted after an uncertain submission.
- Run submission also sends expectedExistingSessionId after restore. The installed agent schema supports this field; preflight allows it for the backend client mode already used by Clawtask, and admission checks the original entry identity. This closes replacement between restore and agent submission.
- Serialized lifecycle checks protect local races. Comment admission during archive remains pending and restores before dispatch. A queue wake during an existing pump is retained. Cleanup retries have a three-attempt budget; only tracked cleanup recovers after restart.
- Error plus close owns one reconnect timer. Deliberate disconnect retires callbacks. Generation guards ignore old sockets and handshake callbacks. A new URL-change regression exposed an infinite Map mutation iteration (the test process exhausted its heap). Snapshotting connection IDs fixed that fault. This is separate from the September 10 blocked loop.
- Red evidence: after correcting a fixture missing required apiKeyHash, the initial timeout test observed null owner instead of t; the cross-task followup test observed t instead of other. Both failed against the existing adapter. Final implementation passes them through the shared controller.
- Final fake/API/transport suite: 46/46 passing (32 lifecycle, 4 transport, 10 API/comment/status). No real gateway requests or model calls in this child.
- npm run typecheck: passed. git diff --check: passed.
- npm run build: passed with Node v26.9.0 and NEXT_TELEMETRY_DISABLED=1 in a copied source/dependency tree at /tmp/clawtask-lifecycle-build.Ovf4Ak/app, HOME=/tmp/clawtask-lifecycle-build.Ovf4Ak/home. This kept the parent server's .next directory and test HOME unchanged. CI still uses Node 20; that runtime was not tested locally.
- Existing warnings remain: experimental.instrumentationHook is obsolete; Browserslist data is old; Node test tooling emits module.register deprecation warnings. No dependency upgrades were made.
- Gateway dedupe audit: ordinary entries expire after 300000 ms and can be evicted above 1000 entries; active/future-expiry accepted entries have maintenance exemptions. No indefinite exactly-once or restart retention claim is made. See docs/gateway-session-lifecycle.md for inspected installed filenames and exact fields.
- Quality workflow now runs npm test. Production publishing is unchanged. No push, image build, deployment, gateway configuration change, default-model change, or production data mutation.
- Parent baseline server warm-trail / pid 94661 at 127.0.0.1:3433 was not stopped or modified. It still uses the old baseline build. next-env.d.ts remains an unrelated pre-existing generated modification and is not staged.
- Next: Parent starts a separate updated isolated app (or deliberately switches its own baseline), authenticates the local gateway, and executes Step 8 with test-only agent/task/session keys. Verify actual accepted/wait/describe/patch responses, same session ID/transcript after restore, one API/SSE comment, blocked routes and the next queued task. Do not publish until the separate production gate is approved.

## Goal

Use the API for agent comments. Track each run correctly. Archive a task session after completion. Restore the same session before a human follow-up.

Preserve the blocked-task fix in commit ca5276912abb1824a0d3e502a55cebb32b253077. That commit cleared both assignee fields and removed blocked from dispatch triggers. Do not attribute the September 10 loop to socket reconnection.

## Boundaries

- Work on a feature branch in ~/clawtask.
- Run the application locally without Docker.
- Use a temporary HOME, database, application port, and test credentials.
- Use the real local OpenClaw gateway for final integration tests.
- Use distinct Clawtask task IDs and session keys for test work only.
- Do not use production task records, agent API keys, or the production database.
- Do not change gateway configuration, default models, or normal sessions.
- Inspect gateway access before use. If a new device needs approval, report that requirement. Do not approve unrelated devices.
- Do not build Docker images, push branches, publish images, or deploy production in this plan.
- Do not delete historical comments or existing sessions.
- Stop at a failed acceptance gate. Report the failure and any required plan change.

## Step 1 — Establish an isolated baseline

1. Create the feature branch. Preserve unrelated local changes.
2. Check the available Node version against the CI runtime.
3. Create a temporary test directory and HOME. Do not use the normal Clawtask database.
4. Select unused local ports for the app and fake gateway.
5. Set CLAWTASK_PUBLIC_URL to the local application URL.
6. Configure test tokens and gateway access without printing secrets.
7. Run the existing type check and application build with isolated state.
8. Start the local application. Check health, task creation, API comments, and browser updates.

Acceptance: The local application works. Production state is unchanged. Baseline failures are recorded before implementation.

## Step 2 — Add automated test support

1. Add an npm test command using the existing TypeScript tooling and a test runner.
2. Use a temporary SQLite database and a fake gateway.
3. Inject gateway requests and test storage where required. Avoid a broad adapter rewrite.
4. Add controlled responses for accepted runs, completion, timeout, disconnect, and archive failures.
5. Add regression tests for the September 10 blocked-task fix.

Acceptance: Tests run without a real model or production access. Test state does not reach the normal database.

## Step 3 — Remove socket comment writes

1. Remove handleAgentOutput and its comment accumulation state.
2. Remove assistant-stream writes from the event handler.
3. Keep the gateway request, response, connection, and completion paths.
4. Keep API comments, activity records, and browser SSE updates.

Acceptance: Socket text, deltas, repeated frames, and NO_REPLY create zero comments. One API comment creates one comment and one activity record. The browser shows that comment once.

## Step 4 — Correct run ownership and follow-up delivery

1. Use one dispatch and completion path for initial work and human follow-ups.
2. Keep each task and run linked. Only the matching run can release its lock.
3. Check agent.wait results. A timeout does not release the lock or start another run.
4. Continue waits for the same run while the adapter owns it. Do not use unbounded retry loops.
5. On connection loss, retain the known run identity. Reconcile it before another dispatch.
6. Save pending human follow-ups in the database when the comments API accepts them.
7. Save a stable dispatch key before submission. Preserve it across recovery.
8. Process follow-ups through the per-agent queue. Do not replace another task's active run state.
9. Recover pending work after restart. Define and test the recovery rules against the gateway contract.
10. Report terminal runs without a task outcome. Do not automatically repeat that completed attempt.

Acceptance: Long runs do not cause duplicate dispatch. Follow-ups release their locks. Comments on another task wait. Two follow-ups retain their order. Restart and connection loss do not silently lose work or repeat accepted work.

## Step 5 — Apply status rules consistently

1. Add a shared status-change helper for the status route, task PATCH route, and subtask PATCH route.
2. Apply the blocked rule through each route: clear both assignee fields and do not dispatch.
3. Select explicit work states in the queue query. Exclude blocked tasks.
4. Notify the lifecycle owner when relevant task state changes through any supported route.
5. Keep existing API responses, activity records, and browser updates compatible.

Acceptance: Every supported status-change route preserves the blocked rule. Marking done through either task route schedules the same session cleanup. An idle task marked done also receives a cleanup check.

## Step 6 — Add archive and restore

Warning: Task status done is not proof that an agent run ended.

1. Use sessions.describe to read the actual response shape and session identity.
2. Confirm terminal run state before an archive check.
3. Under the task lifecycle lock, read current task status and pending follow-ups.
4. Archive only a done task with no pending follow-up and no reported active gateway run.
5. Call sessions.patch with archived: true and the observed expectedSessionId.
6. Before a follow-up, restore an archived session with archived: false and the observed identity.
7. Confirm restore success before reopening and dispatching the follow-up.
8. Keep the same session key and transcript.
9. If restore fails, keep the follow-up pending. Do not send it anyway.
10. If archive fails, keep the task done and record cleanup failure for bounded retry.
11. Treat a missing or changed session as an explicit recovery case. Do not silently create a replacement.
12. Serialize local archive, restore, and follow-up admission for each task.
13. Recover unfinished cleanup after restart. Do not archive historical completed tasks in bulk.

Acceptance: Done during an active run does not archive it. Completion archives once. A new comment restores before dispatch. A comment during archive is retained. Restore failure starts no run. A stale identity cannot mutate a replacement session. The Clawtask task stays done when its OpenClaw session is archived.

## Step 7 — Check transport failure paths

1. Test socket error followed by close.
2. Test deliberate disconnect and gateway URL changes.
3. Fix reconnect timer ownership if tests show duplicate retries or reconnection after deliberate disconnect.
4. Ignore callbacks from obsolete sockets.
5. Keep this fix separate from the historical September 10 loop diagnosis.

Acceptance: One persistent connection exists per test agent. Deliberate disconnect does not reconnect. Old callbacks cannot release or change a newer run.

## Step 8 — Verify against the real local gateway

1. Inspect and authenticate the local gateway connection.
2. Register a test agent record in the local Clawtask database. Use a configured gateway agent with test-only instructions.
3. Create disposable tasks that perform no external business actions.
4. Run this cycle: assign, API comment, done, archive, human comment, restore, reply, done, archive.
5. Verify the same gateway session ID and retained transcript after restore.
6. Verify task rows, comments, activity, gateway session state, logs, and browser updates.
7. Check blocked behavior with a harmless task that deliberately reports blocked.
8. Check that the next queued task starts after completion.
9. Use controlled fake-gateway tests for failures that cannot safely be induced on the live gateway.

Acceptance: Record evidence for the full cycle and blocked regression. Label fake-gateway results separately from real-gateway results. Never claim that a simulated result proves real gateway behavior.

## Step 9 — Documentation and release handoff

1. Add logs for task ID, run ID, dispatch, waits, queue events, archive, restore, and failures.
2. Exclude tokens, prompts, and comment contents from logs.
3. Update CHANGELOG under Unreleased, DECISIONS, and stale adapter guidance.
4. Add tests to the quality workflow. Do not change production publishing without separate approval.
5. Run npm test, npm run typecheck, and npm run build.
6. Review the diff and commit separate logical changes.
7. Give Johnny the commits, test results, integration evidence, and remaining limitations.

Acceptance: All gates pass. The working changes have tests and documentation. No production publication occurs.

## Separate production gate

The existing main-branch workflow publishes latest without waiting for the separate quality workflow. Do not push or merge this work until the production release sequence is approved. Container verification and k3s deployment are separate from this local execution plan.
