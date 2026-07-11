import { describe, expect, it } from 'vitest';
import { createD1DirectoryStore } from './directory-store';

describe('D1 work directory store', () => {
  it('returns only directory metadata for an authorized work', async () => {
    const database = {
      prepare(sql: string) {
        return { bind() { return {
          first: async () => sql.includes('FROM works') ? { id: 'w', title: '新书', role: 'WORK_OWNER' } : null,
          all: async () => sql.includes('FROM volumes')
            ? { results: [{ id: 'v', title: '第一卷', position: 0 }] }
            : { results: [{ id: 'c', volume_id: 'v', title: '第一章', position: 0, revision: 2, word_count: 128, status: 'DRAFT' }] }
        }; } };
      }
    } as unknown as D1Database;
    await expect(createD1DirectoryStore(database).get('u', 'w')).resolves.toEqual({
      work: { id: 'w', title: '新书', role: 'WORK_OWNER' },
      volumes: [{ id: 'v', title: '第一卷', position: 0, chapters: [{ id: 'c', title: '第一章', position: 0, revision: 2, wordCount: 128, status: 'DRAFT' }] }]
    });
  });

  it('returns null when the user has no explicit work access', async () => {
    const database = { prepare() { return { bind() { return { first: async () => null }; } }; } } as unknown as D1Database;
    await expect(createD1DirectoryStore(database).get('platform-owner', 'foreign-work')).resolves.toBeNull();
  });
});
