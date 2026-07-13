import { describe, expect, it } from 'vitest';
import { createWorkSearchHandlers } from './handlers';

describe('work search handlers', () => {
  it('requires a bounded query and returns protected results only through the work scope', async () => {
    const handlers = createWorkSearchHandlers({
      requireUserId: async () => 'writer',
      store: { async search(userId, workId, query) { expect([userId, workId, query]).toEqual(['writer', 'work', '伏笔']); return [{ chapterId: 'chapter', chapterTitle: '第一章', volumeTitle: '第一卷', snippet: '伏笔', matchCount: 1 }]; } }
    });
    const response = await handlers.search(new Request('https://app.test/api/core/works/work/search?q=%E4%BC%8F%E7%AC%94'), 'work');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [{ chapterId: 'chapter' }] });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
