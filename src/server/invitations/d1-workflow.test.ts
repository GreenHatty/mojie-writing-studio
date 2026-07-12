import { describe, expect, it, vi } from 'vitest';
import { createD1InvitationWorkflow } from './d1-workflow';

describe('D1 invitation workflow', () => {
  it('does not let a platform Writer create a platform invitation', async () => {
    const database = { prepare() { return { bind() { return { first: async () => null }; } }; } } as unknown as D1Database;
    await expect(createD1InvitationWorkflow(database).create('writer', { role: 'WRITER', workId: null, expiresAt: '2099-01-01T00:00:00Z', maxUses: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reserves acceptance atomically and never binds the plaintext token', async () => {
    const bound: unknown[][] = []; const batch = vi.fn(async (statements: unknown[]) => statements.map((_value, index) => ({ success: true, meta: { changes: index === 0 ? 1 : 0 } })));
    const database = { prepare(sql: string) { return { bind(...values: unknown[]) { bound.push(values); return { first: async () => sql.includes('FROM invitations') ? { id: 'i', token_hash: 'digest', created_by: 'owner', role: 'EDITOR', work_id: 'w', expires_at: '2099-01-01T00:00:00Z', max_uses: 1, use_count: 0, revoked_at: null } : null, run: async () => ({ success: true, meta: { changes: 1 } }) }; } }; }, batch } as unknown as D1Database;
    await expect(createD1InvitationWorkflow(database).accept('plaintext-invite-token', 'new-writer', 'very-strong-password')).resolves.toMatchObject({ userId: expect.any(String) });
    expect(batch).toHaveBeenCalledOnce(); expect(JSON.stringify(bound)).not.toContain('plaintext-invite-token'); expect(bound.some((values) => values.some((value) => typeof value === 'string' && value.length > 20 && value !== 'plaintext-invite-token'))).toBe(true);
  });
});
