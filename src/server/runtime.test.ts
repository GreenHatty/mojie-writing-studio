import { describe, expect, it } from 'vitest';
import { requireRuntimeBindings } from './runtime';

describe('requireRuntimeBindings', () => {
  it('fails closed when any protected runtime binding is absent', () => {
    expect(() => requireRuntimeBindings({ APP_ORIGIN: 'https://writer.example' })).toThrow('CONFIGURATION_REQUIRED');
  });
});
