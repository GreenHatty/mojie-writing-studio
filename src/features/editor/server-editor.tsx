'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RichTextEditor } from '../../components/rich-text-editor';
import { openUserDraftStore } from '../../lib/offline/draft-store';
import type { CanonicalContent } from '../../server/contracts';

type Chapter = { id: string; workId: string; title: string; canonicalContent: CanonicalContent; plainText: string; revision: number };
type Directory = { work: { id: string; title: string; role: string }; volumes: Array<{ id: string; title: string; chapters: Array<{ id: string; title: string; wordCount: number; status: string }> }> };
type Context = { note: { body: string } | null; versions: Array<{ id: string; label: string | null; reason: string; sourceRevision: number; wordCount: number; createdAt: string }>; conflicts: Array<{ id: string; createdAt: string }>; comments: Array<{ id: string; authorName: string; body: string; status: string; createdAt: string }>; suggestions: Array<{ id: string; authorName: string; status: string; baseRevision: number; createdAt: string }> };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
type DraftStore = Awaited<ReturnType<typeof openUserDraftStore>>;

export function ServerEditor({ chapterId, csrf, userId, draftDek, onBack }: { chapterId: string; csrf: string; userId: string; draftDek: Uint8Array; onBack(): void }) {
  const [activeChapterId, setActiveChapterId] = useState(chapterId);
  const [reloadKey, setReloadKey] = useState(0);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [document, setDocument] = useState<CanonicalContent | null>(null);
  const [plainText, setPlainText] = useState('');
  const [note, setNote] = useState('');
  const [rightTab, setRightTab] = useState<'note' | 'versions' | 'conflicts' | 'collaboration'>('note');
  const [commentBody, setCommentBody] = useState('');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocument = useRef<CanonicalContent | null>(null);
  const latestPlainText = useRef('');
  const revision = useRef(0);
  const pendingOperationId = useRef<string | null>(null);
  const draftStore = useRef<DraftStore | null>(null);
  const localWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    setChapter(null); setDocument(null); setState('idle');
    void fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error('LOAD_FAILED'); return response.json() as Promise<{ chapter: Chapter }>; })
      .then(async ({ chapter: loaded }) => {
        const userStore = await openUserDraftStore(userId, draftDek);
        if (!active) { userStore.close(); return; }
        draftStore.current?.close(); draftStore.current = userStore;
        const local = await userStore.getDraft<{ canonicalContent: CanonicalContent; plainText: string; baseRevision: number; synced?: boolean }>(activeChapterId);
        const useLocal = Boolean(local && (!local.synced || local.baseRevision >= loaded.revision));
        const content = useLocal ? local!.canonicalContent : loaded.canonicalContent;
        const text = useLocal ? local!.plainText : loaded.plainText;
        setChapter(loaded); setDocument(content); setPlainText(text); latestPlainText.current = text; latestDocument.current = content; revision.current = useLocal ? local!.baseRevision : loaded.revision;
        const queued = await userStore.listSync<{ baseRevision: number; canonicalContent: CanonicalContent }>();
        const operation = queued.find((item) => item.chapterId === activeChapterId);
        pendingOperationId.current = operation?.clientOperationId ?? null;
        if (useLocal && !local!.synced) setState('offline');
        const [directoryResponse, contextResponse] = await Promise.all([
          fetch(`/api/works/${encodeURIComponent(loaded.workId)}`, { credentials: 'same-origin', cache: 'no-store' }),
          fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/context`, { credentials: 'same-origin', cache: 'no-store' })
        ]);
        if (!directoryResponse.ok || !contextResponse.ok) throw new Error('CONTEXT_LOAD_FAILED');
        const directoryPayload = await directoryResponse.json() as { directory: Directory };
        const contextPayload = await contextResponse.json() as { context: Context };
        if (active) { setDirectory(directoryPayload.directory); setContext(contextPayload.context); setNote(contextPayload.context.note?.body ?? ''); }
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; if (timer.current) clearTimeout(timer.current); };
  }, [activeChapterId, draftDek, reloadKey, userId]);

  useEffect(() => () => { draftStore.current?.close(); draftStore.current = null; }, []);

  const save = useCallback(async () => {
    if (!latestDocument.current) return;
    if (directory && directory.work.role !== 'WORK_OWNER' && directory.work.role !== 'EDITOR') { setState('dirty'); return; }
    if (!navigator.onLine) { setState('offline'); return; }
    setState('saving');
    try {
      const clientOperationId = pendingOperationId.current ?? crypto.randomUUID();
      pendingOperationId.current = clientOperationId;
      const requestBody = { baseRevision: revision.current, canonicalContent: latestDocument.current, clientOperationId };
      await draftStore.current?.enqueueSync(clientOperationId, activeChapterId, requestBody);
      const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(requestBody) });
      if (!response.ok) throw new Error('SAVE_FAILED');
      const result = await response.json() as { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };
      if (result.kind === 'conflict') { setState('conflict'); setRightTab('conflicts'); return; }
      revision.current = result.revision;
      await draftStore.current?.removeSync(clientOperationId); pendingOperationId.current = null;
      await draftStore.current?.saveDraft(activeChapterId, { canonicalContent: latestDocument.current, plainText: latestPlainText.current, baseRevision: result.revision, synced: true, savedAt: new Date().toISOString() });
      setState('saved');
    } catch { setState(navigator.onLine ? 'error' : 'offline'); }
  }, [activeChapterId, csrf, directory]);

  useEffect(() => { const retry = () => { if (pendingOperationId.current) void save(); }; window.addEventListener('online', retry); return () => window.removeEventListener('online', retry); }, [save]);
  useEffect(() => {
    const persistBeforeHide = () => { if (latestDocument.current) localWrite.current = draftStore.current?.saveDraft(activeChapterId, { canonicalContent: latestDocument.current, plainText: latestPlainText.current, baseRevision: revision.current, synced: false, savedAt: new Date().toISOString() }) ?? Promise.resolve(); };
    window.addEventListener('pagehide', persistBeforeHide); return () => window.removeEventListener('pagehide', persistBeforeHide);
  }, [activeChapterId]);

  async function update(next: CanonicalContent, text: string) {
    const operationId = crypto.randomUUID();
    latestDocument.current = next; latestPlainText.current = text; setDocument(next); setPlainText(text); pendingOperationId.current = operationId;
    const operation = { baseRevision: revision.current, canonicalContent: next, clientOperationId: operationId };
    localWrite.current = (async () => { await draftStore.current?.saveDraft(activeChapterId, { canonicalContent: next, plainText: text, baseRevision: revision.current, synced: false, savedAt: new Date().toISOString() }); await draftStore.current?.enqueueSync(operationId, activeChapterId, operation); })();
    await localWrite.current; setState('dirty');
    if (timer.current) clearTimeout(timer.current); if (directory?.work.role === 'WORK_OWNER' || directory?.work.role === 'EDITOR') timer.current = setTimeout(() => { void save(); }, 1000);
  }

  async function switchChapter(nextChapterId: string) {
    if (nextChapterId === activeChapterId) return;
    await localWrite.current;
    if (state === 'dirty' || state === 'offline' || state === 'error') void save();
    setActiveChapterId(nextChapterId); setLeftOpen(false);
  }

  async function saveNote() {
    const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/context`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ body: note }) });
    if (!response.ok) setState('error');
  }

  async function restoreVersion(versionId: string) {
    if (!window.confirm('恢复前会保存当前版本，确定继续吗？')) return;
    await localWrite.current;
    const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf } });
    if (!response.ok) { setState('error'); return; }
    pendingOperationId.current = null; setReloadKey((value) => value + 1);
  }

  async function resolveConflict(conflictId: string, action: 'KEEP_CURRENT' | 'USE_CONFLICT_COPY') {
    const message = action === 'KEEP_CURRENT' ? '保留当前正文并关闭此冲突？' : '使用冲突副本替换当前正文？当前正文会先保存为历史版本。';
    if (!window.confirm(message)) return;
    await localWrite.current;
    const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action }) });
    if (!response.ok) { setState('error'); return; }
    pendingOperationId.current = null; setReloadKey((value) => value + 1);
  }

  async function createChapter(volumeId: string) {
    const title = window.prompt('章节名称'); if (!title?.trim() || !directory) return;
    await localWrite.current;
    const response = await fetch(`/api/works/${encodeURIComponent(directory.work.id)}/chapters`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ volumeId, title }) });
    if (!response.ok) { setState('error'); return; }
    const created = await response.json() as { id: string }; setActiveChapterId(created.id); setLeftOpen(false);
  }

  async function updateChapterMetadata(targetChapterId: string, input: { action: 'rename'; title: string } | { action: 'move'; direction: 'up' | 'down' }) {
    const response = await fetch(`/api/chapters/${encodeURIComponent(targetChapterId)}/metadata`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(input) });
    if (!response.ok) { setState('error'); return; } setReloadKey((value) => value + 1);
  }

  function renameChapter(targetChapterId: string, currentTitle: string) { const title = window.prompt('新的章节名称', currentTitle); if (title?.trim()) void updateChapterMetadata(targetChapterId, { action: 'rename', title }); }

  async function createComment() {
    if (!commentBody.trim()) return; const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/collaboration`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ type: 'comment', body: commentBody }) });
    if (!response.ok) { setState('error'); return; } setCommentBody(''); setReloadKey((value) => value + 1);
  }

  async function proposeCurrentDocument() {
    if (!latestDocument.current) return; await localWrite.current; const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/collaboration`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ type: 'suggestion', replacementContent: latestDocument.current, baseRevision: revision.current }) });
    if (!response.ok) { setState('error'); return; } setReloadKey((value) => value + 1);
  }

  async function handleSuggestion(suggestionId: string, action: 'accept' | 'reject') {
    if (action === 'accept' && !window.confirm('接受建议会先保存当前正文版本，确定继续吗？')) return;
    const response = await fetch(`/api/chapters/${encodeURIComponent(activeChapterId)}/suggestions/${encodeURIComponent(suggestionId)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action }) });
    if (!response.ok) { setState(response.status === 409 ? 'conflict' : 'error'); return; } setReloadKey((value) => value + 1);
  }

  if (!chapter || !document) return <main className="app-loading">{state === 'error' ? '章节加载失败' : '正在打开章节…'}</main>;
  const canDirectEdit = directory?.work.role === 'WORK_OWNER' || directory?.work.role === 'EDITOR';
  const canDraftSuggestion = canDirectEdit || directory?.work.role === 'COMMENTER';
  const stateLabel: Record<SaveState, string> = { idle: '已同步', dirty: '本地已保存', saving: '正在同步…', saved: '已保存', offline: '离线草稿待同步', conflict: '检测到版本冲突', error: '保存失败' };
  return <main className="server-editor">
    <header className="server-editor-header"><button type="button" onClick={() => void localWrite.current.then(onBack)}>返回作品</button><h1><strong>{directory?.work.title ?? '作品'}</strong><span> / {chapter.title}</span></h1><div><button className="mobile-panel-toggle" type="button" onClick={() => { setRightOpen(false); setLeftOpen((value) => !value); }}>目录</button><button className="mobile-panel-toggle" type="button" onClick={() => { setLeftOpen(false); setRightOpen((value) => !value); }}>辅助</button><span>{Array.from(plainText.replace(/\s/g, '')).length} 字</span><span aria-live="polite">{stateLabel[state]}</span>{canDirectEdit ? <button type="button" onClick={() => void save()}>立即保存</button> : null}</div></header>
    <div className="server-editor-layout">
      <aside className="chapter-directory" data-open={leftOpen} aria-label="作品目录"><h2>目录</h2>{directory?.volumes.map((volume) => <section key={volume.id}><div className="volume-title"><h3>{volume.title}</h3>{directory.work.role === 'WORK_OWNER' || directory.work.role === 'EDITOR' ? <button aria-label={`在${volume.title}中新建章节`} onClick={() => void createChapter(volume.id)}>＋</button> : null}</div>{volume.chapters.map((item) => <div className={`directory-row ${item.id === activeChapterId ? 'is-active' : ''}`} key={item.id}><button className="chapter-link" onClick={() => void switchChapter(item.id)}><span>{item.title}</span><small>{item.wordCount} 字</small></button>{directory.work.role === 'WORK_OWNER' || directory.work.role === 'EDITOR' ? <div className="chapter-actions"><button aria-label={`重命名${item.title}`} onClick={() => renameChapter(item.id, item.title)}>✎</button><button aria-label={`上移${item.title}`} onClick={() => void updateChapterMetadata(item.id, { action: 'move', direction: 'up' })}>↑</button><button aria-label={`下移${item.title}`} onClick={() => void updateChapterMetadata(item.id, { action: 'move', direction: 'down' })}>↓</button></div> : null}</div>)}</section>)}</aside>
      <section className="server-editor-canvas"><RichTextEditor chapterKey={chapter.id} content={document} editable={canDraftSuggestion} onChange={() => undefined} onDocumentChange={update} /></section>
      <aside className="editor-context" data-open={rightOpen} aria-label="章节辅助栏"><nav><button className={rightTab === 'note' ? 'is-active' : ''} onClick={() => setRightTab('note')}>备注</button><button className={rightTab === 'versions' ? 'is-active' : ''} onClick={() => setRightTab('versions')}>版本</button><button className={rightTab === 'collaboration' ? 'is-active' : ''} onClick={() => setRightTab('collaboration')}>协作</button><button className={rightTab === 'conflicts' ? 'is-active' : ''} onClick={() => setRightTab('conflicts')}>冲突 {context?.conflicts.length ? `(${context.conflicts.length})` : ''}</button></nav>
        {rightTab === 'note' ? <section><h2>私人备注</h2><p>仅你本人可见。</p><textarea aria-label="私人备注" value={note} onChange={(event) => setNote(event.target.value)} /><button onClick={() => void saveNote()}>保存备注</button></section> : null}
        {rightTab === 'versions' ? <section><h2>历史版本</h2>{context?.versions.length ? context.versions.map((version) => <article key={version.id}><strong>{version.label ?? version.reason}</strong><span>修订 {version.sourceRevision} · {version.wordCount} 字</span><time>{new Date(version.createdAt).toLocaleString('zh-CN')}</time><button onClick={() => void restoreVersion(version.id)}>恢复此版本</button></article>) : <p>暂无历史版本。</p>}</section> : null}
        {rightTab === 'collaboration' ? <section><h2>协作批注</h2>{context?.comments.length ? context.comments.map((comment) => <article key={comment.id}><strong>{comment.authorName}</strong><p>{comment.body}</p><time>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time></article>) : <p>暂无协作批注。私人备注不会显示在这里。</p>}{directory?.work.role !== 'VIEWER' ? <><textarea aria-label="新增批注" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} /><button onClick={() => void createComment()}>提交批注</button></> : null}<h2>修改建议</h2>{context?.suggestions.length ? context.suggestions.map((suggestion) => <article key={suggestion.id}><strong>{suggestion.authorName}</strong><span>{suggestion.status} · 基于修订 {suggestion.baseRevision}</span>{suggestion.status === 'PENDING' && (directory?.work.role === 'WORK_OWNER' || directory?.work.role === 'EDITOR') ? <div><button onClick={() => void handleSuggestion(suggestion.id, 'accept')}>接受建议</button><button onClick={() => void handleSuggestion(suggestion.id, 'reject')}>拒绝建议</button></div> : null}</article>) : <p>暂无修改建议。</p>}{directory?.work.role === 'COMMENTER' ? <button onClick={() => void proposeCurrentDocument()}>提交当前草稿为修改建议</button> : null}</section> : null}
        {rightTab === 'conflicts' ? <section><h2>版本冲突</h2>{context?.conflicts.length ? context.conflicts.map((conflict) => <article className="conflict-card" key={conflict.id}><strong>待处理冲突</strong><time>{new Date(conflict.createdAt).toLocaleString('zh-CN')}</time><p>冲突副本已安全保存，正文未被覆盖。</p><div><button onClick={() => void resolveConflict(conflict.id, 'KEEP_CURRENT')}>保留当前正文</button><button onClick={() => void resolveConflict(conflict.id, 'USE_CONFLICT_COPY')}>使用冲突副本</button></div></article>) : <p>当前没有待处理冲突。</p>}</section> : null}
      </aside>
    </div>
  </main>;
}
