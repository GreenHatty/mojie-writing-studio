import { describe, expect, it, vi } from 'vitest';
import { createTrashHandlers } from './handlers';

describe('trash handlers', () => {
  it('keeps deleted content scoped to the editable work and protects every response', async () => {
    const handlers = createTrashHandlers({
      requireUserId: async () => 'writer', assertMutation: vi.fn(),
      store: { async listDeletedChapters(userId, workId) { expect([userId, workId]).toEqual(['writer', 'work']); return [{ id: 'chapter', workId: 'work', volumeId: 'volume', title: '旧章', deletedAt: '2026-07-13T00:00:00Z', deleteReason: null }]; }, async deleteChapter() { return { workId: 'work' }; }, async restoreChapter() {} }
    });
    const response = await handlers.list(new Request('https://app.test'), 'work');
    await expect(response.json()).resolves.toMatchObject({ chapters: [{ id: 'chapter' }] });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('requires mutation validation before a chapter can enter the trash', async () => {
    const assertMutation = vi.fn();
    const handlers = createTrashHandlers({ requireUserId: async () => 'writer', assertMutation, store: { async listDeletedChapters() { return []; }, async deleteChapter() { return { workId: 'work' }; }, async restoreChapter() {} } });
    const response = await handlers.deleteChapter(new Request('https://app.test', { method: 'DELETE', body: JSON.stringify({ reason: '误删' }) }), 'chapter');
    expect(response.status).toBe(200);
    expect(assertMutation).toHaveBeenCalledOnce();
  });
});
