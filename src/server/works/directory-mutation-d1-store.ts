import { AppError } from '../errors';
import type { DirectoryMutationStore } from './directory-mutations';

type EditableWork = { owner_id: string; member_role: string | null };
async function requireEditableWork(database: D1Database, userId: string, workId: string): Promise<void> {
  const row = await database.prepare("SELECT w.owner_id, wm.role AS member_role FROM works w LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.role = 'EDITOR')").bind(userId, workId, userId).first<EditableWork>();
  if (!row) throw new AppError('FORBIDDEN', 403);
}

export function createD1DirectoryMutationStore(database: D1Database): DirectoryMutationStore {
  async function editableChapter(userId: string, chapterId: string) {
    const row = await database.prepare("SELECT c.id, c.work_id, c.volume_id, c.position FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.role = 'EDITOR')").bind(userId, chapterId, userId).first<{ id: string; work_id: string; volume_id: string; position: number }>();
    if (!row) throw new AppError('FORBIDDEN', 403);
    return row;
  }
  return {
    async createChapter(userId, workId, volumeId, title) {
      await requireEditableWork(database, userId, workId);
      const volume = await database.prepare('SELECT id FROM volumes WHERE id = ? AND work_id = ? AND deleted_at IS NULL').bind(volumeId, workId).first<{ id: string }>();
      if (!volume) throw new AppError('NOT_FOUND', 404);
      const position = await database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM chapters WHERE volume_id = ? AND deleted_at IS NULL').bind(volumeId).first<{ next_position: number }>();
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      await database.prepare('INSERT INTO chapters (id, work_id, volume_id, title, canonical_content, plain_text, word_count, status, position, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)').bind(id, workId, volumeId, title, JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }), '', 'DRAFT', Number(position?.next_position ?? 0), now, now).run();
      return { id };
    },
    async renameChapter(userId, chapterId, title) { await editableChapter(userId, chapterId); await database.prepare('UPDATE chapters SET title = ?, updated_at = ? WHERE id = ?').bind(title, new Date().toISOString(), chapterId).run(); },
    async moveChapter(userId, chapterId, direction) {
      const current = await editableChapter(userId, chapterId);
      const neighborSql = direction === 'up'
        ? 'SELECT id, position FROM chapters WHERE volume_id = ? AND deleted_at IS NULL AND position < ? ORDER BY position DESC LIMIT 1'
        : 'SELECT id, position FROM chapters WHERE volume_id = ? AND deleted_at IS NULL AND position > ? ORDER BY position ASC LIMIT 1';
      const neighbor = await database.prepare(neighborSql).bind(current.volume_id, current.position).first<{ id: string; position: number }>();
      if (!neighbor) return;
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE chapters SET position = ?, updated_at = ? WHERE id = ?').bind(neighbor.position, now, current.id),
        database.prepare('UPDATE chapters SET position = ?, updated_at = ? WHERE id = ?').bind(current.position, now, neighbor.id)
      ]);
    }
  };
}
