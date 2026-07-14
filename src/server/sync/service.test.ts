import { describe, expect, it } from 'vitest';
import { createMemorySyncStore, createSyncService } from './service';

describe('SyncService', () => {
  it('returns the original result for a repeated client operation id', async () => {
    const store = createMemorySyncStore();
    const chapter = store.addChapter('work-1', 'writer-1');
    const service = createSyncService(store);
    const command = { userId: 'writer-1', chapterId: chapter.id, baseRevision: 0, canonicalContent: { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] }, clientOperationId: 'op-1', savedAt: '2026-07-11T00:05:00Z' };
    const first = await service.saveChapter(command);
    const retry = await service.saveChapter(command);
    expect(retry).toEqual(first);
    expect(store.chapter(chapter.id)?.revision).toBe(1);
  });

  it('keeps both contents and a conflict record for a stale revision', async () => {
    const store = createMemorySyncStore();
    const chapter = store.addChapter('work-1', 'writer-1');
    const service = createSyncService(store);
    await service.saveChapter({ userId: 'writer-1', chapterId: chapter.id, baseRevision: 0, canonicalContent: { type: 'doc' }, clientOperationId: 'op-1', savedAt: '2026-07-11T00:01:00Z' });
    const conflict = await service.saveChapter({ userId: 'writer-1', chapterId: chapter.id, baseRevision: 0, canonicalContent: { type: 'doc', content: [{ type: 'paragraph' }] }, clientOperationId: 'op-2', savedAt: '2026-07-11T00:02:00Z' });
    expect(conflict.kind).toBe('conflict');
    expect(store.versions(chapter.id)).toContainEqual(expect.objectContaining({ reason: 'CONFLICT_COPY' }));
    expect(store.conflicts(chapter.id)).toHaveLength(1);
  });

  it('creates an automatic snapshot on the first threshold save', async () => {
    const store = createMemorySyncStore();
    const chapter = store.addChapter('work-1', 'writer-1');
    const service = createSyncService(store);
    await service.saveChapter({ userId: 'writer-1', chapterId: chapter.id, baseRevision: 0, canonicalContent: { type: 'doc' }, clientOperationId: 'op-1', savedAt: '2026-07-11T00:05:00Z' });
    expect(store.versions(chapter.id)).toContainEqual(expect.objectContaining({ reason: 'AUTO' }));
  });
});
