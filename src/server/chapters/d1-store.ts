import type { CanonicalContent } from '../contracts';
import { canonicalPlainText, normalizeCanonicalContent } from '../content/canonical';
import { AppError } from '../errors';
import type { ChapterDto, ChapterHandlerStore, ChapterSaveResult } from './handlers';

type ChapterRow = {
  id: string;
  work_id: string;
  title: string;
  canonical_content: string;
  plain_text: string;
  revision: number;
};

type StoredOperation = {
  user_id: string;
  chapter_id: string;
  request_digest: string | null;
  result_json: string | null;
};

function parseCanonicalContent(value: string): CanonicalContent {
  return normalizeCanonicalContent(JSON.parse(value) as CanonicalContent);
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

async function digestSaveRequest(input: { baseRevision: number; canonicalContent: CanonicalContent }): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify({ baseRevision: input.baseRevision, canonicalContent: normalizeCanonicalContent(input.canonicalContent) }));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function existingOperation(
  database: D1Database,
  input: { userId: string; chapterId: string; clientOperationId: string },
  requestDigest: string
): Promise<ChapterSaveResult | null> {
  const prior = await database.prepare(
    'SELECT user_id, chapter_id, request_digest, result_json FROM sync_operations WHERE client_operation_id = ?'
  ).bind(input.clientOperationId).first<StoredOperation>();
  if (!prior) return null;
  // An operation id may never be replayed for different content, a different
  // chapter, or another user.  Do not leak the original operation's result.
  if (prior.user_id !== input.userId || prior.chapter_id !== input.chapterId || prior.request_digest !== requestDigest) {
    throw new AppError('SYNC_OPERATION_REUSED', 409);
  }
  if (!prior.result_json) throw new AppError('SYNC_OPERATION_PENDING', 409);
  return JSON.parse(prior.result_json) as ChapterSaveResult;
}

export function createD1ChapterStore(database: D1Database): ChapterHandlerStore {
  return {
    async get(userId, chapterId) {
      const row = await database.prepare(
        "SELECT c.id, c.work_id, c.title, c.canonical_content, c.plain_text, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL)"
      ).bind(userId, chapterId, userId).first<ChapterRow>();
      return row ? mapChapter(row) : null;
    },

    async save(input) {
      const requestDigest = await digestSaveRequest(input);
      const previous = await existingOperation(database, input, requestDigest);
      if (previous) return previous;

      const current = await database.prepare(
        "SELECT c.id, c.work_id, c.title, c.canonical_content, c.plain_text, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.role = 'EDITOR')"
      ).bind(input.userId, input.chapterId, input.userId).first<ChapterRow>();
      if (!current) throw new AppError('NOT_FOUND', 404);

      const canonical = normalizeCanonicalContent(input.canonicalContent);
      const canonicalJson = JSON.stringify(canonical);
      const plainText = canonicalPlainText(canonical);
      const wordCount = Array.from(plainText.replace(/\s/g, '')).length;

      if (Number(current.revision) !== input.baseRevision) {
        const currentVersionId = crypto.randomUUID();
        const submittedVersionId = crypto.randomUUID();
        const conflictVersionId = crypto.randomUUID();
        const conflictId = crypto.randomUUID();
        const result: ChapterSaveResult = { kind: 'conflict', currentRevision: Number(current.revision), conflictId };
        try {
          await database.batch([
            database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(currentVersionId, current.id, current.canonical_content, current.plain_text, Array.from(current.plain_text.replace(/\s/g, '')).length, current.revision, 'CONFLICT_CURRENT', input.userId, input.savedAt),
            database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(submittedVersionId, current.id, canonicalJson, plainText, wordCount, input.baseRevision, 'CONFLICT_SUBMITTED', input.userId, input.savedAt),
            database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(conflictVersionId, current.id, canonicalJson, plainText, wordCount, input.baseRevision, 'CONFLICT_COPY', input.userId, input.savedAt),
            database.prepare('INSERT INTO chapter_conflicts (id, chapter_id, current_version_id, submitted_version_id, conflict_version_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(conflictId, current.id, currentVersionId, submittedVersionId, conflictVersionId, 'OPEN', input.savedAt),
            database.prepare('INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.clientOperationId, input.userId, input.chapterId, requestDigest, JSON.stringify(result), input.savedAt)
          ]);
        } catch (error) {
          const replay = await existingOperation(database, input, requestDigest);
          if (replay) return replay;
          throw error;
        }
        return result;
      }

      const nextRevision = input.baseRevision + 1;
      const result: ChapterSaveResult = { kind: 'saved', revision: nextRevision };
      try {
        await database.batch([
          database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), current.id, current.canonical_content, current.plain_text, Array.from(current.plain_text.replace(/\s/g, '')).length, current.revision, 'AUTO', input.userId, input.savedAt),
          database.prepare('UPDATE chapters SET canonical_content = ?, plain_text = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(canonicalJson, plainText, wordCount, nextRevision, input.savedAt, input.chapterId, input.baseRevision),
          database.prepare('INSERT INTO sync_operations (client_operation_id, user_id, chapter_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(input.clientOperationId, input.userId, input.chapterId, requestDigest, JSON.stringify(result), input.savedAt)
        ]);
      } catch (error) {
        const replay = await existingOperation(database, input, requestDigest);
        if (replay) return replay;
        throw error;
      }
      return result;
    }
  };
}
