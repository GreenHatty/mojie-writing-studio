import type { CanonicalContent } from '../contracts';
import { AppError } from '../errors';
import { protectedJson } from '../http/response';

export type CollaborationStore = {
  createComment(userId: string, chapterId: string, body: string, anchor: Record<string, unknown> | null): Promise<{ id: string }>;
  createSuggestion(userId: string, chapterId: string, replacementContent: CanonicalContent, baseRevision: number, anchor: Record<string, unknown> | null): Promise<{ id: string }>;
  handleSuggestion(userId: string, chapterId: string, suggestionId: string, action: 'accept' | 'reject'): Promise<{ revision: number }>;
};
function errorResponse(error: unknown): Response { return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 }); }
export function createCollaborationHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): void; store: CollaborationStore }) {
  return {
    async create(request: Request, chapterId: string): Promise<Response> {
      try {
        dependencies.assertMutation(request); const userId = await dependencies.requireUserId(request); const input = await request.json() as { type?: string; body?: string; anchor?: Record<string, unknown>; replacementContent?: CanonicalContent; baseRevision?: number };
        if (input.type === 'comment' && input.body?.trim() && input.body.length <= 20_000) return protectedJson(await dependencies.store.createComment(userId, chapterId, input.body.trim(), input.anchor ?? null), { status: 201 });
        if (input.type === 'suggestion' && input.replacementContent?.type === 'doc' && Number.isInteger(input.baseRevision)) return protectedJson(await dependencies.store.createSuggestion(userId, chapterId, input.replacementContent, input.baseRevision!, input.anchor ?? null), { status: 201 });
        throw new AppError('INVALID_INPUT', 400);
      } catch (error) { return errorResponse(error); }
    },
    async handle(request: Request, chapterId: string, suggestionId: string): Promise<Response> {
      try {
        dependencies.assertMutation(request); const { action } = await request.json() as { action?: string };
        if (action !== 'accept' && action !== 'reject') throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.store.handleSuggestion(await dependencies.requireUserId(request), chapterId, suggestionId, action));
      } catch (error) { return errorResponse(error); }
    }
  };
}
