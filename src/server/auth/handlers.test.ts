import { describe, expect, it } from 'vitest';
import { createMemoryAuthRepository } from './service';
import { createAuthHandlers } from './handlers';
import type { SessionRecord, SessionStore } from './sessions';
import { MemoryRateLimiter } from './rate-limit';

function sessions(): SessionStore {
  const rows = new Map<string, SessionRecord>();
  return { async put(row) { rows.set(row.tokenHash, row); }, async get(hash) { return rows.get(hash) ?? null; }, async revoke(hash, at) { const row = rows.get(hash); if (row) rows.set(hash, { ...row, revokedAt: at }); } };
}

describe('auth handlers', () => {
  it('initializes Owner without returning password metadata and does not cache', async () => {
    const handlers = createAuthHandlers({ authRepository: createMemoryAuthRepository(), sessionStore: sessions(), initializationKey: 'key', nodeEnv: 'development', appOrigin: 'http://localhost' });
    const response = await handlers.initialize(new Request('http://localhost/api/auth/initialize', { method: 'POST', headers: { Origin: 'http://localhost' }, body: JSON.stringify({ key: 'key', account: 'owner@example.test', password: 'long-password' }) }));
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    expect(JSON.stringify(await response.json())).not.toContain('password');
  });

  it('rate-limits repeated failed login requests by account and IP', async () => {
    const handlers = createAuthHandlers({ authRepository: createMemoryAuthRepository(), sessionStore: sessions(), initializationKey: 'key', nodeEnv: 'development', appOrigin: 'http://localhost', rateLimiter: new MemoryRateLimiter() });
    const attempt = () => handlers.login(new Request('http://localhost/api/auth/login', { method: 'POST', headers: { Origin: 'http://localhost', 'CF-Connecting-IP': '192.0.2.10' }, body: JSON.stringify({ account: 'missing', password: 'wrong-password' }) }));
    for (let index = 0; index < 5; index += 1) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});
