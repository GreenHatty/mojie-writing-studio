import type { CanonicalContent } from '../contracts';
import type { ChapterDto, ChapterHandlerStore, ChapterSaveResult } from './handlers';

type ChapterRow = {
  id: string;
  work_id: string;
  title: string;
  canonical_content: string;
  plain_text: string;
  revision: number;
};

function parseCanonicalContent(value: string): CanonicalContent {
  const parsed = JSON.parse(value) as CanonicalContent;
  if (!parsed || parsed.type !== 'doc') throw new Error('Invalid canonical chapter content');
  return parsed;
}

function textFromNode(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { text?: unknown; content?: unknown[]; type?: unknown };
  if (typeof record.text === 'string') return record.text;
  if (!Array.isArray(record.content)) return '';
  const separator = record.type === 'doc' ? '\n' : '';
  return record.content.map(textFromNode).filter(Boolean).join(separator);
}

function mapChapter(row: ChapterRow): ChapterDto {
  return {
    id: row.id,
    workId: row.work_id,
    title: row.title,
    canonicalContent: parseCanonicalContent(row.canonical_content),
    plainText: row.plain_text,
    revision: Number(row.revision)
  };
}

export function createD1ChapterStore(database: D1Database): ChapterHandlerStore {
  return {
    async get(userId, chapterId) {
      const row = await database.prepare(
        "SELECT c.id, c.work_id, c.title, c.canonical_content, c.plain_text, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.user_id IS NOT NULL)"
      ).bind(userId, chapterId, userId).first<ChapterRow>();
      return row ? mapChapter(row) : null;
    },

    async save(input) {
      const previous = await database.prepare(
        'SELECT result_json FROM sync_operations WHERE client_operation_id = ? AND user_id = ? AND chapter_id = ?'
      ).bind(input.clientOperationId, input.userId, input.chapterId).first<{ result_json: string | null }>();
      if (previous?.result_json) return JSON.parse(previous.result_json) as ChapterSaveResult;

      const current = await database.prepare(
        "SELECT c.id, c.work_id, c.title, c.canonical_content, c.plain_text, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.role = 'EDITOR')"
      ).bind(input.userId, input.chapterId, input.userId).first<ChapterRow>();
      if (!current) throw new Error('Chapter not found or not editable');

      const canonicalJson = JSON.stringify(input.canonicalContent);
      const plainText = textFromNode(input.canonicalContent);
      const wordCount = Array.from(plainText.replace(/\s/g, '')).length;

      if (Number(current.revision) !== input.baseRevision) {
        const currentVersionId = crypto.randomUUID();
        const submittedVersionId = crypto.randomUUID();
        const conflictVersionId = crypto.randomUUID();
        const conflictId = crypto.randomUUID();
        const result: ChapterSaveResult = { kind: 'conflict', currentRevision: Number(current.revision), conflictId };
        await database.batch([
          database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(currentVersionId, current.id, current.canonical_content, current.plain_text, Array.from(current.plain_text.replace(/\s/g, '')).length, current.revision, 'CONFLICT_CURRENT', input.userId, input.savedAt),
          database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(submittedVersionId, current.id, canonicalJson, plainText, wordCount, input.baseRevision, 'CONFLICT_SUBMITTED', input.userId, input.savedAt),
          database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(conflictVersionId, current.id, canonicalJson, plainText, wordCount, input.baseRevision, 'CONFLICT_COPY', input.userId, input.savedAt),
          database.prepare('INSERT INTO chapter_conflicts (id, chapter_id, current_version_id, submitted_version_id, conflict_version_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(conflictId, current.id, currentVersionId, submittedVersionId, conflictVersionId, 'OPEN', input.savedAt),
          database.prepare('INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.clientOperationId, input.userId, input.chapterId, null, JSON.stringify(result), input.savedAt)
        ]);
        return result;
      }

      const nextRevision = input.baseRevision + 1;
      const result: ChapterSaveResult = { kind: 'saved', revision: nextRevision };
      await database.batch([
        database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), current.id, current.canonical_content, current.plain_text, Array.from(current.plain_text.replace(/\s/g, '')).length, current.revision, 'AUTO', input.userId, input.savedAt),
        database.prepare('UPDATE chapters SET canonical_content = ?, plain_text = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(canonicalJson, plainText, wordCount, nextRevision, input.savedAt, input.chapterId, input.baseRevision),
        database.prepare('INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.clientOperationId, input.userId, input.chapterId, null, JSON.stringify(result), input.savedAt)
      ]);
      return result;
    }
  };
}
