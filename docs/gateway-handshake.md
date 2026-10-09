# Gateway handshake compatibility

Clawtask's backend operator client uses protocol 4. Probe, persistent connection,
and token-only pairing connections request minProtocol = maxProtocol = 4.
There is no protocol 3 fallback for this operator client.

For device authentication, both Probe and persistent connections sign the server's
connect.challenge.payload.ts and send that exact value as device.signedAt.
The timestamp must be a nonnegative safe integer. Missing, fractional, negative,
string, or unsafe values fail before a connect request is sent. The nonce must be
a nonblank string. A reconnect clears the saved challenge before accepting a new one.
The v3 device signature format is unchanged; it is not the transport protocol version.

## Contract evidence

Checked the installed OpenClaw 2026.9.9 package on 2026-10-09 without connecting to
or changing the live gateway:

- docs/gateway/protocol/versioning.md: operator clients use protocol 4.
- docs/gateway/protocol/auth.md: use the server challenge timestamp as signedAt.
- dist/client-B4O1WKhF.mjs: reference client validates a nonnegative safe integer
  challenge timestamp and uses it in the signed device payload.

Current main already offered maxProtocol 4, but its minimum was 3 and both device
handshakes still signed Date.now(). This patch only corrects that contract.

## Verification and limits

The handshake tests use a fake loopback WebSocket gateway for Probe and fake
sockets for persistent connections. They verify Ed25519 signatures against the
server timestamp, malformed challenge rejection, and reconnect reset/stale guards.
Use an isolated HOME for npm test and build to keep database/device files separate.
No production gateway, pairing approval, or task dispatch is needed for these tests.
The live gateway round trip and Node 20 CI remain separate release checks.

## Settings Probe feedback

Settings → Agents shows a failed Probe message beside the agent's probe status.
The message comes from the existing probeError API field or a thrown API/network
error. An unknown thrown value uses "Probe failed". A new attempt clears the old
message, and a successful response clears it. Messages are escaped React text in
an alert, not HTML. This feedback is local to the row and is not saved across reloads.

The UI regressions execute the actual handler with injected state setters and a
fake request, then render the actual alert fragment with React server rendering.
They cover returned errors, thrown errors, retry/success clearing, pending state,
and text escaping. They are not a full browser/DOM interaction test.

The humanRequested markers proposed in PR #6 are deliberately not included.
The current comment route authenticates the actor but persists humanRequested
from the request body without checking actorType. Adding UI markers alone would
not establish server-verified human intent. Followup admission already checks
actorType === 'human'; this patch leaves that behavior and all lifecycle rules intact.
