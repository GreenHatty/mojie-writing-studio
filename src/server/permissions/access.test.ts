import { describe, expect, it } from 'vitest';
import { createMemoryAccessStore, createWorkAccessService } from './access';

describe('work access matrix', () => {
  it('does not grant a platform Owner implicit access to another writers work', async () => {
    const store = createMemoryAccessStore();
    store.addWork('work-1', 'writer-1');
    const access = createWorkAccessService(store);
    await expect(access.canReadWork('platform-owner', 'work-1')).resolves.toBe(false);
  });

  it.each([
    ['VIEWER', false, false],
    ['COMMENTER', false, false],
    ['EDITOR', true, false]
  ] as const)('%s edit=%s delete=%s', async (role, canEdit, canDelete) => {
    const store = createMemoryAccessStore();
    store.addWork('work-1', 'writer-1');
    store.setMember('work-1', 'member-1', role);
    const access = createWorkAccessService(store);
    await expect(access.canEditWork('member-1', 'work-1')).resolves.toBe(canEdit);
    await expect(access.canDeleteWork('member-1', 'work-1')).resolves.toBe(canDelete);
  });

  it('revokes membership access immediately', async () => {
    const store = createMemoryAccessStore();
    store.addWork('work-1', 'writer-1');
    store.setMember('work-1', 'member-1', 'VIEWER');
    const access = createWorkAccessService(store);
    await expect(access.canReadWork('member-1', 'work-1')).resolves.toBe(true);
    store.revokeMember('work-1', 'member-1');
    await expect(access.canReadWork('member-1', 'work-1')).resolves.toBe(false);
  });
});
