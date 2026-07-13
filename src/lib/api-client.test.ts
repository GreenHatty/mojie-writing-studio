import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, MUTATION_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './api-client';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('apiRequest', () => {
  it('uses a 12 second timeout for reads', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const request = apiRequest('/slow');
    const rejection = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await rejection;
  });

  it('uses a 15 second timeout for mutations', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const request = apiRequest('/save', { method: 'POST' });
    const rejection = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });

  it('distinguishes caller cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const request = apiRequest('/cancel', { signal: controller.signal }); controller.abort();
    await expect(request).rejects.toEqual(expect.objectContaining({ code: 'cancelled' }));
  });

  it('preserves the string error codes returned by privacy-protected core routes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, statusText: 'Unauthorized', headers: { 'Content-Type': 'application/json' } })));
    await expect(apiRequest('/api/core/auth/session')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });
});
