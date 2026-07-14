import { env } from 'cloudflare:workers';
import { assertCsrf } from '../auth/csrf';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import type { RuntimeBindings } from '../contracts';
import { AppError } from '../errors';
import { requireRuntimeBindings } from '../runtime';
import { createD1PrivateNoteStore } from './d1-store';
import { createPrivateNoteHandlers } from './handlers';

export function privateNoteHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const cookieEnvironment = { APP_ORIGIN: bindings.APP_ORIGIN, NODE_ENV: bindings.NODE_ENV };
  const sessions = createD1SessionStore(bindings.DB);
  async function sessionFor(request: Request) {
    const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
    if (!token) throw new AppError('UNAUTHENTICATED', 401);
    return requireActiveSession(sessions, token);
  }
  return createPrivateNoteHandlers({
    store: createD1PrivateNoteStore(bindings.DB),
    async requireUserId(request) { return (await sessionFor(request)).userId; },
    async assertMutation(request) {
      const session = await sessionFor(request);
      assertCsrf({ origin: request.headers.get('Origin'), expectedOrigin: bindings.APP_ORIGIN, cookieToken: readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).csrf), headerToken: request.headers.get('X-CSRF-Token'), sessionToken: session.csrfState });
    }
  });
}
