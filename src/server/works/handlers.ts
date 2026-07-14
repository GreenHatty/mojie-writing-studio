import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import { buildWorkGraph, type WorkDirectory, type WorkDirectoryChapter, type WorkDirectoryVolume, type WorkGraph, type WorkKind, type WorkSummary } from './service';

export type WorkHandlerStore = {
  listVisible(userId: string): Promise<WorkSummary[]>;
  createGraph(graph: WorkGraph): Promise<void>;
  getDirectory(userId: string, workId: string): Promise<WorkDirectory | null>;
  createChapter(userId: string, workId: string, volumeId: string | null, title: string | null): Promise<WorkDirectoryChapter>;
  createVolume(userId: string, workId: string, title: string | null): Promise<WorkDirectoryVolume>;
  renameVolume(userId: string, workId: string, volumeId: string, title: string): Promise<WorkDirectoryVolume>;
  reorderChapters(userId: string, workId: string, volumeId: string, chapterIds: string[]): Promise<void>;
};
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
    },
    async detail(request: Request, workId: string): Promise<Response> {
      try {
        const userId = await dependencies.requireUserId(request);
        const work = await dependencies.store.getDirectory(userId, workId);
        if (!work) throw new AppError('NOT_FOUND', 404);
        return protectedJson({ work });
      } catch (error) { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
    },
    async createChapter(request: Request, workId: string): Promise<Response> {
      try {
        await dependencies.assertMutation?.(request);
        const userId = await dependencies.requireUserId(request);
        const input = await readJsonBody<{ volumeId?: string; title?: string }>(request, 64_000);
        const chapter = await dependencies.store.createChapter(userId, workId, input.volumeId ?? null, input.title ?? null);
        return protectedJson({ chapter }, { status: 201 });
      } catch (error) {
        const code = error instanceof AppError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR';
        const status = code === 'FORBIDDEN' ? 403 : code === 'VOLUME_NOT_FOUND' ? 404 : error instanceof AppError ? error.status : 500;
        return protectedJson({ error: code }, { status });
      }
    },
    async createVolume(request: Request, workId: string): Promise<Response> {
      try {
        await dependencies.assertMutation?.(request);
        const input = await readJsonBody<{ title?: string }>(request, 64_000);
        const volume = await dependencies.store.createVolume(await dependencies.requireUserId(request), workId, input.title ?? null);
        return protectedJson({ volume }, { status: 201 });
      } catch (error) {
        const code = error instanceof AppError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR';
        return protectedJson({ error: code }, { status: code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : error instanceof AppError ? error.status : 500 });
      }
    },
    async renameVolume(request: Request, workId: string, volumeId: string): Promise<Response> {
      try {
        await dependencies.assertMutation?.(request);
        const input = await readJsonBody<{ title?: string }>(request, 64_000);
        if (!input.title?.trim()) throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ volume: await dependencies.store.renameVolume(await dependencies.requireUserId(request), workId, volumeId, input.title.trim()) });
      } catch (error) {
        const code = error instanceof AppError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR';
        return protectedJson({ error: code }, { status: code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : error instanceof AppError ? error.status : 500 });
      }
    },
    async reorderChapters(request: Request, workId: string, volumeId: string): Promise<Response> {
      try {
        await dependencies.assertMutation?.(request);
        const input = await readJsonBody<{ chapterIds?: string[] }>(request, 128_000);
        if (!Array.isArray(input.chapterIds) || input.chapterIds.some((id) => typeof id !== 'string')) throw new AppError('INVALID_INPUT', 400);
        await dependencies.store.reorderChapters(await dependencies.requireUserId(request), workId, volumeId, input.chapterIds);
        return protectedJson({ ok: true });
      } catch (error) {
        const code = error instanceof AppError ? error.code : error instanceof Error ? error.message : 'INTERNAL_ERROR';
        return protectedJson({ error: code }, { status: code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : error instanceof AppError ? error.status : 500 });
      }
    }
  };
}
