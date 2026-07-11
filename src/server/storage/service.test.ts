import { describe, expect, it } from 'vitest';
import { createD1ObjectMetadataStore, createMemoryObjectBucket, createMemoryObjectMetadataStore, createObjectStorageService } from './service';

describe('ObjectStorageService', () => {
  it('rejects executable uploads', async () => {
    const service = createObjectStorageService(createMemoryObjectBucket(), createMemoryObjectMetadataStore());
    await expect(service.put({ ownerId: 'u1', name: 'x.js', contentType: 'application/javascript', body: new Uint8Array([1]) })).rejects.toMatchObject({ code: 'FILE_TYPE_REJECTED' });
  });

  it('uses an owner-scoped key and prevents another user from reading it', async () => {
    const service = createObjectStorageService(createMemoryObjectBucket(), createMemoryObjectMetadataStore());
    const stored = await service.put({ ownerId: 'u1', name: 'draft.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: new Uint8Array([1, 2, 3]) });
    expect(stored.objectKey.startsWith('users/u1/')).toBe(true);
    await expect(service.get('u2', stored.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.get('u1', stored.id)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('binds private file metadata in D1', async () => {
    const calls: unknown[][] = [];
    const database = { prepare() { return { bind(...values: unknown[]) { calls.push(values); return { run: async () => ({ success: true }) }; } }; } } as unknown as D1Database;
    await createD1ObjectMetadataStore(database).put({ id: 'f1', ownerId: 'u1', objectKey: 'users/u1/f1', name: 'x.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 3, contentHash: 'hash' });
    expect(calls[0]).toContain('users/u1/f1');
  });
});
