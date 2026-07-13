import { AppError } from '../errors';

export type PrivateNoteDto = { id: string; chapterId: string; body: string; updatedAt: string };

async function assertReadableChapter(database: D1Database, userId: string, chapterId: string): Promise<void> {
  const row = await database.prepare("SELECT c.id FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL)")
    .bind(userId, chapterId, userId).first<{ id: string }>();
  if (!row) throw new AppError('NOT_FOUND', 404);
}

export function createD1PrivateNoteStore(database: D1Database) {
  return {
    async get(userId: string, chapterId: string): Promise<PrivateNoteDto | null> {
      await assertReadableChapter(database, userId, chapterId);
      const row = await database.prepare('SELECT id, chapter_id, body, updated_at FROM chapter_notes WHERE chapter_id = ? AND author_id = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(chapterId, userId).first<{ id: string; chapter_id: string; body: string; updated_at: string }>();
      return row ? { id: row.id, chapterId: row.chapter_id, body: row.body, updatedAt: row.updated_at } : null;
    },
    async put(userId: string, chapterId: string, body: string): Promise<PrivateNoteDto> {
      await assertReadableChapter(database, userId, chapterId);
      const now = new Date().toISOString();
      const existing = await database.prepare('SELECT id, created_at FROM chapter_notes WHERE chapter_id = ? AND author_id = ? ORDER BY updated_at DESC LIMIT 1')
        .bind(chapterId, userId).first<{ id: string; created_at: string }>();
      const id = existing?.id ?? crypto.randomUUID();
      if (existing) {
        await database.prepare('UPDATE chapter_notes SET body = ?, updated_at = ? WHERE id = ? AND author_id = ?').bind(body, now, id, userId).run();
      } else {
        await database.prepare('INSERT INTO chapter_notes (id, chapter_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, chapterId, userId, body, now, now).run();
      }
      return { id, chapterId, body, updatedAt: now };
    }
  };
}
