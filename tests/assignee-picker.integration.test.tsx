import './dom-setup';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { AssigneePicker } from '../src/components/task/AssigneePicker';


beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).fetch;
});

type Patch = (url: string, body: { assigneeId: string | null; assigneeType: 'agent' | 'human' | null }) => Promise<unknown>;
const queries = () => within(document.body);

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function PickerHarness({
  layout = 'desktop',
  patch,
  afterSuccess = { id: 'new-agent', type: 'agent' as const, name: 'New agent' },
}: {
  layout?: 'desktop' | 'mobile';
  patch?: Patch;
  afterSuccess?: { id: string | null; type: 'agent' | 'human' | null; name: string | null };
}) {
  const [current, setCurrent] = useState({ id: 'old-agent' as string | null, type: 'agent' as 'agent' | 'human' | null, name: 'Old agent' as string | null });
  return <AssigneePicker
    taskId="task-1"
    assigneeId={current.id}
    assigneeType={current.type}
    assigneeName={current.name}
    humans={[{ id: 'me', displayName: 'Ez' }]}
    agents={[{ id: 'new-agent', displayName: 'New agent' }]}
    layout={layout}
    patch={patch}
    onRefresh={() => setCurrent(afterSuccess)}
  />;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('desktop picker sends authenticated PATCH, refreshes displayed assignment, closes, and releases loading', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (url === '/api/v1/auth/token') return { json: async () => ({ ok: true, data: { token: 'ui-token' } }) };
    return { json: async () => ({ ok: true, data: {} }) };
  };

  render(<PickerHarness />);
  fireEvent.click(queries().getByRole('button', { name: 'Assignee' }));
  fireEvent.click(queries().getByRole('option', { name: 'New agent' }));

  await flushUi();
  assert.equal(queries().getByText('New agent').textContent, 'New agent');
  assert.equal(queries().queryByRole('listbox'), null);
  assert.equal(queries().queryByRole('status'), null);
  assert.equal(queries().getByRole('button', { name: 'Assignee' }).hasAttribute('disabled'), false);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], {
    url: '/api/v1/tasks/task-1',
    init: {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ui-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: 'new-agent', assigneeType: 'agent' }),
    },
  });
});

for (const message of ['Unauthorized', 'ASSIGNMENT_CONFLICT: agent is already assigned']) {
  test(`rejection ${message.includes('CONFLICT') ? '409' : '401'} remains visible, preserves assignment, and releases loading`, async () => {
    render(<PickerHarness patch={async () => { throw new Error(message); }} />);
    fireEvent.click(queries().getByRole('button', { name: 'Assignee' }));
    fireEvent.click(queries().getByRole('option', { name: 'New agent' }));

    await flushUi();
    assert.equal(queries().getByRole('alert').textContent, message);
    assert.equal(queries().getByText('Old agent').textContent, 'Old agent');
    assert.ok(queries().getByRole('listbox'));
    assert.equal(queries().queryByRole('status'), null);
    assert.equal(queries().getByRole('button', { name: 'Assignee' }).hasAttribute('disabled'), false);
  });
}

test('retry clears a prior error and then updates the assignment', async () => {
  let attempt = 0;
  render(<PickerHarness patch={async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('ASSIGNMENT_CONFLICT: agent is already assigned');
  }} />);

  fireEvent.click(queries().getByRole('button', { name: 'Assignee' }));
  fireEvent.click(queries().getByRole('option', { name: 'New agent' }));
  await flushUi();
  assert.ok(queries().getByRole('alert'));
  fireEvent.click(queries().getByRole('option', { name: 'New agent' }));

  await flushUi();
  assert.equal(queries().getByText('New agent').textContent, 'New agent');
  assert.equal(attempt, 2);
  assert.equal(queries().queryByRole('alert'), null);
  assert.equal(queries().queryByRole('listbox'), null);
});

test('pending request disables repeated mouse and keyboard selection', async () => {
  const pending = deferred<void>();
  let calls = 0;
  render(<PickerHarness patch={async () => { calls += 1; await pending.promise; }} />);

  const trigger = queries().getByRole('button', { name: 'Assignee' });
  fireEvent.click(trigger);
  fireEvent.click(queries().getByRole('option', { name: 'New agent' }));
  assert.equal(queries().getByRole('status').textContent, 'Updating assignee…');
  fireEvent.click(queries().getByRole('option', { name: 'New agent' }));
  fireEvent.keyDown(trigger, { key: 'Enter' });
  assert.equal(calls, 1);

  await act(async () => pending.resolve());
  await flushUi();
  assert.equal(queries().queryByRole('status'), null);
});

for (const layout of ['desktop', 'mobile'] as const) {
test(`${layout} picker supports keyboard selection and unassignment`, async () => {
  const calls: unknown[] = [];
  render(<PickerHarness
    layout={layout}
    afterSuccess={{ id: null, type: null, name: null }}
    patch={async (_url, body) => { calls.push(body); }}
  />);

  const picker = document.querySelector(`[data-layout="${layout}"]`);
  assert.ok(picker, `renders the ${layout} picker`);
  const trigger = queries().getByRole('button', { name: 'Assignee' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.keyDown(trigger, { key: 'Enter' });

  await flushUi();
  assert.equal(queries().getByText('No assignee').textContent, 'No assignee');
  assert.deepEqual(calls, [{ assigneeId: null, assigneeType: null }]);
  assert.equal(queries().queryByRole('listbox'), null);
});
}
