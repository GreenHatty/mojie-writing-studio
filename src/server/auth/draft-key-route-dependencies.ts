import { env } from 'cloudflare:workers';
import { AppError } from '../errors';
import type { RuntimeBindings } from '../contracts';
import { requireRuntimeBindings } from '../runtime';
import { cookieNames } from './cookies';
import { createD1DraftKeyStore } from './d1-draft-key-store';
import { createD1SessionStore } from './d1-repository';
import { createDraftKeyHandler } from './draft-key-handler';
import { readCookie } from './http';
import { createLocalDraftKeyService } from './local-draft-keys';
import { requireActiveSession } from './sessions';

function decodeRootKey(value: string): Uint8Array {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
    if (bytes.byteLength !== 32) throw new Error('Invalid root key');
    return bytes;
  } catch { throw new AppError('CONFIGURATION_REQUIRED', 503); }
}

export function draftKeyHandlerFromRuntime() {
  const bindings = requireRuntimeBindings(env as unknown as RuntimeBindings);
  const cookieEnvironment = { APP_ORIGIN: bindings.APP_ORIGIN, NODE_ENV: bindings.NODE_ENV };
  const sessions = createD1SessionStore(bindings.DB);
  const keys = createLocalDraftKeyService(createD1DraftKeyStore(bindings.DB), decodeRootKey(bindings.LOCAL_DRAFT_KEK));
  return createDraftKeyHandler({
    async requireUserId(request) {
      const token = readCookie(request.headers.get('Cookie'), cookieNames(cookieEnvironment).session);
      if (!token) throw new AppError('UNAUTHENTICATED', 401);
      return (await requireActiveSession(sessions, token)).userId;
    },
    async unwrap(userId) { await keys.getOrCreate(userId); return keys.unwrap(userId); }
  });
}
