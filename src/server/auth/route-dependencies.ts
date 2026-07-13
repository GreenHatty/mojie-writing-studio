import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { createD1AuthRepository, createD1SessionStore } from './d1-repository';
import { createAuthHandlers } from './handlers';
import { createD1RateLimiter } from './rate-limit';

export function authHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  return createAuthHandlers({
    authRepository: createD1AuthRepository(bindings.DB),
    sessionStore: createD1SessionStore(bindings.DB),
    initializationKey: bindings.OWNER_INITIALIZATION_KEY,
    cookieEnvironment: { APP_ORIGIN: bindings.APP_ORIGIN, NODE_ENV: bindings.NODE_ENV },
    appOrigin: bindings.APP_ORIGIN,
    rateLimiter: createD1RateLimiter(bindings.DB)
  });
}
