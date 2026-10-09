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
