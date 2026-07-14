import { AppError } from '../errors';

export type TrashedChapterDto = { id: string; workId: string; volumeId: string; title: string; deletedAt: string; deleteReason: string | null };

type EditableChapter = { id: string; work_id: string; volume_id: string; title: string };

async function editableChapter(database: D1Database, userId: string, chapterId: string, includeDeleted = false): Promise<EditableChapter> {
  const deletedFilter = includeDeleted ? '' : 'AND c.deleted_at IS NULL';
  const row = await database.prepare(`SELECT c.id, c.work_id, c.volume_id, c.title FROM chapters c
    JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL
    WHERE c.id = ? ${deletedFilter} AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')`)
    .bind(userId, chapterId, userId).first<EditableChapter>();
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}

async function editableWork(database: D1Database, userId: string, workId: string): Promise<void> {
  const row = await database.prepare("SELECT w.id FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
    .bind(userId, workId, userId).first<{ id: string }>();
  if (!row) throw new AppError('NOT_FOUND', 404);
}

export function createD1TrashStore(database: D1Database) {
  return {
    async listDeletedChapters(userId: string, workId: string): Promise<TrashedChapterDto[]> {
      await editableWork(database, userId, workId);
      const rows = await database.prepare('SELECT id, work_id, volume_id, title, deleted_at, delete_reason FROM chapters WHERE work_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200')
        .bind(workId).all<{ id: string; work_id: string; volume_id: string; title: string; deleted_at: string; delete_reason: string | null }>();
      return rows.results.map((row) => ({ id: row.id, workId: row.work_id, volumeId: row.volume_id, title: row.title, deletedAt: row.deleted_at, deleteReason: row.delete_reason }));
    },
    async deleteChapter(userId: string, chapterId: string, reason: string | null): Promise<{ workId: string }> {
      const chapter = await editableChapter(database, userId, chapterId);
      const remaining = await database.prepare('SELECT COUNT(*) AS count FROM chapters WHERE work_id = ? AND deleted_at IS NULL').bind(chapter.work_id).first<{ count: number }>();
      if (Number(remaining?.count ?? 0) <= 1) throw new AppError('CANNOT_DELETE_LAST_CHAPTER', 409);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE chapters SET deleted_at = ?, deleted_by = ?, delete_reason = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, userId, reason?.trim() || null, now, chapterId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, chapter.work_id)
      ]);
      return { workId: chapter.work_id };
    },
    async restoreChapter(userId: string, workId: string, chapterId: string): Promise<void> {
      await editableWork(database, userId, workId);
      const chapter = await editableChapter(database, userId, chapterId, true);
      if (chapter.work_id !== workId) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE chapters SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_at = ? WHERE id = ? AND work_id = ? AND deleted_at IS NOT NULL').bind(now, chapterId, workId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
    }
  };
}
