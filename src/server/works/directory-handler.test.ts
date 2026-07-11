import { describe, expect, it } from 'vitest';
import { createDirectoryHandler } from './directory-handler';

describe('work directory handler', () => {
  it('requires a session and returns no-store metadata', async () => {
    const handler = createDirectoryHandler({
      async requireUserId() { return 'u'; },
      store: { async get() { return { work: { id: 'w', title: '书', role: 'WORK_OWNER' as const }, volumes: [] }; } }
    });
    const response = await handler(new Request('https://writer.example/api/works/w'), 'w');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    await expect(response.json()).resolves.toMatchObject({ directory: { work: { id: 'w' } } });
  });
});
