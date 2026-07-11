import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
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
    await a.destroy(); await b.destroy();
  });
});
