import { describe, expect, it } from 'vitest';
import { requireRuntimeBindings } from './runtime';

describe('requireRuntimeBindings', () => {
  it('fails closed when any protected runtime binding is absent', () => {
    expect(() => requireRuntimeBindings({ APP_ORIGIN: 'https://writer.example' })).toThrow('CONFIGURATION_REQUIRED');
  });

  it('fails closed when backup and admin secrets are absent', () => {
    expect(() => requireRuntimeBindings({
      DB: {} as D1Database,
      OBJECTS: {} as R2Bucket,
      APP_ORIGIN: 'https://writer.example',
      OWNER_INITIALIZATION_KEY: 'configured',
      LOCAL_DRAFT_KEK: 'configured'
    })).toThrow('CONFIGURATION_REQUIRED');
  });
});
