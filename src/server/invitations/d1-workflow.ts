import { AppError } from '../errors';
import { createD1AuthRepository } from '../auth/d1-repository';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createInvitationService, hashInvitationToken, type InvitationRecord, type InvitationRole, type InvitationStore } from './service';

type InvitationRow = { id: string; token_hash: string; created_by: string; role: InvitationRole; work_id: string | null; expires_at: string; max_uses: number; use_count: number; revoked_at: string | null };
function map(row: InvitationRow): InvitationRecord { return { id: row.id, tokenHash: row.token_hash, createdBy: row.created_by, role: row.role, workId: row.work_id, expiresAt: row.expires_at, maxUses: Number(row.max_uses), useCount: Number(row.use_count), revokedAt: row.revoked_at }; }
export function createD1InvitationStore(database: D1Database): InvitationStore {
  const select = 'SELECT id, token_hash, created_by, role, work_id, expires_at, max_uses, use_count, revoked_at FROM invitations';
  return {
    async put(record) { await database.prepare('INSERT INTO invitations (id, token_hash, role, work_id, expires_at, max_uses, use_count, revoked_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(record.id, record.tokenHash, record.role, record.workId, record.expiresAt, record.maxUses, record.useCount, record.revokedAt, record.createdBy, new Date().toISOString()).run(); },
    async findByHash(hash) { const row = await database.prepare(`${select} WHERE token_hash = ? LIMIT 1`).bind(hash).first<InvitationRow>(); return row ? map(row) : null; },
    async findById(id) { const row = await database.prepare(`${select} WHERE id = ? LIMIT 1`).bind(id).first<InvitationRow>(); return row ? map(row) : null; },
    async update(record) { await database.prepare('UPDATE invitations SET use_count = ?, revoked_at = ? WHERE id = ?').bind(record.useCount, record.revokedAt, record.id).run(); }
  };
}

async function authorize(database: D1Database, actorId: string, role: InvitationRole, workId: string | null) {
  if (workId) {
    if (!['EDITOR', 'COMMENTER', 'VIEWER'].includes(role)) throw new AppError('INVALID_INPUT', 400);
    const row = await database.prepare('SELECT id FROM works WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(workId, actorId).first(); if (!row) throw new AppError('FORBIDDEN', 403);
  } else {
    if (!['OWNER', 'WRITER'].includes(role)) throw new AppError('INVALID_INPUT', 400);
    const row = await database.prepare("SELECT id FROM users WHERE id = ? AND platform_role = 'OWNER'").bind(actorId).first(); if (!row) throw new AppError('FORBIDDEN', 403);
  }
}

export function createD1InvitationWorkflow(database: D1Database) {
  const store = createD1InvitationStore(database); const service = createInvitationService(store); const auth = createD1AuthRepository(database);
  return {
    async create(actorId: string, input: { role: InvitationRole; workId: string | null; expiresAt: string; maxUses: number }) { await authorize(database, actorId, input.role, input.workId); if (new Date(input.expiresAt) <= new Date()) throw new AppError('INVALID_INPUT', 400); return service.create({ createdBy: actorId, ...input }); },
    async revoke(actorId: string, invitationId: string) { const record = await store.findById(invitationId); if (!record) throw new AppError('INVALID_INVITATION', 400); await authorize(database, actorId, record.role, record.workId); await service.revoke(invitationId, new Date().toISOString()); },
    async accept(token: string, account: string, password: string): Promise<{ userId: string }> {
      const tokenHash = await hashInvitationToken(token); const record = await store.findByHash(tokenHash); const now = new Date();
      if (!record || record.revokedAt || now >= new Date(record.expiresAt) || record.useCount >= record.maxUses) throw new AppError('INVALID_INVITATION', 400);
      const existing = await auth.findByAccount(account); if (existing && !(await verifyPassword(password, existing.password))) throw new AppError('INVALID_INVITATION', 400);
      const userId = existing?.id ?? crypto.randomUUID(); const passwordRecord = existing ? null : await hashPassword(password); const acceptanceId = crypto.randomUUID(); const at = now.toISOString();
      const statements: D1PreparedStatement[] = [database.prepare("UPDATE invitations SET use_count = use_count + 1, last_acceptance_id = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses").bind(acceptanceId, tokenHash, at)];
      if (!existing && passwordRecord) statements.push(database.prepare("INSERT INTO users (id, platform_role, account_identifier, password_algorithm, password_iterations, password_salt, password_digest, created_at, updated_at) SELECT ?, 'WRITER', ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM invitations WHERE token_hash = ? AND last_acceptance_id = ?)").bind(userId, account, passwordRecord.algorithm, passwordRecord.iterations, passwordRecord.salt, passwordRecord.digest, at, at, tokenHash, acceptanceId));
      if (record.workId) statements.push(database.prepare('INSERT INTO work_members (work_id, user_id, role, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM invitations WHERE token_hash = ? AND last_acceptance_id = ?) ON CONFLICT(work_id, user_id) DO UPDATE SET role = excluded.role').bind(record.workId, userId, record.role, at, tokenHash, acceptanceId));
      else statements.push(database.prepare('UPDATE users SET platform_role = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM invitations WHERE token_hash = ? AND last_acceptance_id = ?)').bind(record.role, at, userId, tokenHash, acceptanceId));
      statements.push(database.prepare('UPDATE invitations SET last_acceptance_id = NULL WHERE token_hash = ? AND last_acceptance_id = ?').bind(tokenHash, acceptanceId));
      const results = await database.batch(statements); if ((results[0].meta?.changes ?? 0) !== 1) throw new AppError('INVALID_INVITATION', 400); return { userId };
    }
  };
}
