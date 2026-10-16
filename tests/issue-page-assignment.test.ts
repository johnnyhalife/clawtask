import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAssigneeChange } from '../src/lib/assignee-change';

test('successful issue-page assignment patches the selected assignee', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];

  const result = await executeAssigneeChange({
    taskId: 'task-1',
    assigneeId: 'agent-1',
    assigneeType: 'agent',
    patch: async (url, body) => {
      calls.push({ url, body });
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    url: '/api/v1/tasks/task-1',
    body: { assigneeId: 'agent-1', assigneeType: 'agent' },
  }]);
});

test('rejected issue-page assignment preserves the server error for UI feedback', async () => {
  const result = await executeAssigneeChange({
    taskId: 'task-1',
    assigneeId: 'agent-2',
    assigneeType: 'agent',
    patch: async () => { throw new Error('ASSIGNMENT_CONFLICT: agent is already assigned'); },
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'ASSIGNMENT_CONFLICT: agent is already assigned',
  });
});
