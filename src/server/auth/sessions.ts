import { AppError } from '../errors';

export const SESSION_IDLE_MS = 12 * 60 * 60_000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60_000;
export const SESSION_RENEWAL_WINDOW_MS = 4 * 60 * 60_000;

export type SessionRecord = {
  tokenHash: string;
  userId: string;
  csrfState: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
};

export type SessionStore = {
  put(record: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  revoke(tokenHash: string, at: string): Promise<void>;
  renew(tokenHash: string, expiresAt: string, lastSeenAt: string): Promise<void>;
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

export async function createSession(store: SessionStore, userId: string, csrfState: string, now = new Date()): Promise<{ token: string; record: SessionRecord }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const expiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absoluteExpiresAt.getTime()));
  const record: SessionRecord = {
    tokenHash: await tokenDigest(token),
    userId,
    csrfState,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    absoluteExpiresAt: absoluteExpiresAt.toISOString(),
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

export async function renewSessionIfNeeded(store: SessionStore, token: string, session: SessionRecord, now = new Date()): Promise<{ session: SessionRecord; renewed: boolean }> {
  const expiresAt = new Date(session.expiresAt);
  const absoluteExpiresAt = new Date(session.absoluteExpiresAt);
  if (expiresAt.getTime() - now.getTime() > SESSION_RENEWAL_WINDOW_MS) return { session, renewed: false };
  const nextExpiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absoluteExpiresAt.getTime())).toISOString();
  const lastSeenAt = now.toISOString();
  await store.renew(await tokenDigest(token), nextExpiresAt, lastSeenAt);
  return { session: { ...session, expiresAt: nextExpiresAt, lastSeenAt }, renewed: true };
}

export async function revokeSession(store: SessionStore, token: string, now = new Date()): Promise<void> {
  await store.revoke(await tokenDigest(token), now.toISOString());
}
