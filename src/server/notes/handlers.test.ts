import { describe, expect, it } from 'vitest';
import { createPrivateNoteHandlers } from './handlers';

describe('private note handlers', () => {
  it('does not return a note body for a reader who has no personal note', async () => {
    const handlers = createPrivateNoteHandlers({
      async requireUserId() { return 'viewer'; },
      async assertMutation() {},
      store: { async get() { return null; }, async put(_userId, chapterId, body) { return { id: 'note', chapterId, body, updatedAt: '2026-07-13T00:00:00Z' }; } }
    });
    await expect((await handlers.get(new Request('https://writer.example'), 'chapter')).json()).resolves.toEqual({ note: null });
  });
});
