import { describe, expect, it, vi } from 'vitest';
import { createD1TrashStore } from './trash-d1-store';

describe('D1 trash store', () => {
  it('deletes dependent rows before removing private R2 objects', async () => {
    const statements: string[] = []; const batch = vi.fn(async () => []); const remove = vi.fn(async () => undefined);
    const database = { prepare(sql: string) { return { bind() { statements.push(sql); return { first: async () => ({ id: 'w' }), all: async () => ({ results: [{ object_key: 'users/u/private.docx' }] }), run: async () => ({ success: true }) }; } }; }, batch } as unknown as D1Database;
    const objects = { delete: remove } as unknown as R2Bucket;
    await createD1TrashStore(database, objects).permanentlyDelete('u', 'w');
    expect(batch).toHaveBeenCalledOnce(); expect(statements.some((sql) => sql.includes('DELETE FROM chapter_versions'))).toBe(true); expect(statements.some((sql) => sql.includes('DELETE FROM works'))).toBe(true); expect(remove).toHaveBeenCalledWith('users/u/private.docx');
  });
});
