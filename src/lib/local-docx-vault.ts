import { openDB, type DBSchema } from 'idb';

export type LocalDocxAsset = {
  id: string;
  userId: string;
  workId: string;
  fileName: string;
  originalBytes: ArrayBuffer;
  editedBytes?: ArrayBuffer;
  originalHash: string;
  editedHash?: string;
  paragraphCount: number;
  createdAt: string;
  updatedAt: string;
};

interface LocalDocxVaultSchema extends DBSchema {
  assets: {
    key: string;
    value: LocalDocxAsset;
    indexes: {
      'by-user-work': [string, string];
    };
  };
}

const databasePromise = typeof indexedDB === 'undefined'
  ? null
  : openDB<LocalDocxVaultSchema>('mojie-local-docx-vault', 1, {
      upgrade(database) {
        const store = database.createObjectStore('assets', { keyPath: 'id' });
        store.createIndex('by-user-work', ['userId', 'workId']);
      }
    });

function requireDatabase() {
  if (!databasePromise) throw new Error('当前环境不支持 IndexedDB，无法保存本地 DOCX。');
  return databasePromise;
}

export async function listLocalDocxAssets(userId: string, workId: string): Promise<LocalDocxAsset[]> {
  const database = await requireDatabase();
  const values = await database.getAllFromIndex('assets', 'by-user-work', [userId, workId]);
  return values.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveLocalDocxAsset(input: Omit<LocalDocxAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<LocalDocxAsset> {
  const database = await requireDatabase();
  const now = new Date().toISOString();
  const existing = input.id ? await database.get('assets', input.id) : undefined;
  const value: LocalDocxAsset = {
    ...input,
    id: input.id || crypto.randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await database.put('assets', value);
  return value;
}

export async function deleteLocalDocxAsset(id: string): Promise<void> {
  const database = await requireDatabase();
  await database.delete('assets', id);
}
