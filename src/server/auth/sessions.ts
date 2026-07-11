import { AppError } from '../errors';

export type SessionRecord = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
};

export type SessionStore = {
  put(record: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  revoke(tokenHash: string, at: string): Promise<void>;
};

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function tokenDigest(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export async function createSession(store: SessionStore, userId: string, now = new Date()): Promise<{ token: string; record: SessionRecord }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const record: SessionRecord = {
    tokenHash: await tokenDigest(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString(),
    revokedAt: null
  };
  await store.put(record);
  return { token, record };
}

export async function requireActiveSession(store: SessionStore, token: string, now = new Date()): Promise<SessionRecord> {
  const record = await store.get(await tokenDigest(token));
  if (!record || record.revokedAt || now >= new Date(record.expiresAt) || now >= new Date(record.absoluteExpiresAt)) {
    throw new AppError('UNAUTHENTICATED', 401);
  }
  return record;
}

export async function revokeSession(store: SessionStore, token: string, now = new Date()): Promise<void> {
  await store.revoke(await tokenDigest(token), now.toISOString());
}
