import type { WorkGraph } from './service';
import type { WorkSummary } from './service';

export function createD1WorkStore(database: D1Database) {
  return {
    async createGraph(graph: WorkGraph): Promise<void> {
      const { work, volume, chapter } = graph;
      await database.batch([
        database.prepare('INSERT INTO works (id, owner_id, title, kind, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(work.id, work.ownerId, work.title, work.kind, work.status, work.updatedAt, work.updatedAt),
        database.prepare('INSERT INTO volumes (id, work_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(volume.id, volume.workId, volume.title, volume.position, work.updatedAt, work.updatedAt),
        database.prepare('INSERT INTO chapters (id, work_id, volume_id, title, canonical_content, plain_text, word_count, status, position, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(chapter.id, chapter.workId, chapter.volumeId, chapter.title, JSON.stringify(chapter.canonicalContent), chapter.plainText, chapter.wordCount, 'DRAFT', chapter.position, chapter.revision, work.updatedAt, work.updatedAt)
      ]);
    },
    async listVisible(userId: string): Promise<WorkSummary[]> {
      const result = await database.prepare("SELECT w.id, w.title, w.kind, w.status, w.updated_at, CASE WHEN w.owner_id = ? THEN 'WORK_OWNER' ELSE wa.role END AS role, COALESCE(SUM(c.word_count), 0) AS total_word_count FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL LEFT JOIN chapters c ON c.work_id = w.id AND c.deleted_at IS NULL WHERE w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL) GROUP BY w.id, w.title, w.kind, w.status, w.updated_at, w.owner_id, wa.role ORDER BY w.updated_at DESC")
        .bind(userId, userId, userId).all<{ id: string; title: string; kind: WorkSummary['kind']; status: string; updated_at: string; role: WorkSummary['role']; total_word_count: number }>();
      return result.results.map((row) => ({ id: row.id, title: row.title, kind: row.kind, status: row.status, updatedAt: row.updated_at, role: row.role, totalWordCount: Number(row.total_word_count) }));
    }
  };
}
