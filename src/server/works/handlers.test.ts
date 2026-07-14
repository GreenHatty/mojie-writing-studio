import { describe, expect, it } from 'vitest';
import { createWorkHandlers } from './handlers';

describe('work handlers', () => {
  it('returns only visible work metadata for the authenticated user', async () => {
    const handlers = createWorkHandlers({
      async requireUserId() { return 'writer-1'; },
      store: {
        async listVisible() { return [{ id: 'w', title: '书', kind: 'long', status: 'DRAFT', updatedAt: '2026-07-11T00:00:00Z', role: 'WORK_OWNER', totalWordCount: 0 }]; },
        async createGraph() {},
        async getDirectory() { return null; },
        async createChapter() { return { id: 'c', workId: 'w', volumeId: 'v', title: '第1章', wordCount: 0, revision: 0, position: 0 }; },
        async createVolume() { return { id: 'v', workId: 'w', title: '第一卷', position: 0, chapters: [] }; },
        async renameVolume() { return { id: 'v', workId: 'w', title: '改名卷', position: 0, chapters: [] }; },
        async reorderChapters() {}
      }
    });
    const response = await handlers.list(new Request('https://writer.example/api/works'));
    await expect(response.json()).resolves.toMatchObject({ works: [{ id: 'w', title: '书' }] });
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
  });

  it('uses a full ordered list for chapter reordering instead of partial position writes', async () => {
    const calls: string[][] = [];
    const handlers = createWorkHandlers({
      async requireUserId() { return 'writer-1'; },
      async assertMutation() {},
      store: {
        async listVisible() { return []; }, async createGraph() {}, async getDirectory() { return null; },
        async createChapter() { return { id: 'c', workId: 'w', volumeId: 'v', title: '第1章', wordCount: 0, revision: 0, position: 0 }; },
        async createVolume() { return { id: 'v', workId: 'w', title: '第一卷', position: 0, chapters: [] }; },
        async renameVolume() { return { id: 'v', workId: 'w', title: '第一卷', position: 0, chapters: [] }; },
        async reorderChapters(_userId, _workId, _volumeId, chapterIds) { calls.push(chapterIds); }
      }
    });
    const response = await handlers.reorderChapters(new Request('https://writer.example', { method: 'PUT', body: JSON.stringify({ chapterIds: ['chapter-b', 'chapter-a'] }) }), 'work-a', 'volume-a');
    expect(response.status).toBe(200);
    expect(calls).toEqual([['chapter-b', 'chapter-a']]);
  });
});
