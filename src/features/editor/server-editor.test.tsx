import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerEditor } from './server-editor';

vi.mock('../../components/rich-text-editor', () => ({
  RichTextEditor: ({ onDocumentChange }: { onDocumentChange: (json: unknown, text: string, html: string) => void }) =>
    <button onClick={() => onDocumentChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '新内容' }] }] }, '新内容', '<p>新内容</p>')}>模拟输入</button>
}));
vi.mock('../../lib/offline/draft-store', () => ({ openUserDraftStore: async () => ({ saveDraft: vi.fn(async () => undefined), getDraft: vi.fn(async () => null), enqueueSync: vi.fn(async () => undefined), listSync: vi.fn(async () => []), removeSync: vi.fn(async () => undefined), close: vi.fn() }) }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('ServerEditor', () => {
  it('loads a canonical chapter and saves edits with its base revision', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/chapters/c' && init?.method === 'POST') return new Response(JSON.stringify({ kind: 'saved', revision: 4 }), { status: 200 });
      if (url === '/api/chapters/c') return new Response(JSON.stringify({ chapter: { id: 'c', workId: 'w', title: '第一章', canonicalContent: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: '', revision: 3 } }), { status: 200 });
      if (url === '/api/works/w') return new Response(JSON.stringify({ directory: { work: { id: 'w', title: '新书', role: 'WORK_OWNER' }, volumes: [{ id: 'v', title: '第一卷', chapters: [{ id: 'c', title: '第一章', wordCount: 0, status: 'DRAFT' }] }] } }), { status: 200 });
      if (url === '/api/chapters/c/context') return new Response(JSON.stringify({ context: { note: null, versions: [], conflicts: [] } }), { status: 200 });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ServerEditor chapterId="c" csrf="csrf" userId="u" draftDek={new Uint8Array(32)} onBack={() => undefined} />);
    expect(await screen.findByRole('heading', { name: /第一章/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '模拟输入' }));
    fireEvent.click(screen.getByRole('button', { name: '立即保存' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const init = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST')![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ baseRevision: 3, canonicalContent: { type: 'doc' } });
    expect(await screen.findByText('已保存')).toBeTruthy();
  });
});
