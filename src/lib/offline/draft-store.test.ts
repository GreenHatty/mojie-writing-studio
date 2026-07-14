import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { openUserDraftStore } from './draft-store';

describe('user draft store', () => {
  it('isolates encrypted drafts by user namespace', async () => {
    const dekA = crypto.getRandomValues(new Uint8Array(32));
    const dekB = crypto.getRandomValues(new Uint8Array(32));
    const a = await openUserDraftStore('writer-a', dekA);
    const b = await openUserDraftStore('writer-b', dekB);
    await a.saveDraft('chapter-1', { plainText: 'A的正文', baseRevision: 0 });
    await expect(a.getDraft('chapter-1')).resolves.toEqual({ plainText: 'A的正文', baseRevision: 0 });
    await expect(b.getDraft('chapter-1')).resolves.toBeNull();
    a.close(); b.close();
  });

  it('keeps a closing-page draft encrypted and readable only after the same account reopens it', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const store = await openUserDraftStore('writer-close', dek);
    await store.saveDraft('chapter-close', { plainText: '关闭前也不能丢失的正文' });
    store.close();

    const reopened = await openUserDraftStore('writer-close', new Uint8Array(dek));
    await expect(reopened.getDraft('chapter-close')).resolves.toEqual({ plainText: '关闭前也不能丢失的正文' });

    const raw = await openDB('mojie-writing-studio:writer-close', 3);
    const row = await raw.get('drafts', 'chapter-close') as { payload: unknown };
    expect(JSON.stringify(row.payload)).not.toContain('关闭前也不能丢失的正文');
    raw.close();

    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const anotherAccount = await openUserDraftStore('writer-close', wrongKey);
    await expect(anotherAccount.getDraft('chapter-close')).rejects.toBeTruthy();
    reopened.close();
    anotherAccount.close();
  });

  it('removes only the requested draft after a confirmed cloud save', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const store = await openUserDraftStore('writer-remove', dek);
    await store.saveDraft('chapter-1', { plainText: '已同步' });
    await store.saveDraft('chapter-2', { plainText: '仍待同步' });
    await store.removeDraft('chapter-1');
    await expect(store.getDraft('chapter-1')).resolves.toBeNull();
    await expect(store.getDraft('chapter-2')).resolves.toEqual({ plainText: '仍待同步' });
    store.close();
  });

  it('removes an encrypted pending preference only after its cloud sync succeeds', async () => {
    const store = await openUserDraftStore('writer-settings', crypto.getRandomValues(new Uint8Array(32)));
    await store.saveSetting('pending-profile-settings', { theme: 'dark' });
    await store.removeSetting('pending-profile-settings');
    await expect(store.getSetting('pending-profile-settings')).resolves.toBeNull();
    store.close();
  });
});
