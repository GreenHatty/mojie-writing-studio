import { legacyHtmlToCanonical } from '../content/canonical';
import { AppError } from '../errors';
import type { LegacyWork, MigrationItem, MigrationRun, MigrationStore } from './service';

type RunRow = { migration_id: string; user_id: string; source_hash: string; status: MigrationRun['status']; summary_json: string; created_at: string; updated_at: string };
type ItemRow = { migration_id: string; legacy_work_id: string; source_hash: string; target_work_id: string | null; status: MigrationItem['status']; error_code: string | null };

export function createD1MigrationStore(database: D1Database): MigrationStore {
  return {
    async getRun(migrationId) {
      const row = await database.prepare('SELECT migration_id, user_id, source_hash, status, summary_json, created_at, updated_at FROM migration_runs WHERE migration_id=?').bind(migrationId).first<RunRow>();
      return row ? { migrationId: row.migration_id, userId: row.user_id, sourceHash: row.source_hash, status: row.status, preview: JSON.parse(row.summary_json), createdAt: row.created_at, updatedAt: row.updated_at } : null;
    },
    async putRun(run) {
      await database.prepare(`INSERT INTO migration_runs (migration_id, user_id, source_database, source_hash, summary_json, status, error_code, created_at, updated_at)
        VALUES (?, ?, 'legacy-writing-v1', ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(migration_id) DO UPDATE SET status=excluded.status, summary_json=excluded.summary_json, updated_at=excluded.updated_at`)
        .bind(run.migrationId, run.userId, run.sourceHash, JSON.stringify(run.preview), run.status, run.createdAt, run.updatedAt).run();
    },
    async putItem(item) {
      await database.prepare(`INSERT INTO migration_work_items (migration_id, legacy_work_id, target_work_id, source_hash, status, error_code)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(migration_id, legacy_work_id) DO UPDATE SET target_work_id=excluded.target_work_id, source_hash=excluded.source_hash, status=excluded.status, error_code=excluded.error_code`)
        .bind(item.migrationId, item.legacyWorkId, item.targetWorkId, item.sourceHash, item.status, item.errorCode).run();
    },
    async listItems(migrationId) {
      const result = await database.prepare('SELECT migration_id, legacy_work_id, source_hash, target_work_id, status, error_code FROM migration_work_items WHERE migration_id=? ORDER BY legacy_work_id').bind(migrationId).all<ItemRow>();
      return result.results.map((row) => ({ migrationId: row.migration_id, legacyWorkId: row.legacy_work_id, sourceHash: row.source_hash, targetWorkId: row.target_work_id, status: row.status, errorCode: row.error_code }));
    }
  };
}

function migrationTargetWorkId(migrationId: string, legacyWorkId: string): string {
  return `migrated:${migrationId}:${legacyWorkId}`;
}

async function sourceDigest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createD1MigrationExecutor(database: D1Database) {
  return {
    async importWork(userId: string, migrationId: string, work: LegacyWork, sourceHash: string): Promise<{ targetWorkId: string }> {
      const targetWorkId = migrationTargetWorkId(migrationId, work.id);
      const existing = await database.prepare('SELECT id FROM works WHERE id=? LIMIT 1').bind(targetWorkId).first<{ id: string }>();
      if (existing) throw new AppError('MIGRATION_TARGET_CONFLICT', 409);
      const timestamp = new Date().toISOString();
      const statements: D1PreparedStatement[] = [
        database.prepare('INSERT INTO works (id, owner_id, title, kind, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(targetWorkId, userId, work.title, work.kind ?? 'long', 'DRAFT', timestamp, timestamp)
      ];
      for (const [volumePosition, volume] of work.volumes.entries()) {
        const volumeId = `migrated:${migrationId}:${volume.id}`;
        statements.push(database.prepare('INSERT INTO volumes (id, work_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(volumeId, targetWorkId, volume.title, volumePosition, timestamp, timestamp));
        for (const [chapterPosition, chapter] of volume.chapters.entries()) {
          const chapterId = `migrated:${migrationId}:${chapter.id}`;
          const converted = legacyHtmlToCanonical(chapter.content);
          const legacyContentHash = await sourceDigest(chapter.content);
          statements.push(database.prepare('INSERT INTO chapters (id, work_id, volume_id, title, schema_version, canonical_content, plain_text, legacy_html, legacy_content_hash, word_count, status, position, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
            .bind(chapterId, targetWorkId, volumeId, chapter.title, converted.canonicalContent.schemaVersion ?? 1, JSON.stringify(converted.canonicalContent), chapter.plainText ?? converted.plainText, converted.legacyHtml, legacyContentHash, Array.from((chapter.plainText ?? converted.plainText).replace(/\s/gu, '')).length, 'DRAFT', chapterPosition, timestamp, timestamp));
        }
      }
      statements.push(database.prepare('INSERT INTO migration_work_items (migration_id, legacy_work_id, target_work_id, source_hash, status, error_code) VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(migration_id, legacy_work_id) DO UPDATE SET target_work_id=excluded.target_work_id, source_hash=excluded.source_hash, status=excluded.status, error_code=NULL').bind(migrationId, work.id, targetWorkId, sourceHash, 'MIGRATED'));
      await database.batch(statements);
      return { targetWorkId };
    },
    async rollbackWork(userId: string, _migrationId: string, targetWorkId: string): Promise<void> {
      const timestamp = new Date().toISOString();
      const result = await database.prepare('UPDATE works SET deleted_at=?, deleted_by=?, delete_reason=?, updated_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(timestamp, userId, 'migration_rollback', timestamp, targetWorkId, userId).run();
      if (result.meta?.changes !== 1) throw new AppError('MIGRATION_ROLLBACK_FAILED', 409);
    }
  };
}
