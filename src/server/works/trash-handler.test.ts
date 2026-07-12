import { describe, expect, it, vi } from 'vitest';
import { createTrashHandlers } from './trash-handler';

describe('trash handlers', () => {
  it('lists only the authenticated owners deleted works', async () => {
    const handlers = createTrashHandlers({ async requireUserId() { return 'u'; }, assertMutation() {}, store: { async list() { return [{ id: 'w', title: '旧书', deletedAt: '2026-07-12T00:00:00Z', deleteReason: '用户删除' }]; }, async softDelete() {}, async restore() {}, async permanentlyDelete() {} } });
    const response = await handlers.list(new Request('https://writer.example/api/trash'));
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    await expect(response.json()).resolves.toMatchObject({ works: [{ id: 'w', title: '旧书' }] });
  });

  it.each(['delete', 'restore', 'permanent'] as const)('checks CSRF for %s', async (action) => {
    const assertMutation = vi.fn(); const method = action === 'delete' ? 'softDelete' : action === 'restore' ? 'restore' : 'permanentlyDelete';
    const store = { list: vi.fn(async () => []), softDelete: vi.fn(async () => undefined), restore: vi.fn(async () => undefined), permanentlyDelete: vi.fn(async () => undefined) };
    const handlers = createTrashHandlers({ async requireUserId() { return 'u'; }, assertMutation, store });
    const response = await handlers.mutate(new Request('https://writer.example', { method: 'POST', body: JSON.stringify({ action }) }), 'w');
    expect(response.status).toBe(200); expect(assertMutation).toHaveBeenCalledOnce(); expect(store[method]).toHaveBeenCalledWith('u', 'w');
  });
});
