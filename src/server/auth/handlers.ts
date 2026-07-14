import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import { readJsonBody } from '../http/request';
import { assertCsrf } from './csrf';
import { cookieNames, serializeCsrfCookie, serializeSessionCookie, type CookieEnvironment } from './cookies';
import { readCookie, randomCsrfToken } from './http';
import { createAuthService, type AuthRepository } from './service';
import { createSession, renewSessionIfNeeded, requireActiveSession, revokeSession, type SessionStore } from './sessions';
import type { RateLimiter } from './rate-limit';

const LOGIN_POLICY = { limit: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
const INITIALIZATION_POLICY = { limit: 3, windowMs: 15 * 60_000, blockMs: 60 * 60_000 };

type Dependencies = {
  authRepository: AuthRepository;
  sessionStore: SessionStore;
  initializationKey: string;
  cookieEnvironment: CookieEnvironment;
  appOrigin: string;
  rateLimiter: RateLimiter;
};

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return protectedJson({ error: error.code }, { status: error.status });
  return protectedJson({ error: 'INTERNAL_ERROR' }, { status: 500 });
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'unknown';
}

export function createAuthHandlers(dependencies: Dependencies) {
  const auth = createAuthService(dependencies.authRepository, { initializationKey: dependencies.initializationKey });
  const cookieEnvironment = dependencies.cookieEnvironment;
  function assertOrigin(request: Request): void {
    if (request.headers.get('Origin') !== dependencies.appOrigin) throw new AppError('CSRF_REJECTED', 403);
  }
  async function activeSession(request: Request) {
    const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
    if (!token) throw new AppError('UNAUTHENTICATED', 401);
    return { token, session: await requireActiveSession(dependencies.sessionStore, token) };
  }
  async function assertAuthenticatedMutation(request: Request) {
    const { session } = await activeSession(request);
    assertCsrf({
      origin: request.headers.get('Origin'),
      expectedOrigin: dependencies.appOrigin,
      cookieToken: readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).csrf),
      headerToken: request.headers.get('X-CSRF-Token'),
      sessionToken: session.csrfState
    });
    return session;
  }
  return {
    async initialize(request: Request): Promise<Response> {
      try {
        assertOrigin(request);
        await dependencies.rateLimiter.consume(`initialize:${clientIp(request)}`, new Date(), INITIALIZATION_POLICY);
        const input = await readJsonBody<{ key?: string; account?: string; password?: string }>(request, 64_000);
        if (!input.key || !input.account || !input.password) throw new AppError('INVALID_INPUT', 400);
        const user = await auth.initializeOwner({ key: input.key, account: input.account, password: input.password });
        return protectedJson({ user: { id: user.id, account: user.account, platformRole: user.platformRole } }, { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async login(request: Request): Promise<Response> {
      try {
        assertOrigin(request);
        const input = await readJsonBody<{ account?: string; password?: string }>(request, 64_000);
        if (!input.account || !input.password) throw new AppError('INVALID_CREDENTIALS', 401);
        await dependencies.rateLimiter.consume(`login:${input.account.trim().toLocaleLowerCase('en-US')}:${clientIp(request)}`, new Date(), LOGIN_POLICY);
        const user = await auth.login({ account: input.account, password: input.password });
        const csrf = randomCsrfToken();
        const session = await createSession(dependencies.sessionStore, user.id, csrf);
        const response = protectedJson({ user: { id: user.id, account: user.account, platformRole: user.platformRole }, csrf });
        response.headers.append('Set-Cookie', serializeSessionCookie(session.token, cookieEnvironment));
        response.headers.append('Set-Cookie', serializeCsrfCookie(csrf, cookieEnvironment));
        return response;
      } catch (error) { return errorResponse(error); }
    },
    async session(request: Request): Promise<Response> {
      try {
        const { token, session } = await activeSession(request);
        const renewed = await renewSessionIfNeeded(dependencies.sessionStore, token, session);
        const response = protectedJson({ userId: renewed.session.userId, expiresAt: renewed.session.expiresAt, renewed: renewed.renewed });
        if (renewed.renewed) response.headers.append('Set-Cookie', serializeSessionCookie(token, cookieEnvironment));
        return response;
      } catch (error) { return errorResponse(error); }
    },
    async logout(request: Request): Promise<Response> {
      try {
        const { token } = await activeSession(request);
        await assertAuthenticatedMutation(request);
        await revokeSession(dependencies.sessionStore, token);
        const response = protectedJson({ ok: true });
        response.headers.append('Set-Cookie', serializeSessionCookie('', cookieEnvironment, 0));
        response.headers.append('Set-Cookie', serializeCsrfCookie('', cookieEnvironment, 0));
        return response;
      } catch (error) { return errorResponse(error); }
    }
  };
}
