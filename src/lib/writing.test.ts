import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  countWritingCharacters,
  saveChapterRevision,
  type ChapterRecord
} from './writing';

const chapter: ChapterRecord = {
  id: 'chapter-1',
  workId: 'work-1',
  volumeId: 'volume-1',
  title: '第一章',
  content: '<p>旧稿</p>',
  plainText: '旧稿',
  wordCount: 2,
  revision: 3,
  updatedAt: '2026-07-10T00:00:00.000Z'
};

describe('countWritingCharacters', () => {
  it('counts Chinese characters and non-whitespace characters for writing statistics', () => {
    expect(countWritingCharacters('山河，正在写作。\n\n')).toBe(8);
  });
});

describe('saveChapterRevision', () => {
  it('increments the revision when the writer saves against the latest revision', () => {
    const result = saveChapterRevision(chapter, {
      baseRevision: 3,
      content: '<p>新稿</p>',
      plainText: '新稿',
      savedAt: '2026-07-10T00:01:00.000Z'
    });

    expect(result.kind).toBe('saved');
    if (result.kind === 'saved') {
      expect(result.chapter.revision).toBe(4);
      expect(result.chapter.wordCount).toBe(2);
    }
  });

  it('creates a conflict copy instead of overwriting a newer remote revision', () => {
    const result = saveChapterRevision(chapter, {
      baseRevision: 2,
      content: '<p>离线内容</p>',
      plainText: '离线内容',
      savedAt: '2026-07-10T00:01:00.000Z'
    });

    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.conflictCopy.title).toBe('第一章（冲突副本）');
      expect(result.current.revision).toBe(3);
    }
  });
});

describe('buildSnapshot', () => {
  it('creates an immutable named snapshot of the chapter state', () => {
    const snapshot = buildSnapshot(chapter, '第一卷初稿');

    expect(snapshot.label).toBe('第一卷初稿');
    expect(snapshot.sourceRevision).toBe(3);
    expect(snapshot.content).toBe('<p>旧稿</p>');
  });
});
