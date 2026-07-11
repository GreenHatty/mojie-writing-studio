import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateApp } from './private-app';

afterEach(() => vi.unstubAllGlobals());

describe('PrivateApp', () => {
  it('shows login when the session is anonymous', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401 })));
    render(<PrivateApp />);
    expect(await screen.findByRole('heading', { name: '登录墨界' })).toBeTruthy();
  });

  it('loads real visible works for an authenticated user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ userId: 'writer-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ works: [{ id: 'w1', title: '真实作品', kind: 'long', status: 'DRAFT', updatedAt: '2026-07-11T00:00:00Z', role: 'WORK_OWNER', totalWordCount: 12 }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PrivateApp />);
    expect(await screen.findByRole('heading', { name: '真实作品' })).toBeTruthy();
    expect(screen.getByText('12 字')).toBeTruthy();
  });
});
