import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import type { InvitationRole } from './service';
import { MemoryRateLimiter } from '../auth/rate-limit';

type Workflow = {
  create(actorId: string, input: { role: InvitationRole; workId: string | null; expiresAt: string; maxUses: number }): Promise<{ id: string; token: string }>;
  revoke(actorId: string, invitationId: string): Promise<void>;
  accept(token: string, account: string, password: string): Promise<{ userId: string }>;
};
function errorResponse(error: unknown): Response { const invitation = error instanceof AppError && error.code === 'INVALID_INVITATION'; return protectedJson({ error: invitation ? 'INVALID_INVITATION' : error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: invitation ? 400 : error instanceof AppError ? error.status : 500 }); }
export function createInvitationHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertOrigin(request: Request): void; assertMutation(request: Request): void; workflow: Workflow; rateLimiter?: MemoryRateLimiter }) {
  const limiter = dependencies.rateLimiter ?? new MemoryRateLimiter();
  function clientIp(request: Request): string { return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'unknown'; }
  return {
    async create(request: Request): Promise<Response> {
      try {
        dependencies.assertMutation(request); const actorId = await dependencies.requireUserId(request); const input = await request.json() as { role?: InvitationRole; workId?: string | null; expiresAt?: string; maxUses?: number };
        const roles = ['OWNER', 'WRITER', 'EDITOR', 'COMMENTER', 'VIEWER'];
        if (!input.role || !roles.includes(input.role) || !input.expiresAt || Number.isNaN(Date.parse(input.expiresAt)) || !Number.isInteger(input.maxUses) || input.maxUses! < 1 || input.maxUses! > 100) throw new AppError('INVALID_INPUT', 400);
        const workRole = ['EDITOR', 'COMMENTER', 'VIEWER'].includes(input.role); if (workRole !== Boolean(input.workId)) throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.workflow.create(actorId, { role: input.role, workId: input.workId ?? null, expiresAt: input.expiresAt, maxUses: input.maxUses! }), { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async revoke(request: Request, invitationId: string): Promise<Response> { try { dependencies.assertMutation(request); await dependencies.workflow.revoke(await dependencies.requireUserId(request), invitationId); return protectedJson({ ok: true }); } catch (error) { return errorResponse(error); } },
    async accept(request: Request, token: string): Promise<Response> {
      try {
        dependencies.assertOrigin(request); const limitKey = `invitation:${clientIp(request)}`; limiter.assertAllowed(limitKey, new Date(), 3); const input = await request.json() as { account?: string; password?: string };
        if (!input.account?.trim() || !input.password || input.password.length < 12) throw new AppError('INVALID_INVITATION', 400);
        try { return protectedJson(await dependencies.workflow.accept(token, input.account.trim().toLowerCase(), input.password)); }
        catch (error) { limiter.recordFailure(limitKey, new Date(), 3); throw error; }
      } catch (error) { return errorResponse(error); }
    }
  };
}
