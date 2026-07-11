import { AppError } from '../errors';

export class MemoryRateLimiter {
  private readonly failures = new Map<string, number[]>();

  assertAllowed(key: string, now: Date, limit: number): void {
    const cutoff = now.getTime() - 15 * 60_000;
    const recent = (this.failures.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    this.failures.set(key, recent);
    if (recent.length >= limit) throw new AppError('RATE_LIMITED', 429);
  }

  recordFailure(key: string, now: Date, limit: number): void {
    this.assertAllowed(key, now, limit);
    this.failures.set(key, [...(this.failures.get(key) ?? []), now.getTime()]);
  }
}
