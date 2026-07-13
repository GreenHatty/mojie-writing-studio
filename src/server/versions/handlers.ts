import type { CanonicalContent } from '../contracts';
import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { ChapterVersionDto, RestoredChapter } from './d1-store';

export type ChapterVersionStore = {
  list(userId: string, chapterId: string): Promise<ChapterVersionDto[]>;
  createManual(userId: string, chapterId: string, label: string): Promise<ChapterVersionDto>;
  restore(userId: string, chapterId: string, versionId: string, baseRevision: number): Promise<RestoredChapter>;
};

function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }

export function createChapterVersionHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): Promise<void> | void; store: ChapterVersionStore }) {
  return {
    async list(request: Request, chapterId: string): Promise<Response> {
      try { return protectedJson({ versions: await dependencies.store.list(await dependencies.requireUserId(request), chapterId) }); }
      catch (error) { return errorResponse(error); }
    },
    async create(request: Request, chapterId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<{ label?: string }>(request, 64_000);
        if (typeof input.label !== 'string') throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ version: await dependencies.store.createManual(await dependencies.requireUserId(request), chapterId, input.label) }, { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async restore(request: Request, chapterId: string, versionId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<{ baseRevision?: number }>(request, 64_000);
        if (!Number.isInteger(input.baseRevision)) throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ chapter: await dependencies.store.restore(await dependencies.requireUserId(request), chapterId, versionId, input.baseRevision!) });
      } catch (error) { return errorResponse(error); }
    }
  };
}
