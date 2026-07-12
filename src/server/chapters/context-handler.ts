import { AppError } from '../errors';
import { protectedJson } from '../http/response';

export type ChapterContext = {
  note: { body: string } | null;
  versions: Array<{ id: string; label: string | null; reason: string; sourceRevision: number; wordCount: number; createdAt: string }>;
  conflicts: Array<{ id: string; currentVersionId: string; submittedVersionId: string; conflictVersionId: string; createdAt: string }>;
  comments: Array<{ id: string; authorId: string; authorName: string; body: string; status: string; createdAt: string }>;
  suggestions: Array<{ id: string; authorId: string; authorName: string; status: string; baseRevision: number; createdAt: string }>;
};

export type ChapterContextStore = {
  getContext(userId: string, chapterId: string): Promise<ChapterContext | null>;
  saveNote(userId: string, chapterId: string, body: string): Promise<void>;
  restoreVersion(userId: string, chapterId: string, versionId: string): Promise<{ revision: number }>;
  resolveConflict(userId: string, chapterId: string, conflictId: string, action: 'KEEP_CURRENT' | 'USE_CONFLICT_COPY'): Promise<{ revision: number }>;
};

function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }

export function createChapterContextHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation?(request: Request): void; store: ChapterContextStore }) {
  return {
    async get(request: Request, chapterId: string): Promise<Response> {
      try {
        const context = await dependencies.store.getContext(await dependencies.requireUserId(request), chapterId);
        if (!context) throw new AppError('NOT_FOUND', 404);
        return protectedJson({ context });
      } catch (error) { return errorResponse(error); }
    },
    async saveNote(request: Request, chapterId: string): Promise<Response> {
      try {
        dependencies.assertMutation?.(request);
        const userId = await dependencies.requireUserId(request);
        const { body } = await request.json() as { body?: string };
        if (typeof body !== 'string' || body.length > 20_000) throw new AppError('INVALID_INPUT', 400);
        await dependencies.store.saveNote(userId, chapterId, body);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    },
    async restore(request: Request, chapterId: string, versionId: string): Promise<Response> {
      try {
        dependencies.assertMutation?.(request);
        const result = await dependencies.store.restoreVersion(await dependencies.requireUserId(request), chapterId, versionId);
        return protectedJson(result);
      } catch (error) { return errorResponse(error); }
    },
    async resolve(request: Request, chapterId: string, conflictId: string): Promise<Response> {
      try {
        dependencies.assertMutation?.(request);
        const { action } = await request.json() as { action?: string };
        if (action !== 'KEEP_CURRENT' && action !== 'USE_CONFLICT_COPY') throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.store.resolveConflict(await dependencies.requireUserId(request), chapterId, conflictId, action));
      } catch (error) { return errorResponse(error); }
    }
  };
}
