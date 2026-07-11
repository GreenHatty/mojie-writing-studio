import { describe, expect, it } from 'vitest';
import { cookieNames, serializeSessionCookie } from './cookies';

describe('cookieNames', () => {
  it('uses host cookies in production and dev cookies locally', () => {
    expect(cookieNames({ NODE_ENV: 'production' })).toEqual({ session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' });
    expect(cookieNames({ NODE_ENV: 'development' })).toEqual({ session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' });
  });

  it('requires Secure and Host prefix in production', () => {
    const value = serializeSessionCookie('token', { NODE_ENV: 'production' });
    expect(value).toContain('__Host-mojie-session=token');
    expect(value).toContain('Secure');
    expect(value).toContain('HttpOnly');
    expect(value).not.toContain('Domain=');
  });
});
