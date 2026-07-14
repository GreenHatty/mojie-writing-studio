import { AppError } from '../errors';

export type WorkSearchResult = { chapterId: string; chapterTitle: string; volumeTitle: string; snippet: string; matchCount: number };

function makeSnippet(value: string, query: string): string {
  const position = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (position < 0) return value.slice(0, 140);
  const start = Math.max(0, position - 44);
  const end = Math.min(value.length, position + query.length + 80);
  return `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`;
}

function occurrences(value: string, query: string): number {
  const haystack = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let index = 0;
  let count = 0;
  while ((index = haystack.indexOf(needle, index)) >= 0) { count += 1; index += Math.max(needle.length, 1); }
  return count;
}

type SearchRow = { id: string; chapter_title: string; volume_title: string; plain_text: string };

export function createD1WorkSearchStore(database: D1Database) {
  return {
    async search(userId: string, workId: string, query: string): Promise<WorkSearchResult[]> {
      const readable = await database.prepare("SELECT w.id FROM works w LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wa.user_id IS NOT NULL)")
        .bind(userId, workId, userId).first<{ id: string }>();
      if (!readable) throw new AppError('NOT_FOUND', 404);
      const normalized = query.trim();
      if (!normalized) return [];
      const rows = await database.prepare(`SELECT c.id, c.title AS chapter_title, v.title AS volume_title, c.plain_text
        FROM chapters c JOIN volumes v ON v.id = c.volume_id
        WHERE c.work_id = ? AND c.deleted_at IS NULL AND v.deleted_at IS NULL
          AND (instr(lower(c.title), lower(?)) > 0 OR instr(lower(c.plain_text), lower(?)) > 0)
        ORDER BY v.position, c.position LIMIT 100`).bind(workId, normalized, normalized).all<SearchRow>();
      return rows.results.map((row) => {
        const fullText = `${row.chapter_title}\n${row.plain_text}`;
        return { chapterId: row.id, chapterTitle: row.chapter_title, volumeTitle: row.volume_title, snippet: makeSnippet(row.plain_text || row.chapter_title, normalized), matchCount: occurrences(fullText, normalized) };
      });
    }
  };
}
