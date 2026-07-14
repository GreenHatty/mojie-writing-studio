import type { RuntimeBindings } from '../contracts';

export type CookieEnvironment = Pick<RuntimeBindings, 'APP_ORIGIN' | 'NODE_ENV'>;

function isDevelopment(bindings: CookieEnvironment): boolean {
  return bindings.NODE_ENV === 'development';
}

function mustUseSecureCookies(bindings: CookieEnvironment): boolean {
  if (isDevelopment(bindings)) return false;
  if (!bindings.APP_ORIGIN || new URL(bindings.APP_ORIGIN).protocol !== 'https:') throw new Error('PRODUCTION_HTTPS_REQUIRED');
  return true;
}

export function cookieNames(bindings: CookieEnvironment): { session: string; csrf: string } {
  return mustUseSecureCookies(bindings)
    ? { session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' }
    : { session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' };
}

function commonAttributes(secure: boolean, maxAge: number): string {
  return `Path=/; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function serializeSessionCookie(token: string, bindings: CookieEnvironment, maxAge = 12 * 60 * 60): string {
  const { session } = cookieNames(bindings);
  return `${session}=${encodeURIComponent(token)}; HttpOnly; ${commonAttributes(mustUseSecureCookies(bindings), maxAge)}`;
}

export function serializeCsrfCookie(token: string, bindings: CookieEnvironment, maxAge = 12 * 60 * 60): string {
  const { csrf } = cookieNames(bindings);
  return `${csrf}=${encodeURIComponent(token)}; ${commonAttributes(mustUseSecureCookies(bindings), maxAge)}`;
}
