import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { assertCsrf } from '../auth/csrf';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import { AppError } from '../errors';
import { createD1InvitationWorkflow } from './d1-workflow';
import { createInvitationHandlers } from './handlers';
import { MemoryRateLimiter } from '../auth/rate-limit';

const invitationRateLimiter = new MemoryRateLimiter();

export function invitationHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings); const names = cookieNames({ NODE_ENV: bindings.NODE_ENV ?? 'production' }); const sessions = createD1SessionStore(bindings.DB);
  return createInvitationHandlers({
    workflow: createD1InvitationWorkflow(bindings.DB), rateLimiter: invitationRateLimiter,
    async requireUserId(request) { const token = readCookie(request.headers.get('Cookie'), names.session); if (!token) throw new AppError('UNAUTHENTICATED', 401); return (await requireActiveSession(sessions, token)).userId; },
    assertOrigin(request) { if (request.headers.get('Origin') !== bindings.APP_ORIGIN) throw new AppError('CSRF_REJECTED', 403); },
    assertMutation(request) { assertCsrf({ origin: request.headers.get('Origin'), expectedOrigin: bindings.APP_ORIGIN, cookieToken: readCookie(request.headers.get('Cookie'), names.csrf), headerToken: request.headers.get('X-CSRF-Token') }); }
  });
}
