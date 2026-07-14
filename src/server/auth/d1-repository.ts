import { AppError } from '../errors';
import type { AuthRepository, AuthUser } from './service';
import type { StoredPassword } from './passwords';
import type { SessionRecord, SessionStore } from './sessions';

type UserRow = {
  id: string;
  account_identifier: string;
  platform_role: 'OWNER' | 'WRITER';
  password_algorithm: StoredPassword['algorithm'];
  password_iterations: number;
  password_salt: ArrayBuffer;
  password_digest: ArrayBuffer;
};

export function createD1AuthRepository(database: D1Database): AuthRepository {
  return {
    async isOwnerInitialized(): Promise<boolean> {
      return (await database.prepare('SELECT id FROM platform_accounts WHERE owner_initialized_at IS NOT NULL LIMIT 1').first()) !== null;
    },
    async initializeOwner(user: AuthUser, initializedAt: string): Promise<void> {
      const result = await database.prepare("INSERT INTO platform_accounts (id, platform_role, account_identifier, password_algorithm, password_iterations, password_salt, password_digest, owner_slot, owner_initialized_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM platform_accounts WHERE owner_slot = 1)")
        .bind(user.id, user.platformRole, user.account, user.password.algorithm, user.password.iterations, new Uint8Array(user.password.salt).buffer, new Uint8Array(user.password.digest).buffer, initializedAt, initializedAt, initializedAt).run();
      if (result.meta?.changes === 0) throw new AppError('INITIALIZATION_UNAVAILABLE', 409);
    },
    async findByAccount(account: string): Promise<AuthUser | null> {
      const row = await database.prepare('SELECT id, account_identifier, platform_role, password_algorithm, password_iterations, password_salt, password_digest FROM platform_accounts WHERE account_identifier = ? LIMIT 1').bind(account).first<UserRow>();
      if (!row) return null;
      return {
        id: row.id,
        account: row.account_identifier,
        platformRole: row.platform_role,
        password: { algorithm: row.password_algorithm, iterations: Number(row.password_iterations), salt: new Uint8Array(row.password_salt), digest: new Uint8Array(row.password_digest) }
      };
    },
    async updatePassword(userId: string, password: StoredPassword): Promise<void> {
      await database.prepare('UPDATE platform_accounts SET password_algorithm=?, password_iterations=?, password_salt=?, password_digest=?, updated_at=? WHERE id=?')
        .bind(password.algorithm, password.iterations, new Uint8Array(password.salt).buffer, new Uint8Array(password.digest).buffer, new Date().toISOString(), userId).run();
    }
  };
}

export function createD1SessionStore(database: D1Database): SessionStore {
  return {
    async put(record: SessionRecord): Promise<void> {
      await database.prepare('INSERT INTO platform_sessions (id, token_hash, user_id, csrf_state, expires_at, absolute_expires_at, last_seen_at, revoked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), record.tokenHash, record.userId, record.csrfState, record.expiresAt, record.absoluteExpiresAt, record.lastSeenAt, record.revokedAt, record.createdAt, record.createdAt).run();
    },
    async get(tokenHash: string): Promise<SessionRecord | null> {
      const row = await database.prepare('SELECT token_hash, user_id, csrf_state, expires_at, absolute_expires_at, last_seen_at, revoked_at, created_at FROM platform_sessions WHERE token_hash = ? LIMIT 1').bind(tokenHash).first<{ token_hash: string; user_id: string; csrf_state: string; expires_at: string; absolute_expires_at: string; last_seen_at: string; revoked_at: string | null; created_at: string }>();
      return row ? { tokenHash: row.token_hash, userId: row.user_id, csrfState: row.csrf_state, expiresAt: row.expires_at, absoluteExpiresAt: row.absolute_expires_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, createdAt: row.created_at } : null;
    },
    async revoke(tokenHash: string, at: string): Promise<void> {
      await database.prepare('UPDATE platform_sessions SET revoked_at = ?, updated_at = ? WHERE token_hash = ?').bind(at, at, tokenHash).run();
    },
    async renew(tokenHash: string, expiresAt: string, lastSeenAt: string): Promise<void> {
      await database.prepare('UPDATE platform_sessions SET expires_at = ?, last_seen_at = ?, updated_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(expiresAt, lastSeenAt, lastSeenAt, tokenHash).run();
    }
  };
}
