import type { SyncOperationRecord } from '../contracts';
import type { DatabaseAdapter } from './database';

class D1DatabaseAdapter implements DatabaseAdapter {
  constructor(private readonly database: D1Database) {}

  async insertSyncOperation(record: SyncOperationRecord): Promise<void> {
    await this.database
      .prepare('INSERT INTO sync_operations (client_operation_id, user_id, chapter_id) VALUES (?, ?, ?)')
      .bind(record.clientOperationId, record.userId, record.chapterId)
      .run();
  }
}

export function createD1Database(database: D1Database): DatabaseAdapter {
  return new D1DatabaseAdapter(database);
}
