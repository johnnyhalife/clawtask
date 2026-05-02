# Clawtask — Known Issues

All previously tracked issues resolved as of 2026-05-02 — verified end-to-end in production.

---

## Resolved

### A1: Adapter singleton *(resolved)*
`globalThis.__clawtask_adapter` pattern already in place. Dev HMR does not break the singleton in practice. Non-issue.

### B1: Agent never receives API key *(resolved)*
Adapter reads raw `apiKey` from DB and injects into dispatch prompt. Verified working.

### B2: Unauthenticated agent calls attributed to human *(resolved)*
Consequence of B1. Resolved.

### B3: SSE broadcasts missing enriched author object *(resolved)*
Agent author lookup added before `broadcastSse`. Verified working.

### B4: Human-attributed agent comment triggers re-wake loop *(resolved)*
Consequence of B1. Resolved.

### B5: Human comment doesn't re-spawn agent after task is done *(resolved)*
Consequence of B1. Resolved.

---

## Open

UI polish items TBD — functionality is solid.
