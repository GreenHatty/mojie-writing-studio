import { describe, expect, it } from 'vitest';
import { createD1Database } from './d1-database';

describe('D1DatabaseAdapter', () => {
  it('binds operation values instead of interpolating them into SQL', async () => {
    const calls: unknown[][] = [];
    const database = createD1Database({
      prepare() {
        return {
          bind(...values: unknown[]) {
            calls.push(values);
            return { run: async () => ({ success: true }) };
          }
        };
      }
    } as unknown as D1Database);

    await database.insertSyncOperation({ clientOperationId: "op-'1", userId: 'writer-1', chapterId: 'chapter-1' });

    expect(calls).toEqual([["op-'1", 'writer-1', 'chapter-1']]);
  });
});
