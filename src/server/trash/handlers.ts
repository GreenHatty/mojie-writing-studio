import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { TrashedChapterDto } from './d1-store';

function errorResponse(error: unknown): Response {
  return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
}

export function createTrashHandlers(dependencies: {
  requireUserId(request: Request): Promise<string>;
  assertMutation(request: Request): Promise<void> | void;
  store: { listDeletedChapters(userId: string, workId: string): Promise<TrashedChapterDto[]>; deleteChapter(userId: string, chapterId: string, reason: string | null): Promise<{ workId: string }>; restoreChapter(userId: string, workId: string, chapterId: string): Promise<void> };
}) {
  return {
    async list(request: Request, workId: string): Promise<Response> {
      try { return protectedJson({ chapters: await dependencies.store.listDeletedChapters(await dependencies.requireUserId(request), workId) }); }
      catch (error) { return errorResponse(error); }
    },
    async deleteChapter(request: Request, chapterId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<{ reason?: string }>(request, 64_000).catch((): { reason?: string } => ({}));
        if (input.reason !== undefined && typeof input.reason !== 'string') throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.store.deleteChapter(await dependencies.requireUserId(request), chapterId, input.reason ?? null));
      } catch (error) { return errorResponse(error); }
    },
    async restoreChapter(request: Request, workId: string, chapterId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        await dependencies.store.restoreChapter(await dependencies.requireUserId(request), workId, chapterId);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    }
  };
}
