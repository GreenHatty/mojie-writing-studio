import { describe, expect, it } from 'vitest';
import { assertCsrf } from './csrf';

describe('assertCsrf', () => {
  it('requires exact origin and matching double-submit token', () => {
    expect(() => assertCsrf({ origin: 'https://writer.example', expectedOrigin: 'https://writer.example', cookieToken: 'abc', headerToken: 'abc' })).not.toThrow();
    expect(() => assertCsrf({ origin: 'https://evil.example', expectedOrigin: 'https://writer.example', cookieToken: 'abc', headerToken: 'abc' })).toThrow('CSRF_REJECTED');
  });
});
