import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { AdapterService } from '../src/lib/adapter';

const agent = { id: 'handshake-test', openclawAgentId: 'test', displayName: 'Test' };
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyRaw = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(-32);
const identity = {
  deviceId: crypto.createHash('sha256').update(publicKeyRaw).digest('hex'),
  publicKeyRawBase64Url: publicKeyRaw.toString('base64url'),
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
function adapterFixture(): any {
  const adapter = Object.create(AdapterService.prototype);
  adapter.connections = new Map();
  adapter.deviceIdentity = identity;
  adapter.gatewayAuthToken = 'fake-handshake-token';
  adapter.processNextTask = () => {};
  return adapter;
}
function verifyConnect(params: any, ts: number) {
  assert.equal(params.minProtocol, 4);
  assert.equal(params.maxProtocol, 4);
  assert.equal(params.device.signedAt, ts);
  assert.equal(params.device.nonce, 'fake-nonce');
  const payload = ['v3', params.device.id, params.client.id, params.client.mode,
    params.role, params.scopes.join(','), String(ts), params.auth.token,
    params.device.nonce, params.client.platform, ''].join('|');
  assert.ok(crypto.verify(null, Buffer.from(payload), publicKey,
    Buffer.from(params.device.signature, 'base64url')));
  const wrongTimestamp = payload.replace('|' + String(ts) + '|', '|' + String(ts + 1) + '|');
  assert.equal(crypto.verify(null, Buffer.from(wrongTimestamp), publicKey,
    Buffer.from(params.device.signature, 'base64url')), false);
}
class Socket extends EventEmitter {
  readyState = 1;
  sent: any[] = [];
  close() { this.readyState = 3; this.emit('close'); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
}
async function probe(payload: unknown) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const frames: any[] = [];
  server.on('connection', socket => {
    socket.on('message', raw => {
      const frame = JSON.parse(raw.toString()); frames.push(frame);
      socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }));
    });
    socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload }));
  });
  const adapter = adapterFixture();
  const address = server.address() as { port: number };
  adapter.gatewayUrl = 'ws://127.0.0.1:' + address.port;
  try {
    return { result: await adapter.probeAgent(agent), frames };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
for (const ts of [0, 123456789, Number.MAX_SAFE_INTEGER]) {
  test('probe signs server timestamp ' + ts + ' with protocol 4', async () => {
    const { result, frames } = await probe({ nonce: 'fake-nonce', ts });
    assert.equal(result.ok, true); assert.equal(frames.length, 1);
    verifyConnect(frames[0].params, ts);
  });
  test('persistent connection signs server timestamp ' + ts + ' with protocol 4', async () => {
    const adapter = adapterFixture(); const socket = new Socket();
    adapter.createSocket = () => socket; adapter.connectAgent(agent);
    const conn = adapter.connections.get(agent.id);
    socket.emit('message', JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'fake-nonce', ts } }));
    assert.equal(socket.sent.length, 1); verifyConnect(socket.sent[0].params, ts);
    socket.emit('message', JSON.stringify({ type: 'res', id: socket.sent[0].id, ok: true, payload: {} }));
    await Promise.resolve(); assert.equal(conn.handshakeDone, true);
    adapter.disconnectAgent(agent.id);
  });
}
const invalid = [null, {}, { nonce: 'fake-nonce' }, ...[-1, 1.5, '123', null, Number.MAX_SAFE_INTEGER + 1].map(ts => ({ nonce: 'fake-nonce', ts })),
  ...['', '   ', 7, null].map(nonce => ({ nonce, ts: 123 }))];
for (const [index, payload] of invalid.entries()) {
  test('probe rejects malformed challenge ' + index + ' without connect', async () => {
    const { result, frames } = await probe(payload);
    assert.deepEqual(result, { ok: false, error: 'Invalid gateway challenge' });
    assert.equal(frames.length, 0);
  });
  test('persistent connection rejects malformed challenge ' + index + ' without connect', () => {
    const adapter = adapterFixture(); const socket = new Socket();
    adapter.createSocket = () => socket; adapter.connectAgent(agent);
    socket.emit('message', JSON.stringify({ type: 'event', event: 'connect.challenge', payload }));
    assert.equal(socket.sent.length, 0); assert.equal(socket.readyState, 3);
    adapter.disconnectAgent(agent.id);
  });
}
test('reconnect clears old challenge timestamp and signs the next challenge', async () => {
  const adapter = adapterFixture(); const sockets: Socket[] = [];
  adapter.createSocket = () => { const socket = new Socket(); sockets.push(socket); return socket; };
  adapter.connectAgent(agent); const conn = adapter.connections.get(agent.id);
  conn.challengeNonce = 'old-nonce'; conn.challengeTs = 123;
  adapter.doConnect(conn);
  assert.equal(conn.challengeNonce, null); assert.equal(conn.challengeTs, null);
  sockets[0].emit('message', JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'fake-nonce', ts: 111 } }));
  assert.equal(conn.challengeTs, null);
  sockets[1].emit('message', JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'fake-nonce', ts: 456 } }));
  verifyConnect(sockets[1].sent[0].params, 456);
  sockets[1].emit('message', JSON.stringify({ type: 'res', id: sockets[1].sent[0].id, ok: true, payload: {} }));
  await Promise.resolve(); adapter.disconnectAgent(agent.id); sockets[0].close();
});
