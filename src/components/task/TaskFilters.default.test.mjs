import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./TaskFilters.tsx', import.meta.url), 'utf8');
const homeContent = readFileSync(new URL('../../app/HomeContent.tsx', import.meta.url), 'utf8');
const issuePage = readFileSync(new URL('../../app/issues/[id]/IssuePageClient.tsx', import.meta.url), 'utf8');

test('All Issues default keeps Todo, In Progress, and Blocked selected', () => {
  assert.match(source, /getDefaultFiltersForTab/);
  assert.match(source, /\['todo', 'in_progress', 'blocked'\]/);
  assert.match(homeContent, /getDefaultFiltersForTab\(activeTab\)/);
});

test('the Issues breadcrumb returns to All Issues', () => {
  assert.match(issuePage, /\{\/\* Breadcrumb \*\/\}[\s\S]*?<Link href="\/\?tab=all"/);
});

test('issue detail provides open-issue previous/next navigation with arrow-key shortcuts', () => {
  assert.match(issuePage, /\/api\/v1\/tasks\?sort=updatedAt&order=desc&limit=500/);
  assert.match(issuePage, /\['todo', 'in_progress', 'blocked'\]/);
  assert.match(issuePage, /e\.key === 'ArrowLeft'/);
  assert.match(issuePage, /e\.key === 'ArrowRight'/);
  assert.match(issuePage, /Previous<\/button>/);
  assert.match(issuePage, /Next →<\/button>/);
});
