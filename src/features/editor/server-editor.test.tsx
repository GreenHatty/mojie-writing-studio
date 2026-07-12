import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerEditor } from './server-editor';

const offline = vi.hoisted(() => ({ saveDraft: vi.fn(), enqueueSync: vi.fn(), getDraft: vi.fn(), listSync: vi.fn(), removeSync: vi.fn(), close: vi.fn() }));
vi.mock('../../components/rich-text-editor', () => ({ RichTextEditor: ({ onDocumentChange }: { onDocumentChange: (json: unknown, text: string, html: string) => void }) => <button onClick={() => onDocumentChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '新内容' }] }] }, '新内容', '<p>新内容</p>')}>模拟输入</button> }));
vi.mock('../../lib/offline/draft-store', () => ({ openUserDraftStore: async () => offline }));

beforeEach(() => {
  offline.saveDraft.mockResolvedValue(undefined); offline.enqueueSync.mockResolvedValue(undefined); offline.getDraft.mockResolvedValue(null); offline.listSync.mockResolvedValue([]); offline.removeSync.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function chapterPayload(id: string, title: string, revision = 3) { return { chapter: { id, workId: 'w', title, canonicalContent: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: '', revision } }; }
function contextPayload() { return { context: { note: null, versions: [], conflicts: [], comments: [], suggestions: [] } }; }

describe('ServerEditor', () => {
  it('loads a canonical chapter and saves edits with its base revision', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/chapters/c' && init?.method === 'POST') return new Response(JSON.stringify({ kind: 'saved', revision: 4 }), { status: 200 });
      if (url === '/api/chapters/c') return Response.json(chapterPayload('c', '第一章'));
      if (url === '/api/works/w') return Response.json({ directory: { work: { id: 'w', title: '新书', role: 'WORK_OWNER' }, volumes: [{ id: 'v', title: '第一卷', chapters: [{ id: 'c', title: '第一章', wordCount: 0, status: 'DRAFT' }] }] } });
      if (url === '/api/chapters/c/context') return Response.json(contextPayload());
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ServerEditor chapterId="c" csrf="csrf" userId="u" draftDek={new Uint8Array(32)} onBack={() => undefined} />);
    expect(await screen.findByRole('heading', { name: /第一章/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '模拟输入' })); fireEvent.click(screen.getByRole('button', { name: '立即保存' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'POST')).toBe(true));
    const init = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST')![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ baseRevision: 3, canonicalContent: { type: 'doc' } });
    expect(offline.enqueueSync.mock.calls.every((call) => typeof call[0] === 'string' && call[0].length > 0)).toBe(true);
    expect(await screen.findByText('已保存')).toBeTruthy();
  });

  it('waits for encrypted local persistence before switching chapters even if cloud is unavailable', async () => {
    let release!: () => void;
    offline.saveDraft.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/chapters/c') return Response.json(chapterPayload('c', '第一章'));
      if (url === '/api/chapters/c2') return Response.json(chapterPayload('c2', '第二章', 0));
      if (url === '/api/works/w') return Response.json({ directory: { work: { id: 'w', title: '新书', role: 'WORK_OWNER' }, volumes: [{ id: 'v', title: '第一卷', chapters: [{ id: 'c', title: '第一章', wordCount: 0, status: 'DRAFT' }, { id: 'c2', title: '第二章', wordCount: 0, status: 'DRAFT' }] }] } });
      if (url.endsWith('/context')) return Response.json(contextPayload());
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ServerEditor chapterId="c" csrf="csrf" userId="u" draftDek={new Uint8Array(32)} onBack={() => undefined} />);
    await screen.findByRole('heading', { name: /第一章/ }); fireEvent.click(screen.getByRole('button', { name: '模拟输入' })); fireEvent.click(screen.getByRole('button', { name: /^第二章/ }));
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/chapters/c2')).toBe(false);
    release();
    expect(await screen.findByRole('heading', { name: /第二章/ })).toBeTruthy();
  });
});
