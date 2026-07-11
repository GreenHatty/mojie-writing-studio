import { describe, expect, it } from 'vitest';
import { createD1ChapterContextStore } from './context-d1-store';

describe('D1 chapter context store', () => {
  it('scopes private notes to the current user while listing chapter versions', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const database = { prepare(sql: string) { return { bind(...values: unknown[]) { calls.push({ sql, values }); return {
      first: async () => sql.includes('FROM chapters c') ? { chapter_id: 'c', work_id: 'w', owner_id: 'u', member_role: null, canonical_content: '{"type":"doc"}', plain_text: '', word_count: 0, revision: 1 } : sql.includes('chapter_notes') ? { body: '私人' } : null,
      all: async () => sql.includes('chapter_versions') ? { results: [{ id: 'v', label: null, reason: 'AUTO', source_revision: 1, word_count: 0, created_at: '2026-07-12T00:00:00Z' }] } : { results: [] }
    }; } }; } } as unknown as D1Database;
    const context = await createD1ChapterContextStore(database).getContext('u', 'c');
    expect(context?.note?.body).toBe('私人');
    expect(context?.versions[0].id).toBe('v');
    expect(calls.find((call) => call.sql.includes('chapter_notes'))?.values).toEqual(['c', 'u']);
  });

  it('does not expose context without explicit work access', async () => {
    const database = { prepare() { return { bind() { return { first: async () => null }; } }; } } as unknown as D1Database;
    await expect(createD1ChapterContextStore(database).getContext('platform-owner', 'foreign')).resolves.toBeNull();
  });
});
