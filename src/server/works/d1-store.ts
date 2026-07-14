import { emptyCanonicalContent } from '../content/canonical';
import { AppError } from '../errors';
import type { ServerChapter, WorkDirectory, WorkDirectoryChapter, WorkDirectoryVolume, WorkGraph, WorkSummary } from './service';

type DirectoryWorkRow = { id: string; title: string; kind: WorkDirectory['kind']; status: string; updated_at: string; role: WorkDirectory['role'] };
type DirectoryVolumeRow = { id: string; work_id: string; title: string; position: number };
type DirectoryChapterRow = { id: string; work_id: string; volume_id: string; title: string; word_count: number; revision: number; position: number };

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
    },
    async getDirectory(userId: string, workId: string): Promise<WorkDirectory | null> {
      const work = await database.prepare("SELECT w.id, w.title, w.kind, w.status, w.updated_at, CASE WHEN w.owner_id = ? THEN 'WORK_OWNER' ELSE wa.role END AS role FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL)")
        .bind(userId, userId, workId, userId).first<DirectoryWorkRow>();
      if (!work) return null;
      const [volumeRows, chapterRows] = await Promise.all([
        database.prepare('SELECT id, work_id, title, position FROM volumes WHERE work_id = ? AND deleted_at IS NULL ORDER BY position').bind(workId).all<DirectoryVolumeRow>(),
        database.prepare('SELECT id, work_id, volume_id, title, word_count, revision, position FROM chapters WHERE work_id = ? AND deleted_at IS NULL ORDER BY volume_id, position').bind(workId).all<DirectoryChapterRow>()
      ]);
      return {
        id: work.id,
        title: work.title,
        kind: work.kind,
        status: work.status,
        updatedAt: work.updated_at,
        role: work.role,
        volumes: volumeRows.results.map((volume) => ({
          id: volume.id,
          workId: volume.work_id,
          title: volume.title,
          position: Number(volume.position),
          chapters: chapterRows.results.filter((chapter) => chapter.volume_id === volume.id).map((chapter): WorkDirectoryChapter => ({
            id: chapter.id,
            workId: chapter.work_id,
            volumeId: chapter.volume_id,
            title: chapter.title,
            wordCount: Number(chapter.word_count),
            revision: Number(chapter.revision),
            position: Number(chapter.position)
          }))
        }))
      };
    },
    async createChapter(userId: string, workId: string, volumeId: string | null, title: string | null): Promise<WorkDirectoryChapter> {
      const access = await database.prepare("SELECT w.id, CASE WHEN w.owner_id = ? THEN 'WORK_OWNER' ELSE wa.role END AS role FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
        .bind(userId, userId, workId, userId).first<{ id: string; role: 'WORK_OWNER' | 'EDITOR' | null }>();
      if (!access) throw new AppError('FORBIDDEN', 403);
      const volume = volumeId
        ? await database.prepare('SELECT id, work_id FROM volumes WHERE id = ? AND work_id = ? AND deleted_at IS NULL').bind(volumeId, workId).first<{ id: string; work_id: string }>()
        : await database.prepare('SELECT id, work_id FROM volumes WHERE work_id = ? AND deleted_at IS NULL ORDER BY position DESC LIMIT 1').bind(workId).first<{ id: string; work_id: string }>();
      if (!volume) throw new AppError('NOT_FOUND', 404);
      const positionRow = await database.prepare('SELECT COALESCE(MAX(position), -1) AS position FROM chapters WHERE volume_id = ? AND deleted_at IS NULL').bind(volume.id).first<{ position: number }>();
      const position = Number(positionRow?.position ?? -1) + 1;
      const timestamp = new Date().toISOString();
      const chapter: WorkDirectoryChapter = { id: crypto.randomUUID(), workId, volumeId: volume.id, title: title?.trim() || `第${position + 1}章`, wordCount: 0, revision: 0, position };
      await database.batch([
        database.prepare('INSERT INTO chapters (id, work_id, volume_id, title, schema_version, canonical_content, plain_text, word_count, status, position, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)')
          .bind(chapter.id, workId, volume.id, chapter.title, 1, JSON.stringify(emptyCanonicalContent()), '', 'DRAFT', position, timestamp, timestamp),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(timestamp, workId)
      ]);
      return chapter;
    },
    async createVolume(userId: string, workId: string, title: string | null): Promise<WorkDirectoryVolume> {
      const access = await database.prepare("SELECT w.id FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
        .bind(userId, workId, userId).first<{ id: string }>();
      if (!access) throw new AppError('FORBIDDEN', 403);
      const positionRow = await database.prepare('SELECT COALESCE(MAX(position), -1) AS position FROM volumes WHERE work_id = ? AND deleted_at IS NULL').bind(workId).first<{ position: number }>();
      const position = Number(positionRow?.position ?? -1) + 1;
      const now = new Date().toISOString();
      const volume: WorkDirectoryVolume = { id: crypto.randomUUID(), workId, title: title?.trim() || `第${position + 1}卷`, position, chapters: [] };
      await database.batch([
        database.prepare('INSERT INTO volumes (id, work_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(volume.id, workId, volume.title, position, now, now),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
      return volume;
    },
    async renameVolume(userId: string, workId: string, volumeId: string, title: string): Promise<WorkDirectoryVolume> {
      const access = await database.prepare("SELECT w.id FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
        .bind(userId, workId, userId).first<{ id: string }>();
      if (!access) throw new AppError('FORBIDDEN', 403);
      const volume = await database.prepare('SELECT id, work_id, title, position FROM volumes WHERE id = ? AND work_id = ? AND deleted_at IS NULL').bind(volumeId, workId).first<DirectoryVolumeRow>();
      if (!volume) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE volumes SET title = ?, updated_at = ? WHERE id = ?').bind(title, now, volumeId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
      return { id: volume.id, workId: volume.work_id, title, position: Number(volume.position), chapters: [] };
    },
    async reorderChapters(userId: string, workId: string, volumeId: string, chapterIds: string[]): Promise<void> {
      const access = await database.prepare("SELECT w.id FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
        .bind(userId, workId, userId).first<{ id: string }>();
      if (!access) throw new AppError('FORBIDDEN', 403);
      const volume = await database.prepare('SELECT id FROM volumes WHERE id = ? AND work_id = ? AND deleted_at IS NULL').bind(volumeId, workId).first<{ id: string }>();
      if (!volume) throw new AppError('NOT_FOUND', 404);
      const existing = await database.prepare('SELECT id FROM chapters WHERE work_id = ? AND volume_id = ? AND deleted_at IS NULL ORDER BY position').bind(workId, volumeId).all<{ id: string }>();
      const expected = new Set(existing.results.map((chapter) => chapter.id));
      if (expected.size !== chapterIds.length || new Set(chapterIds).size !== chapterIds.length || chapterIds.some((id) => !expected.has(id))) throw new AppError('INVALID_ORDER', 400);
      const now = new Date().toISOString();
      await database.batch([
        ...chapterIds.map((chapterId, position) => database.prepare('UPDATE chapters SET position = ?, updated_at = ? WHERE id = ? AND work_id = ? AND volume_id = ?').bind(position, now, chapterId, workId, volumeId)),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
    }
  };
}
