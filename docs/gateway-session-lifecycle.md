# Gateway session lifecycle and recovery

Contract inspected from the installed OpenClaw 2026.9.9 distribution on 2026-10-09. Fake-gateway tests are not real-gateway proof. Step 8 remains required.

## Verified requests and responses

- sessions.describe params: {key, agentId?}; includeDerivedTitles/includeLastMessage are optional. Response is {session:null} when missing, otherwise {session:{sessionId, archived, hasActiveRun, activeRunIds?, status, ...}}. activeRunIds may be omitted. Activity evidence is validated as described below; missing hasActiveRun alone is not proof of idle.
- sessions.patch accepts {key, agentId?, expectedSessionId?, archived:boolean}. expectedLifecycleRevision is also supported. Confirmed result is {ok:true, key, entry:{sessionId, archivedAt?, ...}}. Archived state is entry.archivedAt present. Identity is checked at commit and archive drains reject remaining authoritative work.
- agent accepts expectedExistingSessionId and expectedExistingSessionLifecycleRevision. Preflight requires client mode backend for these fields (Clawtask already uses backend). Its existing-session constraint rejects a missing or replaced entry before input admission. The adapter sends expectedExistingSessionId whenever it has recorded original identity, including restored followups.
- agent runId equals its supplied idempotencyKey (agent-request-preflight-RvlrwpA6.mjs:105). Accepted replies contain runId/status. The adapter never substitutes another run ID.
- agent.wait accepts {runId, timeoutMs}. Queue admission returns status:pending, timeoutPhase:queue, providerStarted:false. Observation timeout returns status:timeout. Snapshots can include endedAt, yielded, stopReason, pendingError, terminalReceipt and terminalReply. Timeout alone does not prove work ended.
- context.dedupe uses agent:<idempotencyKey>. Normal TTL is 300000 ms; maximum is 1000 entries. Active controller and future-expiry accepted entries are exempt; other entries are subject to TTL and oldest-entry eviction. This is not durable indefinite exactly-once delivery across gateway restart. Unknown submissions are never replayed.

Inspected installed dist files:

- sessions-Bw59kgfQ.mjs:2761 (describe schema)
- src-D2gvuSyP.mjs:2060–2146 (patch schema), :2933–2942 (agent identity schema), :3019–3022 (wait bounds)
- agent-request-preflight-RvlrwpA6.mjs:39, :88–96; session-delivery-queue-storage-o0JaOuSl.mjs:20–49 (backend identity constraint)
- sessions-read-DE2RieYZ.mjs:227–270 (describe handler)
- session-list-read-result-D0B9ahvS.mjs:162–176; session-row-prepared-read-Db5hRJag.mjs:538–542 (active projection)
- session-active-runs-DvEWGMwn.mjs (queued/live projection)
- sessions-mutations-HKY8Ix4B.mjs:217–340 and :503 (archive identity guards)
- agent-XuZuntjH.mjs:86–116; agent-turn-service-W_0N3NA0.mjs:4428–4492 (wait handler)
- server-maintenance-23cHNzIq.mjs:268–295; server-constants-BH_EolwD.mjs:10–11 (retention)


## Activity evidence compatibility

Status-only support was rechecked against OpenClaw 2026.10.3 on 2026-10-16 (installed distribution source, not a live Gateway experiment):

- `queued` and `running` are busy, never eligible for archive, restore, reopening or submission.
- Exactly `done`, `failed`, `interrupted`, `killed` and `timeout` are accepted terminal status-only values. These establish session activity only, not completion of a saved dispatch. In particular, session status timeout does not release durable ownership; agent.wait timeout remains uncertain as documented below.
- No other idle name is inferred. Unknown, future, empty, null, wrong-typed or absent activity evidence fails closed before identity binding or lifecycle mutation. A new Gateway status requires an explicit compatibility update.
- Legacy boolean-only hasActiveRun remains supported: true is busy, false is idle. Undefined fields count as omitted. A present malformed boolean or status is rejected even if the other field is valid.
- When both fields are supplied, both must be valid and agree on activity. Neither silently overrides a conflict. The supported Gateway projection replaces stale status with queued/running when active; contradictory fields therefore cannot authorize lifecycle actions.

Source evidence: sessions-read-DTN-THv_.mjs:327–365 presents sessions.describe through the session-row projection; session-row-prepared-read's projectGatewaySessionActiveRun returns active?.active and, when active, active.status or running; session-active-runs computes queued/running activity. types-BZlUzQZy.mjs:4–5 defines isTerminalSessionStatus with the five terminal values above. This is session status vocabulary, not the separate agent.wait result vocabulary.

Invalid evidence retains done status, cleanupPending and its bounded retry/error state, or the pending human comment/dispatch. It does not reset cleanup counters, clear owners, replace original sessionKey/sessionId, or resubmit uncertain work. Restore is checked again after patch confirmation before task reopening or agent submission. Recovery remains an explicit operator boundary, not an automatic bypass.

## Durable ownership

The comments API writes a human comment and its pending dispatch in one SQLite transaction. The dispatch ID is saved before submission and is the gateway idempotency key. Initial work and followups use one per-agent owner and completion path. FIFO comment admission order uses an increasing database sequence. An agent cannot dispatch another task while an accepted or uncertain attempt owns it.

Explicit agent assignment on todo/in_progress also saves admission in the assignment transaction. Assignment POST, task/subtask PATCH and assigned creation share run-store. After a completed blocked run, a human can comment while unassigned, set todo, then explicitly reassign the original agent. The latest unused non-empty human comment since the last dispatch becomes the continuation. Without a new comment, session identity checks still apply. Repeated identical assignments and pending/active attempts create no duplicate. Recovery/outcome_required or another agent's owner/session return 409 ASSIGNMENT_CONFLICT and roll back assignment. Assignment POST rejects tasks that remain blocked. Status-only changes never admit a retry; automatic polling still excludes every task with dispatch history.

A submission with a lost acknowledgement remains owned. Recovery only waits for its saved run ID. It never sends another agent request for that attempt. Restart recovers pending comments, owned runs, and explicitly tracked cleanup. It does not scan and archive historical done tasks.

Each pump performs at most three waits of 300000 ms. Each persisted attempt permits at most six waits in total. Pending, yielded, timeout, unknown results and transport failures keep ownership. Exhaustion is explicit recovery, not permission to repeat work. Terminal ok/error requires the matching run ID, endedAt and no yielded flag. A terminal run without done/blocked/archived task outcome is recorded as outcome_required and is not repeated.

Task GET/list responses include additive dispatch and sessionCleanup fields. These show retained work and failure codes without prompt or credential content. Logs contain task ID, run ID, event and fixed failure code only.

## Session lifecycle

Task done and gateway session archived are separate states. Done during an owned run does not archive. Idle done schedules a check through the same helper used by status POST, task PATCH and subtask PATCH. Blocked clears both assignee fields through all three routes and never dispatches. The initial work query selects only todo and in_progress.

Archive checks serialize with restore per task, check task status, pending dispatches and gateway hasActiveRun. Admission remains a synchronous durable database transaction: a comment received during a patch is retained, then restored before submission. A queue wake during an existing pump is remembered.

Archive uses the observed original sessionId as expectedSessionId. Restore must confirm ok, matching entry.sessionId and absent entry.archivedAt, then confirm describe is not archived or active before reopening the task. Missing, changed or unobserved original identity is recovery, never replacement creation. Patch failures retain pending comments or done status. Archive failures permit at most three checks; restart does not reset the counter. A successful restore resets the cleanup budget for that new cycle.

## Manual recovery boundary

Inspect dispatch.state/errorCode and sessionCleanup before intervention. Verify the saved run ID and original session identity with the gateway. An exhausted or uncertain run is intentionally held; no API for automatic resubmission is provided. Do not clear an owner or reset its counters merely because the task says done or describe says idle. The gateway may no longer retain a terminal observation. An operator recovery decision must first establish what was accepted and whether that work ended. This favors paused work over repeated business actions.

The implementation assumes one application process, SQLite, and one gateway. Local lifecycle locks do not promise cross-process serialization. Gateway expectedSessionId protects mutation identity, not end-to-end exactly-once execution.

## Transport

A persistent connection owns one reconnect timer. Error plus close does not schedule two retries. Disconnect removes the connection owner before closing the socket. Socket and handshake callbacks are generation guarded. Gateway URL replacement iterates a snapshot of agent IDs; deleting and reinserting into a live Map iterator otherwise repeats indefinitely. These fixes are independent of the September 10 blocked-task loop.
