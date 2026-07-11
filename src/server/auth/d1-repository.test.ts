import { describe, expect, it } from 'vitest';
import { createD1AuthRepository, createD1SessionStore } from './d1-repository';
import { hashPassword } from './passwords';

describe('D1AuthRepository', () => {
  it('binds Owner password metadata without plaintext', async () => {
    const calls: unknown[][] = [];
    const database = { prepare() { return { bind(...values: unknown[]) { calls.push(values); return { run: async () => ({ success: true }), first: async () => null }; } }; } } as unknown as D1Database;
    const repository = createD1AuthRepository(database);
    const password = await hashPassword('never-persist');
    await repository.initializeOwner({ id: 'u1', account: 'owner@example.test', platformRole: 'OWNER', password }, '2026-07-11T00:00:00Z');
    expect(JSON.stringify(calls)).not.toContain('never-persist');
    expect(calls[0]).toContain('owner@example.test');
  });

  it('persists only the session token digest', async () => {
    const calls: unknown[][] = [];
    const database = { prepare() { return { bind(...values: unknown[]) { calls.push(values); return { run: async () => ({ success: true }) }; } }; } } as unknown as D1Database;
    const store = createD1SessionStore(database);
    await store.put({ tokenHash: 'digest-only', userId: 'u1', createdAt: '2026-07-11T00:00:00Z', expiresAt: '2026-07-11T12:00:00Z', absoluteExpiresAt: '2026-07-18T00:00:00Z', revokedAt: null });
    expect(calls[0]).toContain('digest-only');
  });
});
