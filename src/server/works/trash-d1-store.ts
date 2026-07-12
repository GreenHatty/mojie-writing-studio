import { AppError } from '../errors';
import type { TrashStore, TrashedWork } from './trash-handler';

export function createD1TrashStore(database: D1Database, objects: R2Bucket): TrashStore {
  async function owned(userId: string, workId: string, deleted: boolean) {
    const sql = deleted ? 'SELECT id FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL' : 'SELECT id FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL';
    const row = await database.prepare(sql).bind(workId, userId).first<{ id: string }>();
    if (!row) throw new AppError('NOT_FOUND', 404);
  }
  return {
    async list(userId): Promise<TrashedWork[]> {
      const rows = await database.prepare('SELECT id, title, deleted_at, delete_reason FROM works WHERE owner_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC').bind(userId).all<{ id: string; title: string; deleted_at: string; delete_reason: string | null }>();
      return rows.results.map((row) => ({ id: row.id, title: row.title, deletedAt: row.deleted_at, deleteReason: row.delete_reason }));
    },
    async softDelete(userId, workId) { await owned(userId, workId, false); const now = new Date().toISOString(); await database.prepare('UPDATE works SET deleted_at = ?, deleted_by = ?, delete_reason = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(now, userId, 'USER_DELETED', now, workId, userId).run(); },
    async restore(userId, workId) { await owned(userId, workId, true); await database.prepare('UPDATE works SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_at = ? WHERE id = ? AND owner_id = ?').bind(new Date().toISOString(), workId, userId).run(); },
    async permanentlyDelete(userId, workId) {
      await owned(userId, workId, true);
      const files = await database.prepare('SELECT object_key FROM file_metadata WHERE work_id = ? AND owner_id = ?').bind(workId, userId).all<{ object_key: string }>();
      await database.batch([
        database.prepare('DELETE FROM chapter_conflicts WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM chapter_notes WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM chapter_comments WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM change_suggestions WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM sync_operations WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM chapter_versions WHERE chapter_id IN (SELECT id FROM chapters WHERE work_id = ?)').bind(workId),
        database.prepare('DELETE FROM chapters WHERE work_id = ?').bind(workId),
        database.prepare('DELETE FROM volumes WHERE work_id = ?').bind(workId),
        database.prepare('DELETE FROM invitations WHERE work_id = ?').bind(workId),
        database.prepare('DELETE FROM work_members WHERE work_id = ?').bind(workId),
        database.prepare('DELETE FROM writing_goals WHERE work_id = ?').bind(workId),
        database.prepare('DELETE FROM file_metadata WHERE work_id = ? AND owner_id = ?').bind(workId, userId),
        database.prepare('DELETE FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL').bind(workId, userId)
      ]);
      await Promise.all(files.results.map((file) => objects.delete(file.object_key)));
    }
  };
}
