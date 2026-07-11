'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RichTextEditor } from '../../components/rich-text-editor';
import type { CanonicalContent } from '../../server/contracts';
import { openUserDraftStore } from '../../lib/offline/draft-store';

type Chapter = { id: string; workId: string; title: string; canonicalContent: CanonicalContent; plainText: string; revision: number };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';

export function ServerEditor({ chapterId, csrf, userId, draftDek, onBack }: { chapterId: string; csrf: string; userId: string; draftDek: Uint8Array; onBack(): void }) {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [document, setDocument] = useState<CanonicalContent | null>(null);
  const [plainText, setPlainText] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocument = useRef<CanonicalContent | null>(null);
  const latestPlainText = useRef('');
  const revision = useRef(0);
  const pendingOperationId = useRef<string | null>(null);
  const draftStore = useRef<Awaited<ReturnType<typeof openUserDraftStore>> | null>(null);
  const localWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void fetch(`/api/chapters/${encodeURIComponent(chapterId)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error('LOAD_FAILED'); return response.json() as Promise<{ chapter: Chapter }>; })
      .then(async ({ chapter: loaded }) => {
        const userStore = await openUserDraftStore(userId, draftDek);
        if (!active) { userStore.close(); return; }
        draftStore.current = userStore;
        const local = await userStore.getDraft<{ canonicalContent: CanonicalContent; plainText: string; baseRevision: number; synced?: boolean }>(chapterId);
        const useLocal = Boolean(local && (!local.synced || local.baseRevision >= loaded.revision));
        const content = useLocal ? local!.canonicalContent : loaded.canonicalContent;
        const text = useLocal ? local!.plainText : loaded.plainText;
        setChapter(loaded); setDocument(content); setPlainText(text); latestPlainText.current = text; latestDocument.current = content; revision.current = useLocal ? local!.baseRevision : loaded.revision;
        const queued = await userStore.listSync<{ baseRevision: number; canonicalContent: CanonicalContent }>();
        const operation = queued.find((item) => item.chapterId === chapterId);
        if (operation) pendingOperationId.current = operation.clientOperationId;
        if (useLocal && !local!.synced) setState('offline');
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; if (timer.current) clearTimeout(timer.current); draftStore.current?.close(); draftStore.current = null; };
  }, [chapterId, draftDek, userId]);

  const save = useCallback(async () => {
    if (!latestDocument.current) return;
    if (!navigator.onLine) { setState('offline'); return; }
    setState('saving');
    try {
      const clientOperationId = pendingOperationId.current ?? crypto.randomUUID();
      pendingOperationId.current = clientOperationId;
      const requestBody = { baseRevision: revision.current, canonicalContent: latestDocument.current, clientOperationId };
      await draftStore.current?.enqueueSync(clientOperationId, chapterId, requestBody);
      const response = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) throw new Error('SAVE_FAILED');
      const result = await response.json() as { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };
      if (result.kind === 'conflict') { setState('conflict'); return; }
      revision.current = result.revision;
      await draftStore.current?.removeSync(clientOperationId);
      pendingOperationId.current = null;
      await draftStore.current?.saveDraft(chapterId, { canonicalContent: latestDocument.current, plainText: latestPlainText.current, baseRevision: result.revision, synced: true, savedAt: new Date().toISOString() });
      setState('saved');
    } catch { setState(navigator.onLine ? 'error' : 'offline'); }
  }, [chapterId, csrf]);

  useEffect(() => {
    const retry = () => { if (pendingOperationId.current) void save(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [save]);

  useEffect(() => {
    const persistBeforeHide = () => {
      if (!latestDocument.current) return;
      localWrite.current = draftStore.current?.saveDraft(chapterId, { canonicalContent: latestDocument.current, plainText: latestPlainText.current, baseRevision: revision.current, synced: false, savedAt: new Date().toISOString() }) ?? Promise.resolve();
    };
    window.addEventListener('pagehide', persistBeforeHide);
    return () => window.removeEventListener('pagehide', persistBeforeHide);
  }, [chapterId]);

  async function update(next: CanonicalContent, text: string) {
    latestDocument.current = next; latestPlainText.current = text; setDocument(next); setPlainText(text);
    pendingOperationId.current = crypto.randomUUID();
    const operation = { baseRevision: revision.current, canonicalContent: next, clientOperationId: pendingOperationId.current };
    localWrite.current = (async () => {
      await draftStore.current?.saveDraft(chapterId, { canonicalContent: next, plainText: text, baseRevision: revision.current, synced: false, savedAt: new Date().toISOString() });
      await draftStore.current?.enqueueSync(pendingOperationId.current!, chapterId, operation);
    })();
    await localWrite.current;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 1000);
  }

  if (!chapter || !document) return <main className="app-loading">{state === 'error' ? '章节加载失败' : '正在打开章节…'}</main>;
  const stateLabel: Record<SaveState, string> = { idle: '已同步', dirty: '未保存', saving: '正在保存…', saved: '已保存', offline: '离线草稿待同步', conflict: '检测到版本冲突，已保存冲突副本', error: '保存失败' };
  return <main className="server-editor">
    <header className="server-editor-header"><button type="button" onClick={() => void localWrite.current.then(onBack)}>返回作品</button><h1>{chapter.title}</h1><div><span>{Array.from(plainText.replace(/\s/g, '')).length} 字</span><span aria-live="polite">{stateLabel[state]}</span><button type="button" onClick={() => void save()}>立即保存</button></div></header>
    <section className="server-editor-canvas"><RichTextEditor chapterKey={chapter.id} content={document} onChange={() => undefined} onDocumentChange={update} /></section>
  </main>;
}
