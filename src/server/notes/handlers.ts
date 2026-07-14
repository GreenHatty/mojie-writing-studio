import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { PrivateNoteDto } from './d1-store';

export type PrivateNoteStore = { get(userId: string, chapterId: string): Promise<PrivateNoteDto | null>; put(userId: string, chapterId: string, body: string): Promise<PrivateNoteDto> };

function errorResponse(error: unknown): Response {
  return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
}

export function createPrivateNoteHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): Promise<void> | void; store: PrivateNoteStore }) {
  return {
    async get(request: Request, chapterId: string): Promise<Response> {
      try { return protectedJson({ note: await dependencies.store.get(await dependencies.requireUserId(request), chapterId) }); }
      catch (error) { return errorResponse(error); }
    },
    async put(request: Request, chapterId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<{ body?: string }>(request, 128_000);
        if (typeof input.body !== 'string') throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ note: await dependencies.store.put(await dependencies.requireUserId(request), chapterId, input.body) });
      } catch (error) { return errorResponse(error); }
    }
  };
}
