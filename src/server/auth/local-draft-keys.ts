import { AppError } from '../errors';

export type WrappedDraftKey = { userId: string; wrappedDek: Uint8Array; wrapIv: Uint8Array; kekVersion: 1 };
export type DraftKeyStore = { get(userId: string): Promise<WrappedDraftKey | null>; put(record: WrappedDraftKey): Promise<void> };

class MemoryDraftKeyStore implements DraftKeyStore {
  private readonly records = new Map<string, WrappedDraftKey>();
  async get(userId: string): Promise<WrappedDraftKey | null> { return this.records.get(userId) ?? null; }
  async put(record: WrappedDraftKey): Promise<void> { this.records.set(record.userId, record); }
  record(userId: string): WrappedDraftKey | null { return this.records.get(userId) ?? null; }
}
export function createMemoryDraftKeyStore(): MemoryDraftKeyStore { return new MemoryDraftKeyStore(); }

async function importKek(kek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(kek).buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function createLocalDraftKeyService(store: DraftKeyStore, kek: Uint8Array) {
  if (kek.byteLength !== 32) throw new AppError('CONFIGURATION_REQUIRED', 503);
  return {
    async getOrCreate(userId: string): Promise<WrappedDraftKey> {
      const existing = await store.get(userId);
      if (existing) return existing;
      const dek = crypto.getRandomValues(new Uint8Array(32));
      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedDek = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(wrapIv).buffer }, await importKek(kek), new Uint8Array(dek).buffer));
      const record: WrappedDraftKey = { userId, wrappedDek, wrapIv, kekVersion: 1 };
      await store.put(record);
      return record;
    },
    async unwrap(userId: string): Promise<Uint8Array> {
      const record = await store.get(userId);
      if (!record || record.kekVersion !== 1) throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503);
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.wrapIv).buffer }, await importKek(kek), new Uint8Array(record.wrappedDek).buffer));
      } catch { throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503); }
    }
  };
}
