import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import { AppError } from '../errors';
import { createDirectoryHandler } from './directory-handler';
import { createD1DirectoryStore } from './directory-store';

export function directoryHandlerFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const names = cookieNames({ NODE_ENV: bindings.NODE_ENV ?? 'production' });
  const sessions = createD1SessionStore(bindings.DB);
  return createDirectoryHandler({
    store: createD1DirectoryStore(bindings.DB),
    async requireUserId(request) {
      const token = readCookie(request.headers.get('Cookie'), names.session);
      if (!token) throw new AppError('UNAUTHENTICATED', 401);
      return (await requireActiveSession(sessions, token)).userId;
    }
  });
}
