import type { RuntimeBindings } from '../contracts';

export function cookieNames(bindings: Pick<RuntimeBindings, 'NODE_ENV'>): { session: string; csrf: string } {
  return bindings.NODE_ENV === 'production'
    ? { session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' }
    : { session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' };
}

export function serializeSessionCookie(token: string, bindings: Pick<RuntimeBindings, 'NODE_ENV'>, maxAge = 12 * 60 * 60): string {
  const { session } = cookieNames(bindings);
  const secure = bindings.NODE_ENV === 'production' ? '; Secure' : '';
  return `${session}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function serializeCsrfCookie(token: string, bindings: Pick<RuntimeBindings, 'NODE_ENV'>, maxAge = 12 * 60 * 60): string {
  const { csrf } = cookieNames(bindings);
  const secure = bindings.NODE_ENV === 'production' ? '; Secure' : '';
  return `${csrf}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
