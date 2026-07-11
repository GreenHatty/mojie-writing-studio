import { AppError } from '../errors';
import type { ChapterContext, ChapterContextStore } from './context-handler';

type AccessRow = { chapter_id: string; work_id: string; owner_id: string; member_role: string | null; canonical_content: string; plain_text: string; word_count: number; revision: number };

async function access(database: D1Database, userId: string, chapterId: string, edit = false): Promise<AccessRow> {
  const row = await database.prepare(
    "SELECT c.id AS chapter_id, c.work_id, w.owner_id, wm.role AS member_role, c.canonical_content, c.plain_text, c.word_count, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.user_id IS NOT NULL)"
  ).bind(userId, chapterId, userId).first<AccessRow>();
  if (!row || (edit && row.owner_id !== userId && row.member_role !== 'EDITOR')) throw new AppError(edit ? 'FORBIDDEN' : 'NOT_FOUND', edit ? 403 : 404);
  return row;
}

export function createD1ChapterContextStore(database: D1Database): ChapterContextStore {
  return {
    async getContext(userId, chapterId): Promise<ChapterContext | null> {
      try { await access(database, userId, chapterId); } catch (error) { if (error instanceof AppError && error.status === 404) return null; throw error; }
      const [note, versions, conflicts] = await Promise.all([
        database.prepare('SELECT body FROM chapter_notes WHERE chapter_id = ? AND author_id = ? ORDER BY updated_at DESC LIMIT 1').bind(chapterId, userId).first<{ body: string }>(),
        database.prepare('SELECT id, label, reason, source_revision, word_count, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 100').bind(chapterId).all<{ id: string; label: string | null; reason: string; source_revision: number; word_count: number; created_at: string }>(),
        database.prepare("SELECT id, current_version_id, submitted_version_id, conflict_version_id, created_at FROM chapter_conflicts WHERE chapter_id = ? AND status = 'OPEN' ORDER BY created_at DESC").bind(chapterId).all<{ id: string; current_version_id: string; submitted_version_id: string; conflict_version_id: string; created_at: string }>()
      ]);
      return {
        note: note ? { body: note.body } : null,
        versions: versions.results.map((row) => ({ id: row.id, label: row.label, reason: row.reason, sourceRevision: Number(row.source_revision), wordCount: Number(row.word_count), createdAt: row.created_at })),
        conflicts: conflicts.results.map((row) => ({ id: row.id, currentVersionId: row.current_version_id, submittedVersionId: row.submitted_version_id, conflictVersionId: row.conflict_version_id, createdAt: row.created_at }))
      };
    },
    async saveNote(userId, chapterId, body): Promise<void> {
      await access(database, userId, chapterId);
      const existing = await database.prepare('SELECT id FROM chapter_notes WHERE chapter_id = ? AND author_id = ? ORDER BY updated_at DESC LIMIT 1').bind(chapterId, userId).first<{ id: string }>();
      const now = new Date().toISOString();
      if (existing) await database.prepare('UPDATE chapter_notes SET body = ?, updated_at = ? WHERE id = ? AND author_id = ?').bind(body, now, existing.id, userId).run();
      else await database.prepare('INSERT INTO chapter_notes (id, chapter_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), chapterId, userId, body, now, now).run();
    },
    async restoreVersion(userId, chapterId, versionId): Promise<{ revision: number }> {
      const current = await access(database, userId, chapterId, true);
      const version = await database.prepare('SELECT canonical_content, plain_text, word_count FROM chapter_versions WHERE id = ? AND chapter_id = ?').bind(versionId, chapterId).first<{ canonical_content: string; plain_text: string; word_count: number }>();
      if (!version) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      const nextRevision = Number(current.revision) + 1;
      await database.batch([
        database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), chapterId, current.canonical_content, current.plain_text, current.word_count, current.revision, 'RESTORE_CURRENT', userId, now),
        database.prepare('UPDATE chapters SET canonical_content = ?, plain_text = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(version.canonical_content, version.plain_text, version.word_count, nextRevision, now, chapterId, current.revision)
      ]);
      return { revision: nextRevision };
    },
    async resolveConflict(userId, chapterId, conflictId, action): Promise<{ revision: number }> {
      const current = await access(database, userId, chapterId, true);
      const conflict = await database.prepare("SELECT conflict_version_id FROM chapter_conflicts WHERE id = ? AND chapter_id = ? AND status = 'OPEN'").bind(conflictId, chapterId).first<{ conflict_version_id: string }>();
      if (!conflict) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      if (action === 'KEEP_CURRENT') {
        await database.prepare("UPDATE chapter_conflicts SET status = 'RESOLVED_KEEP_CURRENT', resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'OPEN'").bind(userId, now, conflictId).run();
        return { revision: Number(current.revision) };
      }
      const version = await database.prepare('SELECT canonical_content, plain_text, word_count FROM chapter_versions WHERE id = ? AND chapter_id = ?').bind(conflict.conflict_version_id, chapterId).first<{ canonical_content: string; plain_text: string; word_count: number }>();
      if (!version) throw new AppError('NOT_FOUND', 404);
      const nextRevision = Number(current.revision) + 1;
      await database.batch([
        database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), chapterId, current.canonical_content, current.plain_text, current.word_count, current.revision, 'CONFLICT_RESOLUTION_CURRENT', userId, now),
        database.prepare('UPDATE chapters SET canonical_content = ?, plain_text = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(version.canonical_content, version.plain_text, version.word_count, nextRevision, now, chapterId, current.revision),
        database.prepare("UPDATE chapter_conflicts SET status = 'RESOLVED_USE_CONFLICT_COPY', resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'OPEN'").bind(userId, now, conflictId)
      ]);
      return { revision: nextRevision };
    }
  };
}
