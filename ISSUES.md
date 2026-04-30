# Clawtask — Known Issues

## Architectural

### A1: Adapter singleton broken in Next.js App Router
**Status:** Open  
**Priority:** Blocker — agent activation does not work reliably

Next.js 14 App Router isolates module state per-request. The `_adapter` singleton in `src/lib/adapter.ts` is a different instance in each route handler, so the WebSocket connection established in one route (e.g. SSE) is invisible to another (e.g. `POST /tasks`). Result: task assignment never dispatches to the agent.

**Fix:** Replace `npm run dev` with a custom `server.ts` that calls `adapter.init()` once at process start, then hands off to Next.js. All routes share the same Node process → singleton works. ~30 lines, no extra port needed.

---

## Bugs

### B1: Agent never receives its API key *(partially fixed)*
**Status:** Fix applied by subagent — needs verification  
**Priority:** Critical

`dispatchTask()` tells the agent to "use your agent key" but never provides it. The agents API returns the key redacted (`••••••`). The subagent added key injection — read raw key from DB, pass in wake message.

### B2: Unauthenticated agent calls attributed to human *(consequence of B1)*
**Status:** Resolves when B1 is fully verified  

When the agent has no key it calls Clawtask API without auth. The comment/status routes fall back to `actorType: 'human'` → all agent actions land as `johnnyhalife`.

### B3: SSE broadcasts missing enriched author object *(fixed)*
**Status:** Fixed by subagent  

`handleAgentOutput()` broadcast raw DB row without `author` object → UI showed UUID instead of "clawdio". Fixed: agent author lookup added before `broadcastSse` call.

### B4: Human-attributed agent comment triggers re-wake loop *(consequence of B1)*
**Status:** Resolves when B1 is fully verified  

Agent comment lands as `actorType: 'human'` → `notifyHumanComment` fires → agent woken again → loop. Partially mitigated: added `task.status !== 'done'` guard in comments route. Full fix requires B1.

### B5: Human comment doesn't re-spawn agent after task is "done" *(consequence of B1)*
**Status:** Resolves when B1 is fully verified  

Unauthenticated agent updates cleared the assignee field. `notifyHumanComment` checks `task.assigneeId` → null → silent. Full fix requires B1.

---

## Next Steps

1. Implement custom `server.ts` to fix A1 (blocker)
2. Test end-to-end with B1 fix in place (A1 must be working first)
3. Verify B3 fix renders "clawdio" correctly in the UI
