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

  it('exposes the one-time Owner initialization form without weakening login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401 }))
      .mockResolvedValueOnce(Response.json({ user: { id: 'owner' } }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock); render(<PrivateApp />);
    fireEvent.click(await screen.findByRole('button', { name: '首次部署：初始化 Owner' }));
    fireEvent.change(screen.getByLabelText('初始化密钥'), { target: { value: 'key' } }); fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'owner' } }); fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'strong-password' } }); fireEvent.click(screen.getByRole('button', { name: '完成初始化' }));
    expect(await screen.findByText('Owner 初始化完成，请使用新账号登录')).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/initialize');
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
