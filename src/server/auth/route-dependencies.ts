import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { createD1AuthRepository, createD1SessionStore } from './d1-repository';
import { createAuthHandlers } from './handlers';
import { MemoryRateLimiter } from './rate-limit';

const authRateLimiter = new MemoryRateLimiter();

export function authHandlersFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  return createAuthHandlers({
    authRepository: createD1AuthRepository(bindings.DB),
    sessionStore: createD1SessionStore(bindings.DB),
    initializationKey: bindings.OWNER_INITIALIZATION_KEY,
    nodeEnv: bindings.NODE_ENV ?? 'production',
    appOrigin: bindings.APP_ORIGIN,
    rateLimiter: authRateLimiter
  });
}
