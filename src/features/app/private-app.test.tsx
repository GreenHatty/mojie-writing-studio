import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateApp } from './private-app';

vi.mock('../editor/server-editor', () => ({ ServerEditor: ({ chapterId }: { chapterId: string }) => <h1>编辑章节 {chapterId}</h1> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PrivateApp', () => {
  it('shows login when the session is anonymous', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401 })));
    render(<PrivateApp />);
    expect(await screen.findByRole('heading', { name: '登录墨界' })).toBeTruthy();
  });

  it('loads visible works and opens their first server chapter', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ userId: 'writer-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ dek: btoa(String.fromCharCode(...new Uint8Array(32))) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ works: [{ id: 'w1', title: '真实作品', kind: 'long', status: 'DRAFT', updatedAt: '2026-07-11T00:00:00Z', role: 'WORK_OWNER', totalWordCount: 12, firstChapterId: 'c1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PrivateApp />);
    fireEvent.click(await screen.findByRole('button', { name: /真实作品/ }));
    expect(await screen.findByRole('heading', { name: '编辑章节 c1' })).toBeTruthy();
  });

  it('locks the private workspace after logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ userId: 'writer-1' }))
      .mockResolvedValueOnce(Response.json({ dek: btoa(String.fromCharCode(...new Uint8Array(32))) }))
      .mockResolvedValueOnce(Response.json({ works: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock); render(<PrivateApp />);
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('heading', { name: '登录墨界' })).toBeTruthy();
  });
});
