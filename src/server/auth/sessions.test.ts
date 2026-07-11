import { describe, expect, it } from 'vitest';
import { createSession, requireActiveSession, revokeSession, type SessionStore } from './sessions';

function memoryStore(): SessionStore & { records: Map<string, Parameters<SessionStore['put']>[0]> } {
  const records = new Map<string, Parameters<SessionStore['put']>[0]>();
  return {
    records,
    async put(record) { records.set(record.tokenHash, record); },
    async get(tokenHash) { return records.get(tokenHash) ?? null; },
    async revoke(tokenHash, at) { const row = records.get(tokenHash); if (row) records.set(tokenHash, { ...row, revokedAt: at }); }
  };
}

describe('sessions', () => {
  it('returns a plaintext token but stores only its digest', async () => {
    const store = memoryStore();
    const created = await createSession(store, 'writer-1', new Date('2026-07-11T00:00:00Z'));
    expect(created.token).toHaveLength(43);
    expect(JSON.stringify([...store.records.values()])).not.toContain(created.token);
    await expect(requireActiveSession(store, created.token, new Date('2026-07-11T01:00:00Z'))).resolves.toMatchObject({ userId: 'writer-1' });
  });

  it('rejects a revoked session immediately', async () => {
    const store = memoryStore();
    const created = await createSession(store, 'writer-1', new Date('2026-07-11T00:00:00Z'));
    await revokeSession(store, created.token, new Date('2026-07-11T00:01:00Z'));
    await expect(requireActiveSession(store, created.token, new Date('2026-07-11T00:02:00Z'))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
