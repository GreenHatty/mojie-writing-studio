import { describe, expect, it } from 'vitest';
import { createMemoryAuthRepository } from './service';
import { createAuthHandlers } from './handlers';
import { MemoryRateLimiter } from './rate-limit';
import type { SessionRecord, SessionStore } from './sessions';

function sessions(): SessionStore {
  const rows = new Map<string, SessionRecord>();
  return { async put(row) { rows.set(row.tokenHash, row); }, async get(hash) { return rows.get(hash) ?? null; }, async revoke(hash, at) { const row = rows.get(hash); if (row) rows.set(hash, { ...row, revokedAt: at }); }, async renew(hash, expiresAt, lastSeenAt) { const row = rows.get(hash); if (row) rows.set(hash, { ...row, expiresAt, lastSeenAt }); } };
}

describe('auth handlers', () => {
  it('initializes Owner without returning password metadata and does not cache', async () => {
    const handlers = createAuthHandlers({ authRepository: createMemoryAuthRepository(), sessionStore: sessions(), initializationKey: 'key', cookieEnvironment: { APP_ORIGIN: 'http://localhost', NODE_ENV: 'development' }, appOrigin: 'http://localhost', rateLimiter: new MemoryRateLimiter() });
    const response = await handlers.initialize(new Request('http://localhost/api/auth/initialize', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify({ key: 'key', account: 'owner@example.test', password: 'long-password' }) }));
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    expect(JSON.stringify(await response.json())).not.toContain('password');
  });

  it('returns only the active account identity and CSRF state from a protected session', async () => {
    const repository = createMemoryAuthRepository();
    const handlers = createAuthHandlers({ authRepository: repository, sessionStore: sessions(), initializationKey: 'key', cookieEnvironment: { APP_ORIGIN: 'http://localhost', NODE_ENV: 'development' }, appOrigin: 'http://localhost', rateLimiter: new MemoryRateLimiter() });
    await handlers.initialize(new Request('http://localhost/api/auth/initialize', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify({ key: 'key', account: 'owner@example.test', password: 'long-password' }) }));
    const login = await handlers.login(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify({ account: 'owner@example.test', password: 'long-password' }) }));
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const session = await handlers.session(new Request('http://localhost/api/auth/session', { headers: { Cookie: cookie } }));
    await expect(session.json()).resolves.toMatchObject({ user: { account: 'owner@example.test', platformRole: 'OWNER' }, csrf: expect.any(String) });
    expect(session.headers.get('Cache-Control')).toBe('no-store, private');
  });
});
