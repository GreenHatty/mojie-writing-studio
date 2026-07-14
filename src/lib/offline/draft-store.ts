import { openDB, type DBSchema } from 'idb';
import { createDatabaseCoordinator, withDatabaseTimeout, type DatabaseLifecycleListener, type DatabaseLifecycleState } from '../indexeddb-lifecycle';
import { decryptLocalPayload, encryptLocalPayload, offlineDatabaseName, zeroizeLocalDek, type EncryptedLocalPayload } from './crypto';

type DraftDatabase = DBSchema & {
  drafts: { key: string; value: { chapterId: string; payload: EncryptedLocalPayload } };
  syncQueue: { key: string; value: { clientOperationId: string; chapterId: string; payload: EncryptedLocalPayload } };
  settings: { key: string; value: { settingKey: string; payload: EncryptedLocalPayload } };
  conflicts: { key: string; value: { chapterId: string; payload: EncryptedLocalPayload } };
};

export type UserDraftStoreOptions = { onLifecycleState?: DatabaseLifecycleListener; openTimeoutMs?: number };

export async function openUserDraftStore(userId: string, dek: Uint8Array, options: UserDraftStoreOptions = {}) {
  if (!userId || dek.byteLength !== 32) throw new Error('LOCAL_DRAFT_KEY_UNAVAILABLE');
  const key = new Uint8Array(dek);
  const databaseName = offlineDatabaseName(userId);
  const coordinator = createDatabaseCoordinator(databaseName, options.onLifecycleState);
  let lifecycle: DatabaseLifecycleState = 'opening';
  let readOnly = false;
  let closed = false;
  const notify = (state: DatabaseLifecycleState, detail?: string) => { lifecycle = state; options.onLifecycleState?.(state, detail); };
  notify('opening');
  const database = await withDatabaseTimeout(openDB<DraftDatabase>(databaseName, 3, {
    upgrade(db) {
      notify('upgrading');
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'chapterId' });
      if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'clientOperationId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'settingKey' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'chapterId' });
    },
    blocked() {
      readOnly = true;
      notify('blocked', '请关闭使用该账号写作空间的其他标签页后重试。');
      coordinator.announce('upgrade-requested');
    },
    blocking(_currentVersion, _blockedVersion, event) {
      readOnly = true;
      notify('versionchange', '本地数据库版本发生变化，已停止新的加密写入。');
      coordinator.announce('versionchange');
      (event.target as IDBDatabase | null)?.close();
    },
    terminated() {
      readOnly = true;
      notify('closed', '本地数据库连接意外关闭。');
    }
  }), options.openTimeoutMs).catch((error) => {
    readOnly = true;
    notify('upgrade-failed', error instanceof Error ? error.message : '本地数据库升级失败。');
    zeroizeLocalDek(key);
    coordinator.close();
    throw error;
  });
  if (!readOnly) notify('ready');

  function assertOpen(): void {
    if (closed || readOnly) throw new Error('LOCAL_DRAFT_STORE_READ_ONLY');
  }
  const context = (kind: string, id: string) => `${userId}:${kind}:${id}`;
  return {
    databaseName,
    getLifecycleState(): DatabaseLifecycleState { return lifecycle; },
    async saveDraft(chapterId: string, value: unknown): Promise<void> {
      assertOpen();
      await database.put('drafts', { chapterId, payload: await encryptLocalPayload(key, value, context('draft', chapterId)) });
    },
    async getDraft<T>(chapterId: string): Promise<T | null> {
      const row = await database.get('drafts', chapterId);
      return row ? decryptLocalPayload<T>(key, row.payload, context('draft', chapterId)) : null;
    },
    async enqueueSync(clientOperationId: string, chapterId: string, value: unknown): Promise<void> {
      assertOpen();
      await database.put('syncQueue', { clientOperationId, chapterId, payload: await encryptLocalPayload(key, value, context('sync', clientOperationId)) });
    },
    async listSync<T>(): Promise<Array<{ clientOperationId: string; chapterId: string; value: T }>> {
      const rows = await database.getAll('syncQueue');
      return Promise.all(rows.map(async (row) => ({ clientOperationId: row.clientOperationId, chapterId: row.chapterId, value: await decryptLocalPayload<T>(key, row.payload, context('sync', row.clientOperationId)) })));
    },
    async removeSync(clientOperationId: string): Promise<void> { assertOpen(); await database.delete('syncQueue', clientOperationId); },
    async saveSetting(settingKey: string, value: unknown): Promise<void> { assertOpen(); await database.put('settings', { settingKey, payload: await encryptLocalPayload(key, value, context('setting', settingKey)) }); },
    async getSetting<T>(settingKey: string): Promise<T | null> { const row = await database.get('settings', settingKey); return row ? decryptLocalPayload<T>(key, row.payload, context('setting', settingKey)) : null; },
    async saveConflict(chapterId: string, value: unknown): Promise<void> { assertOpen(); await database.put('conflicts', { chapterId, payload: await encryptLocalPayload(key, value, context('conflict', chapterId)) }); },
    async getConflict<T>(chapterId: string): Promise<T | null> { const row = await database.get('conflicts', chapterId); return row ? decryptLocalPayload<T>(key, row.payload, context('conflict', chapterId)) : null; },
    close(): void {
      if (closed) return;
      closed = true;
      database.close();
      coordinator.close();
      zeroizeLocalDek(key);
      notify('closed');
    }
  };
}
