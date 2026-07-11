import { describe, expect, it } from 'vitest';
import { createD1ChapterStore } from './d1-store';

describe('D1ChapterStore', () => {
  it('maps an authorized canonical chapter from D1', async () => {
    const database = { prepare() { return { bind() { return { first: async () => ({ id: 'c', work_id: 'w', title: '第1章', canonical_content: '{"type":"doc"}', plain_text: '', revision: 0 }) }; } }; } } as unknown as D1Database;
    await expect(createD1ChapterStore(database).get('u', 'c')).resolves.toMatchObject({ id: 'c', canonicalContent: { type: 'doc' }, revision: 0 });
  });
});
