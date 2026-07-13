import type { SyncOperationRecord } from '../contracts';
import { AppError } from '../errors';
import type { DatabaseAdapter } from './database';

class MemoryDatabase implements DatabaseAdapter {
  private readonly syncOperations = new Map<string, SyncOperationRecord>();

  async insertSyncOperation(record: SyncOperationRecord): Promise<void> {
    if (this.syncOperations.has(record.clientOperationId)) {
      throw new AppError('CONFLICT', 409);
    }
    this.syncOperations.set(record.clientOperationId, record);
  }
}

export function createMemoryDatabase(): DatabaseAdapter {
  return new MemoryDatabase();
}
