import type { PlatformRole } from '../contracts';
import { AppError } from '../errors';
import { hashPassword, passwordNeedsUpgrade, verifyPassword, type StoredPassword } from './passwords';

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
  findById(userId: string): Promise<AuthUser | null>;
  updatePassword?(userId: string, password: StoredPassword): Promise<void>;
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
  async findById(userId: string): Promise<AuthUser | null> { return [...this.users.values()].find((user) => user.id === userId) ?? null; }
  async updatePassword(userId: string, password: StoredPassword): Promise<void> {
    for (const [account, user] of this.users) if (user.id === userId) this.users.set(account, { ...user, password });
  }
}

export function createMemoryAuthRepository(): AuthRepository {
  return new MemoryAuthRepository();
}

function normalizeAccount(account: string): string {
  return account.trim().toLocaleLowerCase('en-US');
}

async function secretsEqual(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export function createAuthService(repository: AuthRepository, options: { initializationKey: string }) {
  return {
    async initializeOwner(input: { key: string; account: string; password: string }): Promise<AuthUser> {
      if (!(await secretsEqual(input.key, options.initializationKey)) || await repository.isOwnerInitialized()) {
        throw new AppError('INITIALIZATION_UNAVAILABLE', 409);
      }
      const account = normalizeAccount(input.account);
      if (!account) throw new AppError('INVALID_INPUT', 400);
      let password: StoredPassword;
      try { password = await hashPassword(input.password); }
      catch { throw new AppError('INVALID_PASSWORD', 400); }
      const user: AuthUser = { id: crypto.randomUUID(), account, platformRole: 'OWNER', password };
      await repository.initializeOwner(user, new Date().toISOString());
      return user;
    },
    async login(input: { account: string; password: string }): Promise<AuthUser> {
      const user = await repository.findByAccount(normalizeAccount(input.account));
      if (!user || !(await verifyPassword(input.password, user.password))) {
        throw new AppError('INVALID_CREDENTIALS', 401);
      }
      if (passwordNeedsUpgrade(user.password) && repository.updatePassword) {
        await repository.updatePassword(user.id, await hashPassword(input.password));
      }
      return user;
    }
  };
}
