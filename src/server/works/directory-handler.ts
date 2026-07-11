import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import type { WorkDirectory } from './directory-store';

export function createDirectoryHandler(dependencies: { requireUserId(request: Request): Promise<string>; store: { get(userId: string, workId: string): Promise<WorkDirectory | null> } }) {
  return async (request: Request, workId: string): Promise<Response> => {
    try {
      const directory = await dependencies.store.get(await dependencies.requireUserId(request), workId);
      if (!directory) throw new AppError('NOT_FOUND', 404);
      return protectedJson({ directory });
    } catch (error) {
      return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
    }
  };
}
