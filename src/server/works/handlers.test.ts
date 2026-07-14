import { describe, expect, it } from 'vitest';
import { createWorkHandlers } from './handlers';

describe('work handlers', () => {
  it('returns only visible work metadata for the authenticated user', async () => {
    const handlers = createWorkHandlers({
      async requireUserId() { return 'writer-1'; },
      store: { async listVisible() { return [{ id: 'w', title: '书', kind: 'long', status: 'DRAFT', updatedAt: '2026-07-11T00:00:00Z', role: 'WORK_OWNER', totalWordCount: 0 }]; }, async createGraph() {} }
    });
    const response = await handlers.list(new Request('https://writer.example/api/works'));
    await expect(response.json()).resolves.toMatchObject({ works: [{ id: 'w', title: '书' }] });
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
  });
});
