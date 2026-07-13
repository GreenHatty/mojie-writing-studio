import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from './rate-limit';

describe('MemoryRateLimiter', () => {
  it('blocks the sixth failure inside a fifteen-minute window', () => {
    const limiter = new MemoryRateLimiter();
    const now = new Date('2026-07-11T00:00:00Z');
    for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure('login:user:ip', now, 5);
    expect(() => limiter.assertAllowed('login:user:ip', now, 5)).toThrow('RATE_LIMITED');
  });
});
