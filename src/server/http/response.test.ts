import { describe, expect, it } from 'vitest';
import { protectedJson } from './response';

describe('protectedJson', () => {
  it('prevents caching and applies basic security headers', async () => {
    const response = protectedJson({ ok: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
