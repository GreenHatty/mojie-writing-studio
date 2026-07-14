import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/site/public', (route) => route.fulfill({ json: { profile: { siteName: '墨界·私人网文创作台', defaultInviteHours: 72, recycleRetentionDays: 30 }, serverReady: true } }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, user: { id: `e2e-${test.info().project.name}`, email: 'writer@example.invalid', displayName: '验收作者', globalRole: 'owner' }, serverReady: true } }));
  await page.route('**/api/rankings/sources', (route) => route.fulfill({ json: { sources: [{ id: 'source-1', platform: 'qidian', list_name: '脱敏验收榜', category: '全部', source_url: 'https://www.qidian.com/rank/', enabled: 1, authorization_note: 'fixture', last_success_at: null, last_error: null }] } }));
  await page.route('**/api/rankings/snapshots', (route) => route.fulfill({ json: { snapshots: [] } }));
  await page.addInitScript(() => indexedDB.deleteDatabase(`mojie-writing-studio:e2e-${location.search || 'default'}`));
});

test('creates, opens and edits a work without an infinite loading state', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始第一本作品' })).toBeVisible({ timeout: 12_000 });
  await page.getByLabel('作品名称').fill(`稳定性验收-${test.info().project.name}`);
  await page.getByRole('button', { name: '创建并开始写作' }).click();
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    (window as typeof window & { __mojieLongTasks?: number[] }).__mojieLongTasks = [];
    if ('PerformanceObserver' in window) new PerformanceObserver((list) => {
      (window as typeof window & { __mojieLongTasks?: number[] }).__mojieLongTasks?.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: 'longtask', buffered: false });
  });
  await editor.fill('第一段离线稳定性验收正文。');
  await context.setOffline(true);
  await editor.press('End'); await editor.type('离线追加。');
  await expect(page.getByText(/字$/).first()).toBeVisible();
  await context.setOffline(false);
  const longestTask = await page.evaluate(() => Math.max(0, ...((window as typeof window & { __mojieLongTasks?: number[] }).__mojieLongTasks || [])));
  expect(longestTask).toBeLessThan(100);
  await page.getByRole('button', { name: '返回工作台' }).click();
  await expect(page.getByRole('heading', { name: '我的作品' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate((element) => element.clientWidth));
});

test('loads rankings only after an explicit user action', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  let sourceRequests = 0;
  page.on('request', (request) => { if (request.url().includes('/api/rankings/sources')) sourceRequests += 1; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /开始第一本作品|我的作品/ })).toBeVisible({ timeout: 12_000 });
  expect(sourceRequests).toBe(0);
  if (await page.getByRole('heading', { name: '开始第一本作品' }).isVisible()) {
    await page.getByLabel('作品名称').fill('榜单懒加载验收'); await page.getByRole('button', { name: '创建并开始写作' }).click(); await page.getByRole('button', { name: '返回工作台' }).click();
  }
  expect(sourceRequests).toBe(0);
  await page.getByRole('button', { name: '打开平台榜单' }).click();
  await expect.poll(() => sourceRequests).toBe(1);
});
