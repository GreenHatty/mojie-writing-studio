import type { PlatformRole, WorkRole } from '../contracts';
import { AppError } from '../errors';

type InvitationRole = PlatformRole | WorkRole;
type InvitationRecord = { id: string; tokenHash: string; createdBy: string; role: InvitationRole; workId: string | null; expiresAt: string; maxUses: number; useCount: number; revokedAt: string | null };
export type InvitationStore = { put(record: InvitationRecord): Promise<void>; findByHash(hash: string): Promise<InvitationRecord | null>; findById(id: string): Promise<InvitationRecord | null>; update(record: InvitationRecord): Promise<void> };

function encode(bytes: Uint8Array): string { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
async function digest(token: string): Promise<string> { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))); }

class MemoryInvitationStore implements InvitationStore {
  private readonly values = new Map<string, InvitationRecord>();
  records(): InvitationRecord[] { return [...this.values.values()]; }
  async put(record: InvitationRecord): Promise<void> { this.values.set(record.id, record); }
  async findByHash(hash: string): Promise<InvitationRecord | null> { return [...this.values.values()].find((row) => row.tokenHash === hash) ?? null; }
  async findById(id: string): Promise<InvitationRecord | null> { return this.values.get(id) ?? null; }
  async update(record: InvitationRecord): Promise<void> { this.values.set(record.id, record); }
}

export function createMemoryInvitationStore(): MemoryInvitationStore { return new MemoryInvitationStore(); }

export function createInvitationService(store: InvitationStore) {
  return {
    async create(input: { createdBy: string; role: InvitationRole; workId: string | null; expiresAt: string; maxUses: number }) {
      const token = encode(crypto.getRandomValues(new Uint8Array(32)));
      const record: InvitationRecord = { id: crypto.randomUUID(), tokenHash: await digest(token), ...input, useCount: 0, revokedAt: null };
      await store.put(record);
      return { id: record.id, token };
    },
    async accept(token: string, now = new Date()): Promise<InvitationRecord> {
      const record = await store.findByHash(await digest(token));
      if (!record || record.revokedAt || now >= new Date(record.expiresAt) || record.useCount >= record.maxUses) throw new AppError('INVALID_INVITATION', 400);
      const accepted = { ...record, useCount: record.useCount + 1 };
      await store.update(accepted);
      return accepted;
    },
    async revoke(id: string, revokedAt: string): Promise<void> {
      const record = await store.findById(id);
      if (!record) throw new AppError('INVALID_INVITATION', 400);
      await store.update({ ...record, revokedAt });
    }
  };
}
