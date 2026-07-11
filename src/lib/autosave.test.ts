import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createChapterAutosaver } from './autosave';
import { createWritingRepository, type WritingRepository } from './repository';

const repositories: WritingRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.destroy()));
});

describe('createChapterAutosaver', () => {
  it('writes a local draft first and then persists a new chapter revision on flush', async () => {
    const repository = createWritingRepository({
      databaseName: `autosave-test-${crypto.randomUUID()}`,
      ownerId: 'owner-1'
    });
    repositories.push(repository);
    const created = await repository.createWork({ title: '风雪夜归人', kind: 'long' });
    const states: string[] = [];
    let savedRevision = 0;
    const autosaver = createChapterAutosaver({
      repository,
      chapter: created.chapter,
      debounceMs: 60_000,
      onStateChange: (state) => states.push(state),
      onSaved: (chapter) => {
        savedRevision = chapter.revision;
      }
    });

    await autosaver.queue('<p>灯火照长街。</p>', '灯火照长街。');
    expect((await repository.getDraft(created.chapter.id))?.plainText).toBe('灯火照长街。');

    await autosaver.flush();
    expect((await repository.getChapter(created.chapter.id))?.revision).toBe(1);
    expect(await repository.getDraft(created.chapter.id)).toBeNull();
    expect(savedRevision).toBe(1);
    expect(states).toContain('saving');
    expect(states).toContain('saved');
  });

  it('flushes pending content when disposed', async () => {
    const repository = createWritingRepository({
      databaseName: `autosave-dispose-${crypto.randomUUID()}`,
      ownerId: 'owner-1'
    });
    repositories.push(repository);
    const created = await repository.createWork({ title: '归档前', kind: 'long' });
    const autosaver = createChapterAutosaver({ repository, chapter: created.chapter, debounceMs: 60_000 });

    await autosaver.queue('<p>切换前必须保留。</p>', '切换前必须保留。');
    await autosaver.dispose();

    expect((await repository.getChapter(created.chapter.id))?.plainText).toBe('切换前必须保留。');
  });
});
