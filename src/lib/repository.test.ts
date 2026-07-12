import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createWritingRepository, type WritingRepository } from './repository';

const repositories: WritingRepository[] = [];

function makeRepository(): WritingRepository {
  const repository = createWritingRepository({
    databaseName: `mojie-test-${crypto.randomUUID()}`,
    ownerId: 'owner-1',
    now: () => '2026-07-10T01:00:00.000Z'
  });
  repositories.push(repository);
  return repository;
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.destroy()));
});

describe('WritingRepository', () => {
  it('creates a work with a first volume and chapter that survives reopening the local database', async () => {
    const repository = makeRepository();
    const created = await repository.createWork({ title: '长夜行', kind: 'long' });
    const reopened = createWritingRepository({
      databaseName: repository.databaseName,
      ownerId: 'owner-1',
      now: () => '2026-07-10T01:00:00.000Z'
    });
    repositories.push(reopened);

    const work = await reopened.getWork(created.work.id);

    expect(created.volume.title).toBe('第一卷');
    expect(created.chapter.title).toBe('第1章');
    expect(work?.title).toBe('长夜行');
    expect(work?.volumes[0].chapters).toHaveLength(1);
  });

  it('keeps a stale offline save as a conflict chapter instead of losing it', async () => {
    const repository = makeRepository();
    const created = await repository.createWork({ title: '山海志', kind: 'short' });

    await repository.saveChapter(created.chapter.id, {
      baseRevision: 0,
      content: '<p>云端先完成。</p>',
      plainText: '云端先完成。',
      savedAt: '2026-07-10T01:01:00.000Z'
    });
    const conflict = await repository.saveChapter(created.chapter.id, {
      baseRevision: 0,
      content: '<p>离线内容。</p>',
      plainText: '离线内容。',
      savedAt: '2026-07-10T01:02:00.000Z'
    });

    expect(conflict.kind).toBe('conflict');
    const work = await repository.getWork(created.work.id);
    expect(work?.volumes[0].chapters.map((chapter) => chapter.title)).toContain('第1章（冲突副本）');
  });

  it('keeps an immediate local draft separate from the synced chapter revision', async () => {
    const repository = makeRepository();
    const created = await repository.createWork({ title: '孤灯记', kind: 'essay' });

    await repository.saveDraft(created.chapter.id, {
      baseRevision: 0,
      content: '<p>刚输入的本地草稿。</p>',
      plainText: '刚输入的本地草稿。',
      savedAt: '2026-07-10T01:01:00.000Z'
    });

    const draft = await repository.getDraft(created.chapter.id);
    const chapter = await repository.getChapter(created.chapter.id);
    expect(draft?.plainText).toBe('刚输入的本地草稿。');
    expect(chapter?.plainText).toBe('');
  });

  it('records newly saved writing characters for the current day', async () => {
    const repository = makeRepository();
    const created = await repository.createWork({ title: '千灯录', kind: 'long' });

    await repository.saveChapter(created.chapter.id, {
      baseRevision: 0,
      content: '<p>风起云涌。</p>',
      plainText: '风起云涌。',
      savedAt: '2026-07-10T01:05:00.000Z'
    });

    expect(await repository.getTodayWritingCount('2026-07-10')).toBe(5);
  });

  it('persists project entities and supports soft delete with restore', async () => {
    const repository = makeRepository();
    const created = await repository.createWork({ title: '万象录', kind: 'long' });
    const character = await repository.saveEntity(created.work.id, {
      kind: 'character',
      title: '沈砚',
      summary: '谨慎的年轻剑修',
      fields: { age: 23, aliases: ['阿砚'] }
    });

    expect(await repository.listEntities(created.work.id, 'character')).toEqual([
      expect.objectContaining({ id: character.id, title: '沈砚', kind: 'character' })
    ]);

    await repository.softDeleteEntity(character.id);
    expect(await repository.listEntities(created.work.id, 'character')).toHaveLength(0);
    expect(await repository.listEntities(created.work.id, 'character', { includeDeleted: true })).toHaveLength(1);

    await repository.restoreEntity(character.id);
    expect(await repository.listEntities(created.work.id, 'character')).toHaveLength(1);
  });
});
