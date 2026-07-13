import { describe, expect, it } from 'vitest';
import { createMemoryAuthRepository, createAuthService } from './service';

describe('AuthService', () => {
  it('initializes the first Owner once and permanently closes initialization', async () => {
    const repository = createMemoryAuthRepository();
    const service = createAuthService(repository, { initializationKey: 'one-time-key' });

    const owner = await service.initializeOwner({ key: 'one-time-key', account: 'owner@example.test', password: 'long-password' });
    expect(owner.platformRole).toBe('OWNER');
    await expect(service.initializeOwner({ key: 'one-time-key', account: 'second@example.test', password: 'long-password' })).rejects.toMatchObject({ code: 'INITIALIZATION_UNAVAILABLE' });
  });

  it('returns one generic error for an unknown account and a wrong password', async () => {
    const repository = createMemoryAuthRepository();
    const service = createAuthService(repository, { initializationKey: 'one-time-key' });
    await service.initializeOwner({ key: 'one-time-key', account: 'owner@example.test', password: 'long-password' });

    await expect(service.login({ account: 'missing@example.test', password: 'long-password' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(service.login({ account: 'owner@example.test', password: 'wrong-password' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
