import type { CanonicalContent } from '../contracts';
import { AppError } from '../errors';
import { protectedJson } from '../http/response';

export type ChapterDto = { id: string; workId: string; title: string; canonicalContent: CanonicalContent; plainText: string; revision: number };
export type ChapterSaveResult = { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };
export type ChapterHandlerStore = { get(userId: string, chapterId: string): Promise<ChapterDto | null>; save(input: { userId: string; chapterId: string; baseRevision: number; canonicalContent: CanonicalContent; clientOperationId: string; savedAt: string }): Promise<ChapterSaveResult> };

function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
export function createChapterHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation?(request: Request): void; store: ChapterHandlerStore }) {
  return {
    async get(request: Request, chapterId: string): Promise<Response> {
      try { const userId = await dependencies.requireUserId(request); const chapter = await dependencies.store.get(userId, chapterId); if (!chapter) throw new AppError('NOT_FOUND', 404); return protectedJson({ chapter }); }
      catch (error) { return errorResponse(error); }
    },
    async save(request: Request, chapterId: string): Promise<Response> {
      try {
        dependencies.assertMutation?.(request);
        const userId = await dependencies.requireUserId(request);
        const input = await request.json() as { baseRevision?: number; canonicalContent?: CanonicalContent; clientOperationId?: string };
        if (!Number.isInteger(input.baseRevision) || !input.canonicalContent || input.canonicalContent.type !== 'doc' || !input.clientOperationId) throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.store.save({ userId, chapterId, baseRevision: input.baseRevision!, canonicalContent: input.canonicalContent, clientOperationId: input.clientOperationId, savedAt: new Date().toISOString() }));
      } catch (error) { return errorResponse(error); }
    }
  };
}
