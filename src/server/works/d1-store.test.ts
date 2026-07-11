import { describe, expect, it } from 'vitest';
import { createD1WorkStore } from './d1-store';

describe('D1WorkStore', () => {
  it('creates work, volume and chapter in one D1 batch', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const database = {
      prepare(sql: string) { return { bind(...values: unknown[]) { const statement = { sql, values, run: async () => ({ success: true }) }; statements.push(statement); return statement; } }; },
      async batch(values: unknown[]) { expect(values).toHaveLength(3); return []; }
    } as unknown as D1Database;
    const store = createD1WorkStore(database);
    await store.createGraph({
      work: { id: 'w', ownerId: 'u', title: '书', kind: 'long', status: 'DRAFT', updatedAt: '2026-07-11T00:00:00Z', deletedAt: null, deleteReason: null },
      volume: { id: 'v', workId: 'w', title: '第一卷', position: 0 },
      chapter: { id: 'c', workId: 'w', volumeId: 'v', title: '第1章', canonicalContent: { type: 'doc' }, plainText: '', wordCount: 0, revision: 0, position: 0 }
    });
    expect(statements).toHaveLength(3);
    expect(statements[0].values).toContain('书');
  });
});
