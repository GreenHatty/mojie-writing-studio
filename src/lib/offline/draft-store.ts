import { deleteDB, openDB, type DBSchema } from 'idb';
import { decryptLocalPayload, encryptLocalPayload, offlineDatabaseName, type EncryptedLocalPayload } from './crypto';

type DraftDatabase = DBSchema & { drafts: { key: string; value: { chapterId: string; payload: EncryptedLocalPayload } } };

export async function openUserDraftStore(userId: string, dek: Uint8Array) {
  const databaseName = offlineDatabaseName(userId);
  const database = await openDB<DraftDatabase>(databaseName, 1, { upgrade(db) { if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'chapterId' }); } });
  return {
    async saveDraft(chapterId: string, value: unknown): Promise<void> { await database.put('drafts', { chapterId, payload: await encryptLocalPayload(dek, value) }); },
    async getDraft<T>(chapterId: string): Promise<T | null> { const row = await database.get('drafts', chapterId); return row ? decryptLocalPayload<T>(dek, row.payload) : null; },
    close(): void { database.close(); },
    async destroy(): Promise<void> { database.close(); await deleteDB(databaseName); }
  };
}
