import { AppError } from '../errors';

export type LegacyChapter = { id: string; title: string; content: string; plainText?: string };
export type LegacyVolume = { id: string; title: string; chapters: LegacyChapter[] };
export type LegacyWork = { id: string; title: string; kind?: 'long' | 'short' | 'essay'; volumes: LegacyVolume[] };
export type LegacyWritingPayload = { works: LegacyWork[] };

export type MigrationWorkPreview = { legacyWorkId: string; title: string; chapterCount: number; sourceHash: string; needsReview: boolean };
export type MigrationRun = {
  migrationId: string;
  userId: string;
  sourceHash: string;
  status: 'PREVIEW' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK';
  preview: MigrationWorkPreview[];
  createdAt: string;
  updatedAt: string;
};
export type MigrationItem = { migrationId: string; legacyWorkId: string; sourceHash: string; targetWorkId: string | null; status: 'PREVIEW' | 'MIGRATED' | 'FAILED' | 'ROLLED_BACK' | 'CONFLICT'; errorCode: string | null };

export type MigrationStore = {
  getRun(migrationId: string): Promise<MigrationRun | null>;
  putRun(run: MigrationRun): Promise<void>;
  putItem(item: MigrationItem): Promise<void>;
  listItems(migrationId: string): Promise<MigrationItem[]>;
};

class MemoryMigrationStore implements MigrationStore {
  private readonly runs = new Map<string, MigrationRun>();
  private readonly items = new Map<string, MigrationItem>();
  async getRun(migrationId: string): Promise<MigrationRun | null> { return this.runs.get(migrationId) ?? null; }
  async putRun(run: MigrationRun): Promise<void> { this.runs.set(run.migrationId, run); }
  async putItem(item: MigrationItem): Promise<void> { this.items.set(`${item.migrationId}:${item.legacyWorkId}`, item); }
  async listItems(migrationId: string): Promise<MigrationItem[]> { return [...this.items.values()].filter((item) => item.migrationId === migrationId); }
}
export function createMemoryMigrationStore(): MigrationStore { return new MemoryMigrationStore(); }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateLegacy(input: LegacyWritingPayload): void {
  if (!Array.isArray(input.works)) throw new AppError('INVALID_MIGRATION_SOURCE', 400);
  const workIds = new Set<string>();
  for (const work of input.works) {
    if (!work.id || !work.title || !Array.isArray(work.volumes) || workIds.has(work.id)) throw new AppError('INVALID_MIGRATION_SOURCE', 400);
    workIds.add(work.id);
    const volumeIds = new Set<string>();
    for (const volume of work.volumes) {
      if (!volume.id || !volume.title || !Array.isArray(volume.chapters) || volumeIds.has(volume.id)) throw new AppError('INVALID_MIGRATION_SOURCE', 400);
      volumeIds.add(volume.id);
      const chapterIds = new Set<string>();
      for (const chapter of volume.chapters) {
        if (!chapter.id || !chapter.title || typeof chapter.content !== 'string' || chapterIds.has(chapter.id)) throw new AppError('INVALID_MIGRATION_SOURCE', 400);
        chapterIds.add(chapter.id);
      }
    }
  }
}

function validateMigrationId(migrationId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(migrationId)) throw new AppError('INVALID_INPUT', 400);
}

async function previewWorks(legacy: LegacyWritingPayload): Promise<MigrationWorkPreview[]> {
  return Promise.all(legacy.works.map(async (work) => ({
    legacyWorkId: work.id,
    title: work.title,
    chapterCount: work.volumes.reduce((total, volume) => total + volume.chapters.length, 0),
    sourceHash: await digest(work),
    needsReview: work.volumes.some((volume) => volume.chapters.some((chapter) => /<(script|style|iframe|object|embed|svg|math)\b/iu.test(chapter.content)))
  })));
}

export type MigrationDependencies = {
  importWork(userId: string, migrationId: string, work: LegacyWork, sourceHash: string): Promise<{ targetWorkId: string }>;
  rollbackWork(userId: string, migrationId: string, targetWorkId: string): Promise<void>;
};

export function createMigrationService(store: MigrationStore, dependencies: MigrationDependencies, now = () => new Date().toISOString()) {
  return {
    async preview(input: { migrationId: string; userId: string; source: LegacyWritingPayload }): Promise<{ run: MigrationRun; repeated: boolean }> {
      validateMigrationId(input.migrationId);
      validateLegacy(input.source);
      const existing = await store.getRun(input.migrationId);
      if (existing) {
        if (existing.userId !== input.userId) throw new AppError('MIGRATION_NOT_FOUND', 404);
        return { run: existing, repeated: true };
      }
      const sourceHash = await digest(input.source);
      const timestamp = now();
      const preview = await previewWorks(input.source);
      const run: MigrationRun = { migrationId: input.migrationId, userId: input.userId, sourceHash, status: 'PREVIEW', preview, createdAt: timestamp, updatedAt: timestamp };
      await store.putRun(run);
      await Promise.all(preview.map((item) => store.putItem({ migrationId: input.migrationId, legacyWorkId: item.legacyWorkId, sourceHash: item.sourceHash, targetWorkId: null, status: 'PREVIEW', errorCode: null })));
      return { run, repeated: false };
    },

    async execute(input: { migrationId: string; userId: string; confirmed: boolean; source: LegacyWritingPayload }): Promise<{ run: MigrationRun; repeated: boolean }> {
      validateMigrationId(input.migrationId);
      if (!input.confirmed) throw new AppError('CONFIRMATION_REQUIRED', 400);
      validateLegacy(input.source);
      const run = await store.getRun(input.migrationId);
      if (!run || run.userId !== input.userId) throw new AppError('MIGRATION_NOT_FOUND', 404);
      if (run.status === 'COMPLETED' || run.status === 'PARTIAL') return { run, repeated: true };
      if (run.sourceHash !== await digest(input.source)) throw new AppError('MIGRATION_SOURCE_CHANGED', 409);

      const started: MigrationRun = { ...run, status: 'RUNNING', updatedAt: now() };
      await store.putRun(started);
      let migrated = 0;
      let failed = 0;
      for (const work of input.source.works) {
        const sourceHash = await digest(work);
        const existing = (await store.listItems(input.migrationId)).find((item) => item.legacyWorkId === work.id);
        if (existing?.status === 'MIGRATED') { migrated += 1; continue; }
        try {
          const result = await dependencies.importWork(input.userId, input.migrationId, work, sourceHash);
          await store.putItem({ migrationId: input.migrationId, legacyWorkId: work.id, sourceHash, targetWorkId: result.targetWorkId, status: 'MIGRATED', errorCode: null });
          migrated += 1;
        } catch (error) {
          await store.putItem({ migrationId: input.migrationId, legacyWorkId: work.id, sourceHash, targetWorkId: null, status: 'FAILED', errorCode: error instanceof AppError ? error.code : 'MIGRATION_IMPORT_FAILED' });
          failed += 1;
        }
      }
      const completed: MigrationRun = { ...started, status: failed ? (migrated ? 'PARTIAL' : 'FAILED') : 'COMPLETED', updatedAt: now() };
      await store.putRun(completed);
      return { run: completed, repeated: false };
    },

    async rollback(input: { migrationId: string; userId: string }): Promise<MigrationRun> {
      validateMigrationId(input.migrationId);
      const run = await store.getRun(input.migrationId);
      if (!run || run.userId !== input.userId) throw new AppError('MIGRATION_NOT_FOUND', 404);
      for (const item of await store.listItems(input.migrationId)) {
        if (item.status !== 'MIGRATED' || !item.targetWorkId) continue;
        await dependencies.rollbackWork(input.userId, input.migrationId, item.targetWorkId);
        await store.putItem({ ...item, status: 'ROLLED_BACK', errorCode: null });
      }
      const rolledBack: MigrationRun = { ...run, status: 'ROLLED_BACK', updatedAt: now() };
      await store.putRun(rolledBack);
      return rolledBack;
    }
  };
}
