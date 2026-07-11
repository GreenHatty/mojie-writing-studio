import { env } from 'cloudflare:workers';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { AppError } from '../errors';
import { cookieNames } from './cookies';
import { createD1DraftKeyStore } from './d1-draft-key-store';
import { createD1SessionStore } from './d1-repository';
import { createDraftKeyHandler } from './draft-key-handler';
import { readCookie } from './http';
import { createLocalDraftKeyService } from './local-draft-keys';
import { requireActiveSession } from './sessions';

function decodeKek(value: string): Uint8Array {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  }
  catch { throw new AppError('CONFIGURATION_REQUIRED', 503); }
}

export function draftKeyHandlerFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const cookieEnvironment = { NODE_ENV: bindings.NODE_ENV ?? 'production' };
  const sessions = createD1SessionStore(bindings.DB);
  const keys = createLocalDraftKeyService(createD1DraftKeyStore(bindings.DB), decodeKek(bindings.LOCAL_DRAFT_KEK));
  return createDraftKeyHandler({
    async requireUserId(request) {
      const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
      if (!token) throw new AppError('UNAUTHENTICATED', 401);
      return (await requireActiveSession(sessions, token)).userId;
    },
    async unwrap(userId) { await keys.getOrCreate(userId); return keys.unwrap(userId); }
  });
}
