import { AppError } from '../errors';

const ALLOWED_TYPES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/json', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/webp']);
type Metadata = { id: string; ownerId: string; objectKey: string; name: string; contentType: string; size: number; contentHash: string };
export type ObjectBucket = { put(key: string, body: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array | null> };
export type ObjectMetadataStore = { put(record: Metadata): Promise<void>; get(id: string): Promise<Metadata | null> };

class MemoryObjectBucket implements ObjectBucket {
  private readonly values = new Map<string, Uint8Array>();
  async put(key: string, body: Uint8Array): Promise<void> { this.values.set(key, new Uint8Array(body)); }
  async get(key: string): Promise<Uint8Array | null> { return this.values.get(key) ?? null; }
}
class MemoryObjectMetadataStore implements ObjectMetadataStore {
  private readonly values = new Map<string, Metadata>();
  async put(record: Metadata): Promise<void> { this.values.set(record.id, record); }
  async get(id: string): Promise<Metadata | null> { return this.values.get(id) ?? null; }
}
export function createMemoryObjectBucket(): ObjectBucket { return new MemoryObjectBucket(); }
export function createMemoryObjectMetadataStore(): ObjectMetadataStore { return new MemoryObjectMetadataStore(); }
export function createD1ObjectMetadataStore(database: D1Database): ObjectMetadataStore {
  return {
    async put(record) { await database.prepare('INSERT INTO file_metadata (id, owner_id, object_key, original_name, content_type, size_bytes, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(record.id, record.ownerId, record.objectKey, record.name, record.contentType, record.size, record.contentHash, new Date().toISOString()).run(); },
    async get(id) {
      const row = await database.prepare('SELECT id, owner_id, object_key, original_name, content_type, size_bytes, content_hash FROM file_metadata WHERE id = ? LIMIT 1').bind(id).first<{ id: string; owner_id: string; object_key: string; original_name: string; content_type: string; size_bytes: number; content_hash: string }>();
      return row ? { id: row.id, ownerId: row.owner_id, objectKey: row.object_key, name: row.original_name, contentType: row.content_type, size: row.size_bytes, contentHash: row.content_hash } : null;
    }
  };
}
function encode(bytes: Uint8Array): string { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }

export function createObjectStorageService(bucket: ObjectBucket, metadata: ObjectMetadataStore, maxBytes = 25 * 1024 * 1024) {
  return {
    async put(input: { ownerId: string; name: string; contentType: string; body: Uint8Array }): Promise<Metadata> {
      if (!ALLOWED_TYPES.has(input.contentType)) throw new AppError('FILE_TYPE_REJECTED', 415);
      if (input.body.byteLength > maxBytes) throw new AppError('FILE_TOO_LARGE', 413);
      const id = crypto.randomUUID();
      const objectKey = `users/${input.ownerId}/${id}`;
      const contentHash = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input.body).buffer)));
      const record = { id, ownerId: input.ownerId, objectKey, name: input.name, contentType: input.contentType, size: input.body.byteLength, contentHash };
      await bucket.put(objectKey, input.body, input.contentType);
      await metadata.put(record);
      return record;
    },
    async get(userId: string, id: string): Promise<Uint8Array> {
      const record = await metadata.get(id);
      if (!record || record.ownerId !== userId) throw new AppError('FORBIDDEN', 403);
      const body = await bucket.get(record.objectKey);
      if (!body) throw new AppError('NOT_FOUND', 404);
      return body;
    }
  };
}

export function createR2ObjectBucket(bucket: R2Bucket): ObjectBucket {
  return {
    async put(key, body, contentType) { await bucket.put(key, body, { httpMetadata: { contentType } }); },
    async get(key) { const object = await bucket.get(key); return object ? new Uint8Array(await object.arrayBuffer()) : null; }
  };
}
