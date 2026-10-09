# Service worker SSE investigation (local only)

Follow-up: [task-data investigation](service-worker-task-data-evidence.md) supersedes
the SSE-only proposed policy below and adds visible request failures.

## Scope and deployment evidence

PR7 merged at 2026-10-09T18:47:16Z. This work starts at main

`f4bc78d6c54cd8ab7e26352fbc8c8051a420520e`.

The user reported an SSE request that a service worker intercepted and failed.
Read-only public asset checks on 2026-10-09 at about 19:05Z found:

- Production /sw.js returned 200, public,max-age=0. Its bytes exactly matched main's worker. It had no SSE exclusion. Last-Modified was 18:47:33Z.
- The current production home HTML and all eleven referenced JS/CSS assets returned 200 with the expected MIME types. One JS chunk included PR7's collection error literal.
- This does not verify the cluster image SHA/digest or the user's cached HTML/chunks. No production API, task data, mutation, or gateway connection was used.

## Observed cause and local change

The shipped worker handled every same-origin API GET with respondWith(fetch(...)).
That included the indefinite /api/v1/sse stream. Its network failure fallback returned
JSON 503, which is not an event stream. This is a confirmed stream-routing defect,
not proof that it caused the user's missing All Issues page.

The local fix leaves /api/v1/sse (including query strings) and requests with an
Accept header containing text/event-stream to the browser. No respondWith, cache
lookup, proxy fetch, or JSON fallback runs for those requests. Ordinary API and
static/navigation cache policies stay unchanged. No hook change is justified yet.

## Actual browser reproduction and correlation

Managed Chromium, disposable SQLite HOME, no agents, gatewayUrl ws://127.0.0.1:9:

1. Original worker controlled the local production page. EventSource received the
   connected event successfully. The production console error was not naturally
   reproduced in Chromium.
2. A disposable worker deliberately rejected only /api/v1/sse requests. Browser
   EventSource reported error with that worker controlling the page. Opening issue
   detail and returning to All Issues mounted real hooks under the failing worker.
   Detail and All Issues still rendered. Task API requests still succeeded.
3. Replaced that disposable worker with the fixed /sw.js locally. It became active
   and EventSource received connected again. The fault worker source was moved out
   of public/ into the disposable fixture folder and is not committed.
4. Fixed production build at port3449 was controlled by fixed /sw.js. All Issues
   displayed in-progress/todo/blocked fixtures. Detail Next went NAV-001 -> NAV-002;
   Previous returned NAV-001. Deleted adjacent NAV-002 through the local API (200);
   SSE refresh made Next target NAV-003 rather than the deleted issue.

The fault injection is controlled evidence, not a recreation of the unknown
production worker failure. The browser tool error collector does not include
worker-console exceptions; EventSource's onerror result was observed directly.

## Collection hook relationship

useSse closes a failed EventSource and schedules retry after three seconds. It does
not reload the collection on error. First connected does not call reload either.
Only a connected event after a prior successful connection invokes onReconnect.
Task mutations also invoke reload. useTaskCollection clears stale data on reload,
then publishes the full successful collection. If that REST request also fails,
data stays null and Home currently does not show the hook error. Thus an SSE-only
failure does not explain a persistently empty list; repeated successful reconnects
plus failed/slow task requests could affect the list, but were not observed here.

## Cache/stale-asset inspection

clawtask-v1 caches static assets cache-first and navigation network-first with an
offline cache fallback. API responses are never cached. The worker has not changed
since the original PWA commit 939dd13, so PR7 did not introduce this interception.
The cache name is not build-versioned, so a client may retain older HTML/assets.
Current origin assets were healthy. A stale client cache or a browser-specific
stream failure remains possible, not established. No production cache was cleared,
no automatic page reload was added, and no broad cache-policy change was made.

## Regression tests and quality gates

Tests execute public/sw.js in a VM and dispatch actual fetch events:

- SSE endpoint/query bypass.
- Event-stream Accept bypass.
- Ordinary task API network-only/no-cache.
- Ordinary API network failure keeps its explicit offline response.

Before fix: 2 pass / 2 fail. After fix: npm test 128 pass / 0 fail / 0 skipped.
Isolated-HOME typecheck, standard production build, and git diff --check pass on
Node26.9.0. These VM tests are separate from the actual browser work above.

## Handles and remaining evidence

Worktree /private/tmp/clawtask-navigation-fix; branch fix/task-collection-refresh-loop.
HOME /private/tmp/clawtask-navigation-fixtures/home. Fixed build server
http://127.0.0.1:3449, exec salty-meadow, PID23485. Dev3447 exec tidal-mist and old
baseline server3448 exec tide-cloud remain running; no process was killed. Old
baseline server should not be used as immutable baseline after the shared build
output changed. Apps3433/3434 and original worktrees are untouched.

Still needed: failing browser family/version, exact failing page, task REST
request/error, controller script state, cached asset state and deployed image
digest. Do not claim this local SSE patch fixes the unverified missing-navigation
cause. No push, PR, merge, image build, or deployment was done.
