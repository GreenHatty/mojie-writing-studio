import { describe, expect, it, vi } from 'vitest';
import { createDirectoryMutationHandlers } from './directory-mutations';

describe('directory mutation handlers', () => {
  it('creates a chapter only after CSRF and session checks', async () => {
    const createChapter = vi.fn(async () => ({ id: 'c2' }));
    const assertMutation = vi.fn();
    const handlers = createDirectoryMutationHandlers({ async requireUserId() { return 'u'; }, assertMutation, store: { createChapter, async renameChapter() {}, async moveChapter() {} } });
    const response = await handlers.createChapter(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ volumeId: 'v', title: '第二章' }) }), 'w');
    expect(response.status).toBe(201);
    expect(assertMutation).toHaveBeenCalledOnce();
    expect(createChapter).toHaveBeenCalledWith('u', 'w', 'v', '第二章');
  });

  it('supports explicit rename and accessible move actions', async () => {
    const renameChapter = vi.fn(async () => undefined);
    const moveChapter = vi.fn(async () => undefined);
    const handlers = createDirectoryMutationHandlers({ async requireUserId() { return 'u'; }, assertMutation() {}, store: { async createChapter() { return { id: 'c' }; }, renameChapter, moveChapter } });
    await handlers.updateChapter(new Request('https://writer.example', { method: 'PATCH', body: JSON.stringify({ action: 'rename', title: '新章名' }) }), 'c');
    await handlers.updateChapter(new Request('https://writer.example', { method: 'PATCH', body: JSON.stringify({ action: 'move', direction: 'up' }) }), 'c');
    expect(renameChapter).toHaveBeenCalledWith('u', 'c', '新章名');
    expect(moveChapter).toHaveBeenCalledWith('u', 'c', 'up');
  });
});
