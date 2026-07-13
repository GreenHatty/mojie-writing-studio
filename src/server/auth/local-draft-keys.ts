import { AppError } from '../errors';

const encoder = new TextEncoder();

export type WrappedDraftKey = { userId: string; wrappedDek: Uint8Array; wrapIv: Uint8Array; kekVersion: number };
export type DraftKeyStore = { get(userId: string): Promise<WrappedDraftKey | null>; put(record: WrappedDraftKey): Promise<void> };

class MemoryDraftKeyStore implements DraftKeyStore {
  private readonly records = new Map<string, WrappedDraftKey>();
  async get(userId: string): Promise<WrappedDraftKey | null> { return this.records.get(userId) ?? null; }
  async put(record: WrappedDraftKey): Promise<void> { this.records.set(record.userId, record); }
  record(userId: string): WrappedDraftKey | null { return this.records.get(userId) ?? null; }
}
export function createMemoryDraftKeyStore(): MemoryDraftKeyStore { return new MemoryDraftKeyStore(); }

async function deriveUserKek(rootKey: Uint8Array, userId: string, version: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new Uint8Array(rootKey).buffer, 'HKDF', false, ['deriveKey']);
  const salt = await crypto.subtle.digest('SHA-256', encoder.encode('mojie-local-draft-kek'));
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`user:${userId}:kek-version:${version}`) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function createLocalDraftKeyService(store: DraftKeyStore, rootKey: Uint8Array, currentKekVersion = 1) {
  if (rootKey.byteLength !== 32 || !Number.isInteger(currentKekVersion) || currentKekVersion < 1) throw new AppError('CONFIGURATION_REQUIRED', 503);
  return {
    async getOrCreate(userId: string): Promise<WrappedDraftKey> {
      const existing = await store.get(userId);
      if (existing) return existing;
      const dek = crypto.getRandomValues(new Uint8Array(32));
      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const kek = await deriveUserKek(rootKey, userId, currentKekVersion);
      const wrappedDek = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(wrapIv).buffer }, kek, new Uint8Array(dek).buffer));
      const record: WrappedDraftKey = { userId, wrappedDek, wrapIv, kekVersion: currentKekVersion };
      await store.put(record);
      dek.fill(0);
      return record;
    },
    async unwrap(userId: string): Promise<Uint8Array> {
      const record = await store.get(userId);
      if (!record || record.kekVersion < 1 || record.kekVersion > currentKekVersion) throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503);
      try {
        const kek = await deriveUserKek(rootKey, userId, record.kekVersion);
        const dek = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.wrapIv).buffer }, kek, new Uint8Array(record.wrappedDek).buffer));
        if (dek.byteLength !== 32) throw new Error('Invalid DEK length');
        return dek;
      } catch { throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503); }
    }
  };
}
