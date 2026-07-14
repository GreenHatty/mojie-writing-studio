import { env } from 'cloudflare:workers';
import { assertCsrf } from '../auth/csrf';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import type { RuntimeBindings } from '../contracts';
import { AppError } from '../errors';
import { requireRuntimeBindings } from '../runtime';
import { createD1MigrationExecutor, createD1MigrationStore } from './d1-store';
import { createMigrationHandlers } from './handlers';
import { createMigrationService } from './service';

export function migrationHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const cookieEnvironment = { APP_ORIGIN: bindings.APP_ORIGIN, NODE_ENV: bindings.NODE_ENV };
  const sessions = createD1SessionStore(bindings.DB);
  async function sessionFor(request: Request) {
    const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
    if (!token) throw new AppError('UNAUTHENTICATED', 401);
    return requireActiveSession(sessions, token);
  }
  return createMigrationHandlers({
    requireUserId: async (request) => (await sessionFor(request)).userId,
    async assertMutation(request) {
      const session = await sessionFor(request);
      assertCsrf({ origin: request.headers.get('Origin'), expectedOrigin: bindings.APP_ORIGIN, cookieToken: readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).csrf), headerToken: request.headers.get('X-CSRF-Token'), sessionToken: session.csrfState });
    },
    service: createMigrationService(createD1MigrationStore(bindings.DB), createD1MigrationExecutor(bindings.DB))
  });
}
