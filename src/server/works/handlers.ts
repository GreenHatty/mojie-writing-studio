import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import { buildWorkGraph, type WorkGraph, type WorkKind, type WorkSummary } from './service';

export type WorkHandlerStore = { listVisible(userId: string): Promise<WorkSummary[]>; createGraph(graph: WorkGraph): Promise<void> };
export function createWorkHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation?(request: Request): Promise<void> | void; store: WorkHandlerStore }) {
  return {
    async list(request: Request): Promise<Response> {
      try { const userId = await dependencies.requireUserId(request); return protectedJson({ works: await dependencies.store.listVisible(userId) }); }
      catch (error) { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
    },
    async create(request: Request): Promise<Response> {
      try {
        await dependencies.assertMutation?.(request);
        const userId = await dependencies.requireUserId(request);
        const input = await readJsonBody<{ title?: string; kind?: WorkKind }>(request, 64_000);
        if (!input.title || !input.kind || !['long', 'short', 'essay'].includes(input.kind)) throw new AppError('INVALID_INPUT', 400);
        const graph = buildWorkGraph(userId, { title: input.title, kind: input.kind }, new Date().toISOString());
        await dependencies.store.createGraph(graph);
        return protectedJson({ work: graph.work, volume: graph.volume, chapter: graph.chapter }, { status: 201 });
      } catch (error) { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
    }
  };
}
