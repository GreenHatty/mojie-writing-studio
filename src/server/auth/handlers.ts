import { AppError } from '../errors';
import { protectedJson } from '../http/response';
import { cookieNames, serializeCsrfCookie, serializeSessionCookie } from './cookies';
import { readCookie, randomCsrfToken } from './http';
import { createAuthService, type AuthRepository } from './service';
import { createSession, requireActiveSession, revokeSession, type SessionStore } from './sessions';

type Dependencies = { authRepository: AuthRepository; sessionStore: SessionStore; initializationKey: string; nodeEnv: string; appOrigin: string };

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return protectedJson({ error: error.code }, { status: error.status });
  return protectedJson({ error: 'INTERNAL_ERROR' }, { status: 500 });
}

export function createAuthHandlers(dependencies: Dependencies) {
  const auth = createAuthService(dependencies.authRepository, { initializationKey: dependencies.initializationKey });
  const cookieEnvironment = { NODE_ENV: dependencies.nodeEnv };
  function assertOrigin(request: Request): void { if (request.headers.get('Origin') !== dependencies.appOrigin) throw new AppError('CSRF_REJECTED', 403); }
  return {
    async initialize(request: Request): Promise<Response> {
      try {
        assertOrigin(request);
        const input = await request.json() as { key?: string; account?: string; password?: string };
        if (!input.key || !input.account || !input.password) throw new AppError('INVALID_INPUT', 400);
        const user = await auth.initializeOwner({ key: input.key, account: input.account, password: input.password });
        return protectedJson({ user: { id: user.id, account: user.account, platformRole: user.platformRole } }, { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async login(request: Request): Promise<Response> {
      try {
        assertOrigin(request);
        const input = await request.json() as { account?: string; password?: string };
        if (!input.account || !input.password) throw new AppError('INVALID_CREDENTIALS', 401);
        const user = await auth.login({ account: input.account, password: input.password });
        const session = await createSession(dependencies.sessionStore, user.id);
        const csrf = randomCsrfToken();
        const response = protectedJson({ user: { id: user.id, account: user.account, platformRole: user.platformRole }, csrf });
        response.headers.append('Set-Cookie', serializeSessionCookie(session.token, cookieEnvironment));
        response.headers.append('Set-Cookie', serializeCsrfCookie(csrf, cookieEnvironment));
        return response;
      } catch (error) { return errorResponse(error); }
    },
    async session(request: Request): Promise<Response> {
      try {
        const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
        if (!token) throw new AppError('UNAUTHENTICATED', 401);
        const session = await requireActiveSession(dependencies.sessionStore, token);
        return protectedJson({ userId: session.userId, expiresAt: session.expiresAt });
      } catch (error) { return errorResponse(error); }
    },
    async logout(request: Request): Promise<Response> {
      try {
        assertOrigin(request);
        const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
        if (token) await revokeSession(dependencies.sessionStore, token);
        const response = protectedJson({ ok: true });
        response.headers.append('Set-Cookie', serializeSessionCookie('', cookieEnvironment, 0));
        response.headers.append('Set-Cookie', serializeCsrfCookie('', cookieEnvironment, 0));
        return response;
      } catch (error) { return errorResponse(error); }
    }
  };
}
