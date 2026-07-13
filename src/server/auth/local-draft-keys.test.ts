import { describe, expect, it } from 'vitest';
import { createLocalDraftKeyService, createMemoryDraftKeyStore } from './local-draft-keys';

describe('local draft key envelope', () => {
  it('stores only a wrapped DEK, IV and version and unwraps for the same user', async () => {
    const store = createMemoryDraftKeyStore();
    const service = createLocalDraftKeyService(store, crypto.getRandomValues(new Uint8Array(32)));
    const first = await service.getOrCreate('writer-1');
    expect(first.wrappedDek.byteLength).toBeGreaterThan(32);
    expect(first.wrapIv).toHaveLength(12);
    expect(first.kekVersion).toBe(1);
    const dek = await service.unwrap('writer-1');
    expect(dek).toHaveLength(32);
    expect(JSON.stringify(store.record('writer-1'))).not.toContain(JSON.stringify(dek));
  });

  it('fails closed when the KEK is not exactly 32 bytes', () => {
    expect(() => createLocalDraftKeyService(createMemoryDraftKeyStore(), new Uint8Array(16))).toThrow('CONFIGURATION_REQUIRED');
  });
});
