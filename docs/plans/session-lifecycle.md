# Clawtask session lifecycle — execution plan

Status: Approved on 2026-10-09. Steps 4–7 implemented and fake-gateway acceptance tests passed. Step 8 live followup, browser continuity, blocked routes and next-task queue checks passed. Parent-owned chronological server log review remains before the docs commit.

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


## Step 8 — 2026-10-09 real-gateway check

- Started the updated standalone build at http://127.0.0.1:3434 with a new isolated HOME at /tmp/clawtask-lifecycle-build.Ovf4Ak/live-home. Process handle delta-haven.
- Health check returned 200. Registered a test-only main-agent record in the local database.
- Gateway port is omitted from the on-disk config; corrected the test URL to the default ws://127.0.0.1:18789.
- Used the token from the on-disk gateway configuration in the isolated app. Probe failed: unauthorized: gateway token mismatch (provide gateway auth token).
- No task was dispatched. Real archive/restore and transcript continuity are not verified.
- Do not restart the gateway or replace its token to accommodate this test. Obtain the running gateway credential through approved setup, then repeat the probe.
- The two isolated local servers remain running. No push, image build, deployment, or production data change.

### Step 8 continuation — initial live cycle passed; browser gate failed

- User configured the baseline gateway connection. Parent copied only gateway URL and authentication into the updated isolated database; updated probe passed. This supersedes the earlier token-mismatch blocker. Gateway configuration was not changed.
- Parent dispatched LOCALTEST-001 once: task 616e884f-f376-4d48-92d5-15394f30f178, run 8bd21394-f50b-4595-91be-7bd0c47f2cc7. The continuation did not redispatch it.
- API GET confirmed task done, dispatch null, cleanupPending=0, cleanupAttempts=1, errorCode=null. Comments GET returned exactly one agent message, LIFECYCLE_INITIAL_OK, comment 16b0ba9d-62f1-48c9-9dfd-9da559808fa1. Activity contained exactly one agent commented event and the in_progress-to-done transition.
- Read-only isolated SQLite inspection confirmed one dispatch, state completed, attempts=1, matching run ID, no error. Stored original session ID: 49f68bb8-2472-4be2-875a-608865b26fa9.
- Real gateway agent.wait returned terminal evidence with endedAt and terminal reply. Real sessions.describe returned the same session ID, archived=true, hasActiveRun=false, status=done, endedAt=1791561211414, lastRunId matching the initial dispatch. Initial completion/archive gate passed.
- Browser gate FAILED at http://127.0.0.1:3434/issues/localtest-001. Page remained at Issues… / No messages yet / PROPERTIES Loading…; visible initial marker count=0. A browser-origin GET to /api/v1/tasks/localtest-001 returned HTTP 200, ok=true, task done, so task lookup itself works.
- Three script resources referenced by the page returned HTTP 404, content-type text/plain: /_next/static/chunks/0ghv~-5lzvz-t.js, /_next/static/chunks/0xwi65jm~oq5v.js, and /_next/static/chunks/turbopack-132go9rn714ci.js. This prevents claiming browser rendering or SSE success. Likely isolated standalone asset staging issue; no fix attempted.
- Stopped at the failed acceptance gate as required. No human follow-up submitted; restore, transcript continuity, follow-up comment, blocked/no-redispatch and next queued task remain untested on the real gateway. Existing fake-gateway results remain separate.
- No implementation changes, owner/counter resets, process kills, gateway changes, publication or deployment. Parent must report this failed gate and authorize the local test-harness asset correction before continuing. Browser label clawtask-lifecycle-live was opened in the available managed browser because its initial tab list did not contain the parent-reported tab.


### Step 8 continuation — approved asset repair, followup and blocked/queue checks

- Parent copied the standalone static assets and restarted only the updated test app. The same live-home/database/credentials were preserved. The hydrated browser now renders LOCALTEST-001 and its initial agent comment. The previous static-asset browser blocker is resolved. Both isolated app health endpoints, 3433 and 3434, returned 200; this child did not stop or change either server.
- Submitted exactly one human followup through the comments API using the existing UI bearer loaded from a local file and Headers.set. HTTP 201 created comment 0cc22eaf-d02b-4899-b503-47b5b5207d0c. The original task and initial run were not redispatched or reset.
- Before admission, real sessions.describe confirmed original session 49f68bb8-2472-4be2-875a-608865b26fa9 archived=true, hasActiveRun=false. During the followup a read-only observer confirmed that same session archived=false, hasActiveRun=true; the task reopened to in_progress and the followup owned run 256d3360-7276-41e3-a7a8-00daea21479c. During a later observation the task was already done while the run still owned the dispatch and archive remained pending. A read-only agent.wait timeout did not release ownership.
- Final real agent.wait for followup returned status=ok, startedAt=1791562385679, endedAt=1791562409549 and a terminal receipt with the original session ID. Real sessions.describe then returned that same ID, archived=true, hasActiveRun=false, lastRunId=256d3360-7276-41e3-a7a8-00daea21479c. SQLite contained exactly two completed dispatch rows, initial and followup, each attempts=1 and errorCode=null. Cleanup was pending=0, attempts=1, errorCode=null; the task remained done.
- SQLite contained exactly three comments: the original agent marker, one human followup, and one agent LIFECYCLE_FOLLOWUP_OK comment 5260bb8d-20ab-475b-91fa-497dbdf021e6. Activity contained two agent commented events total, the human admission, the done-to-in_progress reopening and the second in_progress-to-done transition. Gateway terminal prose did not become extra socket comments.
- Browser tab clawtask-lifecycle-live was not reloaded or navigated during followup. performance.timeOrigin stayed 1791562292561.4. Its exact paragraph-node counts were initial=1 and followup=1; the human comment and restored in_progress state appeared live, then the agent reply and Done appeared live. Counts exclude marker text quoted in the description/human instructions.
- Sanitized sessions_history for the original session key, explicitly anchored to sessionId 49f68bb8-2472-4be2-875a-608865b26fa9 and original final message 7b902807-efda-45a7-bd41-9d358c0e349b, retained that original message and subsequent followup entries. The latest bounded history also included followup final message 6342db45-084b-47b6-90c5-273daf9b6311 with run 256d3360-7276-41e3-a7a8-00daea21479c. History reported truncation: this is proof of those retained entries, not an exhaustive transcript export.
- Local HTTP blocked-route checks passed for status POST (task 0f71611f-b853-4c95-8864-fb6bf62defda), task PATCH (38bc5e48-6134-4352-b695-74188b12fd68), and subtask PATCH (7675c944-6d48-4f48-9a96-05a5a377ec7e, parent 7a8fca94-3c2e-420f-b57b-647ff9cb4368). Each returned blocked with assigneeId=null, assigneeType=null and dispatch=null. The isolated DB contained zero dispatch rows for these route fixtures.
- Real gateway deliberate blocked test LOCALTEST-006: task 7f826fcb-2457-4d82-b55c-e0f74ad63946, run c402232c-0984-4b8f-939a-7c69cc756915, session 10bdc40c-25e9-48f1-b555-d6968ead6ec8. One agent comment LIFECYCLE_BLOCKED_OK, ID 5fb4a5f2-4cf0-4510-8e8c-7b1693e2c19c. Final task blocked, both assignee fields null; exactly one completed dispatch, attempts=1, errorCode=null. Real wait returned ok, endedAt=1791562512404. Session idle and not archived, as expected for blocked rather than done. No redispatch occurred through completion of the next task.
- Next queued task LOCALTEST-007: task 13ed8ed5-b2d9-4dd9-8ba6-164a912dce9f, run 1aae08de-a87a-463e-8b9a-05f0764a55c7, session 6f4d019f-501c-4b30-902e-1c1ce6e6fd2a. It stayed todo with no dispatch while the blocked run owned the agent. Its dispatch was created at 2026-10-09T16:15:12.426Z, after blocked endedAt 16:15:12.404Z. Real wait startedAt=1791562512483, endedAt=1791562534315, status=ok. Exactly one agent comment LIFECYCLE_QUEUED_OK, ID 7b8b8e48-acec-4862-963a-f1ab10c61ba9; one completed dispatch, attempts=1, errorCode=null. Final task done, session archived=true/hasActiveRun=false, cleanup pending=0/attempts=1/errorCode=null.
- Test harness notes, not product failures: the first followup observer queried a nonexistent sequence column after the single successful admission. It stopped without resubmitting; subsequent observers used rowid. New queue fixtures defaulted to backlog and correctly did not run until explicitly moved to todo. No owner or attempt counter was reset. These observations must not be represented as application failure or duplicate work.
- Evidence files on this host: /tmp/clawtask-followup-evidence.log (before/admission), /tmp/clawtask-followup-after.log (active identity/timeout), /tmp/clawtask-followup-final.log (terminal/archive), /tmp/clawtask-queue-evidence.log (route and queue transitions), /tmp/clawtask-blocked-final.log and /tmp/clawtask-queued-final.log (real terminal/session evidence). Temporary read-only gateway observers use the existing adapter handshake, suppress its queue pump and auto-pair method, and issue only sessions.describe/agent.wait. They disconnect their own observation sockets when finished.
- Repeated npm test: 46/46 passing. npm run typecheck and git diff --check passed. No source change required; the prior isolated build remains the build evidence. Node 20 remains untested locally. Controlled fake failure paths remain separate from these real-gateway successes.
- Remaining evidence boundary: restore-before-submit is enforced by the inspected prepare/pump path (sessions.patch confirmation and nonarchived idle describe precede reopening and agent admission), and real same-identity restore was observed. This observer did not capture the application's raw restore patch response or its exact pre-admission idle snapshot. The parent-owned keen-harbor process log is not visible to this child (process.log reported no session). Parent must check restored before accepted for task 616e884f-f376-4d48-92d5-15394f30f178/run 256d3360-7276-41e3-a7a8-00daea21479c, and subsequent terminal/archived events, to close the chronological log-review gate. No new run or session mutation is needed.
- Documentation left uncommitted until that parent-only log-review gate is closed. Only docs/plans/session-lifecycle.md was edited here; generated next-env.d.ts remains unrelated and must be excluded. No push, gateway configuration/restart, process kill, Docker image, deployment, production data write or unrelated outbound message.


### Parent log gate — passed

The preserved local app process keen-harbor logged LOCALTEST-001 events in this order: restored, accepted (256d3360-7276-41e3-a7a8-00daea21479c), wait, completed, archived. This confirms restore preceded followup admission in the real test. The queued task was accepted only after the blocked task completed.

Local execution plan complete. Automated checks: 46 tests, typecheck, build, diff-check passed on Node 26.9.0. Real initial dispatch, API comment, done/archive, human followup, same-session restore, reply, done/archive, live browser delivery, blocked status routes and next queued task passed. Node 20 CI and container/production release remain separate gates. No push, publication, Docker build or production deployment.
