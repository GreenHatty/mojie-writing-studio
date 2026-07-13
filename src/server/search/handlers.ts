import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import type { WorkSearchResult } from './d1-store';

export function createWorkSearchHandlers(dependencies: { requireUserId(request: Request): Promise<string>; store: { search(userId: string, workId: string, query: string): Promise<WorkSearchResult[]> } }) {
  return {
    async search(request: Request, workId: string): Promise<Response> {
      try {
        const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
        if (!query || query.length > 200) throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ results: await dependencies.store.search(await dependencies.requireUserId(request), workId, query) });
      } catch (error) {
        return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
      }
    }
  };
}
