import { test, expect, type Page } from '@playwright/test';

const longDescription = Array.from({ length: 70 }, (_, i) => 'Paragraph ' + i + ': synthetic description with enough detail to overflow a small viewport.').join('\n\n')
  + '\n\nhttps://example.invalid/' + 'segment'.repeat(100);
const markdown = longDescription + '\n\n' + ['~~~text', 'wide code '.repeat(100), '~~~', '', '| Column | Value |', '| --- | --- |', '| Long | ' + 'word'.repeat(150) + ' |'].join('\n');
const makeComment = (i: number) => ({ id: 'comment-' + i, taskId: 'synthetic', authorId: 'human', authorType: 'human', author: { displayName: 'Test reader' }, type: 'message', content: 'Synthetic comment ' + i, createdAt: new Date(1700000000000 + i * 600000).toISOString() });

async function fixture(page: Page, description = markdown, count = 45) {
  let task = { id: 'synthetic', issueId: 'TEST-001', title: 'Synthetic scroll regression', description, status: 'todo', priority: 'medium', assigneeId: null, assigneeType: null, projectId: null, tags: [], subtasks: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  let comments = Array.from({ length: count }, (_, i) => makeComment(i));
  let failSend = false;
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
    else if (url.pathname.startsWith('/api/v1/tasks/')) {
      if (route.request().method() === 'PATCH') task = { ...task, ...route.request().postDataJSON() };
      data = task;
    }
    await route.fulfill({ status, json: status === 200 ? { ok: true, data } : { ok: false, error: { message: 'Synthetic send rejected' } } });
  });
  await page.goto('/issues/test-001');
  await expect(page.getByRole('heading', { name: task.title })).toBeVisible();
  await expect(page.getByText('Synthetic comment ' + (count - 1), { exact: true })).toHaveCount(count ? 1 : 0);
  await expect(page.locator('.detail-mobile-shell')).toHaveCount(page.viewportSize()!.width < 768 ? 1 : 0);
  return {
    async emit(type: string, data: unknown) { await page.evaluate(event => (window as any).emitTestEvent(event), { type, data }); },
    append() { const c = makeComment(comments.length); comments = [...comments, c]; return c; },
    failSend(value: boolean) { failSend = value; },
  };
}
const owner = (page: Page) => page.getByRole('region', { name: 'Issue content' });
async function resizeIssue(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  // Browser protocol completion does not imply React's resize effect has committed.
  // Observe each branch transition before sending the next resize or scroll intent.
  const mobile = page.locator('.detail-mobile-shell');
  await expect(mobile).toHaveCount(width < 768 ? 1 : 0);
  if (width < 768) await expect(mobile).toHaveCSS('height', height + 'px');
}

async function scroll(page: Page, top: number) {
  await owner(page).evaluate((node, value) => { node.scrollTop = value; node.dispatchEvent(new Event('scroll')); }, top);
}
async function atBottom(page: Page) {
  await expect.poll(() => owner(page).evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
}
for (const [width, height] of [[1440, 900], [613, 749], [390, 844], [767, 749], [768, 749], [844, 390], [613, 320]]) {
  for (const [name, description] of [['long', markdown], ['short', 'Short description'], ['empty', '']]) {
    test(width + 'x' + height + ' ' + name + ': top, one owner, complete thread and composer', async ({ page }) => {
      await page.setViewportSize({ width, height });
      await fixture(page, description);
      const heading = page.getByRole('heading', { name: 'Synthetic scroll regression' });
      // Wait for initial layout/smooth scrolling to settle without using a new-only selector.
      await heading.evaluate(node => new Promise<void>(resolve => {
        let previous = Number.NaN, stableFrames = 0;
        const frame = () => {
          const top = node.getBoundingClientRect().top;
          stableFrames = top === previous ? stableFrames + 1 : 0; previous = top;
          if (stableFrames >= 5) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }));
      // Old-compatible geometry assertion proves clipping, not missing new markup.
      expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(owner(page)).toHaveJSProperty('scrollTop', 0);
      expect(await owner(page).evaluate(node => [node, ...node.querySelectorAll('*')].filter(el => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0).length)).toBe(1);
      expect(await heading.evaluate(node => node.closest('[aria-label="Issue content"]') !== null)).toBe(true);
      await owner(page).hover();
      await page.mouse.wheel(0, 450);
      await expect.poll(() => owner(page).evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await owner(page).focus();
      await page.keyboard.press('Control+End');
      await atBottom(page);
      await expect(page.getByText('Synthetic comment 44', { exact: true })).toBeInViewport();
      await expect(page.getByPlaceholder('Reply')).toBeInViewport();
      const reply = await page.getByPlaceholder('Reply').boundingBox();
      if (width < 768) {
        const nav = await page.locator('nav').boundingBox();
        expect(reply!.y + reply!.height).toBeLessThanOrEqual(nav!.y);
      }
      await scroll(page, 0);
      await expect(heading).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await heading.evaluate(node => { let p = node.parentElement; while (p) { if (getComputedStyle(p).overflowY === 'hidden' && p.scrollTop !== 0) return false; p = p.parentElement; } return true; })).toBe(true);
    });
  }
}

for (const width of [1440, 390]) {
  test(width + ': incoming follows only at bottom, edits/activity do not yank, jump and send are deliberate', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await fixture(page);
    await scroll(page, 250);
    await f.emit('comment.added', f.append());
    await expect(owner(page)).toHaveJSProperty('scrollTop', 250);
    await scroll(page, 1e8);
    const appended = f.append();
    await f.emit('comment.added', appended);
    await f.emit('comment.added', appended);
    await expect(page.getByText(appended.content, { exact: true })).toHaveCount(1);
    await atBottom(page);
    await scroll(page, 200);
    await f.emit('comment.updated', { ...makeComment(0), content: 'Edited comment without scrolling' });
    await f.emit('activity.added', { id: 'activity-test', taskId: 'synthetic', verb: 'updated', actorId: 'human', actorType: 'human', createdAt: '2026-01-01' });
    await expect(owner(page)).toHaveJSProperty('scrollTop', 200);
    await page.getByRole('button', { name: 'Jump to latest' }).click();
    await atBottom(page);
    await scroll(page, 0);
    await page.getByPlaceholder('Reply').fill('My successful synthetic message');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(owner(page).locator('.prose-clawtask').getByText('My successful synthetic message', { exact: true })).toHaveCount(1);
    await atBottom(page);
    f.failSend(true);
    await page.getByPlaceholder('Reply').fill('Keep rejected draft');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByPlaceholder('Reply')).toHaveValue('Keep rejected draft');
  });
}

test('edit, tabs, breakpoint resize and short-height fallback remain reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const f = await fixture(page);
  await page.keyboard.press('e');
  await page.getByPlaceholder('Description (optional)').fill(markdown + '\n\nEdited description tail');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByPlaceholder('Description (optional)')).toHaveCount(0);
  await expect(owner(page).locator('.prose-clawtask').getByText('Edited description tail')).toHaveCount(1);
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  for (const width of [767, 768, 613]) {
    await resizeIssue(page, width, 749);
    await expect(owner(page)).toHaveCount(1);
    await scroll(page, 1e8);
    await expect(page.getByPlaceholder('Reply')).toBeInViewport();
  }
  await resizeIssue(page, 768, 749);
  await scroll(page, 1e8);
  await resizeIssue(page, 613, 749);
  await expect(owner(page)).toHaveJSProperty('scrollTop', 0);
  await f.emit('comment.added', f.append());
  await expect(owner(page)).toHaveJSProperty('scrollTop', 0);
  await resizeIssue(page, 613, 320);
  await scroll(page, 1e8);
  expect(await page.locator('.detail-composer').evaluate(node => getComputedStyle(node).position)).toBe('static');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeInViewport();
  await page.getByPlaceholder('Reply').fill('Short viewport draft');
  await resizeIssue(page, 613, 749);
  await expect(page.getByPlaceholder('Reply')).toHaveValue('Short viewport draft');
});

test('empty thread does not scroll initial short description', async ({ page }) => {
  await fixture(page, 'Short description', 0);
  await expect(owner(page)).toHaveJSProperty('scrollTop', 0);
  await expect(page.getByText('No messages yet')).toBeVisible();
});

test('touch scrolling and nonzero mobile safe area keep composer above navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', baseURL: 'http://127.0.0.1:3347' });
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
    await fixture(page);
    const box = (await owner(page).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let offset = 20; offset <= 160; offset += 20) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - offset }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => owner(page).evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await scroll(page, 1e8);
    await expect(page.getByText('Synthetic comment 44', { exact: true })).toBeInViewport();
    const nav = page.locator('nav');
    expect(await nav.evaluate(node => getComputedStyle(node).paddingBottom)).toBe('34px');
    expect((await nav.boundingBox())!.height).toBe(90);
    const composer = (await page.locator('.detail-composer').boundingBox())!;
    expect(composer.y + composer.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);
  } finally { await context.close(); }
});

test('visual viewport keyboard resize switches composer to flow without losing draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { height: 844 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
  });
  await fixture(page);
  await page.getByPlaceholder('Reply').fill('Keyboard draft');
  await page.evaluate(() => {
    const viewport = window.visualViewport as any; viewport.height = 300; viewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.detail-mobile-shell')).toHaveCSS('height', '300px');
  await scroll(page, 1e8);
  await expect(page.locator('.detail-composer')).toHaveCSS('position', 'static');
  expect((await page.locator('nav').boundingBox())!.y).toBeLessThan(300);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeInViewport();
  await expect(page.getByPlaceholder('Reply')).toHaveValue('Keyboard draft');
});

for (const [from, to] of [[1440, 390], [390, 1440]]) {
  test(from + ' to ' + to + ': new-owner scroll before incoming append keeps following', async ({ page }) => {
    await page.setViewportSize({ width: from, height: 900 });
    const f = await fixture(page);
    await scroll(page, 1e8);
    await resizeIssue(page, to, 900);
    await expect(owner(page)).toHaveJSProperty('scrollTop', 0);
    await scroll(page, 1e8);
    await atBottom(page);
    const comment = { ...f.append(), content: Array.from({ length: 15 }, (_, i) => 'Responsive append paragraph ' + i).join('\n\n') };
    await f.emit('comment.added', comment);
    await expect(page.getByText('Responsive append paragraph 14', { exact: true })).toHaveCount(1);
    await atBottom(page);
  });
}
