import { describe, expect, it, vi } from 'vitest';
import { createChapterContextHandlers } from './context-handler';

describe('chapter context handlers', () => {
  it('returns private notes and immutable versions through a no-store response', async () => {
    const handlers = createChapterContextHandlers({
      async requireUserId() { return 'u'; },
      store: {
        async getContext() { return { note: { body: '只给我看' }, versions: [{ id: 'v1', label: null, reason: 'AUTO', sourceRevision: 1, wordCount: 9, createdAt: '2026-07-12T00:00:00Z' }], conflicts: [] }; },
        async saveNote() {}, async restoreVersion() { return { revision: 2 }; }, async resolveConflict() { return { revision: 2 }; }
      }
    });
    const response = await handlers.get(new Request('https://writer.example'), 'c');
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    await expect(response.json()).resolves.toMatchObject({ context: { note: { body: '只给我看' }, versions: [{ id: 'v1' }] } });
  });

  it('checks CSRF before saving a private note', async () => {
    const assertMutation = vi.fn();
    const saveNote = vi.fn(async () => undefined);
    const handlers = createChapterContextHandlers({ async requireUserId() { return 'u'; }, assertMutation, store: { async getContext() { return null; }, saveNote, async restoreVersion() { return { revision: 2 }; }, async resolveConflict() { return { revision: 2 }; } } });
    const request = new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ body: '备注' }) });
    expect((await handlers.saveNote(request, 'c')).status).toBe(200);
    expect(assertMutation).toHaveBeenCalledOnce();
    expect(saveNote).toHaveBeenCalledWith('u', 'c', '备注');
  });

  it('restores a version only through the store revision workflow', async () => {
    const restoreVersion = vi.fn(async () => ({ revision: 8 }));
    const handlers = createChapterContextHandlers({ async requireUserId() { return 'u'; }, assertMutation() {}, store: { async getContext() { return null; }, async saveNote() {}, restoreVersion, async resolveConflict() { return { revision: 2 }; } } });
    const response = await handlers.restore(new Request('https://writer.example', { method: 'POST' }), 'c', 'v');
    await expect(response.json()).resolves.toEqual({ revision: 8 });
    expect(restoreVersion).toHaveBeenCalledWith('u', 'c', 'v');
  });

  it('accepts only explicit conflict resolution actions', async () => {
    const resolveConflict = vi.fn(async () => ({ revision: 9 }));
    const handlers = createChapterContextHandlers({ async requireUserId() { return 'u'; }, assertMutation() {}, store: { async getContext() { return null; }, async saveNote() {}, async restoreVersion() { return { revision: 2 }; }, resolveConflict } });
    const request = new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ action: 'USE_CONFLICT_COPY' }) });
    await expect((await handlers.resolve(request, 'c', 'conflict-1')).json()).resolves.toEqual({ revision: 9 });
    expect(resolveConflict).toHaveBeenCalledWith('u', 'c', 'conflict-1', 'USE_CONFLICT_COPY');
  });
});
