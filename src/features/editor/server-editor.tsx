'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RichTextEditor } from '../../components/rich-text-editor';
import type { CanonicalContent } from '../../server/contracts';

type Chapter = { id: string; workId: string; title: string; canonicalContent: CanonicalContent; plainText: string; revision: number };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';

export function ServerEditor({ chapterId, csrf, onBack }: { chapterId: string; csrf: string; onBack(): void }) {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [document, setDocument] = useState<CanonicalContent | null>(null);
  const [plainText, setPlainText] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocument = useRef<CanonicalContent | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch(`/api/chapters/${encodeURIComponent(chapterId)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error('LOAD_FAILED'); return response.json() as Promise<{ chapter: Chapter }>; })
      .then(({ chapter: loaded }) => { if (active) { setChapter(loaded); setDocument(loaded.canonicalContent); setPlainText(loaded.plainText); latestDocument.current = loaded.canonicalContent; revision.current = loaded.revision; } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; if (timer.current) clearTimeout(timer.current); };
  }, [chapterId]);

  const save = useCallback(async () => {
    if (!latestDocument.current) return;
    if (!navigator.onLine) { setState('offline'); return; }
    setState('saving');
    try {
      const response = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ baseRevision: revision.current, canonicalContent: latestDocument.current, clientOperationId: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error('SAVE_FAILED');
      const result = await response.json() as { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };
      if (result.kind === 'conflict') { setState('conflict'); return; }
      revision.current = result.revision;
      setState('saved');
    } catch { setState(navigator.onLine ? 'error' : 'offline'); }
  }, [chapterId, csrf]);

  function update(next: CanonicalContent, text: string) {
    latestDocument.current = next; setDocument(next); setPlainText(text); setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 1000);
  }

  if (!chapter || !document) return <main className="app-loading">{state === 'error' ? '章节加载失败' : '正在打开章节…'}</main>;
  const stateLabel: Record<SaveState, string> = { idle: '已同步', dirty: '未保存', saving: '正在保存…', saved: '已保存', offline: '离线草稿待同步', conflict: '检测到版本冲突，已保存冲突副本', error: '保存失败' };
  return <main className="server-editor">
    <header className="server-editor-header"><button type="button" onClick={onBack}>返回作品</button><h1>{chapter.title}</h1><div><span>{Array.from(plainText.replace(/\s/g, '')).length} 字</span><span aria-live="polite">{stateLabel[state]}</span><button type="button" onClick={() => void save()}>立即保存</button></div></header>
    <section className="server-editor-canvas"><RichTextEditor chapterKey={chapter.id} content={document} onChange={() => undefined} onDocumentChange={update} /></section>
  </main>;
}
