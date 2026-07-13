import { openDB, type DBSchema } from 'idb';
import { createDatabaseCoordinator, withDatabaseTimeout } from './indexeddb-lifecycle';

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

const databasePromises = new Map<string, ReturnType<typeof openDB<LocalDocxVaultSchema>>>();

function databaseFor(userId: string) {
  if (typeof indexedDB === 'undefined') throw new Error('当前环境不支持 IndexedDB，无法保存本地 DOCX。');
  if (!userId) throw new Error('缺少当前账号，无法打开本机 DOCX 文件库。');
  const existing = databasePromises.get(userId);
  if (existing) return existing;
  const vaultName = `mojie-local-docx-vault:${userId}`;
  const coordinator = createDatabaseCoordinator(vaultName);
  const promise = withDatabaseTimeout(openDB<LocalDocxVaultSchema>(vaultName, 1, {
      upgrade(database) {
        const store = database.createObjectStore('assets', { keyPath: 'id' });
        store.createIndex('by-user-work', ['userId', 'workId']);
      },
      blocked() { coordinator?.announce('upgrade-requested'); },
      blocking(_current, _blocked, event) {
        coordinator?.announce('versionchange');
        (event.target as IDBDatabase | null)?.close();
      }
    }), 12_000);
  databasePromises.set(userId, promise);
  return promise;
}

export async function listLocalDocxAssets(userId: string, workId: string): Promise<LocalDocxAsset[]> {
  const database = await databaseFor(userId);
  const values = await database.getAllFromIndex('assets', 'by-user-work', [userId, workId]);
  return values.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveLocalDocxAsset(input: Omit<LocalDocxAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<LocalDocxAsset> {
  const database = await databaseFor(input.userId);
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

export async function deleteLocalDocxAsset(userId: string, id: string): Promise<void> {
  const database = await databaseFor(userId);
  await database.delete('assets', id);
}
