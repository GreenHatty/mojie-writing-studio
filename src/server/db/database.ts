import type { SyncOperationRecord } from '../contracts';

export type DatabaseAdapter = {
  insertSyncOperation(record: SyncOperationRecord): Promise<void>;
};
