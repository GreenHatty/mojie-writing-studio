import { describe, expect, it } from 'vitest';
import { cookieNames } from './cookies';

describe('cookieNames', () => {
  it('uses host cookies in production and dev cookies locally', () => {
    expect(cookieNames({ NODE_ENV: 'production' })).toEqual({ session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' });
    expect(cookieNames({ NODE_ENV: 'development' })).toEqual({ session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' });
  });
});
