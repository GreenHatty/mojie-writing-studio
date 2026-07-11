import { describe, expect, it } from 'vitest';
import { createMemoryMigrationStore, createMigrationService } from './service';

describe('legacy migration', () => {
  it('backs up before import and returns the prior result for a repeated migration id', async () => {
    const store = createMemoryMigrationStore();
    const events: string[] = [];
    const service = createMigrationService(store, {
      async backup() { events.push('backup'); return 'backups/m1.json'; },
      async importWork() { events.push('import'); return 1; }
    });
    const input = { migrationId: 'm1', userId: 'writer-1', confirmed: true, legacy: { works: [{ title: '旧书', html: '<p>正文</p>' }] } };
    await expect(service.migrate(input)).resolves.toMatchObject({ imported: 1 });
    await expect(service.migrate(input)).resolves.toMatchObject({ imported: 0, repeated: true });
    expect(events).toEqual(['backup', 'import']);
  });

  it('requires explicit confirmation', async () => {
    const service = createMigrationService(createMemoryMigrationStore(), { async backup() { return ''; }, async importWork() { return 0; } });
    await expect(service.migrate({ migrationId: 'm1', userId: 'u', confirmed: false, legacy: { works: [] } })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  });
});
