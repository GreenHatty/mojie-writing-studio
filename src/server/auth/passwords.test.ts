import { describe, expect, it } from 'vitest';
import { hashPassword, passwordNeedsUpgrade, verifyPassword } from './passwords';

describe('password hashing', () => {
  it('stores PBKDF2 metadata and never the password', async () => {
    const stored = await hashPassword('not-stored-pass');

    expect(stored.algorithm).toBe('PBKDF2-HMAC-SHA-256');
    expect(stored.iterations).toBe(100_000);
    expect(stored.salt).toHaveLength(16);
    expect(stored.digest).toHaveLength(32);
    expect(JSON.stringify(stored)).not.toContain('not-stored-pass');
    await expect(verifyPassword('not-stored-pass', stored)).resolves.toBe(true);
    expect(passwordNeedsUpgrade(stored)).toBe(false);
  });

  it('fails closed before Web Crypto for unsupported iteration metadata', async () => {
    const stored = await hashPassword('not-stored-pass');
    const unsupported = { ...stored, iterations: 100_001 };

    await expect(verifyPassword('not-stored-pass', unsupported)).resolves.toBe(false);
    expect(passwordNeedsUpgrade(unsupported)).toBe(true);
  });
});
