import type { WorkRole } from '../contracts';
import { AppError } from '../errors';

export type WorkAccess = 'WORK_OWNER' | WorkRole | null;

export type AccessStore = {
  getWorkOwner(workId: string): Promise<string | null>;
  getMemberRole(workId: string, userId: string): Promise<WorkRole | null>;
};

class MemoryAccessStore implements AccessStore {
  private readonly owners = new Map<string, string>();
  private readonly members = new Map<string, WorkRole>();
  addWork(workId: string, ownerId: string): void { this.owners.set(workId, ownerId); }
  setMember(workId: string, userId: string, role: WorkRole): void { this.members.set(`${workId}:${userId}`, role); }
  revokeMember(workId: string, userId: string): void { this.members.delete(`${workId}:${userId}`); }
  async getWorkOwner(workId: string): Promise<string | null> { return this.owners.get(workId) ?? null; }
  async getMemberRole(workId: string, userId: string): Promise<WorkRole | null> { return this.members.get(`${workId}:${userId}`) ?? null; }
}

export function createMemoryAccessStore(): MemoryAccessStore { return new MemoryAccessStore(); }

/**
 * The platform role intentionally does not appear in this query.  An OWNER
 * has administrative metadata rights but must be granted work access just as
 * any other account would be before reading another author's text.
 */
export function createD1AccessStore(database: D1Database): AccessStore {
  return {
    async getWorkOwner(workId) {
      const row = await database.prepare('SELECT owner_id FROM works WHERE id = ? AND deleted_at IS NULL').bind(workId).first<{ owner_id: string }>();
      return row?.owner_id ?? null;
    },
    async getMemberRole(workId, userId) {
      const row = await database.prepare('SELECT role FROM work_access WHERE work_id = ? AND user_id = ? AND revoked_at IS NULL').bind(workId, userId).first<{ role: WorkRole }>();
      return row?.role ?? null;
    }
  };
}

export function createWorkAccessService(store: AccessStore) {
  async function getWorkAccess(userId: string, workId: string): Promise<WorkAccess> {
    if (await store.getWorkOwner(workId) === userId) return 'WORK_OWNER';
    return store.getMemberRole(workId, userId);
  }
  async function canReadWork(userId: string, workId: string): Promise<boolean> { return (await getWorkAccess(userId, workId)) !== null; }
  async function canEditWork(userId: string, workId: string): Promise<boolean> { return ['WORK_OWNER', 'EDITOR'].includes((await getWorkAccess(userId, workId)) ?? ''); }
  async function canCommentWork(userId: string, workId: string): Promise<boolean> { return ['WORK_OWNER', 'EDITOR', 'COMMENTER'].includes((await getWorkAccess(userId, workId)) ?? ''); }
  async function canManageWorkMembers(userId: string, workId: string): Promise<boolean> { return (await getWorkAccess(userId, workId)) === 'WORK_OWNER'; }
  async function canDeleteWork(userId: string, workId: string): Promise<boolean> { return (await getWorkAccess(userId, workId)) === 'WORK_OWNER'; }
  async function requireWorkRole(userId: string, workId: string, allowedRoles: Exclude<WorkAccess, null>[]): Promise<Exclude<WorkAccess, null>> {
    const access = await getWorkAccess(userId, workId);
    if (!access || !allowedRoles.includes(access)) throw new AppError('FORBIDDEN', 403);
    return access;
  }
  return { getWorkAccess, canReadWork, canEditWork, canCommentWork, canManageWorkMembers, canDeleteWork, requireWorkRole };
}
