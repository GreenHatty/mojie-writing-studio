import { AppError } from '../errors';
import { protectedJson } from '../http/response';

export type TrashedWork = { id: string; title: string; deletedAt: string; deleteReason: string | null };
export type TrashStore = { list(userId: string): Promise<TrashedWork[]>; softDelete(userId: string, workId: string): Promise<void>; restore(userId: string, workId: string): Promise<void>; permanentlyDelete(userId: string, workId: string): Promise<void> };
function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
export function createTrashHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): void; store: TrashStore }) {
  return {
    async list(request: Request): Promise<Response> { try { return protectedJson({ works: await dependencies.store.list(await dependencies.requireUserId(request)) }); } catch (error) { return errorResponse(error); } },
    async mutate(request: Request, workId: string): Promise<Response> {
      try {
        dependencies.assertMutation(request); const userId = await dependencies.requireUserId(request); const { action } = await request.json() as { action?: string };
        if (action === 'delete') await dependencies.store.softDelete(userId, workId);
        else if (action === 'restore') await dependencies.store.restore(userId, workId);
        else if (action === 'permanent') await dependencies.store.permanentlyDelete(userId, workId);
        else throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    }
  };
}
