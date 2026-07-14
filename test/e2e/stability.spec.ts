import { expect, test, type Page, type Route } from '@playwright/test';

type ChapterState = { id: string; workId: string; volumeId: string; title: string; canonicalContent: Record<string, unknown>; plainText: string; revision: number; wordCount: number; position: number };
type WorkState = { id: string; title: string; kind: 'long' | 'short' | 'essay'; volumeId: string; chapters: ChapterState[] };

function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === 'text') return value.text ?? '';
  const children = (value.content ?? []).map(plainText);
  return children.join(value.type === 'doc' || value.type === 'paragraph' ? '\n' : '').trim();
}

async function json(route: Route, value: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value), headers: { 'Cache-Control': 'no-store, private' } });
}

async function installCoreApi(page: Page, userId: string) {
  const state: { work: WorkState | null; rankingRequests: number } = { work: null, rankingRequests: 0 };
  await page.addInitScript((id) => { indexedDB.deleteDatabase(`mojie-writing-studio:${id}`); }, userId);
  await page.route('**/api/rankings/**', async (route) => { state.rankingRequests += 1; await json(route, { error: 'UNEXPECTED_RANKING_REQUEST' }, 500); });
  await page.route('**/api/core/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === '/api/core/auth/session') return json(route, { user: { id: userId, account: 'writer@example.invalid', platformRole: 'OWNER' }, csrf: 'e2e-csrf', expiresAt: '2026-07-14T12:00:00Z', renewed: false });
    if (path === '/api/core/auth/draft-key') return json(route, { dek: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', version: 1 });
    if (path === '/api/core/profile-settings' && method === 'GET') return json(route, { settings: { theme: 'paper', fontSize: 18, lineHeight: 1.9, editorWidth: 'comfortable', leftColumnWidth: 280, rightColumnWidth: 320, updatedAt: '2026-07-14T00:00:00Z' } });
    if (path === '/api/core/profile-settings' && method === 'PUT') return json(route, { settings: { ...request.postDataJSON(), updatedAt: new Date().toISOString() } });
    if (path === '/api/core/writing-stats') return json(route, { stats: { date: '2026-07-14', addedCharacters: 0, streakDays: 0 } });
    if (path === '/api/core/works' && method === 'GET') return json(route, { works: state.work ? [{ id: state.work.id, title: state.work.title, kind: state.work.kind, status: 'DRAFT', updatedAt: '2026-07-14T00:00:00Z', role: 'WORK_OWNER', totalWordCount: state.work.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0) }] : [] });
    if (path === '/api/core/works' && method === 'POST') {
      const input = request.postDataJSON() as { title: string; kind: WorkState['kind'] };
      const chapter: ChapterState = { id: 'chapter-1', workId: 'work-1', volumeId: 'volume-1', title: '第1章', canonicalContent: { type: 'doc', schemaVersion: 1, content: [{ type: 'paragraph' }] }, plainText: '', revision: 0, wordCount: 0, position: 0 };
      state.work = { id: 'work-1', title: input.title, kind: input.kind, volumeId: 'volume-1', chapters: [chapter] };
      return json(route, { work: { id: state.work.id }, volume: { id: state.work.volumeId }, chapter: { id: chapter.id } }, 201);
    }
    const workMatch = path.match(/^\/api\/core\/works\/([^/]+)$/u);
    if (workMatch && method === 'GET' && state.work) return json(route, { work: { id: state.work.id, title: state.work.title, kind: state.work.kind, status: 'DRAFT', updatedAt: '2026-07-14T00:00:00Z', role: 'WORK_OWNER', volumes: [{ id: state.work.volumeId, workId: state.work.id, title: '第一卷', position: 0, chapters: state.work.chapters }] } });
    if (/^\/api\/core\/works\/[^/]+\/volumes$/u.test(path) && method === 'POST' && state.work) return json(route, { volume: { id: `volume-${state.work.chapters.length + 2}`, workId: state.work.id, title: (request.postDataJSON() as { title: string }).title, position: 1, chapters: [] } }, 201);
    if (/^\/api\/core\/works\/[^/]+\/chapters$/u.test(path) && method === 'POST' && state.work) {
      const input = request.postDataJSON() as { volumeId: string; title: string };
      const chapter: ChapterState = { id: `chapter-${state.work.chapters.length + 1}`, workId: state.work.id, volumeId: input.volumeId, title: input.title, canonicalContent: { type: 'doc', schemaVersion: 1, content: [{ type: 'paragraph' }] }, plainText: '', revision: 0, wordCount: 0, position: state.work.chapters.length };
      state.work.chapters.push(chapter);
      return json(route, { chapter }, 201);
    }
    const chapterMatch = path.match(/^\/api\/core\/chapters\/([^/]+)$/u);
    if (chapterMatch && state.work) {
      const chapter = state.work.chapters.find((item) => item.id === chapterMatch[1]);
      if (!chapter) return json(route, { error: 'NOT_FOUND' }, 404);
      if (method === 'GET') return json(route, { chapter });
      if (method === 'PUT') {
        const input = request.postDataJSON() as { baseRevision: number; canonicalContent: Record<string, unknown> };
        chapter.canonicalContent = input.canonicalContent;
        chapter.plainText = plainText(input.canonicalContent);
        chapter.wordCount = Array.from(chapter.plainText.replace(/\s/gu, '')).length;
        chapter.revision = input.baseRevision + 1;
        return json(route, { kind: 'saved', revision: chapter.revision });
      }
      if (method === 'PATCH') { chapter.title = (request.postDataJSON() as { title: string }).title; return json(route, { chapter }); }
    }
    if (/\/note$/u.test(path) && method === 'GET') return json(route, { note: null });
    if (/\/versions$/u.test(path) && method === 'GET') return json(route, { versions: [] });
    return json(route, { error: `UNHANDLED_${method}_${path}` }, 500);
  });
  return state;
}

test('creates, opens, edits and reconnects without an infinite loading state', async ({ page, context }) => {
  await installCoreApi(page, `e2e-${test.info().project.name}`);
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
  await editor.fill('第一段稳定性验收正文。');
  await expect(page.getByText('已同步', { exact: true }).last()).toBeVisible({ timeout: 5_000 });
  await context.setOffline(true);
  await editor.fill('离线追加仍需保留。');
  await expect(page.getByText('离线草稿待同步', { exact: true })).toBeVisible({ timeout: 5_000 });
  await context.setOffline(false);
  await expect(page.getByText('已同步', { exact: true }).last()).toBeVisible({ timeout: 6_000 });
  const longestTask = await page.evaluate(() => Math.max(0, ...((window as typeof window & { __mojieLongTasks?: number[] }).__mojieLongTasks || [])));
  expect(longestTask).toBeLessThan(100);
  await page.getByRole('button', { name: '返回工作台' }).click();
  await expect(page.getByRole('heading', { name: '我的作品' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate((element) => element.clientWidth));
});

test('previews and imports a TXT file through the core repository', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  await installCoreApi(page, 'file-import-desktop');
  await page.goto('/');
  await page.getByLabel('作品名称').fill('文件导入验收');
  await page.getByRole('button', { name: '创建并开始写作' }).click();
  await page.getByRole('button', { name: '写作工具箱' }).click();
  await page.getByRole('button', { name: '文件与备份' }).click();
  const picker = page.locator('input[type="file"][accept*=".txt"]').first();
  await picker.setInputFiles({ name: '导入验收.txt', mimeType: 'text/plain', buffer: Buffer.from('第1章 导入章\n导入正文内容。', 'utf8') });
  await expect(page.getByText(/已解析 1 卷、1 章/)).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByLabel('正文内容')).toContainText('导入正文内容。', { timeout: 15_000 });
});

test('uses responsive drawers and never starts the ranking module implicitly', async ({ page }) => {
  const state = await installCoreApi(page, `responsive-${test.info().project.name}`);
  await page.goto('/');
  await page.getByLabel('作品名称').fill('响应式验收');
  await page.getByRole('button', { name: '创建并开始写作' }).click();
  await expect(page.getByLabel('正文内容')).toBeVisible({ timeout: 15_000 });
  expect(state.rankingRequests).toBe(0);
  if (test.info().project.name === 'tablet') {
    const contextPanel = page.getByRole('complementary', { name: '章节辅助信息' });
    await expect(contextPanel).toHaveCSS('position', 'fixed');
    await page.getByRole('button', { name: '章工具' }).click();
    await expect(page.getByRole('button', { name: '章工具' })).toHaveAttribute('aria-expanded', 'true');
  }
  if (test.info().project.name === 'desktop') {
    await page.getByRole('button', { name: '写作工具箱' }).click();
    await expect(page.getByRole('dialog', { name: '写作工具箱' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '写作工具箱' })).toBeVisible();
    await page.getByRole('button', { name: '关闭写作工具箱' }).click();
  }
  if (test.info().project.name === 'mobile-390') {
    const directory = page.getByRole('complementary', { name: '作品目录' });
    await expect(directory).toHaveCSS('position', 'fixed');
    await page.getByRole('button', { name: '目录' }).click();
    await expect(page.getByRole('button', { name: '目录' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '目录' }).click();
    await expect(page.getByRole('button', { name: '目录' })).toHaveAttribute('aria-expanded', 'false');
  }
  expect(state.rankingRequests).toBe(0);
});
