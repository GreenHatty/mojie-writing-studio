import { describe, expect, it } from 'vitest';
import { createD1DraftKeyStore } from './d1-draft-key-store';

describe('D1 draft key store', () => {
  it('maps wrapped key bytes and persists only the envelope', async () => {
    const executed: unknown[][] = [];
    const database = { prepare(sql: string) { return { bind(...values: unknown[]) { return { first: async () => sql.startsWith('SELECT') ? { user_id: 'u', wrapped_dek: new Uint8Array([1, 2]).buffer, wrap_iv: new Uint8Array([3]).buffer, kek_version: 1 } : null, run: async () => { executed.push(values); } }; } }; } } as unknown as D1Database;
    const store = createD1DraftKeyStore(database);
    await expect(store.get('u')).resolves.toMatchObject({ userId: 'u', kekVersion: 1 });
    await store.put({ userId: 'u', wrappedDek: new Uint8Array([4]), wrapIv: new Uint8Array([5]), kekVersion: 1 });
    expect(executed[0][0]).toBe('u');
    expect(executed[0][1]).toBeInstanceOf(Uint8Array);
  });
});
