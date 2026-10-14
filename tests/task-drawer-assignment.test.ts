import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/components/task/TaskDrawer.tsx', 'utf8');

test('assignee updates use the authenticated API helper and surface failures', () => {
  const start = source.indexOf('const handleAssign');
  const end = source.indexOf('const timelineEndRef', start);
  const handler = source.slice(start, end);

  assert.match(handler, /await apiPatch\(`\/api\/v1\/tasks\/\$\{taskId\}`/);
  assert.doesNotMatch(handler, /await fetch\(`\/api\/v1\/tasks\/\$\{taskId\}`/);
  assert.match(handler, /setAssigneeError\(/);
  assert.match(source, /role="alert"/);
});
