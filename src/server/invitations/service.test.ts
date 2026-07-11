import { describe, expect, it } from 'vitest';
import { createInvitationService, createMemoryInvitationStore } from './service';

describe('InvitationService', () => {
  it('stores only a digest and accepts a valid scoped invitation', async () => {
    const store = createMemoryInvitationStore();
    const service = createInvitationService(store);
    const created = await service.create({ createdBy: 'owner-1', role: 'EDITOR', workId: 'work-1', expiresAt: '2026-07-12T00:00:00Z', maxUses: 1 });
    expect(JSON.stringify(store.records())).not.toContain(created.token);
    await expect(service.accept(created.token, new Date('2026-07-11T00:00:00Z'))).resolves.toMatchObject({ role: 'EDITOR', workId: 'work-1' });
  });

  it('rejects a revoked invitation with the generic invalid error', async () => {
    const store = createMemoryInvitationStore();
    const service = createInvitationService(store);
    const created = await service.create({ createdBy: 'owner-1', role: 'WRITER', workId: null, expiresAt: '2026-07-12T00:00:00Z', maxUses: 1 });
    await service.revoke(created.id, '2026-07-11T00:01:00Z');
    await expect(service.accept(created.token, new Date('2026-07-11T00:02:00Z'))).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
  });
});
