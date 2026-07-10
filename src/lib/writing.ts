export type ChapterRecord = {
  id: string;
  workId: string;
  volumeId: string;
  title: string;
  content: string;
  plainText: string;
  wordCount: number;
  revision: number;
  updatedAt: string;
};

export type ChapterSnapshot = {
  id: string;
  chapterId: string;
  label: string;
  sourceRevision: number;
  content: string;
  plainText: string;
  wordCount: number;
  createdAt: string;
};

export type SaveChapterRequest = {
  baseRevision: number;
  content: string;
  plainText: string;
  savedAt: string;
};

export type SaveChapterResult =
  | { kind: 'saved'; chapter: ChapterRecord }
  | { kind: 'conflict'; current: ChapterRecord; conflictCopy: ChapterRecord };

export function countWritingCharacters(text: string): number {
  return [...text].filter((character) => !/\s/u.test(character)).length;
}

export function saveChapterRevision(
  current: ChapterRecord,
  request: SaveChapterRequest
): SaveChapterResult {
  const wordCount = countWritingCharacters(request.plainText);

  if (request.baseRevision !== current.revision) {
    return {
      kind: 'conflict',
      current,
      conflictCopy: {
        ...current,
        id: `${current.id}-conflict-${request.savedAt}`,
        title: `${current.title}（冲突副本）`,
        content: request.content,
        plainText: request.plainText,
        wordCount,
        revision: 0,
        updatedAt: request.savedAt
      }
    };
  }

  return {
    kind: 'saved',
    chapter: {
      ...current,
      content: request.content,
      plainText: request.plainText,
      wordCount,
      revision: current.revision + 1,
      updatedAt: request.savedAt
    }
  };
}

export function buildSnapshot(chapter: ChapterRecord, label = '自动快照'): ChapterSnapshot {
  return {
    id: `${chapter.id}-v${chapter.revision}-${chapter.updatedAt}`,
    chapterId: chapter.id,
    label,
    sourceRevision: chapter.revision,
    content: chapter.content,
    plainText: chapter.plainText,
    wordCount: chapter.wordCount,
    createdAt: chapter.updatedAt
  };
}
