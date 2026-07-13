import { describe, expect, it } from 'vitest';
import { readCookie } from './http';

describe('auth HTTP helpers', () => {
  it('reads an exact cookie name without matching prefixes', () => {
    expect(readCookie('a=1; mojie-dev-session=token; mojie-dev-session-extra=no', 'mojie-dev-session')).toBe('token');
    expect(readCookie(null, 'mojie-dev-session')).toBeNull();
  });
});
