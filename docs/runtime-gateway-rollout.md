# Gateway runtime qualification and rollout

## Compatibility policy

OpenClaw 2026.10.5 is the minimum semantic baseline for task runtime preparation.
Qualified releases are 2026.10.5 and every plain YYYY.M.P release at or above
**2026.10.8**. The range is a deliberate choice: the audited surface (sessions.create,
sessions.describe, sessions.patch and agent admission) did not change in meaning
between .8 and 2026.11.1, and a per-release allowlist stopped all dispatches after
each Gateway update. Skipped releases (.6/.7), releases below .8, and prerelease or
custom labels (for example 2026.11.1-dev, 2026.11.1+custom, v2026.11.1) stay
unqualified. The authenticated hello must also
advertise sessions.create, sessions.describe, sessions.patch and agent. Every
actual row and receipt must independently satisfy [the runtime verifier](task-runtime.md).
A version match is never evidence of lifecycle proof, provider availability or
successful execution. Unsupported gateways block even tasks with both settings
at Default, retaining the same pending work with zero agent submissions.

Do not implement a .4 receipt-only/null-revision fallback. Maintaining obsolete
semantics is not worth weakening original-identity or admission fencing. Keep
independent dynamic model/thinking defaults and the non-admin session-only
mutation boundary instead of replacing Default with a snapshot.

## Immutable .8 source audit

The release tag v2026.10.8 resolves to commit

`dc2523e5a5c7a309517fd7fa834add938231d526`.
The source review qualifies the following wire semantics; it does not claim a
running .8 Gateway or live provider has been tested.

- [Protocol 4](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/packages/gateway-protocol/src/version.ts).
- [Create schema](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/packages/gateway-protocol/src/schema/sessions-create.ts) accepts key, agentId and idempotencyKey. With no message/task/attachments,
  [initial-turn resolution](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/session-create-initial-turn.ts) reports no initial turn;
  [create](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/sessions-create.ts#L580-L665) returns the committed sessionId and runStarted. No titleSource is sent, so
  [background naming](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/chat-send-background.ts#L56-L69) also does not invoke a model. Unknown create acknowledgment still requires a durable hold, not replay.
- [Full row projection](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/session-utils-row.ts#L541-L605) includes actual stored lifecycleRevision, canonical model/runtime, raw thinking,
  supported levels and thinkingDefault. [Thinking resolution and patch receipt](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/session-utils-model.ts#L597-L658) preserve catalog-optional receipt metadata; full describe remains authoritative.
- [Nullable patch schema and expectations](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/packages/gateway-protocol/src/schema/sessions-patch.ts#L48-L116) support both clears and identity/revision preconditions;
  [target validation](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/sessions-patch-expectations.ts#L61-L95) rejects changed stored identity/revision.
  [Patch semantics](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/sessions-patch.ts) clear thinking and preserve the existing revision on ordinary runtime edits.
  [Public receipt projection](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/config/sessions/session-entry-projection.ts#L30-L77) does not strip revision or model-default provenance.
- [Non-admin sticky policy](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/session-model-selection-policy.ts) only permits config persistence for admin authority. Runtime preparation keeps
  its separately signed operator.write connection; never add admin fallback or new grants.
- [Backend request constraint](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/agent-turn/agent-request-preflight.ts#L48-L58) and
  [identity/revision comparison](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/server-methods/agent-expected-session.ts#L65-L83) remain enforced against
  [the latest stored entry at admission](https://github.com/openclaw/openclaw/blob/dc2523e5a5c7a309517fd7fa834add938231d526/src/gateway/agent-turn/agent-admission-controller.ts#L129-L149).

The prior immutable .5 audit is retained in [task-runtime.md](task-runtime.md).
These constraints are not a preference/config lock; do not concurrently edit a
task session outside Clawtask during preparation/admission.

## Immutable 2026.11.1 source audit

The release tag v2026.11.1 resolves to commit

4ffdd2047d192dd65554de3c8c46c0e0197c6e2a.
The review compares the fifteen source files audited for .8 (commit dc2523e5a5c7a309517fd7fa834add938231d526) at both commits. It qualifies the wire semantics below. It does not claim a live provider was tested.

- Unchanged: the protocol version file (protocol 4), the expected-session constraint comparison (agent-expected-session.ts) and the non-admin sticky model policy (session-model-selection-policy.ts).
- Create: the schema adds only optional communication and deviceFolder fields. A request with key, agentId and idempotencyKey and no message, task or attachments still resolves no initial turn, so create makes no model call. Mention validation moved to a helper and runs only when mentions are present. Required cloud-worker preparation is a no-op unless the Gateway config sets cloudWorkers.requiredProfile. Clawtask sends no titleSource, so background naming does not invoke a model.
- Row projection: full rows still include the stored lifecycleRevision, canonical model and runtime, raw thinking, supported levels and thinkingDefault. thinkingLevel now reports the raw stored value and effectiveThinkingLevel the resolved value. Undefined fields are omitted. Clawtask readback uses thinkingLevel ?? thinkingDefault.
- Patch: the schema adds only optional communication, sidebarRoot and organization expectations. Expectations still reject a changed stored identity or lifecycle revision. A null model resets to the configured default with default provenance. A null thinkingLevel deletes the stored value. A string thinkingLevel is validated against the effective profile. An existing session keeps its revision; only a new identity receives one.
- Admission: backend agent admission still enforces expectedExistingSessionId and the lifecycle revision against the latest stored entry. It re-reads that entry after it acquires the session work lease and checks again.

The range gate covers 2026.11.1 and later releases. If a later release changes the audited surface, the runtime verifier row, receipt and revision proofs still fail closed and keep work pending. Add a new audit section here and raise the range floor or add an exclusion in the same change.

The rollout procedure below applies unchanged.

## Revisionless legacy policy

An additive application or Gateway upgrade is **not** proof that an old session
has acquired a valid revision. The .8 row projection copies stored revision; the
ordinary patch initializes one only for a new identity, not an existing legacy
session. Therefore:

1. Preserve the original task/session/run bindings, accepted owner, counters,
   pending followups, cleanup state and creation-intent holds. Existing accepted
   runs are reconciled only; never reconfigure or repeat them during recovery.
2. A bound idle session with absent/empty revision stays pending with
   runtime_preparation_failed, no runtime patch and no agent submission. Reopen
   and queue wakes must preserve the same dispatch and binding.
3. Do not clear ownership, fabricate a UUID, adopt a replacement, reset/recreate
   the session, sweep historical rows, or use receipt-only/null-CAS admission.
4. Recovery is an explicit operator hold. An operator must establish original
   identity and accepted-run/terminal state, then separately approve and verify
   a Gateway-supported same-identity recovery procedure before retrying.
   This change provides **no automatic migration or manual reset API**. If no
   supported recovery can prove the same identity, the hold remains unresolved.
   Upgrading to .8 alone must never be presented as a repair.

## Owner-controlled rollout and acceptance

This is a procedure, not authorization to execute it. Local tests use temporary
SQLite databases and fake Gateways. No production data is a test fixture.

1. **Authorize separately:** owner chooses the exact qualified Gateway build,
   deployment window, candidate Clawtask commit and harmless test scope. Confirm
   source/build provenance and authenticated *running* hello/methods; package
   version alone is insufficient. Never expand grants/defaults to make tests pass.
2. **Checkpoint and hold:** prevent new admissions through the deployment's
   established operator procedure; drain or explicitly hold accepted/uncertain
   work and pending followups. Record original bindings/owners/counters, take
   consistent SQLite and Gateway-state backups, record previous image/build
   digests and establish a rollback window. Do not terminate accepted work to
   manufacture an idle state.
3. **Qualify in isolation:** after explicit permission, use a separate .8 test
   Gateway and test Clawtask DB/config, not the chat-hosting Gateway. Verify the
   non-admin connection, full rows/receipts, actual supported thinking and native
   runtime without changing global/agent defaults. Re-run Default and explicit
   overrides on the exact candidate; do not label signed fake-socket results as
   this gate. Do not install plugins or copy production credentials/state.
4. **Initial Default:** one authorized harmless task, both overrides null; record
   sanitized task/session/run IDs, actual version/methods, effective model/thinking,
   one submission, unique marker and terminal evidence. Verify real authenticated
   HTTP comment/status callbacks where required; SSE/model prose is not a callback.
5. **Same-session followup:** complete and archive only after terminal idle proof.
   Ask the human for the actual followup; restore the same sessionId, admit one
   reply, verify terminal completion and rearchive. Never fabricate human input.
6. **Existing Default:** include an existing bound revision-bearing session and
   prove it survives the additive upgrade without replacement or replay. Include
   an isolated revisionless fixture and prove it holds without patch/submission,
   including after restart. Any live legacy repair requires its own authorization.
7. **Deploy only after permission:** exact-head local gates and Quality CI must
   pass, and live evidence/legacy holds must be reviewed. For the Gateway hosting
   this chat, only the owner performs the supported update flow; this task does
   not run an update/restart or change its service/configuration.
8. **Rollback:** stop new admission, drain or explicitly hold accepted work first.
   Retain original owners and pending followups. Revert to recorded builds only
   after confirming schema/data compatibility; do not restore an older DB over
   work accepted since backup. If accepted ownership cannot be reconciled, stop
   with the explicit hold instead of resetting state.

## Reproducible local gates and evidence limits

Run npm test, npm run typecheck, npm run build, git diff --check and
npm run test:browser. Browser suites use temporary HOME/loopback servers and
synthetic API/SSE; the combined command covers both scroll and runtime flows.

runtime-contract.test.ts tests exact release/method/build boundaries.
runtime-transport.test.ts uses real signed loopback WebSockets with synthetic
.5/.8-shaped responses, Default/override create/existing single submissions and
missing proof/security negatives. runtime-control.test.ts proves revisionless
holds survive database reopen without replay. Existing readback, transport,
API/migration and lifecycle regressions remain mandatory.

Source audit plus these tests qualifies the client-side contract boundary. It
is **not** a full .8 installation, live-provider acceptance, deployment, physical
mobile-device test, or proof that every .5/.8 session/provider can dispatch.
