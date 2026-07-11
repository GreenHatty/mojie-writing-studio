import { AppError } from '../errors';
import type { AuthRepository, AuthUser } from './service';
import type { StoredPassword } from './passwords';
import type { SessionRecord, SessionStore } from './sessions';

type UserRow = { id: string; account_identifier: string; platform_role: 'OWNER' | 'WRITER'; password_algorithm: StoredPassword['algorithm']; password_iterations: 600000; password_salt: ArrayBuffer; password_digest: ArrayBuffer };

export function createD1AuthRepository(database: D1Database): AuthRepository {
  return {
    async isOwnerInitialized(): Promise<boolean> {
      return (await database.prepare('SELECT id FROM users WHERE owner_initialized_at IS NOT NULL LIMIT 1').first()) !== null;
    },
    async initializeOwner(user: AuthUser, initializedAt: string): Promise<void> {
      const result = await database.prepare("INSERT INTO users (id, platform_role, account_identifier, password_algorithm, password_iterations, password_salt, password_digest, owner_initialized_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE owner_initialized_at IS NOT NULL)")
        .bind(user.id, user.platformRole, user.account, user.password.algorithm, user.password.iterations, new Uint8Array(user.password.salt).buffer, new Uint8Array(user.password.digest).buffer, initializedAt, initializedAt, initializedAt).run();
      if (result.meta?.changes === 0) throw new AppError('INITIALIZATION_UNAVAILABLE', 409);
    },
    async findByAccount(account: string): Promise<AuthUser | null> {
      const row = await database.prepare('SELECT id, account_identifier, platform_role, password_algorithm, password_iterations, password_salt, password_digest FROM users WHERE account_identifier = ? LIMIT 1').bind(account).first<UserRow>();
      if (!row) return null;
      return { id: row.id, account: row.account_identifier, platformRole: row.platform_role, password: { algorithm: row.password_algorithm, iterations: row.password_iterations, salt: new Uint8Array(row.password_salt), digest: new Uint8Array(row.password_digest) } };
    }
  };
}

export function createD1SessionStore(database: D1Database): SessionStore {
  return {
    async put(record: SessionRecord): Promise<void> {
      await database.prepare('INSERT INTO sessions (id, token_hash, user_id, csrf_state, expires_at, absolute_expires_at, revoked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), record.tokenHash, record.userId, '', record.expiresAt, record.absoluteExpiresAt, record.revokedAt, record.createdAt, record.createdAt).run();
    },
    async get(tokenHash: string): Promise<SessionRecord | null> {
      const row = await database.prepare('SELECT token_hash, user_id, expires_at, absolute_expires_at, revoked_at, created_at FROM sessions WHERE token_hash = ? LIMIT 1').bind(tokenHash).first<{ token_hash: string; user_id: string; expires_at: string; absolute_expires_at: string; revoked_at: string | null; created_at: string }>();
      return row ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at, absoluteExpiresAt: row.absolute_expires_at, revokedAt: row.revoked_at, createdAt: row.created_at } : null;
    },
    async revoke(tokenHash: string, at: string): Promise<void> {
      await database.prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE token_hash = ?').bind(at, at, tokenHash).run();
    }
  };
}
