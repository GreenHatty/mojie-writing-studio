import type { DraftKeyStore, WrappedDraftKey } from './local-draft-keys';

function bytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export function createD1DraftKeyStore(database: D1Database): DraftKeyStore {
  return {
    async get(userId): Promise<WrappedDraftKey | null> {
      const row = await database.prepare('SELECT user_id, wrapped_dek, wrap_iv, kek_version FROM user_local_draft_keys WHERE user_id = ?').bind(userId).first<{ user_id: string; wrapped_dek: ArrayBuffer | Uint8Array; wrap_iv: ArrayBuffer | Uint8Array; kek_version: number }>();
      return row ? { userId: row.user_id, wrappedDek: bytes(row.wrapped_dek), wrapIv: bytes(row.wrap_iv), kekVersion: row.kek_version as 1 } : null;
    },
    async put(record): Promise<void> {
      const now = new Date().toISOString();
      await database.prepare('INSERT INTO user_local_draft_keys (user_id, wrapped_dek, wrap_iv, kek_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET wrapped_dek = excluded.wrapped_dek, wrap_iv = excluded.wrap_iv, kek_version = excluded.kek_version, updated_at = excluded.updated_at')
        .bind(record.userId, record.wrappedDek, record.wrapIv, record.kekVersion, now, now).run();
    }
  };
}
