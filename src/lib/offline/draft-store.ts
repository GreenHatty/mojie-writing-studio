import { deleteDB, openDB, type DBSchema } from 'idb';
import { decryptLocalPayload, encryptLocalPayload, offlineDatabaseName, type EncryptedLocalPayload } from './crypto';

type DraftDatabase = DBSchema & {
  drafts: { key: string; value: { chapterId: string; payload: EncryptedLocalPayload } };
  syncQueue: { key: string; value: { clientOperationId: string; chapterId: string; payload: EncryptedLocalPayload } };
};

export async function openUserDraftStore(userId: string, dek: Uint8Array) {
  const databaseName = offlineDatabaseName(userId);
  const database = await openDB<DraftDatabase>(databaseName, 2, { upgrade(db) {
    if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'chapterId' });
    if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'clientOperationId' });
  } });
  return {
    async saveDraft(chapterId: string, value: unknown): Promise<void> { await database.put('drafts', { chapterId, payload: await encryptLocalPayload(dek, value) }); },
    async getDraft<T>(chapterId: string): Promise<T | null> { const row = await database.get('drafts', chapterId); return row ? decryptLocalPayload<T>(dek, row.payload) : null; },
    async enqueueSync(clientOperationId: string, chapterId: string, value: unknown): Promise<void> { await database.put('syncQueue', { clientOperationId, chapterId, payload: await encryptLocalPayload(dek, value) }); },
    async listSync<T>(): Promise<Array<{ clientOperationId: string; chapterId: string; value: T }>> { const rows = await database.getAll('syncQueue'); return Promise.all(rows.map(async (row) => ({ clientOperationId: row.clientOperationId, chapterId: row.chapterId, value: await decryptLocalPayload<T>(dek, row.payload) }))); },
    async removeSync(clientOperationId: string): Promise<void> { await database.delete('syncQueue', clientOperationId); },
    close(): void { database.close(); },
    async destroy(): Promise<void> { database.close(); await deleteDB(databaseName); }
  };
}
