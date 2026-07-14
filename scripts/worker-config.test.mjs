import { describe, expect, it } from 'vitest';
import { createWorkerConfig, REQUIRED_WORKER_SECRETS } from './worker-config.mjs';

describe('production Worker configuration', () => {
  it('binds D1, exact HTTPS origin and required managed secrets without R2', () => {
    const config = createWorkerConfig({
      APP_ORIGIN: 'https://mojie.example',
      CLOUDFLARE_D1_DATABASE_ID: 'database-id',
      CLOUDFLARE_D1_DATABASE_NAME: 'mojie-db',
      CLOUDFLARE_WORKER_NAME: 'mojie-worker'
    });
    expect(config.name).toBe('mojie-worker');
    expect(config.vars).toEqual({ APP_ORIGIN: 'https://mojie.example', NODE_ENV: 'production' });
    expect(config.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', database_id: 'database-id' })]);
    expect(config.secrets.required).toEqual(REQUIRED_WORKER_SECRETS);
    expect(config.assets).toMatchObject({ run_worker_first: true, not_found_handling: 'none' });
    expect(config).not.toHaveProperty('r2_buckets');
  });

  it('fails closed when a production D1 has no exact HTTPS origin', () => {
    expect(() => createWorkerConfig({ CLOUDFLARE_D1_DATABASE_ID: 'database-id' })).toThrow(/APP_ORIGIN is required/u);
    expect(() => createWorkerConfig({ APP_ORIGIN: 'http://mojie.example', CLOUDFLARE_D1_DATABASE_ID: 'database-id' })).toThrow(/exact HTTPS origin/u);
    expect(() => createWorkerConfig({ APP_ORIGIN: 'https://mojie.example/path', CLOUDFLARE_D1_DATABASE_ID: 'database-id' })).toThrow(/exact HTTPS origin/u);
  });
});
