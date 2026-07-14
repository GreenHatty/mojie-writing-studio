import { expect, test, type Page, type Route } from '@playwright/test';

type ChapterState = { id: string; workId: string; volumeId: string; title: string; canonicalContent: Record<string, unknown>; plainText: string; revision: number; wordCount: number; position: number };
type WorkState = { id: string; title: string; kind: 'long' | 'short' | 'essay'; volumeId: string; chapters: ChapterState[] };
type EntityState = { id: string; workId: string; kind: string; title: string; summary: string; fields: Record<string, unknown>; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string; deletedAt?: string };

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
  const state: { work: WorkState | null; rankingRequests: number; entities: EntityState[] } = { work: null, rankingRequests: 0, entities: [] };
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
    if (/^\/api\/core\/works\/[^/]+\/entities$/u.test(path) && method === 'GET') {
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
      const kind = url.searchParams.get('kind');
      return json(route, { entities: state.entities.filter((entity) => (includeDeleted || !entity.deletedAt) && (!kind || entity.kind === kind)) });
    }
    if (/^\/api\/core\/works\/[^/]+\/entities$/u.test(path) && method === 'POST' && state.work) {
      const input = request.postDataJSON() as Pick<EntityState, 'kind' | 'title' | 'summary' | 'fields'>;
      const entity: EntityState = { id: `entity-${state.entities.length + 1}`, workId: state.work.id, ...input, summary: input.summary || '', fields: input.fields || {}, createdBy: userId, updatedBy: userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.entities.push(entity); return json(route, { entity }, 201);
    }
    const entityMatch = path.match(/^\/api\/core\/works\/[^/]+\/entities\/([^/]+)$/u);
    if (entityMatch) {
      const entity = state.entities.find((item) => item.id === entityMatch[1]);
      if (!entity) return json(route, { error: 'NOT_FOUND' }, 404);
      if (method === 'GET') return json(route, { references: [] });
      if (method === 'PATCH') { Object.assign(entity, request.postDataJSON(), { updatedAt: new Date().toISOString() }); return json(route, { entity }); }
      if (method === 'DELETE') { entity.deletedAt = new Date().toISOString(); return json(route, { ok: true }); }
    }
    const restoreEntityMatch = path.match(/^\/api\/core\/works\/[^/]+\/entities\/([^/]+)\/restore$/u);
    if (restoreEntityMatch && method === 'POST') { const entity = state.entities.find((item) => item.id === restoreEntityMatch[1]); if (entity) delete entity.deletedAt; return json(route, { ok: true }); }
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
    await page.getByRole('button', { name: '大纲与设定' }).click();
    await expect(page.getByRole('dialog', { name: '大纲与世界设定' })).toBeVisible();
    await page.getByRole('button', { name: '关闭大纲与世界设定' }).click();
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
    await page.getByRole('button', { name: '更多' }).click();
    await page.getByRole('button', { name: '大纲与设定' }).click();
    await expect(page.getByRole('dialog', { name: '大纲与世界设定' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '大纲与世界设定' })).toHaveCSS('width', '390px');
    await page.getByRole('button', { name: '关闭大纲与世界设定' }).click();
  }
  expect(state.rankingRequests).toBe(0);
});

test('creates worldbuilding records and highlights chapter mentions without persisting marks', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const state = await installCoreApi(page, 'worldbuilding-desktop');
  await page.goto('/');
  await page.getByLabel('作品名称').fill('世界设定验收');
  await page.getByRole('button', { name: '创建并开始写作' }).click();
  await page.getByRole('button', { name: '大纲与设定' }).click();
  await expect(page.getByRole('dialog', { name: '大纲与世界设定' })).toBeVisible();
  await page.getByRole('button', { name: '人物卡' }).click();
  await page.getByLabel('名称').fill('沈青');
  await page.getByLabel('摘要与重点').fill('谨慎的主角');
  await page.getByLabel('别名（逗号或换行分隔）').fill('阿青');
  await page.getByRole('button', { name: '创建设定' }).click();
  await expect(page.getByText('设定已保存。')).toBeVisible();
  await page.getByRole('button', { name: '关闭大纲与世界设定' }).click();
  const editor = page.locator('.ProseMirror');
  await editor.fill('阿青踏入长街，沈青没有回头。');
  await expect.poll(() => state.work?.chapters[0]?.plainText, { timeout: 5_000 }).toContain('沈青');
  await page.getByRole('tab', { name: '设定提示' }).click();
  await expect(page.getByText(/命中 沈青、阿青|命中 阿青、沈青/u)).toBeVisible();
  await expect(page.locator('.entity-mention-highlight')).toHaveCount(2);
  expect(JSON.stringify(state.work?.chapters[0]?.canonicalContent)).not.toContain('entityMention');
});
