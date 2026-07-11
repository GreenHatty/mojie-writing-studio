import type { PlatformRole } from '../contracts';
import { AppError } from '../errors';
import { hashPassword, verifyPassword, type StoredPassword } from './passwords';

export type AuthUser = {
  id: string;
  account: string;
  platformRole: PlatformRole;
  password: StoredPassword;
};

export type AuthRepository = {
  isOwnerInitialized(): Promise<boolean>;
  initializeOwner(user: AuthUser, initializedAt: string): Promise<void>;
  findByAccount(account: string): Promise<AuthUser | null>;
};

class MemoryAuthRepository implements AuthRepository {
  private initialized = false;
  private readonly users = new Map<string, AuthUser>();

  async isOwnerInitialized(): Promise<boolean> { return this.initialized; }
  async initializeOwner(user: AuthUser): Promise<void> {
    if (this.initialized) throw new AppError('INITIALIZATION_UNAVAILABLE', 409);
    this.users.set(user.account, user);
    this.initialized = true;
  }
  async findByAccount(account: string): Promise<AuthUser | null> { return this.users.get(account) ?? null; }
}

export function createMemoryAuthRepository(): AuthRepository {
  return new MemoryAuthRepository();
}

function normalizeAccount(account: string): string {
  return account.trim().toLocaleLowerCase('en-US');
}

export function createAuthService(repository: AuthRepository, options: { initializationKey: string }) {
  return {
    async initializeOwner(input: { key: string; account: string; password: string }): Promise<AuthUser> {
      if (input.key !== options.initializationKey || await repository.isOwnerInitialized()) {
        throw new AppError('INITIALIZATION_UNAVAILABLE', 409);
      }
      const account = normalizeAccount(input.account);
      const user: AuthUser = {
        id: crypto.randomUUID(),
        account,
        platformRole: 'OWNER',
        password: await hashPassword(input.password)
      };
      await repository.initializeOwner(user, new Date().toISOString());
      return user;
    },
    async login(input: { account: string; password: string }): Promise<AuthUser> {
      const user = await repository.findByAccount(normalizeAccount(input.account));
      if (!user || !(await verifyPassword(input.password, user.password))) {
        throw new AppError('INVALID_CREDENTIALS', 401);
      }
      return user;
    }
  };
}
