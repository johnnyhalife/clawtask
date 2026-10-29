import { test, expect, type Locator } from '@playwright/test';
import { fixture } from './issue-fixture';

async function reachable(option: Locator) {
  expect(await option.evaluate(node => {
    const r = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
}
const statuses = ['Backlog', 'Todo', 'In Progress', 'Blocked', 'Done', 'Archived'];
const values = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'archived'];
const priorities = ['Urgent', 'High', 'Medium', 'Low'];
for (const [width, height] of [[320, 568], [390, 844], [613, 749], [613, 320], [767, 749], [768, 749], [1440, 900], [844, 390]]) {
  test(width + 'x' + height + ': every status/priority option is pointer reachable', async ({ page }) => {
    await page.setViewportSize({ width, height });
    const f = await fixture(page, undefined, 3, true);
    let label = 'Todo';
    for (const [i, name] of statuses.entries()) {
      await page.getByRole('button', { name: label, exact: true }).click();
      const option = page.locator('button').filter({ hasText: new RegExp('^' + name + '$') }).last();
      await reachable(option);
      if (name === 'Archived' && width === 390) await page.screenshot({ path: 'test-results/chip-fixed.png' });
      await option.click();
      await expect.poll(() => f.patches.at(-1)?.status).toBe(values[i]);
      label = name;
    }
    label = 'Medium';
    for (const name of priorities) {
      await page.getByRole('button', { name: label, exact: true }).click();
      const option = page.getByRole('option', { name, exact: true });
      const bounds = await page.locator('[data-chip-popover]').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      await reachable(option); await option.click();
      await expect.poll(() => f.patches.at(-1)?.priority).toBe(name.toLowerCase());
      label = name;
    }
    expect(f.patches).toHaveLength(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('region', { name: 'Issue content' })).toHaveJSProperty('scrollTop', 0);
  });
}

test('dismissal, scrolling, keyboard, breakpoint cleanup and properties modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, undefined, 3, true);
  const trigger = () => page.getByRole('button', { name: 'Todo', exact: true }).first();
  const panel = page.locator('[data-chip-popover]');
  await trigger().click(); await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0); await expect(trigger()).toBeFocused();
  await trigger().click(); await page.locator('[data-chip-backdrop]').click({ position: { x: 300, y: 400 } });
  await expect(panel).toHaveCount(0); expect(f.patches).toHaveLength(0);
  await trigger().click(); await page.keyboard.press('Tab'); await expect(panel).toHaveCount(0);
  await trigger().click();
  await page.getByRole('region', { name: 'Issue content' }).evaluate(node => { node.scrollTop = 100; });
  await expect(panel).toHaveCount(0);
  const row = trigger().locator('..').locator('..').locator('..');
  await trigger().click();
  await row.evaluate(node => { node.scrollLeft = 80; });
  await expect(panel).toHaveCount(0);
  await row.evaluate(node => { node.scrollLeft = 0; });
  await trigger().click(); await page.setViewportSize({ width: 613, height: 320 });
  await expect(panel).toHaveCount(0);
  await trigger().click(); await page.setViewportSize({ width: 768, height: 749 });
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect.poll(() => f.patches.at(-1)?.status).toBe('archived');
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await expect.poll(() => f.patches.at(-1)?.status).toBe('backlog');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show properties', exact: true }).click();
  await page.getByRole('button', { name: 'Backlog', exact: true }).first().click();
  await reachable(page.getByRole('option', { name: 'Archived', exact: true }));
  await page.getByRole('option', { name: 'Archived', exact: true }).click();
  await expect.poll(() => f.patches.at(-1)?.status).toBe('archived');
  await page.getByRole('button', { name: 'Medium', exact: true }).first().click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect.poll(() => f.patches.at(-1)?.priority).toBe('low');
});


test('touch selection, outside dismissal and visual viewport changes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', baseURL: 'http://127.0.0.1:3347' });
  try {
    const page = await context.newPage();
    const f = await fixture(page, undefined, 3, true);
    for (const [names, initial, field] of [[statuses, 'Todo', 'status'], [priorities, 'Medium', 'priority']] as const) {
      let label: string = initial;
      for (const [i, name] of names.entries()) {
        await page.getByRole('button', { name: label, exact: true }).tap();
        const option = page.getByRole('option', { name, exact: true });
        await reachable(option); await option.tap();
        await expect.poll(() => f.patches.at(-1)?.[field]).toBe(field === 'status' ? values[i] : name.toLowerCase());
        label = name;
      }
    }
    await page.getByRole('button', { name: 'Archived', exact: true }).tap();
    await page.locator('[data-chip-backdrop]').tap({ position: { x: 300, y: 400 } });
    await expect(page.locator('[data-chip-popover]')).toHaveCount(0);
    expect(f.patches).toHaveLength(10);
    expect(new URL(page.url()).pathname).toBe('/issues/test-001');
    await page.getByRole('button', { name: 'Archived', exact: true }).tap();
    await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));
    await expect(page.locator('[data-chip-popover]')).toHaveCount(0);
  } finally { await context.close(); }
});


test('390 mobile: original Archived hit-test regression', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, undefined, 3, true);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  const last = page.locator('button').filter({ hasText: /^Archived$/ });
  await reachable(last);
  await last.click();
  await expect.poll(() => f.patches.at(-1)?.status).toBe('archived');
});


test('short visual viewport scrolls options locally and keeps final choice reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(window, 'visualViewport', {
    value: Object.assign(new EventTarget(), { width: 390, height: 180, offsetLeft: 0, offsetTop: 0 }),
  }));
  const f = await fixture(page, undefined, 3, true);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await page.keyboard.press('End');
  const panel = page.locator('[data-chip-popover]');
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await reachable(page.getByRole('option', { name: 'Archived', exact: true }));
  const box = (await panel.boundingBox())!; expect(box.y + box.height).toBeLessThanOrEqual(180);
  await page.keyboard.press('Enter');
  await expect.poll(() => f.patches.at(-1)?.status).toBe('archived');
  await expect(page.getByRole('region', { name: 'Issue content' })).toHaveJSProperty('scrollTop', 0);
});
