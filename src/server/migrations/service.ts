import { AppError } from '../errors';

type MigrationResult = { imported: number; repeated: boolean; backupKey: string };
export type MigrationStore = { get(migrationId: string): Promise<MigrationResult | null>; put(migrationId: string, result: MigrationResult): Promise<void> };
class MemoryMigrationStore implements MigrationStore {
  private readonly results = new Map<string, MigrationResult>();
  async get(id: string): Promise<MigrationResult | null> { return this.results.get(id) ?? null; }
  async put(id: string, result: MigrationResult): Promise<void> { this.results.set(id, result); }
}
export function createMemoryMigrationStore(): MigrationStore { return new MemoryMigrationStore(); }

export function createMigrationService(store: MigrationStore, dependencies: { backup(userId: string, migrationId: string, legacy: unknown): Promise<string>; importWork(userId: string, work: { title: string; html: string }): Promise<number> }) {
  return {
    async migrate(input: { migrationId: string; userId: string; confirmed: boolean; legacy: { works: Array<{ title: string; html: string }> } }): Promise<MigrationResult> {
      if (!input.confirmed) throw new AppError('CONFIRMATION_REQUIRED', 400);
      const existing = await store.get(input.migrationId);
      if (existing) return { ...existing, imported: 0, repeated: true };
      const backupKey = await dependencies.backup(input.userId, input.migrationId, input.legacy);
      let imported = 0;
      for (const work of input.legacy.works) imported += await dependencies.importWork(input.userId, work);
      const result = { imported, repeated: false, backupKey };
      await store.put(input.migrationId, result);
      return result;
    }
  };
}
