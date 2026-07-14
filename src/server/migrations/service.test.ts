import { describe, expect, it } from 'vitest';
import { createMemoryMigrationStore, createMigrationService, type LegacyWritingPayload } from './service';

const source: LegacyWritingPayload = { works: [{ id: 'legacy-work', title: '旧作品', volumes: [{ id: 'v1', title: '第一卷', chapters: [{ id: 'c1', title: '第一章', content: '<p>原正文</p>' }] }] }] };

describe('migration service', () => {
  it('creates an immutable preview and makes a repeated migration id idempotent', async () => {
    let imports = 0;
    const service = createMigrationService(createMemoryMigrationStore(), { async importWork() { imports += 1; return { targetWorkId: 'new-work' }; }, async rollbackWork() {} }, () => '2026-07-13T00:00:00Z');
    const first = await service.preview({ migrationId: 'm1', userId: 'u1', source });
    const second = await service.preview({ migrationId: 'm1', userId: 'u1', source });
    expect(first.repeated).toBe(false);
    expect(second.repeated).toBe(true);
    await service.execute({ migrationId: 'm1', userId: 'u1', confirmed: true, source });
    await service.execute({ migrationId: 'm1', userId: 'u1', confirmed: true, source });
    expect(imports).toBe(1);
  });

  it('does not alter the source when one work import fails and allows per-work rollback', async () => {
    const before = JSON.stringify(source);
    const rolledBack: string[] = [];
    const service = createMigrationService(createMemoryMigrationStore(), {
      async importWork(_userId, _migrationId, work) { if (work.id === 'legacy-work') return { targetWorkId: 'new-work' }; throw new Error('unexpected'); },
      async rollbackWork(_userId, _migrationId, targetWorkId) { rolledBack.push(targetWorkId); }
    });
    await service.preview({ migrationId: 'm2', userId: 'u1', source });
    await service.execute({ migrationId: 'm2', userId: 'u1', confirmed: true, source });
    await service.rollback({ migrationId: 'm2', userId: 'u1' });
    expect(JSON.stringify(source)).toBe(before);
    expect(rolledBack).toEqual(['new-work']);
  });

  it('does not reveal an existing migration preview to another account', async () => {
    const service = createMigrationService(createMemoryMigrationStore(), { async importWork() { return { targetWorkId: 'new-work' }; }, async rollbackWork() {} });
    await service.preview({ migrationId: 'private-migration', userId: 'writer-1', source });
    await expect(service.preview({ migrationId: 'private-migration', userId: 'writer-2', source })).rejects.toMatchObject({ code: 'MIGRATION_NOT_FOUND' });
  });
});
