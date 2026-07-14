import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords';

describe('password hashing', () => {
  it('stores PBKDF2 metadata and never the password', async () => {
    const stored = await hashPassword('not-stored-pass');

    expect(stored.algorithm).toBe('PBKDF2-HMAC-SHA-256');
    expect(stored.iterations).toBe(600_000);
    expect(stored.salt).toHaveLength(16);
    expect(stored.digest).toHaveLength(32);
    expect(JSON.stringify(stored)).not.toContain('not-stored-pass');
    await expect(verifyPassword('not-stored-pass', stored)).resolves.toBe(true);
  });
});
