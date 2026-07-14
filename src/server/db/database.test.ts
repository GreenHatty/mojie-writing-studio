import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from './memory-database';

describe('MemoryDatabase', () => {
  it('rejects duplicate client operation identifiers', async () => {
    const database = createMemoryDatabase();
    await database.insertSyncOperation({ clientOperationId: 'operation-1', userId: 'writer-1', chapterId: 'chapter-1' });

    await expect(
      database.insertSyncOperation({ clientOperationId: 'operation-1', userId: 'writer-1', chapterId: 'chapter-1' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
