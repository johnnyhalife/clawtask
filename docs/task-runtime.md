# Task runtime defaults and overrides

Tasks (including subtasks) independently inherit the assigned agent's configured model and thinking by default. They do not inherit a parent task's runtime overrides. Prompt text is not runtime configuration.

## API and UI

Task/subtask creation and PATCH accept nullable `modelOverride` and `thinkingOverride` fields. Omitted creation fields are null. On PATCH, omitted fields stay unchanged; explicit null clears that field to Default. GET/list include persisted preferences. Example:

```json
{"modelOverride":"openai/example-model","thinkingOverride":"high"}
```

Model references must be provider/model, at most 256 characters, without whitespace or auth-profile selectors. Thinking accepts canonical IDs: off, minimal, low, medium, high, xhigh, adaptive, max, ultra. Syntax acceptance is not a guarantee that the Gateway provider/runtime supports the combination; runtime preparation checks that before submission. Invalid values return 400 INVALID_RUNTIME without partially changing the task or admitting work.

New Issue exposes independent Default/Override model and Default/thinking controls on desktop and mobile. Issue properties contains Edit runtime, Save runtime and Cancel. Choosing Default explicitly sends null. Failed saves keep the draft and error visible and never present the draft as persisted.

## Dispatch boundary

Before every initial dispatch and admitted human followup/explicit retry, Clawtask captures current preferences and their revision. Existing archive/restore, identity, activity and durable assignment guards still apply. Only an initial unbound session can be created, without message/task/title generation or a model call. Followups require the original session and never create a replacement.

Initial creation first commits a `task_sessions.creationPending` intent, then sends the no-execution create request. A complete successful acknowledgment (matching key, nonempty session ID and runStarted=false) synchronously binds that ID and clears the intent before any subsequent describe, patch or readback. Those later failures retain the binding across database reopen/restart, and retry rejects any replacement identity. Missing/partial acknowledgments, process loss between creation and binding, or binding persistence failure leave the durable intent unresolved: no automatic create replay, observed-session adoption or model submission is allowed, even if the key later exists. The same pending dispatch and counters remain intact with runtime_preparation_failed. This conservative uncertainty requires operator investigation of the original creation, not an automatic reset or invented identity proof. No new manual reset/recovery API is provided.

A separate bounded authenticated connection signs and requests only operator.write (which includes session reads). It uses the same device, authentication, protocol 4 and exact server challenge timestamp as the existing connection. It verifies the returned non-admin authority before any runtime mutation. There is no pairing, scope upgrade, admin fallback, reconnect timer or automatic request replay on this connection. The existing admin transport remains responsible for run control and archive/restore.

On the exact task session, the runtime connection describes idle identity, patches BOTH model and thinkingLevel (including explicit null defaults), then verifies patch and describe readback before changing the dispatch to submitting or calling agent. Patch carries expectedSessionId and an observed expectedLifecycleRevision when available. Verification checks canonical model/provider, runtime, effective thinking, supported explicit thinking and clear provenance. A reused Default session intentionally clears earlier model/thinking overrides. No configured global or agent default is edited.

An edit during preparation invalidates the captured revision; it leaves the same dispatch pending, without submitting. A later queue wake prepares the current settings. At the synchronous pending-to-submitting boundary the snapshot is saved with the dispatch under assignment/status/revision checks. Edits after that boundary affect subsequent dispatches only: they neither steer nor cancel the active run. Reconnect and uncertain-acceptance recovery only observe the saved owner/run; they do not reapply preferences or resubmit. Internal continuation/provider retry remains owned by the Gateway's accepted run and its runtime policy, not a new Clawtask dispatch. Clawtask does not introduce a model fallback or downgrade.

Preparation failures retain the same pending row with runtime_preparation_failed, original session identity and untouched wait counters; no agent call occurs. A later queue wake may retry safe session preparation only when creation is not unresolved; verified original bindings are never replaced. Acceptance uncertainty after submitting retains existing recovery ownership and never retries submission. Task done is still distinct from terminal run evidence.

## Required Gateway contract and security

Inspected OpenClaw 2026.10.3 installed protocol docs/source; this is not a live-Gateway execution claim. Required methods: sessions.create without execution, sessions.describe, sessions.patch with nullable model/thinkingLevel and identity preconditions, agent expectedExistingSessionId and optional expectedExistingSessionLifecycleRevision. Readback must expose resolved model/provider/runtime and effective thinking metadata; unsupported/older metadata fails closed rather than falling back to prompt-based selection. Non-reasoning providers that omit effective thinking metadata cannot be dispatched until their contract can be verified.

Why a second non-admin connection: an admin string-model sessions.patch can asynchronously persist configuration when agents.defaults.modelSelectionScope is agent/global and configuration is writable. A policy pre-read is not atomic with config reload. Signed non-admin authority structurally selects session-only persistence even under those configurations. Existing authorized admin device grants satisfy requested write/read; this feature does not add grants or change Gateway configuration.

Source references: gateway/protocol/rpc-session-control.md; concepts/models.md (modelSelectionScope); dist/src-l2dWvEsN.mjs (session/create/patch/agent schemas); operator-scope-compat; sessions-patch-model-selection and sticky-model-selection (persistence policy); session-utils-model (resolved thinking); agent-scope (public default provenance is null).

Identity CAS is not a lock against an external session writer or a promise that configuration/provider availability cannot change after readback. Session reset/replacement is rejected by the original identity constraint at agent admission. Do not externally modify task-session preferences during dispatch. Existing Gateway fallback policies, provider behavior and native continuation policy remain Gateway-owned; local fake-Gateway tests do not prove a live provider call's internal behavior.

## Local verification

Run npm test, npm run typecheck, npm run build and git diff --check. For the rendered desktop/mobile flows, install the development Chromium binary with npx playwright install chromium, then run npm run test:browser after build. Browser tests start their own ephemeral-port server with temporary HOME and intercepted synthetic API/SSE; they never use the live task database or Gateway. They verify creation, failed mutations/retry, explicit clears, persisted labels after reload and no page errors. Physical-device keyboard/safe-area behavior and real provider execution remain separate checks.

## Migration and rollback

Startup additively adds nullable task preferences, a runtime revision, nullable dispatch snapshot/revision columns and task_sessions.creationPending (default 0). Existing session bindings and cleanup state are preserved; historical rows are not inferred to have unresolved creation. Old/null task rows inherit defaults; historical dispatch ownership/state/counters remain unchanged. Existing accepted historical work is only reconciled, not reconfigured. No database replacement or historical sweep is performed. For an operator-approved downgrade, drain or explicitly hold accepted work first; keep a consistent database backup as described in gateway-session-lifecycle.md.
