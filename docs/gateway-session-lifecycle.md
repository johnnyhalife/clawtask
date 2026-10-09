# Gateway session lifecycle and recovery

Contract inspected from the installed OpenClaw 2026.9.9 distribution on 2026-10-09. Fake-gateway tests are not real-gateway proof. Step 8 remains required.

## Verified requests and responses

- sessions.describe params: {key, agentId?}; includeDerivedTitles/includeLastMessage are optional. Response is {session:null} when missing, otherwise {session:{sessionId, archived, hasActiveRun, activeRunIds?, status, ...}}. activeRunIds may be omitted. Missing hasActiveRun is never interpreted as idle.
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


## Durable ownership

The comments API writes a human comment and its pending dispatch in one SQLite transaction. The dispatch ID is saved before submission and is the gateway idempotency key. Initial work and followups use one per-agent owner and completion path. FIFO comment admission order uses an increasing database sequence. An agent cannot dispatch another task while an accepted or uncertain attempt owns it.

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
