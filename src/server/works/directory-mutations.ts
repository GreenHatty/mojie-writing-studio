import { AppError } from '../errors';
import { protectedJson } from '../http/response';

export type DirectoryMutationStore = {
  createChapter(userId: string, workId: string, volumeId: string, title: string): Promise<{ id: string }>;
  renameChapter(userId: string, chapterId: string, title: string): Promise<void>;
  moveChapter(userId: string, chapterId: string, direction: 'up' | 'down'): Promise<void>;
};

function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
export function createDirectoryMutationHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): void; store: DirectoryMutationStore }) {
  return {
    async createChapter(request: Request, workId: string): Promise<Response> {
      try {
        dependencies.assertMutation(request); const userId = await dependencies.requireUserId(request);
        const { volumeId, title } = await request.json() as { volumeId?: string; title?: string };
        if (!volumeId || !title?.trim() || title.length > 200) throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.store.createChapter(userId, workId, volumeId, title.trim()), { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async updateChapter(request: Request, chapterId: string): Promise<Response> {
      try {
        dependencies.assertMutation(request); const userId = await dependencies.requireUserId(request);
        const input = await request.json() as { action?: string; title?: string; direction?: string };
        if (input.action === 'rename' && input.title?.trim() && input.title.length <= 200) await dependencies.store.renameChapter(userId, chapterId, input.title.trim());
        else if (input.action === 'move' && (input.direction === 'up' || input.direction === 'down')) await dependencies.store.moveChapter(userId, chapterId, input.direction);
        else throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    }
  };
}
