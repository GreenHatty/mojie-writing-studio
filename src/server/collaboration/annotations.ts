import { AppError } from '../errors';

export type AnnotationAccess = {
  canReadWork(userId: string, workId: string): Promise<boolean>;
  canEditWork(userId: string, workId: string): Promise<boolean>;
  canCommentWork(userId: string, workId: string): Promise<boolean>;
};

export type PrivateChapterNote = { id: string; workId: string; chapterId: string; authorId: string; body: string; createdAt: string; updatedAt: string };
export type ChapterComment = { id: string; workId: string; chapterId: string; authorId: string; anchorJson: string | null; body: string; status: 'OPEN' | 'RESOLVED'; createdAt: string; updatedAt: string };
export type ChangeSuggestion = { id: string; workId: string; chapterId: string; authorId: string; anchorJson: string; replacementContent: string; status: 'OPEN' | 'ACCEPTED' | 'REJECTED'; handledBy: string | null; handledAt: string | null; createdAt: string; updatedAt: string };

export type AnnotationStore = {
  savePrivateNote(note: PrivateChapterNote): Promise<void>;
  listPrivateNotes(workId: string, chapterId: string, authorId: string): Promise<PrivateChapterNote[]>;
  saveComment(comment: ChapterComment): Promise<void>;
  listComments(workId: string, chapterId: string): Promise<ChapterComment[]>;
  saveSuggestion(suggestion: ChangeSuggestion): Promise<void>;
  getSuggestion(id: string): Promise<ChangeSuggestion | null>;
  listSuggestions(workId: string, chapterId: string): Promise<ChangeSuggestion[]>;
};

export function createAnnotationService(store: AnnotationStore, access: AnnotationAccess, now = () => new Date().toISOString()) {
  async function requireRead(userId: string, workId: string): Promise<void> {
    if (!(await access.canReadWork(userId, workId))) throw new AppError('FORBIDDEN', 403);
  }
  async function requireComment(userId: string, workId: string): Promise<void> {
    if (!(await access.canCommentWork(userId, workId))) throw new AppError('FORBIDDEN', 403);
  }

  return {
    /** Notes are author-private: collaborators cannot enumerate or read them. */
    async addPrivateNote(input: { userId: string; workId: string; chapterId: string; body: string }): Promise<PrivateChapterNote> {
      await requireRead(input.userId, input.workId);
      if (!input.body.trim()) throw new AppError('INVALID_INPUT', 400);
      const timestamp = now();
      const note: PrivateChapterNote = { id: crypto.randomUUID(), authorId: input.userId, workId: input.workId, chapterId: input.chapterId, body: input.body, createdAt: timestamp, updatedAt: timestamp };
      await store.savePrivateNote(note);
      return note;
    },
    async listPrivateNotes(input: { userId: string; workId: string; chapterId: string }): Promise<PrivateChapterNote[]> {
      await requireRead(input.userId, input.workId);
      return store.listPrivateNotes(input.workId, input.chapterId, input.userId);
    },
    async addComment(input: { userId: string; workId: string; chapterId: string; body: string; anchorJson?: string | null }): Promise<ChapterComment> {
      await requireComment(input.userId, input.workId);
      if (!input.body.trim()) throw new AppError('INVALID_INPUT', 400);
      const timestamp = now();
      const comment: ChapterComment = { id: crypto.randomUUID(), authorId: input.userId, workId: input.workId, chapterId: input.chapterId, anchorJson: input.anchorJson ?? null, body: input.body, status: 'OPEN', createdAt: timestamp, updatedAt: timestamp };
      await store.saveComment(comment);
      return comment;
    },
    async listComments(input: { userId: string; workId: string; chapterId: string }): Promise<ChapterComment[]> {
      await requireRead(input.userId, input.workId);
      return store.listComments(input.workId, input.chapterId);
    },
    async addSuggestion(input: { userId: string; workId: string; chapterId: string; anchorJson: string; replacementContent: string }): Promise<ChangeSuggestion> {
      await requireComment(input.userId, input.workId);
      if (!input.anchorJson || !input.replacementContent.trim()) throw new AppError('INVALID_INPUT', 400);
      const timestamp = now();
      const suggestion: ChangeSuggestion = { id: crypto.randomUUID(), authorId: input.userId, workId: input.workId, chapterId: input.chapterId, anchorJson: input.anchorJson, replacementContent: input.replacementContent, status: 'OPEN', handledBy: null, handledAt: null, createdAt: timestamp, updatedAt: timestamp };
      await store.saveSuggestion(suggestion);
      return suggestion;
    },
    async reviewSuggestion(input: { userId: string; workId: string; suggestionId: string; accept: boolean }): Promise<ChangeSuggestion> {
      if (!(await access.canEditWork(input.userId, input.workId))) throw new AppError('FORBIDDEN', 403);
      const existing = await store.getSuggestion(input.suggestionId);
      if (!existing || existing.workId !== input.workId) throw new AppError('NOT_FOUND', 404);
      if (existing.status !== 'OPEN') throw new AppError('SUGGESTION_ALREADY_REVIEWED', 409);
      const timestamp = now();
      const reviewed: ChangeSuggestion = { ...existing, status: input.accept ? 'ACCEPTED' : 'REJECTED', handledBy: input.userId, handledAt: timestamp, updatedAt: timestamp };
      await store.saveSuggestion(reviewed);
      return reviewed;
    },
    async listSuggestions(input: { userId: string; workId: string; chapterId: string }): Promise<ChangeSuggestion[]> {
      await requireRead(input.userId, input.workId);
      return store.listSuggestions(input.workId, input.chapterId);
    }
  };
}
