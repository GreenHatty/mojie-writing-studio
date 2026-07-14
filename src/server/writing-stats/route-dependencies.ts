import { env } from 'cloudflare:workers';
import { cookieNames } from '../auth/cookies';
import { createD1SessionStore } from '../auth/d1-repository';
import { readCookie } from '../auth/http';
import { requireActiveSession } from '../auth/sessions';
import type { RuntimeBindings } from '../contracts';
import { AppError } from '../errors';
import { requireRuntimeBindings } from '../runtime';
import { createD1WritingStatsStore } from './d1-store';
import { createWritingStatsHandlers } from './handlers';

export function writingStatsHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const sessions = createD1SessionStore(bindings.DB);
  const cookieEnvironment = { APP_ORIGIN: bindings.APP_ORIGIN, NODE_ENV: bindings.NODE_ENV };
  return createWritingStatsHandlers({
    store: createD1WritingStatsStore(bindings.DB),
    async requireUserId(request) {
      const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
      if (!token) throw new AppError('UNAUTHENTICATED', 401);
      return (await requireActiveSession(sessions, token)).userId;
    }
  });
}
