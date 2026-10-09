import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the shipped worker, not a duplicate of its routing policy.
function worker(network: typeof fetch = async () => new Response('network')) {
  const handlers = new Map<string, (event: any) => void>();
  const requests: Request[] = [];
  const cacheCalls: string[] = [];
  const self = {
    location: { origin: 'http://localhost' },
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
    skipWaiting() {}, clients: { claim() {} },
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self, URL, Response,
    fetch: (request: Request) => { requests.push(request); return network(request); },
    caches: {
      match: async () => { cacheCalls.push('match'); return undefined; },
      open: async () => { cacheCalls.push('open'); return { put: async () => {} }; },
    },
  });
  function dispatch(path: string, init?: RequestInit) {
    let response: Promise<Response> | undefined;
    handlers.get('fetch')!({ request: new Request('http://localhost' + path, init),
      respondWith: (value: Promise<Response>) => { response = value; } });
    return response;
  }
  return { dispatch, requests, cacheCalls };
}

test('service worker leaves the SSE endpoint and query requests to the browser', () => {
  const sw = worker();
  assert.equal(sw.dispatch('/api/v1/sse'), undefined);
  assert.equal(sw.dispatch('/api/v1/sse?probe=1'), undefined);
  assert.equal(sw.requests.length, 0);
  assert.deepEqual(sw.cacheCalls, []);
});

test('event-stream Accept requests bypass worker offline and cache policies', () => {
  const sw = worker();
  assert.equal(sw.dispatch('/api/other-stream', { headers: { Accept: 'text/event-stream' } }), undefined);
  assert.equal(sw.requests.length, 0);
  assert.deepEqual(sw.cacheCalls, []);
});

test('ordinary task API requests stay network-only and are never cached', async () => {
  const sw = worker();
  const response = await sw.dispatch('/api/v1/tasks?page=1');
  assert.equal(response?.status, 200);
  assert.equal(await response?.text(), 'network');
  assert.equal(sw.requests.length, 1);
  assert.deepEqual(sw.cacheCalls, []);
});

test('ordinary API network failures retain the explicit offline response', async () => {
  const sw = worker(async () => { throw new TypeError('offline'); });
  const response = await sw.dispatch('/api/v1/tasks');
  assert.equal(response?.status, 503);
  assert.deepEqual(await response?.json(), { ok: false, error: 'Offline' });
  assert.deepEqual(sw.cacheCalls, []);
});
