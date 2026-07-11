import { describe, expect, it } from 'vitest';
import { createDraftKeyHandler } from './draft-key-handler';

describe('draft key handler', () => {
  it('returns a 32-byte DEK only for the active user and never caches it', async () => {
    const handler = createDraftKeyHandler({ async requireUserId() { return 'u'; }, async unwrap(userId) { expect(userId).toBe('u'); return new Uint8Array(32).fill(7); } });
    const response = await handler(new Request('https://writer.example/api/auth/draft-key'));
    const body = await response.json() as { dek: string };
    expect(atob(body.dek)).toHaveLength(32);
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
  });
});
