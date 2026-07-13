import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import type { WritingStatsDto } from './d1-store';

export function createWritingStatsHandlers(dependencies: { requireUserId(request: Request): Promise<string>; store: { get(userId: string): Promise<WritingStatsDto> } }) {
  return {
    async get(request: Request): Promise<Response> {
      try { return protectedJson({ stats: await dependencies.store.get(await dependencies.requireUserId(request)) }); }
      catch (error) { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
    }
  };
}
