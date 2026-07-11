import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { assertCsrf } from '../auth/csrf';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import { AppError } from '../errors';
import { createD1DirectoryMutationStore } from './directory-mutation-d1-store';
import { createDirectoryMutationHandlers } from './directory-mutations';

export function directoryMutationHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings); const names = cookieNames({ NODE_ENV: bindings.NODE_ENV ?? 'production' }); const sessions = createD1SessionStore(bindings.DB);
  return createDirectoryMutationHandlers({
    store: createD1DirectoryMutationStore(bindings.DB),
    async requireUserId(request) { const token = readCookie(request.headers.get('Cookie'), names.session); if (!token) throw new AppError('UNAUTHENTICATED', 401); return (await requireActiveSession(sessions, token)).userId; },
    assertMutation(request) { assertCsrf({ origin: request.headers.get('Origin'), expectedOrigin: bindings.APP_ORIGIN, cookieToken: readCookie(request.headers.get('Cookie'), names.csrf), headerToken: request.headers.get('X-CSRF-Token') }); }
  });
}
