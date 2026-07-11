const BLOCKED_KEYS = new Set(['content', 'canonicalcontent', 'plaintext', 'password', 'cookie', 'token', 'stack', 'databaseerror']);
export type AuditRecord = { actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown> };
export type AuditStore = { put(record: AuditRecord): Promise<void> };
class MemoryAuditStore implements AuditStore {
  private readonly values: AuditRecord[] = [];
  async put(record: AuditRecord): Promise<void> { this.values.push(record); }
  records(): AuditRecord[] { return [...this.values]; }
}
export function createMemoryAuditStore(): MemoryAuditStore { return new MemoryAuditStore(); }
export function createAuditService(store: AuditStore) {
  return {
    async write(record: AuditRecord): Promise<void> {
      const metadata = Object.fromEntries(Object.entries(record.metadata).filter(([key]) => !BLOCKED_KEYS.has(key.toLocaleLowerCase('en-US'))));
      await store.put({ ...record, metadata });
    }
  };
}
