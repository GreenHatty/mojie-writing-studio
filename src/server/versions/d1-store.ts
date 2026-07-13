import type { CanonicalContent } from '../contracts';
import { canonicalPlainText, normalizeCanonicalContent } from '../content/canonical';
import { AppError } from '../errors';

export type ChapterVersionDto = { id: string; chapterId: string; label: string | null; reason: string; sourceRevision: number; wordCount: number; createdAt: string };
export type RestoredChapter = { id: string; workId: string; title: string; canonicalContent: CanonicalContent; plainText: string; revision: number };

type EditableChapterRow = { id: string; work_id: string; title: string; schema_version: number; canonical_content: string; plain_text: string; word_count: number; revision: number; legacy_html: string | null };

async function editableChapter(database: D1Database, userId: string, chapterId: string): Promise<EditableChapterRow> {
  const row = await database.prepare("SELECT c.id, c.work_id, c.title, c.schema_version, c.canonical_content, c.plain_text, c.word_count, c.revision, c.legacy_html FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')")
    .bind(userId, chapterId, userId).first<EditableChapterRow>();
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}

export function createD1ChapterVersionStore(database: D1Database) {
  return {
    async list(userId: string, chapterId: string): Promise<ChapterVersionDto[]> {
      // A viewer can inspect version metadata but not another author's private
      // note; the chapter visibility query is intentionally separate.
      const readable = await database.prepare("SELECT c.id FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL)")
        .bind(userId, chapterId, userId).first<{ id: string }>();
      if (!readable) throw new AppError('NOT_FOUND', 404);
      const rows = await database.prepare('SELECT id, chapter_id, label, reason, source_revision, word_count, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC').bind(chapterId).all<{ id: string; chapter_id: string; label: string | null; reason: string; source_revision: number; word_count: number; created_at: string }>();
      return rows.results.map((row) => ({ id: row.id, chapterId: row.chapter_id, label: row.label, reason: row.reason, sourceRevision: Number(row.source_revision), wordCount: Number(row.word_count), createdAt: row.created_at }));
    },
    async createManual(userId: string, chapterId: string, label: string): Promise<ChapterVersionDto> {
      const chapter = await editableChapter(database, userId, chapterId);
      const version: ChapterVersionDto = { id: crypto.randomUUID(), chapterId, label: label.trim() || '命名版本', reason: 'MANUAL', sourceRevision: Number(chapter.revision), wordCount: Number(chapter.word_count), createdAt: new Date().toISOString() };
      await database.prepare('INSERT INTO chapter_versions (id, chapter_id, schema_version, canonical_content, plain_text, legacy_html, word_count, source_revision, reason, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(version.id, chapterId, chapter.schema_version, chapter.canonical_content, chapter.plain_text, chapter.legacy_html, chapter.word_count, chapter.revision, version.reason, version.label, userId, version.createdAt).run();
      return version;
    },
    async restore(userId: string, chapterId: string, versionId: string, baseRevision: number): Promise<RestoredChapter> {
      const chapter = await editableChapter(database, userId, chapterId);
      if (Number(chapter.revision) !== baseRevision) throw new AppError('REVISION_CONFLICT', 409);
      const version = await database.prepare('SELECT schema_version, canonical_content, plain_text, legacy_html, word_count FROM chapter_versions WHERE id = ? AND chapter_id = ?').bind(versionId, chapterId).first<{ schema_version: number; canonical_content: string; plain_text: string; legacy_html: string | null; word_count: number }>();
      if (!version) throw new AppError('NOT_FOUND', 404);
      const beforeId = crypto.randomUUID();
      const now = new Date().toISOString();
      const canonical = normalizeCanonicalContent(JSON.parse(version.canonical_content) as CanonicalContent);
      const plainText = canonicalPlainText(canonical);
      const wordCount = Array.from(plainText.replace(/\s/gu, '')).length;
      const nextRevision = Number(chapter.revision) + 1;
      await database.batch([
        database.prepare('INSERT INTO chapter_versions (id, chapter_id, schema_version, canonical_content, plain_text, legacy_html, word_count, source_revision, reason, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(beforeId, chapterId, chapter.schema_version, chapter.canonical_content, chapter.plain_text, chapter.legacy_html, chapter.word_count, chapter.revision, 'RESTORE_BEFORE', '恢复前快照', userId, now),
        database.prepare('UPDATE chapters SET schema_version = ?, canonical_content = ?, plain_text = ?, legacy_html = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?')
          .bind(canonical.schemaVersion ?? 1, JSON.stringify(canonical), plainText, version.legacy_html, wordCount, nextRevision, now, chapterId, baseRevision)
      ]);
      return { id: chapter.id, workId: chapter.work_id, title: chapter.title, canonicalContent: canonical, plainText, revision: nextRevision };
    }
  };
}
