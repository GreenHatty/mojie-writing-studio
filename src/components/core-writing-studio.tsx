'use client';

import type { JSONContent } from '@tiptap/core';
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ApiError } from '../lib/api-client';
import {
  createCoreChapterVersion,
  createCoreWork,
  createCoreChapter,
  createCoreVolume,
  deleteCoreChapter,
  getCoreChapter,
  getCorePrivateNote,
  getCoreProfileSettings,
  getCoreWritingStats,
  getCoreWork,
  listCoreChapterVersions,
  listCoreProjectEntities,
  listCoreTrashedChapters,
  listCoreWorks,
  renameCoreChapter,
  renameCoreVolume,
  reorderCoreChapters,
  searchCoreWork,
  restoreCoreChapterVersion,
  restoreCoreTrashedChapter,
  saveCoreChapter,
  saveCorePrivateNote,
  saveCoreProfileSettings,
  type CanonicalDocument,
  type CoreChapter,
  type CoreChapterVersion,
  type CoreDirectoryChapter,
  type CoreProjectEntity,
  type CoreUser,
  type CoreWorkDirectory,
  type CoreWorkKind,
  type CoreWorkSearchResult,
  type CoreTrashedChapter,
  type CoreWorkSummary
} from '../lib/core-api';
import type { UserDraftStore } from '../lib/offline/draft-store';
import { plainTextToCanonical } from '../lib/core-project-file';
import { AuxiliaryErrorBoundary } from './auxiliary-error-boundary';
import { HelpTip } from './help-tip';
import { LocalContentImporter, type ImportApplyMode } from './local-content-importer';
import { RichTextEditor } from './rich-text-editor';
import { shortBrand, useSiteProfile } from './site-profile-context';

const CoreAuthoringDrawer = lazy(() => import('./core-authoring-drawer').then((module) => ({ default: module.CoreAuthoringDrawer })));
const CoreWorldbuildingDrawer = lazy(() => import('./core-worldbuilding-drawer').then((module) => ({ default: module.CoreWorldbuildingDrawer })));
const CoreOperationsDrawer = lazy(() => import('./core-operations-drawer').then((module) => ({ default: module.CoreOperationsDrawer })));

type SaveState = 'idle' | 'local' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
type RightPanel = 'note' | 'entities' | 'versions' | 'search' | 'trash';
type Theme = 'paper' | 'warm' | 'gray' | 'dark';
type EditorWidth = 'narrow' | 'comfortable' | 'wide';
type LocalDraft = {
  chapterId: string;
  baseRevision: number;
  baseWordCount: number;
  canonicalContent: CanonicalDocument;
  plainText: string;
  savedAt: string;
  clientOperationId?: string;
  conflicted?: boolean;
};
type LocalSettings = { theme: Theme; fontSize: number; lineHeight: number; editorWidth: EditorWidth; leftColumnWidth: number; rightColumnWidth: number };

const DEFAULT_SETTINGS: LocalSettings = { theme: 'paper', fontSize: 18, lineHeight: 1.9, editorWidth: 'comfortable', leftColumnWidth: 280, rightColumnWidth: 320 };
const EMPTY_DOCUMENT: CanonicalDocument = { type: 'doc', schemaVersion: 1, content: [{ type: 'paragraph' }] };

function countCharacters(value: string): number { return Array.from(value.replace(/\s/gu, '')).length; }
function formatCount(value: number): string { return new Intl.NumberFormat('zh-CN').format(value); }
function today(): string { return new Date().toISOString().slice(0, 10); }
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'REVISION_CONFLICT') return '章节已被更新，请先重新载入后再恢复版本。';
    if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') return '当前账号没有该内容的访问权限。';
    return error.code;
  }
  return error instanceof Error ? error.message : '操作未完成。';
}

export function CoreWritingStudio({ user, csrf, draftStore, onLogout }: { user: CoreUser; csrf: string; draftStore: UserDraftStore; onLogout: () => void }) {
  const { siteName } = useSiteProfile();
  const [works, setWorks] = useState<CoreWorkSummary[]>([]);
  const [directory, setDirectory] = useState<CoreWorkDirectory | null>(null);
  const [chapter, setChapter] = useState<CoreChapter | null>(null);
  const [document, setDocument] = useState<CanonicalDocument>(EMPTY_DOCUMENT);
  const [plainText, setPlainText] = useState('');
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_SETTINGS);
  const [note, setNote] = useState('');
  const [versions, setVersions] = useState<CoreChapterVersion[]>([]);
  const [workSearch, setWorkSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CoreWorkSearchResult[]>([]);
  const [trashedChapters, setTrashedChapters] = useState<CoreTrashedChapter[]>([]);
  const [contextEntities, setContextEntities] = useState<CoreProjectEntity[]>([]);
  const [entityHighlightsEnabled, setEntityHighlightsEnabled] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>('note');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [worldbuildingOpen, setWorldbuildingOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'directory' | 'context'>('none');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [todayCount, setTodayCount] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const draftRef = useRef<LocalDraft | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const chapterRequest = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);

  const activeChapters = useMemo(() => directory?.volumes.flatMap((volume) => volume.chapters) ?? [], [directory]);
  const liveWordCount = countCharacters(plainText);
  const totalWordCount = activeChapters.reduce((total, item) => total + item.wordCount, 0);
  const deferredPlainText = useDeferredValue(plainText);
  const mentionedEntities = useMemo(() => contextEntities.flatMap((entity) => {
    const aliases = Array.isArray(entity.fields.aliases) ? entity.fields.aliases : [];
    const terms = [entity.title, ...aliases].filter((term) => term.length >= 2);
    const matches = terms.filter((term) => deferredPlainText.includes(term));
    return matches.length ? [{ entity, matches }] : [];
  }), [contextEntities, deferredPlainText]);
  const entityHighlightTerms = useMemo(() => entityHighlightsEnabled ? mentionedEntities.flatMap((item) => item.matches) : [], [entityHighlightsEnabled, mentionedEntities]);

  async function persistDraft(draft = draftRef.current): Promise<void> {
    if (!draft) return;
    await draftStore.saveDraft(draft.chapterId, draft);
  }

  function replaceDirectoryChapter(update: Partial<CoreDirectoryChapter> & { id: string }): void {
    setDirectory((current) => current ? {
      ...current,
      updatedAt: new Date().toISOString(),
      volumes: current.volumes.map((volume) => ({ ...volume, chapters: volume.chapters.map((item) => item.id === update.id ? { ...item, ...update } : item) }))
    } : current);
  }

  function scheduleSync(): void {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { void syncCurrentDraft(); }, 1_000);
  }

  async function syncDraft(draft: LocalDraft): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveState('offline');
      return;
    }
    let queued = draft;
    if (!queued.clientOperationId) {
      queued = { ...queued, clientOperationId: crypto.randomUUID() };
      if (draftRef.current?.savedAt === draft.savedAt) draftRef.current = queued;
      await persistDraft(queued);
    }
    await draftStore.enqueueSync(queued.clientOperationId!, queued.chapterId, queued);
    const controller = new AbortController();
    syncAbort.current = controller;
    setSaveState('saving');
    try {
      const result = await saveCoreChapter({ chapterId: queued.chapterId, baseRevision: queued.baseRevision, canonicalContent: queued.canonicalContent, clientOperationId: queued.clientOperationId! }, csrf, controller.signal);
      if (result.kind === 'conflict') {
        const conflicted = { ...queued, baseRevision: result.currentRevision, clientOperationId: undefined, conflicted: true };
        draftRef.current = conflicted;
        await draftStore.saveDraft(queued.chapterId, conflicted);
        await draftStore.saveConflict(queued.chapterId, conflicted);
        await draftStore.removeSync(queued.clientOperationId!);
        const currentRemote = await getCoreChapter(queued.chapterId, controller.signal).catch(() => null);
        if (currentRemote) setChapter(currentRemote);
        setVersions(await listCoreChapterVersions(queued.chapterId, controller.signal).catch(() => []));
        setSaveState('conflict');
        setNotice('已保留本地冲突稿和云端冲突版本。继续编辑可按最新修订保存，或在“版本”中选择恢复。');
        return;
      }
      await draftStore.removeSync(queued.clientOperationId!);
      if (draftRef.current?.savedAt === queued.savedAt) {
        draftRef.current = null;
        await draftStore.removeDraft(queued.chapterId);
        setChapter((current) => current?.id === queued.chapterId ? { ...current, revision: result.revision, canonicalContent: queued.canonicalContent, plainText: queued.plainText } : current);
        replaceDirectoryChapter({ id: queued.chapterId, revision: result.revision, wordCount: countCharacters(queued.plainText) });
      } else if (draftRef.current?.chapterId === queued.chapterId) {
        draftRef.current = { ...draftRef.current, baseRevision: result.revision, baseWordCount: countCharacters(queued.plainText), clientOperationId: undefined };
        await persistDraft(draftRef.current);
        scheduleSync();
      }
      setTodayCount((current) => current + Math.max(0, countCharacters(queued.plainText) - (Number.isFinite(queued.baseWordCount) ? queued.baseWordCount : 0)));
      setSaveState('saved');
    } catch (error) {
      if (controller.signal.aborted) return;
      setSaveState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      setNotice('云端暂不可用，当前内容已进入加密同步队列，可继续写作。');
    } finally {
      if (syncAbort.current === controller) syncAbort.current = null;
    }
  }

  async function syncCurrentDraft(): Promise<void> {
    const draft = draftRef.current;
    if (!draft || draft.conflicted) return;
    await persistDraft(draft); // Local IndexedDB success is the mandatory switch/exit condition.
    await syncDraft(draft); // Cloud failure keeps the queued operation and never blocks writing.
  }

  async function flushProfileSettings(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const pending = await draftStore.getSetting<LocalSettings>('pending-profile-settings');
    if (!pending) return;
    await saveCoreProfileSettings(pending, csrf);
    await draftStore.removeSetting('pending-profile-settings');
  }

  async function flushQueue(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queued = await draftStore.listSync<LocalDraft>();
    for (const entry of queued) {
      try {
        const result = await saveCoreChapter({ chapterId: entry.chapterId, baseRevision: entry.value.baseRevision, canonicalContent: entry.value.canonicalContent, clientOperationId: entry.clientOperationId }, csrf);
        if (result.kind === 'conflict') {
          const conflicted = { ...entry.value, baseRevision: result.currentRevision, clientOperationId: undefined, conflicted: true };
          await draftStore.saveDraft(entry.chapterId, conflicted);
          await draftStore.saveConflict(entry.chapterId, conflicted);
          if (draftRef.current?.chapterId === entry.chapterId) draftRef.current = conflicted;
        }
        await draftStore.removeSync(entry.clientOperationId);
      } catch {
        break;
      }
    }
  }

  async function flushBeforeTransition(): Promise<void> {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    await syncCurrentDraft();
  }

  async function loadChapter(chapterId: string): Promise<void> {
    chapterRequest.current?.abort();
    const controller = new AbortController();
    chapterRequest.current = controller;
    const sequence = ++loadSequence.current;
    try {
      const remote = await getCoreChapter(chapterId, controller.signal);
      const [localDraft, localNote, history] = await Promise.all([
        draftStore.getDraft<LocalDraft>(chapterId),
        getCorePrivateNote(chapterId, controller.signal),
        listCoreChapterVersions(chapterId, controller.signal)
      ]);
      if (controller.signal.aborted || sequence !== loadSequence.current) return;
      const preferred = localDraft && localDraft.baseRevision <= remote.revision ? localDraft : null;
      draftRef.current = preferred;
      setChapter(remote);
      setDocument(preferred?.canonicalContent ?? remote.canonicalContent ?? EMPTY_DOCUMENT);
      setPlainText(preferred?.plainText ?? remote.plainText);
      setNote(localNote?.body ?? '');
      setVersions(history);
      setNotice(preferred?.conflicted ? '已恢复冲突草稿。继续编辑可按最新云端修订保存，或在“版本”中恢复其他版本。' : preferred ? '已恢复尚未同步的本地草稿。' : '');
      setSaveState(preferred?.conflicted ? 'conflict' : preferred ? 'local' : 'idle');
      if (preferred && !preferred.conflicted && (typeof navigator === 'undefined' || navigator.onLine)) scheduleSync();
    } catch (error) {
      if (controller.signal.aborted) return;
      const localDraft = await draftStore.getDraft<LocalDraft>(chapterId);
      if (localDraft) {
        draftRef.current = localDraft;
        const fallback = activeChapters.find((item) => item.id === chapterId);
        setChapter({ id: chapterId, workId: fallback?.workId ?? '', title: fallback?.title ?? '离线章节', canonicalContent: localDraft.canonicalContent, plainText: localDraft.plainText, revision: localDraft.baseRevision });
        setDocument(localDraft.canonicalContent);
        setPlainText(localDraft.plainText);
        setSaveState('offline');
        setNotice('离线恢复了当前账号的本地草稿；恢复网络后将自动同步。');
      } else {
        setNotice(errorMessage(error));
      }
    }
  }

  async function openWork(workId: string, preferredChapterId?: string): Promise<void> {
    setBusy(true);
    try {
      await flushBeforeTransition();
      const loaded = await getCoreWork(workId);
      setDirectory(loaded);
      setSearch('');
      const firstChapter = preferredChapterId ?? loaded.volumes.flatMap((volume) => volume.chapters)[0]?.id;
      if (firstChapter) await loadChapter(firstChapter);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function refreshDashboard(): Promise<void> {
    try { setWorks(await listCoreWorks()); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [loadedWorks, localSettings, remoteSettings, remoteStats] = await Promise.all([
          listCoreWorks(),
          draftStore.getSetting<LocalSettings>('profile-settings'),
          getCoreProfileSettings().catch(() => null),
          getCoreWritingStats().catch(() => null)
        ]);
        if (!active) return;
        setWorks(loadedWorks);
        const restoredSettings = { ...DEFAULT_SETTINGS, ...(remoteSettings ?? {}), ...(localSettings ?? {}) };
        setSettings(restoredSettings);
        await draftStore.saveSetting('profile-settings', restoredSettings);
        if (remoteStats) { setTodayCount(remoteStats.addedCharacters); setStreakDays(remoteStats.streakDays); }
        await flushQueue();
        await flushProfileSettings();
      } catch (error) { if (active) setNotice(errorMessage(error)); }
      finally { if (active) setLoading(false); }
    }
    void bootstrap();
    const goOnline = () => {
      setOnline(true);
      void (async () => {
        await syncCurrentDraft();
        await flushQueue();
        await flushProfileSettings();
      })();
    };
    const goOffline = () => setOnline(false);
    const pagehide = () => { void persistDraft(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('pagehide', pagehide);
    return () => {
      active = false;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncAbort.current?.abort();
      chapterRequest.current?.abort();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('pagehide', pagehide);
    };
  }, [draftStore, csrf]);

  async function createWork(input: { title: string; kind: CoreWorkKind }): Promise<void> {
    setBusy(true);
    try {
      const created = await createCoreWork(input, csrf);
      await refreshDashboard();
      await openWork(created.work.id, created.chapter.id);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function addChapter(): Promise<void> {
    if (!directory) return;
    setBusy(true);
    try {
      await flushBeforeTransition();
      const volume = directory.volumes.at(-1);
      const created = await createCoreChapter(directory.id, { volumeId: volume?.id }, csrf);
      await openWork(directory.id, created.id);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function addVolume(): Promise<void> {
    if (!directory) return;
    const title = window.prompt('新卷名称', `第${directory.volumes.length + 1}卷`);
    if (!title?.trim()) return;
    setBusy(true);
    try {
      await flushBeforeTransition();
      await createCoreVolume(directory.id, title.trim(), csrf);
      setDirectory(await getCoreWork(directory.id));
      setNotice('已新建分卷。');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function renameVolume(volumeId: string, currentTitle: string): Promise<void> {
    if (!directory) return;
    const title = window.prompt('修改分卷名称', currentTitle);
    if (!title?.trim() || title.trim() === currentTitle) return;
    setBusy(true);
    try {
      await renameCoreVolume(directory.id, volumeId, title.trim(), csrf);
      setDirectory(await getCoreWork(directory.id));
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function moveChapter(volumeId: string, chapterId: string, direction: -1 | 1): Promise<void> {
    if (!directory) return;
    const volume = directory.volumes.find((item) => item.id === volumeId);
    if (!volume) return;
    const currentIndex = volume.chapters.findIndex((item) => item.id === chapterId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= volume.chapters.length) return;
    const chapterIds = volume.chapters.map((item) => item.id);
    [chapterIds[currentIndex], chapterIds[nextIndex]] = [chapterIds[nextIndex], chapterIds[currentIndex]];
    setBusy(true);
    try {
      await flushBeforeTransition();
      await reorderCoreChapters(directory.id, volumeId, chapterIds, csrf);
      setDirectory(await getCoreWork(directory.id));
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function searchAllChapters(): Promise<void> {
    if (!directory || !workSearch.trim()) { setSearchResults([]); return; }
    try { setSearchResults(await searchCoreWork(directory.id, workSearch.trim())); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  async function openTrash(): Promise<void> {
    if (!directory) return;
    setRightPanel('trash');
    try { setTrashedChapters(await listCoreTrashedChapters(directory.id)); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  async function deleteCurrentChapter(): Promise<void> {
    if (!directory || !chapter || !window.confirm(`将“${chapter.title}”移入回收站吗？可以在回收站恢复。`)) return;
    setBusy(true);
    try {
      await flushBeforeTransition();
      await deleteCoreChapter(chapter.id, csrf);
      const refreshed = await getCoreWork(directory.id);
      setDirectory(refreshed);
      const replacement = refreshed.volumes.flatMap((volume) => volume.chapters)[0];
      if (replacement) await loadChapter(replacement.id);
      await openTrash();
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function restoreTrashChapter(chapterId: string): Promise<void> {
    if (!directory) return;
    setBusy(true);
    try {
      await restoreCoreTrashedChapter(directory.id, chapterId, csrf);
      setDirectory(await getCoreWork(directory.id));
      setTrashedChapters(await listCoreTrashedChapters(directory.id));
      setNotice('章节已从回收站恢复。');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function updateEditor(_html: string, nextPlainText: string, nextCanonicalContent: JSONContent): void {
    if (!chapter) return;
    if (draftRef.current?.clientOperationId) {
      syncAbort.current?.abort();
      void draftStore.removeSync(draftRef.current.clientOperationId);
    }
    const next: LocalDraft = { chapterId: chapter.id, baseRevision: chapter.revision, baseWordCount: countCharacters(chapter.plainText), canonicalContent: { ...nextCanonicalContent, schemaVersion: 1 } as CanonicalDocument, plainText: nextPlainText, savedAt: new Date().toISOString() };
    draftRef.current = next;
    setDocument(next.canonicalContent);
    setPlainText(nextPlainText);
    setSaveState('local');
    void persistDraft(next).then(scheduleSync).catch(() => { setSaveState('error'); setNotice('本地加密草稿未能写入，请重试。'); });
  }

  function applyImportedChapterText(text: string, mode: ImportApplyMode, fileName: string): void {
    const nextText = mode === 'append' && plainText.trim() ? `${plainText.replace(/\s+$/u, '')}\n\n${text}` : text;
    const canonical = plainTextToCanonical(nextText);
    updateEditor('', nextText, canonical);
    setEditorResetKey((value) => value + 1);
    setNotice(`已从“${fileName}”${mode === 'append' ? '追加' : '替换'}正文；内容先保存到本机加密草稿，再同步云端。`);
  }

  async function applyImportedNoteText(text: string, mode: ImportApplyMode): Promise<void> {
    if (!chapter) return;
    const nextNote = mode === 'append' && note.trim() ? `${note.replace(/\s+$/u, '')}\n\n${text}` : text;
    setNote(nextNote);
    await saveCorePrivateNote(chapter.id, nextNote, csrf);
  }

  async function renameChapter(title: string): Promise<void> {
    if (!chapter || !title.trim() || title.trim() === chapter.title) return;
    try {
      const renamed = await renameCoreChapter(chapter.id, title.trim(), csrf);
      setChapter(renamed);
      replaceDirectoryChapter({ id: renamed.id, title: renamed.title });
    } catch (error) { setNotice(errorMessage(error)); }
  }

  async function saveNote(): Promise<void> {
    if (!chapter) return;
    try { await saveCorePrivateNote(chapter.id, note, csrf); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  async function createVersion(): Promise<void> {
    if (!chapter) return;
    await flushBeforeTransition();
    const label = window.prompt('为这个版本命名', '关键版本');
    if (!label) return;
    try { setVersions(await listCoreChapterVersions(chapter.id).then(async () => { await createCoreChapterVersion(chapter.id, label, csrf); return listCoreChapterVersions(chapter.id); })); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  async function restoreVersion(version: CoreChapterVersion): Promise<void> {
    if (!chapter || !window.confirm(`恢复“${version.label ?? version.reason}”吗？当前内容会先保存为恢复前快照。`)) return;
    try {
      await flushBeforeTransition();
      const latest = await getCoreChapter(chapter.id);
      const restored = await restoreCoreChapterVersion(chapter.id, version.id, latest.revision, csrf);
      draftRef.current = null;
      await draftStore.removeDraft(chapter.id);
      setChapter(restored);
      setDocument(restored.canonicalContent);
      setPlainText(restored.plainText);
      replaceDirectoryChapter({ id: restored.id, revision: restored.revision, wordCount: countCharacters(restored.plainText) });
      setVersions(await listCoreChapterVersions(chapter.id));
      setSaveState('saved');
      setNotice('已恢复版本，并保存了恢复前快照。');
    } catch (error) { setNotice(errorMessage(error)); }
  }

  async function updateSettings(patch: Partial<LocalSettings>): Promise<void> {
    const next = { ...settings, ...patch };
    setSettings(next);
    await draftStore.saveSetting('profile-settings', next);
    try {
      await saveCoreProfileSettings(next, csrf);
    } catch {
      await draftStore.saveSetting('pending-profile-settings', next);
      setNotice('外观已保存在当前设备；云端偏好会在网络恢复后再次保存。');
    }
  }

  async function returnToDashboard(): Promise<void> {
    await flushBeforeTransition();
    await refreshDashboard();
    setDirectory(null);
    setChapter(null);
    setMobilePanel('none');
    setFocusMode(false);
    setToolboxOpen(false);
    setWorldbuildingOpen(false);
  }

  async function openImportedWork(workId: string, chapterId?: string): Promise<void> {
    setToolboxOpen(false);
    await refreshDashboard();
    await openWork(workId, chapterId);
  }

  async function openEntityContext(): Promise<void> {
    setRightPanel('entities');
    try {
      setContextEntities((await listCoreProjectEntities(directory!.id)).filter((entity) => ['character', 'location', 'faction'].includes(entity.kind)).slice(0, 500));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const matchingChapters = search.trim()
    ? new Set(activeChapters.filter((item) => item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((item) => item.id))
    : null;
  const visualStyle = { '--editor-font-size': `${settings.fontSize}px`, '--editor-line-height': String(settings.lineHeight), '--left-column-width': `${settings.leftColumnWidth}px`, '--right-column-width': `${settings.rightColumnWidth}px` } as CSSProperties;
  const saveLabel: Record<SaveState, string> = { idle: '已同步', local: '已保存本地草稿', saving: '正在同步', saved: '已同步', offline: '离线草稿待同步', conflict: '已创建冲突副本', error: '同步稍后重试' };
  const canEditDirectory = directory?.role === 'WORK_OWNER' || directory?.role === 'EDITOR';

  if (loading) return <main className="app-loading">正在打开你的加密写作空间…</main>;

  if (!directory) {
    return <main className={works.length ? 'workspace-dashboard' : 'empty-workspace'}>
      <header className="dashboard-header">
        <div><p className="eyebrow">私有写作空间</p><h1>{works.length ? '我的作品' : '开始第一本作品'}</h1><p>当前账号：{user.account}。正文优先写入本地加密草稿，再按安全版本号同步云端。</p></div>
        <div className="dashboard-stat"><strong>{formatCount(todayCount)}</strong><span>今日新增 · 已连续写作 {streakDays} 天</span></div>
      </header>
      {notice ? <p className="workspace-notice" role="status">{notice}</p> : null}
      {works.length ? <section aria-label="作品列表" className="work-grid">{works.map((work) => <article className="work-card" key={work.id}><div><span className="work-kind">{work.kind === 'long' ? '长篇小说' : work.kind === 'short' ? '短篇小说' : '随笔'}</span><h2>{work.title}</h2><p>{formatCount(work.totalWordCount)} 字 · {work.role}</p></div><button disabled={busy} onClick={() => void openWork(work.id)} type="button">继续写作</button></article>)}</section> : null}
      <section className="dashboard-create"><div><p className="eyebrow">新建</p><h2>{works.length ? '开始另一部作品' : '从书名开始'}</h2><p>创建后自动生成第一卷与第一章。</p></div><form className="create-work-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void createWork({ title: String(data.get('title') ?? ''), kind: String(data.get('kind') ?? 'long') as CoreWorkKind }); }}><label><span>作品名称</span><input aria-label="作品名称" name="title" required /></label><label><span>作品类型</span><select aria-label="作品类型" defaultValue="long" name="kind"><option value="long">长篇小说</option><option value="short">短篇小说</option><option value="essay">随笔</option></select></label><button disabled={busy} type="submit">{busy ? '正在创建…' : '创建并开始写作'}</button></form></section>
      <footer className="core-account-footer"><button onClick={onLogout} type="button">退出登录</button></footer>
    </main>;
  }

  if (!chapter) return <main className="app-loading">正在载入章节…</main>;

  return <main className={`studio-shell theme-${settings.theme} ${focusMode ? 'is-focused' : ''}`} style={visualStyle}>
    <header className="studio-topbar">
      <button aria-label="返回工作台" className="brand-lockup" onClick={() => void returnToDashboard()} type="button"><span className="brand-mark">墨</span><span>{shortBrand(siteName)}</span></button>
      <div className="work-identity"><span>{directory.kind === 'long' ? '长篇小说' : directory.kind === 'short' ? '短篇小说' : '随笔'}</span><strong>{directory.title}</strong></div>
      <div className="topbar-actions"><span className={`network-state ${online ? '' : 'is-offline'}`}>{online ? saveLabel[saveState] : '离线写作中'}</span><button aria-expanded={mobilePanel === 'directory'} className="mobile-panel-button" onClick={() => setMobilePanel((current) => current === 'directory' ? 'none' : 'directory')} type="button">目录</button><button aria-expanded={mobilePanel === 'context'} className="mobile-panel-button tablet-context-button" onClick={() => setMobilePanel((current) => current === 'context' ? 'none' : 'context')} type="button">章工具</button><button className="quiet-button" onClick={() => setWorldbuildingOpen(true)} type="button">大纲与设定</button><button className="quiet-button" onClick={() => setToolboxOpen(true)} type="button">写作工具箱</button><button className="quiet-button" onClick={() => setOperationsOpen(true)} type="button">发布与备份</button><button className="quiet-button" onClick={() => setFocusMode((value) => !value)} type="button">{focusMode ? '退出专注' : '专注模式'}</button><button className="quiet-button" onClick={onLogout} type="button">退出</button><button aria-expanded={mobileMenuOpen} className="mobile-more-button" onClick={() => setMobileMenuOpen((value) => !value)} type="button">更多</button>{mobileMenuOpen ? <div className="mobile-more-menu"><button onClick={() => { setWorldbuildingOpen(true); setMobileMenuOpen(false); }} type="button">大纲与设定</button><button onClick={() => { setToolboxOpen(true); setMobileMenuOpen(false); }} type="button">写作工具箱</button><button onClick={() => { setOperationsOpen(true); setMobileMenuOpen(false); }} type="button">发布、榜单与备份</button><button onClick={() => { setFocusMode((value) => !value); setMobileMenuOpen(false); }} type="button">{focusMode ? '退出专注' : '专注模式'}</button><button onClick={onLogout} type="button">退出登录</button></div> : null}</div>
    </header>
    <aside aria-label="作品目录" className={`studio-sidebar ${mobilePanel === 'directory' ? 'is-mobile-open' : ''}`}>
      <div className="sidebar-heading"><div><p className="eyebrow">目录</p><h1>{directory.title}</h1></div><div className="directory-actions">{canEditDirectory ? <button aria-label="新建分卷" className="quiet-button" disabled={busy} onClick={() => void addVolume()} type="button">＋卷</button> : null}<button aria-label="新建章节" className="icon-button" disabled={busy || !canEditDirectory} onClick={() => void addChapter()} type="button">＋</button></div></div>
      <label className="directory-search"><span className="sr-only">搜索章节</span><input onChange={(event) => setSearch(event.target.value)} placeholder="查找章节标题" value={search} /></label>
      <nav>{directory.volumes.map((volume) => <section className="volume-group" key={volume.id}><div className="volume-heading"><h2>{volume.title}</h2>{canEditDirectory ? <button aria-label={`重命名${volume.title}`} className="chapter-order-button" disabled={busy} onClick={() => void renameVolume(volume.id, volume.title)} type="button">编辑</button> : null}</div>{volume.chapters.filter((item) => !matchingChapters || matchingChapters.has(item.id)).map((item, index, visible) => <div className="chapter-row" key={item.id}><button className={`chapter-link ${item.id === chapter.id ? 'is-active' : ''}`} onClick={() => void (async () => { await flushBeforeTransition(); await loadChapter(item.id); setMobilePanel('none'); })()} type="button"><span>{item.title}</span><small>{formatCount(item.wordCount)}</small></button>{canEditDirectory ? <span className="chapter-order-controls"><button aria-label={`上移${item.title}`} className="chapter-order-button" disabled={busy || index === 0 || visible.length !== volume.chapters.length} onClick={() => void moveChapter(volume.id, item.id, -1)} type="button">↑</button><button aria-label={`下移${item.title}`} className="chapter-order-button" disabled={busy || index === visible.length - 1 || visible.length !== volume.chapters.length} onClick={() => void moveChapter(volume.id, item.id, 1)} type="button">↓</button></span> : null}</div>)}</section>)}</nav>
      <div className="sidebar-settings"><label><span>主题</span><select onChange={(event) => void updateSettings({ theme: event.target.value as Theme })} value={settings.theme}><option value="paper">纸白</option><option value="warm">暖黄</option><option value="gray">低对比灰</option><option value="dark">深色</option></select></label><label><span>编辑宽度</span><select onChange={(event) => void updateSettings({ editorWidth: event.target.value as EditorWidth })} value={settings.editorWidth}><option value="narrow">窄</option><option value="comfortable">舒适</option><option value="wide">宽</option></select></label><div className="font-controls"><span>字号</span><button aria-label="减小字号" onClick={() => void updateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })} type="button">A−</button><span>{settings.fontSize}</span><button aria-label="增大字号" onClick={() => void updateSettings({ fontSize: Math.min(28, settings.fontSize + 1) })} type="button">A＋</button></div><div className="font-controls"><span>行距</span><button aria-label="减小行距" onClick={() => void updateSettings({ lineHeight: Math.max(1.4, Number((settings.lineHeight - 0.1).toFixed(1))) })} type="button">−</button><span>{settings.lineHeight.toFixed(1)}</span><button aria-label="增大行距" onClick={() => void updateSettings({ lineHeight: Math.min(2.6, Number((settings.lineHeight + 0.1).toFixed(1))) })} type="button">＋</button></div><label className="column-width-control"><span>目录宽度 {settings.leftColumnWidth}px</span><input aria-label="目录栏宽度" max="460" min="220" onChange={(event) => void updateSettings({ leftColumnWidth: Number(event.target.value) })} type="range" value={settings.leftColumnWidth} /></label><label className="column-width-control"><span>工具栏宽度 {settings.rightColumnWidth}px</span><input aria-label="工具栏宽度" max="520" min="260" onChange={(event) => void updateSettings({ rightColumnWidth: Number(event.target.value) })} type="range" value={settings.rightColumnWidth} /></label></div>
    </aside>
    <section aria-label="正文编辑器" className={`editor-stage editor-width-${settings.editorWidth}`}>
      <div className="chapter-heading"><input aria-label="章节标题" defaultValue={chapter.title} key={chapter.id} onBlur={(event) => void renameChapter(event.target.value)} /><div className="chapter-heading-actions">{canEditDirectory ? <LocalContentImporter compact disabled={busy} label="导入本章" onApply={applyImportedChapterText} /> : null}<button className="quiet-button" onClick={() => void createVersion()} title="保存不可变的命名快照，之后可从右栏恢复" type="button">保存版本</button><HelpTip text="正文支持 TXT、Markdown、HTML 和 DOCX 导入。可先预览，再选择追加或替换；替换同样会先写入本地加密草稿。" />{canEditDirectory ? <button className="quiet-button danger-button" disabled={busy} onClick={() => void deleteCurrentChapter()} title="移入回收站，不会立即永久删除" type="button">移到回收站</button> : null}</div></div>
      {notice ? <div className="draft-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} type="button">知道了</button></div> : null}
      <RichTextEditor chapterKey={`${chapter.id}-${chapter.revision}`} content={document} highlightTerms={entityHighlightTerms} onChange={updateEditor} resetKey={editorResetKey} />
      <footer className="editor-statusbar"><span>{formatCount(liveWordCount)} 字</span><span>全书 {formatCount(totalWordCount)} 字</span><span>本次新增 {formatCount(todayCount)} 字</span><span>段落 {plainText ? plainText.split(/\n+/u).filter(Boolean).length : 0}</span><span>预计阅读 {Math.max(1, Math.ceil(liveWordCount / 500))} 分钟</span><span className={`save-state save-${saveState}`}>{saveLabel[saveState]}</span></footer>
    </section>
    <aside aria-label="章节辅助信息" className={`context-sidebar ${mobilePanel === 'context' ? 'is-mobile-open' : ''}`}>
      <div className="context-tabs" role="tablist"><button aria-selected={rightPanel === 'note'} onClick={() => setRightPanel('note')} role="tab" type="button">备注</button><button aria-selected={rightPanel === 'entities'} onClick={() => void openEntityContext()} role="tab" type="button">设定提示</button><button aria-selected={rightPanel === 'versions'} onClick={() => setRightPanel('versions')} role="tab" type="button">版本</button><button aria-selected={rightPanel === 'search'} onClick={() => setRightPanel('search')} role="tab" type="button">查找</button>{canEditDirectory ? <button aria-selected={rightPanel === 'trash'} onClick={() => void openTrash()} role="tab" type="button">回收站</button> : null}</div>
      {rightPanel === 'note' && canEditDirectory ? <div className="context-import-row"><LocalContentImporter compact label="导入备注" onApply={(text, mode) => applyImportedNoteText(text, mode)} /></div> : null}
      {rightPanel === 'entities' ? <section className="entity-context-panel"><div><p>按需检查本章出现的人物、别名、地点和势力；高亮只显示在编辑器中，不写入正文格式。</p><label><input checked={entityHighlightsEnabled} onChange={(event) => setEntityHighlightsEnabled(event.target.checked)} type="checkbox" />低干扰高亮</label></div>{mentionedEntities.length ? <ul>{mentionedEntities.map(({ entity, matches }) => <li key={entity.id}><strong>{entity.title}</strong><span>{entity.kind === 'character' ? '人物' : entity.kind === 'location' ? '地点' : '势力'} · 命中 {matches.join('、')}</span><p>{entity.summary || '暂无摘要'}</p></li>)}</ul> : <div className="context-empty">本章尚未命中已保存的人物、地点或势力。打开“大纲与设定”可新增资料。</div>}</section> : rightPanel === 'note' ? <section className="note-panel"><p>这是仅当前账号可见的私人章节备注，不会进入正文或导出内容。</p><textarea aria-label="本章备注" onBlur={() => void saveNote()} onChange={(event) => setNote(event.target.value)} placeholder="记录伏笔、问题或改稿方向…" value={note} /></section> : rightPanel === 'versions' ? <section className="versions-panel"><p>恢复前会自动保留当前内容。</p>{versions.length ? <ul>{versions.map((version) => <li key={version.id}><div><strong>{version.label ?? version.reason}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small></div><button onClick={() => void restoreVersion(version)} type="button">恢复</button></li>)}</ul> : <div className="context-empty">尚无版本。可点击正文上方“保存版本”建立关键快照。</div>}</section> : rightPanel === 'search' ? <section className="work-search-panel"><label><span>查找正文与章节标题</span><input aria-label="全书查找" onChange={(event) => setWorkSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchAllChapters(); }} placeholder="输入关键词" value={workSearch} /></label><button disabled={!workSearch.trim()} onClick={() => void searchAllChapters()} type="button">查找</button>{searchResults.length ? <ul>{searchResults.map((result) => <li key={result.chapterId}><button onClick={() => void (async () => { await flushBeforeTransition(); await loadChapter(result.chapterId); setMobilePanel('none'); })()} type="button"><strong>{result.volumeTitle} · {result.chapterTitle}</strong><span>{result.snippet || '章节标题匹配'}</span><small>{result.matchCount} 处匹配</small></button></li>)}</ul> : workSearch ? <p className="context-empty">输入关键词后进行查找；结果只来自当前作品。</p> : null}</section> : <section className="versions-panel"><p>已删除章节只在此作品的作者或编辑账号中可见。</p>{trashedChapters.length ? <ul>{trashedChapters.map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{new Date(item.deletedAt).toLocaleString('zh-CN')}</small></div><button disabled={busy} onClick={() => void restoreTrashChapter(item.id)} type="button">恢复</button></li>)}</ul> : <div className="context-empty">回收站是空的。</div>}</section>}
    </aside>
    {toolboxOpen ? <AuxiliaryErrorBoundary title="写作工具箱"><Suspense fallback={<div className="authoring-drawer-loading">正在加载写作工具箱…</div>}><CoreAuthoringDrawer csrf={csrf} directory={directory} draftStore={draftStore} onClose={() => setToolboxOpen(false)} onImported={openImportedWork} text={plainText} userId={user.id} /></Suspense></AuxiliaryErrorBoundary> : null}
    {worldbuildingOpen ? <AuxiliaryErrorBoundary title="大纲与世界设定"><Suspense fallback={<div className="authoring-drawer-loading">正在加载大纲与世界设定…</div>}><CoreWorldbuildingDrawer csrf={csrf} directory={directory} onClose={() => { setWorldbuildingOpen(false); if (rightPanel === 'entities') void openEntityContext(); }} user={user} /></Suspense></AuxiliaryErrorBoundary> : null}
    {operationsOpen ? <AuxiliaryErrorBoundary title="发布、榜单与外部备份"><Suspense fallback={<div className="authoring-drawer-loading">正在加载平台运营工具…</div>}><CoreOperationsDrawer chapter={chapter} csrf={csrf} directory={directory} onClose={() => setOperationsOpen(false)} text={plainText} user={user} /></Suspense></AuxiliaryErrorBoundary> : null}
  </main>;
}
