import { describe, expect, it } from 'vitest';
import { decryptLocalPayload, encryptLocalPayload, offlineDatabaseName } from './crypto';

describe('offline crypto', () => {
  it('encrypts payloads without persisted plaintext and uses a user namespace', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptLocalPayload(dek, { chapterId: 'c1', plainText: '私人正文' });
    expect(JSON.stringify(encrypted)).not.toContain('私人正文');
    await expect(decryptLocalPayload(dek, encrypted)).resolves.toEqual({ chapterId: 'c1', plainText: '私人正文' });
    expect(offlineDatabaseName('writer-1')).toBe('mojie-writing-studio:writer-1');
  });
});
