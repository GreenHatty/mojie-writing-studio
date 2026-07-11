import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from './crypto';

describe('backup encryption', () => {
  it('encrypts backup bytes with a 32-byte master key', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptBackup(key, new TextEncoder().encode('private backup'));
    expect(encrypted.iv).toHaveLength(12);
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain('private backup');
    expect(new TextDecoder().decode(await decryptBackup(key, encrypted))).toBe('private backup');
  });

  it('fails closed for an invalid master key', async () => {
    await expect(encryptBackup(new Uint8Array(16), new Uint8Array())).rejects.toMatchObject({ code: 'CONFIGURATION_REQUIRED' });
  });
});
