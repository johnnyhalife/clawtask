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
  vm.runInNewContext(fs.readFileSync(process.env.SW_SOURCE || 'public/sw.js', 'utf8'), {
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

test('all API requests bypass worker fetch, fallback, and caches', () => {
  const sw = worker(async () => { throw new TypeError('offline'); });
  for (const path of ['/api/v1/tasks?page=1', '/api/v1/tasks/nav-001', '/api/config.js', '/api/v1/sse']) {
    assert.equal(sw.dispatch(path), undefined);
    assert.equal(sw.dispatch(path, { method: 'POST' }), undefined);
  }
  assert.equal(sw.requests.length, 0);
  assert.deepEqual(sw.cacheCalls, []);
});

test('static cache-first requests still intercept', async () => {
  const sw = worker();
  assert.equal(await (await sw.dispatch('/_next/static/probe.js'))?.text(), 'network');
  assert.deepEqual(sw.cacheCalls, ['match']);
  assert.equal(sw.requests.length, 1);
});


test('activation awaits cache cleanup then client takeover, retaining current cache', async () => {
  const handlers = new Map<string, (event: any) => void>();
  const calls: string[] = [];
  vm.runInNewContext(fs.readFileSync(process.env.SW_SOURCE || 'public/sw.js', 'utf8'), {
    self: { addEventListener: (type: string, handler: any) => handlers.set(type, handler),
      clients: { claim: async () => { calls.push('claim'); } }, skipWaiting() {} },
    caches: { keys: async () => ['clawtask-v1', 'old-cache'], delete: async (name: string) => { calls.push('delete:' + name); } },
  });
  let lifetime: Promise<unknown> | undefined;
  handlers.get('activate')!({ waitUntil: (promise: Promise<unknown>) => { lifetime = promise; } });
  await lifetime;
  assert.deepEqual(calls, ['delete:old-cache', 'claim']);
});

test('late afterInteractive registration does not depend on a missed load event', () => {
  const source = fs.readFileSync(process.env.LAYOUT_SOURCE || 'src/app/layout.tsx', 'utf8');
  const script = source.match(/__html: \x60(if\('serviceWorker'[\s\S]*?)\x60/)![1];
  const calls: any[] = [];
  vm.runInNewContext(script, { window: { addEventListener() {} }, navigator: { serviceWorker: { register: (...args: any[]) => { calls.push(args); return Promise.resolve(); } } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/sw.js');
  assert.equal(calls[0][1].updateViaCache, 'none');
});
