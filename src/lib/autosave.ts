import type { StoredChapter, WritingRepository } from './repository';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

type ChapterAutosaverOptions = {
  repository: WritingRepository;
  chapter: StoredChapter;
  debounceMs?: number;
  onStateChange?: (state: AutosaveState) => void;
  onSaved?: (chapter: StoredChapter) => void;
  onConflict?: (conflictChapterId: string) => void;
};

type PendingContent = {
  content: string;
  plainText: string;
  savedAt: string;
};

export type ChapterAutosaver = {
  queue(content: string, plainText: string): Promise<void>;
  flush(): Promise<void>;
  currentChapter(): StoredChapter;
  dispose(): void;
};

export function createChapterAutosaver(options: ChapterAutosaverOptions): ChapterAutosaver {
  const debounceMs = options.debounceMs ?? 1_000;
  let chapter = options.chapter;
  let pending: PendingContent | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function state(next: AutosaveState) {
    if (!disposed) options.onStateChange?.(next);
  }

  async function flush(): Promise<void> {
    if (!pending) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const write = pending;
    pending = null;
    state('saving');
    try {
      const result = await options.repository.saveChapter(chapter.id, {
        baseRevision: chapter.revision,
        content: write.content,
        plainText: write.plainText,
        savedAt: write.savedAt
      });
      if (result.kind === 'saved') {
        chapter = { ...chapter, ...result.chapter };
        await options.repository.clearDraft(chapter.id);
        options.onSaved?.(chapter);
        state('saved');
      } else {
        chapter = { ...chapter, ...result.current };
        options.onConflict?.(result.conflictCopy.id);
        state('conflict');
      }
    } catch {
      pending = write;
      state('error');
    }
  }

  return {
    async queue(content, plainText) {
      const savedAt = new Date().toISOString();
      pending = { content, plainText, savedAt };
      await options.repository.saveDraft(chapter.id, {
        baseRevision: chapter.revision,
        content,
        plainText,
        savedAt
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, debounceMs);
      state('saving');
    },
    flush,
    currentChapter() {
      return chapter;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}
