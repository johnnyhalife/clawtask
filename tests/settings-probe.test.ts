import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the actual narrow UI handler without adding a DOM runner dependency.
const source = fs.readFileSync('src/app/settings/SettingsPageClient.tsx', 'utf8');
const start = source.indexOf('  const handleProbe = async () => {');
const end = source.indexOf('  const handleDelete', start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(request: () => Promise<unknown>) {
  const errors: (string | null)[] = []; const probing: boolean[] = []; let updates = 0;
  const apiPost = async (url: string, body: unknown) => {
    assert.equal(url, '/api/v1/agents/test-agent/probe'); assert.deepEqual(body, {});
    return request();
  };
  const run = new Function('agent', 'apiPost', 'setProbing', 'setProbeError', 'onUpdated',
    handler + '; return handleProbe;')({ id: 'test-agent' }, apiPost,
      (value: boolean) => probing.push(value), (value: string | null) => errors.push(value), () => updates++);
  return { run, errors, probing, updates: () => updates };
}
test('Probe displays gateway error returned in successful API envelope', async () => {
  const f = fixture(async () => ({ probeError: 'Invalid gateway challenge' })); await f.run();
  assert.deepEqual(f.errors, [null, 'Invalid gateway challenge']);
  assert.deepEqual(f.probing, [true, false]); assert.equal(f.updates(), 1);
});
test('Probe success clears old error and reloads agent status', async () => {
  let attempt = 0; const f = fixture(async () => ++attempt === 1 ? { probeError: 'First failure' } : {});
  await f.run(); await f.run();
  assert.deepEqual(f.errors, [null, 'First failure', null, null]);
  assert.deepEqual(f.probing, [true, false, true, false]); assert.equal(f.updates(), 2);
});
test('Probe clears old feedback while request is pending', async () => {
  let release!: (value: unknown) => void;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.run(); assert.deepEqual(f.errors, [null]); assert.deepEqual(f.probing, [true]);
  release({}); await pending; assert.deepEqual(f.probing, [true, false]);
});
test('Probe displays thrown API or transport error and releases busy state', async () => {
  const f = fixture(async () => { throw new Error('Network failed'); }); await f.run();
  assert.deepEqual(f.errors, [null, 'Network failed']);
  assert.deepEqual(f.probing, [true, false]); assert.equal(f.updates(), 0);
});
test('Probe provides fallback for unknown or empty errors', async () => {
  for (const error of [null, 'failure', new Error('')]) {
    const f = fixture(async () => { throw error; }); await f.run();
    assert.deepEqual(f.errors, [null, 'Probe failed']); assert.deepEqual(f.probing, [true, false]);
  }
});
test('Probe renders an accessible alert and escapes gateway text', () => {
  const alertStart = source.indexOf('<p className="mt-1 text-xs text-red-600 break-all" role="alert">');
  assert.ok(alertStart >= 0);
  const alert = source.slice(alertStart, source.indexOf('</p>', alertStart) + 4);
  assert.ok(alert);
  assert.ok(source.includes('{probeError && ('));
  const render = ts.transpileModule('const render = () => (' + alert + ');', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const element = new Function('React', 'probeError', render + '; return render();')(React, '<script>bad</script>');
  const html = renderToStaticMarkup(element);
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('Probe: &lt;script&gt;bad&lt;/script&gt;'));
  assert.equal(html.includes('<script>'), false);
});
