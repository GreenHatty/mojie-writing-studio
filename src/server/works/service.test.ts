import { describe, expect, it } from 'vitest';
import { createMemoryWorkStore, createWorkService } from './service';

describe('WorkService', () => {
  it('creates a work with its first volume and chapter', async () => {
    const service = createWorkService(createMemoryWorkStore());
    const created = await service.createWork('writer-1', { title: '新书', kind: 'long' });
    expect(created.volume.title).toBe('第一卷');
    expect(created.chapter.title).toBe('第1章');
    expect(created.chapter.canonicalContent).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('lists visible metadata without chapter content and does not expose foreign works', async () => {
    const store = createMemoryWorkStore();
    const service = createWorkService(store);
    const own = await service.createWork('writer-1', { title: '自己的书', kind: 'long' });
    await service.createWork('writer-2', { title: '别人的书', kind: 'long' });
    store.grant(own.work.id, 'viewer-1', 'VIEWER');
    const visible = await service.listVisibleWorks('viewer-1');
    expect(visible).toHaveLength(1);
    expect(JSON.stringify(visible)).not.toContain('canonicalContent');
  });

  it('soft deletes and restores an owned work', async () => {
    const service = createWorkService(createMemoryWorkStore());
    const created = await service.createWork('writer-1', { title: '暂删', kind: 'short' });
    await service.softDelete('writer-1', created.work.id, '整理目录');
    expect(await service.listVisibleWorks('writer-1')).toHaveLength(0);
    await service.restore('writer-1', created.work.id);
    expect(await service.listVisibleWorks('writer-1')).toHaveLength(1);
  });
});
