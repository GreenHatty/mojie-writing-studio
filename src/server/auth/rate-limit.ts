import { AppError } from '../errors';

export type RateLimitPolicy = { limit: number; windowMs: number; blockMs: number };
export type RateLimiter = { consume(key: string, now: Date, policy: RateLimitPolicy): Promise<void> };

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

  async consume(key: string, now: Date, policy: RateLimitPolicy): Promise<void> {
    this.assertAllowed(key, now, policy.limit);
    this.recordFailure(key, now, policy.limit);
  }
}

type RateLimitRow = { window_started_at: string; attempt_count: number; blocked_until: string | null };

export function createD1RateLimiter(database: D1Database): RateLimiter {
  return {
    async consume(key, now, policy): Promise<void> {
      const current = await database.prepare('SELECT window_started_at, attempt_count, blocked_until FROM auth_rate_limit_buckets WHERE bucket_key=?').bind(key).first<RateLimitRow>();
      if (current?.blocked_until && new Date(current.blocked_until) > now) throw new AppError('RATE_LIMITED', 429);

      const windowExpired = !current || new Date(current.window_started_at).getTime() + policy.windowMs <= now.getTime();
      const attemptCount = windowExpired ? 1 : Number(current.attempt_count) + 1;
      const blockedUntil = attemptCount > policy.limit ? new Date(now.getTime() + policy.blockMs).toISOString() : null;
      const timestamp = now.toISOString();
      await database.prepare(`INSERT INTO auth_rate_limit_buckets (bucket_key, window_started_at, attempt_count, blocked_until, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bucket_key) DO UPDATE SET window_started_at=excluded.window_started_at, attempt_count=excluded.attempt_count, blocked_until=excluded.blocked_until, updated_at=excluded.updated_at`)
        .bind(key, windowExpired ? timestamp : current!.window_started_at, attemptCount, blockedUntil, timestamp).run();
      if (attemptCount > policy.limit) throw new AppError('RATE_LIMITED', 429);
    }
  };
}
