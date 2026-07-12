import type { CanonicalContent } from '../contracts';
import { AppError } from '../errors';
import type { CollaborationStore } from './collaboration-handler';

type Access = { owner_id: string; member_role: string | null; canonical_content: string; plain_text: string; word_count: number; revision: number };
async function chapterAccess(database: D1Database, userId: string, chapterId: string): Promise<Access> {
  const row = await database.prepare("SELECT w.owner_id, wm.role AS member_role, c.canonical_content, c.plain_text, c.word_count, c.revision FROM chapters c JOIN works w ON w.id = c.work_id LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE c.id = ? AND c.deleted_at IS NULL AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.user_id IS NOT NULL)").bind(userId, chapterId, userId).first<Access>();
  if (!row) throw new AppError('NOT_FOUND', 404); return row;
}
function canComment(access: Access, userId: string) { return access.owner_id === userId || access.member_role === 'EDITOR' || access.member_role === 'COMMENTER'; }
function canEdit(access: Access, userId: string) { return access.owner_id === userId || access.member_role === 'EDITOR'; }
function textFromNode(node: unknown): string { if (!node || typeof node !== 'object') return ''; const value = node as { text?: unknown; content?: unknown[]; type?: unknown }; if (typeof value.text === 'string') return value.text; if (!Array.isArray(value.content)) return ''; return value.content.map(textFromNode).filter(Boolean).join(value.type === 'doc' ? '\n' : ''); }

export function createD1CollaborationStore(database: D1Database): CollaborationStore {
  return {
    async createComment(userId, chapterId, body, anchor) {
      const access = await chapterAccess(database, userId, chapterId); if (!canComment(access, userId)) throw new AppError('FORBIDDEN', 403);
      const id = crypto.randomUUID(); const now = new Date().toISOString(); await database.prepare('INSERT INTO chapter_comments (id, chapter_id, author_id, anchor_json, body, thread_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, chapterId, userId, anchor ? JSON.stringify(anchor) : null, body, 'OPEN', now, now).run(); return { id };
    },
    async createSuggestion(userId, chapterId, replacementContent, baseRevision, anchor) {
      const access = await chapterAccess(database, userId, chapterId); if (!canComment(access, userId)) throw new AppError('FORBIDDEN', 403);
      const id = crypto.randomUUID(); const now = new Date().toISOString(); await database.prepare('INSERT INTO change_suggestions (id, chapter_id, author_id, anchor_json, replacement_content, status, base_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, chapterId, userId, JSON.stringify(anchor ?? {}), JSON.stringify(replacementContent), 'PENDING', baseRevision, now, now).run(); return { id };
    },
    async handleSuggestion(userId, chapterId, suggestionId, action) {
      const access = await chapterAccess(database, userId, chapterId); if (!canEdit(access, userId)) throw new AppError('FORBIDDEN', 403);
      const suggestion = await database.prepare("SELECT replacement_content, base_revision FROM change_suggestions WHERE id = ? AND chapter_id = ? AND status = 'PENDING'").bind(suggestionId, chapterId).first<{ replacement_content: string; base_revision: number }>();
      if (!suggestion) throw new AppError('NOT_FOUND', 404); const now = new Date().toISOString();
      if (action === 'reject') { await database.prepare("UPDATE change_suggestions SET status = 'REJECTED', handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'").bind(userId, now, now, suggestionId).run(); return { revision: Number(access.revision) }; }
      if (Number(suggestion.base_revision) !== Number(access.revision)) throw new AppError('REVISION_CONFLICT', 409);
      const canonical = JSON.parse(suggestion.replacement_content) as CanonicalContent; if (canonical.type !== 'doc') throw new AppError('INVALID_SUGGESTION', 422);
      const plainText = textFromNode(canonical); const wordCount = Array.from(plainText.replace(/\s/g, '')).length; const nextRevision = Number(access.revision) + 1;
      await database.batch([
        database.prepare('INSERT INTO chapter_versions (id, chapter_id, canonical_content, plain_text, word_count, source_revision, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), chapterId, access.canonical_content, access.plain_text, access.word_count, access.revision, 'SUGGESTION_ACCEPT_CURRENT', userId, now),
        database.prepare('UPDATE chapters SET canonical_content = ?, plain_text = ?, word_count = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(canonical), plainText, wordCount, nextRevision, now, chapterId, access.revision),
        database.prepare("UPDATE change_suggestions SET status = 'ACCEPTED', handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'").bind(userId, now, now, suggestionId)
      ]);
      return { revision: nextRevision };
    }
  };
}
