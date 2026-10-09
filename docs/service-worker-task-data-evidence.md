# Service worker task-data follow-up (local only)

## Scope and evidence limits

The user reports missing task data in both Brave and Firefox. That is not dismissed
as an SSE-only or Firefox-only issue. These tests use disposable task fixtures,
not the user's tasks. They establish a reproducible failure mechanism and repair
error visibility; they do not establish the cause of the user's production failure.
No production API, real gateway, deployment, push, merge, container, process kill,
or existing app reconfiguration was used.

The prior SSE-only findings are in service-worker-sse-evidence.md. This follow-up
supersedes its proposed API routing policy: all /api/ paths now bypass the worker.

## Minimal policy

The previous worker proxied ordinary API GETs through respondWith(fetch(request))
and converted fetch rejection to JSON HTTP 503. It did not cache task data.
The new worker returns without respondWith for every /api/ path. This also covers
SSE, pagination, auth, detail, queries, and API paths ending in static extensions.
Non-GETs already passed through. Event-stream Accept requests still pass through.
Static cache-first and navigation network-first/offline fallback remain unchanged.
The cache name remains clawtask-v1; there is no wholesale purge or forced reload.

## Controlled browser failure

The managed browser is Brave (Chromium/CDP), not a separate Chrome test. Firefox
and Playwright Firefox are not installed, so local Firefox reproduction is unavailable.

At origin http://127.0.0.1:3452 the isolated proxy initially forwards the existing
fixture app3449, with the prior SSE-only worker. Browser response evidence records
ordinary tasks API responses with fromServiceWorker=true. SSE is already bypassed.
A disposable worker then rejects only /api/v1/tasks and its descendants. Under
that controlled worker, the old All Issues page renders zero and "No tasks found."
without a task-data error. This reproduces hidden data failure, not the unknown
production error.

The new Home shows loading while the full collection loads, and a visible alert
with Retry on failure. It does not label a failed/pending request an empty list.
Detail shows independent loading/error notices for the issue and navigation list,
on desktop and mobile. Its existing useApi hook clears the previous error on Retry.
The collection hook remains unchanged; stale neighbors stay disabled until a full
successful collection is available.

## Worker update plan for existing clients

1. Serve the changed /sw.js at its existing URL with revalidation (current assets
   used max-age=0). Keep scope and the existing static cache policy.
2. Registration now runs immediately at afterInteractive, with updateViaCache=none.
   A fresh baseline page hydrated successfully but had no registration: its inline
   afterInteractive script attached a load listener after load had already fired.
   The old listener can miss registration. A VM regression exercises late execution.
3. New installation uses existing skipWaiting. Activation now puts cache cleanup
   AND clients.claim into waitUntil, claiming only after cleanup completes.
4. Existing open documents can call their registration.update() or navigate/reload
   normally to trigger the browser update check. A permanently idle old document
   is not guaranteed immediate discovery without an update check.
5. Wait for the replacement active worker to be activated, not just the first
   controllerchange event. That event can precede completed activation or belong
   to another pending update. Verify the actual API response bypass afterward.
6. Takeover changes request routing without automatically reloading a document.
   Existing JS must be reloaded normally to obtain the new error UI. No controller
   reload loop was added. Do not clear the user's cache to conceal evidence.

Locally the update replaces the task-rejecting worker in an already open document.
A document marker proves no reload; clawtask-v1 retains a static sentinel and a
separate retired fixture cache is removed. Retry can recover after takeover.

## Pagination, cancellation, and compatibility

fetchTaskCollection requests limit=500 and consumes data.tasks, total, and limit.
The local API returns {ok:true,data:{tasks,total,page,limit}}. The checked PR7 parent
2b196c6 already returns these four pagination fields, so that known older revision
has the same envelope. That does NOT establish the running production image or
response. Older totals/filter behavior differs, so production compatibility remains
a separate check. No guessed compatibility fallback or hook dependency fix was made.

reload aborts the previous collection fetch and clears its result; unmount aborts
it too. A URL change stabilizes reload by URL string, not callback identity.
SSE errors retry the stream after three seconds but do not reload task data; first
connected also does not reload. Task mutations and successful reconnects after a
prior connection do reload, so a burst can cancel requests intentionally. Distinguish
those aborts from spontaneous loops before changing this policy.

## Reproduction artifacts (all disposable)

Root: /private/tmp/clawtask-data-verification

- proxy.cjs and proxy-state.json: loopback-only proxy3452 and selectable worker.
- fault-sw.js: controlled task rejection, not committed or used in production.
- check-before.cjs / browser-before.json: old API interception and hidden data failure.
- check-after.cjs / browser-after.json: new errors, worker replacement, pagination,
  SSE, preserved static cache, Retry, loading, and browser network evidence.
- app-final: isolated normal production build; new loopback app3453.
- home: copied fixture SQLite plus 505 unassigned todo fixtures; no agent admission.
- worker-before.log, test-final.log, build-final.log: independent gates.

Run check-before only with its baseline proxy state and fixture app3449; check-after
switches the proxy to fixed app3453. Both use the managed browser's existing local
CDP endpoint18800 and only origin3452. They do not navigate existing user tabs.
Initial harness failures (missed automatic registration, transient empty alert,
activation not yet complete, ambiguous heading, wrong row selector, retry overlap)
were inspected and corrected; they are not reported as application fixes.

Production remaining evidence: exact failing task URL, status/error and sanitized
pagination fields, deployed image SHA/digest, controller state and client asset
version in each browser. The broad bypass is verified locally; a user-specific
production blank-list fix is not yet verified.

## Final measured results and quality gates

- Before: 3/6 worker/registration regression tests pass, 3 fail (ordinary API
  bypass, cleanup/claim order, late registration). After: all 6 pass.
- Full npm test: 132 pass, 0 fail, 0 skipped on Node26.9.0.
- Isolated-HOME typecheck and normal production build pass; diff check passes.
- Actual Brave list: 507 open fixtures, all rendered; page1=500 and page2=7.
  Exactly two settled task collection responses during a 3.5-second observation,
  both HTTP200 and fromServiceWorker=false. No spontaneous reload/abort loop found.
  A first measurement included an overlapping detail Retry request; waiting for
  completed navigation-list loading isolates the two-page measurement.
- Task rejection: old Home hides the error and shows "No tasks found." New Home,
  desktop detail, and mobile detail show visible alerts and Retry.
- Completed worker takeover: activated, no waiting worker; original document
  marker retained. Current static sentinel retained, retired fixture cache removed.
  Existing document's issue and navigation Retry both recover without a reload.
- SSE: connected event, HTTP200, fromServiceWorker=false. An explicit EventSource
  close is logged as ERR_ABORTED; this is not a failed task-data request.
- Artificial REST delay: Home "Loading issues…" and detail "Loading issue…"
  are visible before success. Neither state is falsely presented as an empty list.
- Fresh origin3454 registers the updated worker automatically and becomes
  controlled without manual registration. Initial origin3453 failed registration
  because the disposable copy command nested public/public (sw.js404), NOT because
  the new registration script failed. Corrected public/contents copying before a
  new fixture server starts resolves that fixture-only setup error.
- Controlled-worker detail Next: NAV-001 -> PAGE-001. Previous -> NAV-001.

Additional artifacts: registration.json, neighbors.json, build-gate.log,
typecheck-gate.log. The corrected direct fixture is http://127.0.0.1:3454.
The prior proxy evidence stays on3452. Earlier fixture servers are left running
because process termination was explicitly excluded. Original apps3433/3434 and
fixture app3449 remain untouched.
