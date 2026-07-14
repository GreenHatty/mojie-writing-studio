import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCoreSession, getLocalDraftDek, saveCoreChapter } from './core-api';

afterEach(() => vi.unstubAllGlobals());

describe('core API client', () => {
  it('treats an unauthenticated session as a normal signed-out state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    await expect(getCoreSession()).resolves.toBeNull();
  });

  it('decodes a 32-byte protected draft key only in memory', async () => {
    const encoded = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ dek: encoded, version: 1 }), { headers: { 'Content-Type': 'application/json' } })));
    await expect(getLocalDraftDek()).resolves.toHaveLength(32);
  });

  it('sends a versioned structured document with CSRF protection', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) calls.push(init);
      return new Response(JSON.stringify({ kind: 'saved', revision: 1 }), { headers: { 'Content-Type': 'application/json' } });
    });
    await saveCoreChapter({ chapterId: 'chapter-1', baseRevision: 0, clientOperationId: 'op-1', canonicalContent: { type: 'doc', content: [{ type: 'paragraph' }] } }, 'csrf');
    const init = calls[0];
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf');
    expect(String(init?.body)).toContain('schemaVersion');
  });
});
