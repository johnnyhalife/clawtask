import { expect, type Page } from '@playwright/test';
const longDescription = Array.from({ length: 70 }, (_, i) => 'Paragraph ' + i + ': synthetic description with enough detail to overflow a small viewport.').join('\n\n')
  + '\n\nhttps://example.invalid/' + 'segment'.repeat(100);
export const markdown = longDescription + '\n\n' + ['~~~text', 'wide code '.repeat(100), '~~~', '', '| Column | Value |', '| --- | --- |', '| Long | ' + 'word'.repeat(150) + ' |'].join('\n');
export const makeComment = (i: number) => ({ id: 'comment-' + i, taskId: 'synthetic', authorId: 'human', authorType: 'human', author: { displayName: 'Test reader' }, type: 'message', content: 'Synthetic comment ' + i, createdAt: new Date(1700000000000 + i * 600000).toISOString() });

export async function fixture(page: Page, description = markdown, count = 45, longMetadata = false) {
  let task = { id: 'synthetic', issueId: 'TEST-001', title: longMetadata ? 'Synthetic long issue title '.repeat(8) : 'Synthetic scroll regression', description, status: 'todo', priority: 'medium', assigneeId: null, assigneeType: null, projectId: null, project: longMetadata ? { id: 'test-project', name: 'Synthetic project with a very long name', color: '#3189FF' } : undefined, tags: longMetadata ? Array.from({ length: 8 }, (_, i) => ({ id: 'tag-' + i, name: 'Synthetic long tag ' + i, color: '#3189FF' })) : [], subtasks: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  let comments = Array.from({ length: count }, (_, i) => makeComment(i));
  let failSend = false;
  const patches: Record<string, string>[] = [];
  await page.addInitScript(() => {
    const sources: any[] = [];
    (window as any).emitTestEvent = (event: unknown) => sources.forEach(s => s.onmessage?.({ data: JSON.stringify(event) }));
    (window as any).EventSource = class {
      onmessage: any; onerror: any;
      constructor() { sources.push(this); }
      close() { const i = sources.indexOf(this); if (i >= 0) sources.splice(i, 1); }
    };
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    let status = 200;
    if (url.pathname.endsWith('/auth/token')) data = { token: 'synthetic-browser-token' };
    else if (url.pathname.endsWith('/config')) data = { appName: 'Test workspace' };
    else if (url.pathname.endsWith('/comments')) {
      if (route.request().method() === 'POST') {
        if (failSend) status = 500;
        else comments = [...comments, { ...makeComment(comments.length), content: route.request().postDataJSON().content }];
      }
      data = comments;
    } else if (url.pathname.endsWith('/activity')) data = [];
    else if (url.pathname === '/api/v1/tasks') data = { tasks: [task], total: 1, page: 1, limit: 500 };
    else if (url.pathname.endsWith('/status') && route.request().method() === 'POST') {
      const patch = route.request().postDataJSON(); patches.push(patch); task = { ...task, ...patch }; data = task;
    } else if (url.pathname.startsWith('/api/v1/tasks/')) {
      if (route.request().method() === 'PATCH') { const patch = route.request().postDataJSON(); patches.push(patch); task = { ...task, ...patch }; }
      data = task;
    }
    await route.fulfill({ status, json: status === 200 ? { ok: true, data } : { ok: false, error: { message: 'Synthetic send rejected' } } });
  });
  await page.goto('/issues/test-001');
  await expect(page.getByRole('heading', { name: task.title })).toBeVisible();
  await expect(page.getByText('Synthetic comment ' + (count - 1), { exact: true })).toHaveCount(count ? 1 : 0);
  await expect(page.locator('.detail-mobile-shell')).toHaveCount(page.viewportSize()!.width < 768 ? 1 : 0);
  return {
    patches,
    async emit(type: string, data: unknown) { await page.evaluate(event => (window as any).emitTestEvent(event), { type, data }); },
    append() { const c = makeComment(comments.length); comments = [...comments, c]; return c; },
    failSend(value: boolean) { failSend = value; },
  };
}
