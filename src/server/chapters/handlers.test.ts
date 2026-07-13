import { describe, expect, it } from 'vitest';
import { createChapterHandlers } from './handlers';

describe('chapter handlers', () => {
  it('returns an authorized chapter and preserves revision on save response', async () => {
    const store = {
      async get() { return { id: 'c1', workId: 'w1', title: '第1章', canonicalContent: { type: 'doc' as const }, plainText: '', revision: 0 }; },
      async save() { return { kind: 'saved' as const, revision: 1 }; },
      async rename(_userId: string, chapterId: string, title: string) { return { id: chapterId, workId: 'w1', title, canonicalContent: { type: 'doc' as const }, plainText: '', revision: 0 }; }
    };
    const handlers = createChapterHandlers({ async requireUserId() { return 'u1'; }, store });
    const response = await handlers.get(new Request('https://writer.example/api/chapters/c1'), 'c1');
    await expect(response.json()).resolves.toMatchObject({ chapter: { id: 'c1', revision: 0 } });
  });
});
