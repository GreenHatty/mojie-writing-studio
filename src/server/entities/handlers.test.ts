import { describe, expect, it } from 'vitest';
import { createProjectEntityHandlers } from './handlers';

function store() {
  return {
    async list() { return []; },
    async create(userId: string, workId: string, input: { kind: 'character'; title: string; summary: string; fields: Record<string, string> }) { return { id: 'entity', workId, ...input, createdBy: userId, updatedBy: userId, createdAt: 'now', updatedAt: 'now' }; },
    async update() { throw new Error('not used'); },
    async references() { return [{ id: 'timeline', kind: 'timeline' as const, title: '决战', field: 'characterIds' }]; },
    async softDelete() {},
    async restore() {}
  };
}

describe('project entity handlers', () => {
  it('creates a bounded entity inside the authenticated work scope', async () => {
    let mutationChecked = false;
    const handlers = createProjectEntityHandlers({ requireUserId: async () => 'writer', assertMutation: async () => { mutationChecked = true; }, store: store() });
    const response = await handlers.create(new Request('https://app.test/api/core/works/work/entities', { method: 'POST', body: JSON.stringify({ kind: 'character', title: ' 沈青 ', summary: '主角', fields: { aliases: ['阿青'] } }) }), 'work');
    expect(response.status).toBe(201);
    expect(mutationChecked).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ entity: { id: 'entity', workId: 'work', title: '沈青' } });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('refuses to delete a referenced entity until the client confirms after showing references', async () => {
    const calls: string[] = [];
    const entityStore = store();
    entityStore.softDelete = async () => { calls.push('deleted'); };
    const handlers = createProjectEntityHandlers({ requireUserId: async () => 'writer', assertMutation: async () => undefined, store: entityStore });
    const blocked = await handlers.remove(new Request('https://app.test', { method: 'DELETE', body: '{}' }), 'work', 'character');
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'ENTITY_REFERENCED', details: { references: [{ id: 'timeline' }] } } });
    expect(calls).toEqual([]);
    const confirmed = await handlers.remove(new Request('https://app.test', { method: 'DELETE', body: JSON.stringify({ confirmReferences: true }) }), 'work', 'character');
    expect(confirmed.status).toBe(200);
    expect(calls).toEqual(['deleted']);
  });

  it('rejects unsupported entity kinds and oversized field values', async () => {
    const handlers = createProjectEntityHandlers({ requireUserId: async () => 'writer', assertMutation: async () => undefined, store: store() });
    const invalidKind = await handlers.create(new Request('https://app.test', { method: 'POST', body: JSON.stringify({ kind: 'dictionary', title: '词典', fields: {} }) }), 'work');
    expect(invalidKind.status).toBe(400);
    const invalidField = await handlers.create(new Request('https://app.test', { method: 'POST', body: JSON.stringify({ kind: 'material', title: '超长', fields: { content: 'x'.repeat(50_001) } }) }), 'work');
    expect(invalidField.status).toBe(400);
  });
});
