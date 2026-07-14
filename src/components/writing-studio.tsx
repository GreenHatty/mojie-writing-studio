'use client';

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createChapterAutosaver, type ChapterAutosaver, type AutosaveState } from '../lib/autosave';
import { countWritingCharacters, type ChapterSnapshot } from '../lib/writing';
import {
  createWritingRepository,
  type ProfileSettings,
  type StoredChapter,
  type WorkDetail,
  type WorkKind,
  type WorkRecord,
  type WritingRepository
} from '../lib/repository';
import { CreateWorkForm } from './create-work-form';
import { RichTextEditor } from './rich-text-editor';
import { WorkspaceDashboard } from './workspace-dashboard';
import { shortBrand, useSiteProfile } from './site-profile-context';
import { AuxiliaryErrorBoundary } from './auxiliary-error-boundary';

const ImportExportPanel = lazy(() => import('./import-export-panel').then((module) => ({ default: module.ImportExportPanel })));
const LessonsPanel = lazy(() => import('./lessons-panel').then((module) => ({ default: module.LessonsPanel })));
const ProjectPanel = lazy(() => import('./project-panel').then((module) => ({ default: module.ProjectPanel })));
const TemplateLibrary = lazy(() => import('./template-library').then((module) => ({ default: module.TemplateLibrary })));
const ToolsPanel = lazy(() => import('./tools-panel').then((module) => ({ default: module.ToolsPanel })));

type WritingStudioProps = {
  repository?: WritingRepository;
};

type RightPanel = 'note' | 'versions' | 'project' | 'tools' | 'templates' | 'lessons' | 'export';

const SETTINGS_FALLBACK: ProfileSettings = {
  ownerId: 'site-owner',
  theme: 'paper',
  fontSize: 18,
  lineHeight: 1.9,
  editorWidth: 'comfortable',
  leftColumnWidth: 280,
  rightColumnWidth: 320
};

function defaultRepository(): WritingRepository {
  return createWritingRepository({ ownerId: 'site-owner' });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function totalWords(work: WorkDetail): number {
  return work.volumes.flatMap((volume) => volume.chapters).reduce((sum, chapter) => sum + chapter.wordCount, 0);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function WritingStudio({ repository: suppliedRepository }: WritingStudioProps) {
  const { siteName } = useSiteProfile();
  const [repository, setRepository] = useState<WritingRepository | null>(suppliedRepository ?? null);
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [activeWork, setActiveWork] = useState<WorkDetail | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingWork, setOpeningWork] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [editorDocument, setEditorDocument] = useState('<p></p>');
  const [livePlainText, setLivePlainText] = useState('');
  const [liveWordCount, setLiveWordCount] = useState(0);
  const [saveState, setSaveState] = useState<AutosaveState>('idle');
  const [note, setNote] = useState('');
  const [snapshots, setSnapshots] = useState<ChapterSnapshot[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>('note');
  const [search, setSearch] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [online, setOnline] = useState(true);
  const [settings, setSettings] = useState(SETTINGS_FALLBACK);
  const [todayCount, setTodayCount] = useState(0);
  const [draftNotice, setDraftNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [editorReset, setEditorReset] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'directory' | 'context'>('none');
  const autosaverRef = useRef<ChapterAutosaver | null>(null);

  const activeChapter = useMemo(() => {
    if (!activeWork || !activeChapterId) return null;
    return activeWork.volumes.flatMap((volume) => volume.chapters).find((chapter) => chapter.id === activeChapterId) ?? null;
  }, [activeChapterId, activeWork]);

  useEffect(() => {
    if (!repository) setRepository(defaultRepository());
  }, [repository]);

  useEffect(() => {
    if (!repository) return;
    const storage: WritingRepository = repository;
    let cancelled = false;
    async function bootstrap() {
      try {
        const [workRecords, loadedSettings, writtenToday] = await Promise.all([
          storage.listWorks(), storage.getSettings(), storage.getTodayWritingCount(today())
        ]);
        if (cancelled) return;
        setWorks(workRecords); setSettings(loadedSettings); setTodayCount(writtenToday);
        setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : '本地写作空间打开失败。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  function replaceChapter(replacement: StoredChapter) {
    setActiveWork((current) => {
      if (!current) return current;
      return {
        ...current,
        updatedAt: replacement.updatedAt,
        volumes: current.volumes.map((volume) => ({
          ...volume,
          chapters: volume.chapters.map((chapter) => (chapter.id === replacement.id ? replacement : chapter))
        }))
      };
    });
  }

  async function refreshSnapshots(chapterId: string) {
    if (!repository) return;
    setSnapshots(await repository.listSnapshots(chapterId));
  }

  useEffect(() => {
    if (!activeChapter || !repository) return;
    const storage: WritingRepository = repository;
    const chapter = activeChapter;
    let cancelled = false;
    setChapterTitle(chapter.title);
    setLivePlainText(chapter.plainText);
    setLiveWordCount(chapter.wordCount);
    setDraftNotice('');
    const autosaver = createChapterAutosaver({
      repository: storage,
      chapter,
      onStateChange: setSaveState,
      onSaved: (savedChapter) => {
        replaceChapter(savedChapter);
        setLivePlainText(savedChapter.plainText);
        setLiveWordCount(savedChapter.wordCount);
        void storage.getTodayWritingCount(today()).then(setTodayCount);
      },
      onConflict: (conflictChapterId) => {
        setDraftNotice('发现另一份较新的章节内容，已保留为“冲突副本”。');
        void refreshSnapshots(conflictChapterId);
      }
    });
    autosaverRef.current = autosaver;
    async function loadChapterContext() {
      try {
        const [draft, notes, versionHistory] = await Promise.all([
          storage.getDraft(chapter.id),
          storage.listNotes(chapter.id),
          storage.listSnapshots(chapter.id)
        ]);
        if (cancelled) return;
        const preferredDocument = draft?.content ?? chapter.content;
        const preferredText = draft?.plainText ?? chapter.plainText;
        setEditorDocument(preferredDocument);
        setLivePlainText(preferredText);
        setLiveWordCount(countWritingCharacters(preferredText));
        setNote(notes[0]?.body ?? '');
        setSnapshots(versionHistory);
        setEditorReset((value) => value + 1);
        if (draft && draft.plainText !== chapter.plainText) {
          setDraftNotice('已恢复尚未提交的本地草稿。');
        }
      } catch {
        if (!cancelled) {
          setSaveState('error');
          setDraftNotice('章节上下文暂时不可读；本地草稿仍不会被覆盖。');
        }
      }
    }
    void loadChapterContext();
    return () => {
      cancelled = true;
      autosaver.dispose();
      if (autosaverRef.current === autosaver) autosaverRef.current = null;
    };
  }, [activeChapter?.id, repository]);

  async function openWork(workId: string) {
    if (!repository) return;
    setOpeningWork(true);
    try {
      const work = await repository.getWork(workId);
      if (!work) throw new Error('作品不存在或本地数据暂时不可读。');
      setActiveWork(work);
      setActiveChapterId(work?.volumes[0]?.chapters[0]?.id ?? null);
      setRightPanel('note');
      setSearch('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '作品打开失败。');
    } finally {
      setOpeningWork(false);
    }
  }

  async function createWork(input: { title: string; kind: WorkKind }) {
    if (!repository) return;
    setCreating(true);
    try {
      const created = await repository.createWork(input);
      const [work, workRecords] = await Promise.all([
        repository.getWork(created.work.id),
        repository.listWorks()
      ]);
      setWorks(workRecords);
      setActiveWork(work);
      setActiveChapterId(created.chapter.id);
      setRightPanel('note');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '作品创建失败，请重试。');
    } finally {
      setCreating(false);
    }
  }

  async function returnToDashboard() {
    if (!repository) return;
    await autosaverRef.current?.flush();
    setWorks(await repository.listWorks());
    setActiveWork(null);
    setActiveChapterId(null);
    setMobilePanel('none');
    setFocusMode(false);
  }

  async function switchChapter(chapterId: string) {
    await autosaverRef.current?.flush();
    setActiveChapterId(chapterId);
    setMobilePanel('none');
  }

  async function addChapter() {
    if (!activeWork || !repository) return;
    const volume = activeWork.volumes[activeWork.volumes.length - 1];
    if (!volume) return;
    await autosaverRef.current?.flush();
    const chapter = await repository.createChapter(activeWork.id, volume.id);
    const refreshed = await repository.getWork(activeWork.id);
    setActiveWork(refreshed);
    setActiveChapterId(chapter.id);
  }

  async function renameChapter() {
    if (!activeChapter || !repository) return;
    const renamed = await repository.renameChapter(activeChapter.id, chapterTitle);
    replaceChapter(renamed);
  }

  function updateEditor(content: string, plainText: string) {
    setEditorDocument(content);
    setLivePlainText(plainText);
    setLiveWordCount(countWritingCharacters(plainText));
    void autosaverRef.current?.queue(content, plainText).catch(() => setSaveState('error'));
  }

  async function saveNote() {
    if (!activeChapter || !repository) return;
    await repository.saveNote(activeChapter.id, note);
  }

  async function createSnapshot() {
    if (!activeChapter || !repository) return;
    await autosaverRef.current?.flush();
    const label = window.prompt('为这个版本命名', '关键版本');
    if (!label) return;
    await repository.createSnapshot(activeChapter.id, label);
    await refreshSnapshots(activeChapter.id);
  }

  async function restoreSnapshot(snapshot: ChapterSnapshot) {
    if (!activeChapter || !repository || !window.confirm(`恢复“${snapshot.label}”吗？当前内容会先保存为恢复前快照。`)) return;
    const restored = await repository.restoreSnapshot(activeChapter.id, snapshot.id);
    replaceChapter(restored);
    setEditorDocument(restored.content);
    setLivePlainText(restored.plainText);
    setLiveWordCount(restored.wordCount);
    setEditorReset((value) => value + 1);
    await refreshSnapshots(activeChapter.id);
    setSaveState('saved');
  }

  async function restoreSyncedVersion() {
    if (!activeChapter || !repository) return;
    await repository.clearDraft(activeChapter.id);
    setEditorDocument(activeChapter.content);
    setLivePlainText(activeChapter.plainText);
    setLiveWordCount(activeChapter.wordCount);
    setDraftNotice('已使用已保存版本。');
    setEditorReset((value) => value + 1);
  }

  async function updateSettings(patch: Partial<ProfileSettings>) {
    if (!repository) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await repository.saveSettings(next);
  }

  if (loading || !repository) return <main className="app-loading">正在打开你的写作台…</main>;
  if (workspaceError && !activeWork) return (
    <main className="recovery-page" role="alert">
      <h1>写作空间暂时无法打开</h1><p>{workspaceError}</p>
      <div><button onClick={() => window.location.reload()} type="button">重试</button><button onClick={() => setWorkspaceError('')} type="button">返回工作台</button></div>
      <p>不会删除或重建本地数据库。若其他标签页正在使用本站，请关闭后再重试。</p>
    </main>
  );

  if (!activeWork && works.length === 0) {
    return (
      <main className="empty-workspace">
        <div className="brand-mark" aria-hidden="true">墨</div>
        <p className="eyebrow">私人写作空间</p>
        <h1>开始第一本作品</h1>
        <p className="empty-copy">从一个书名开始。目录、草稿与版本会在本机安全保存。</p>
        <CreateWorkForm busy={creating} onCreate={createWork} />
      </main>
    );
  }

  if (!activeWork) {
    return (
      <WorkspaceDashboard
        creating={creating || openingWork}
        onCreate={createWork}
        onOpen={(workId) => void openWork(workId)}
        todayCount={todayCount}
        works={works}
      />
    );
  }

  if (!activeChapter) return <main className="app-loading">正在定位章节…</main>;

  const allChapters = activeWork.volumes.flatMap((volume) => volume.chapters);
  const matchingChapterIds = search.trim()
    ? new Set(
        allChapters
          .filter((chapter) => `${chapter.title}\n${chapter.plainText}`.toLowerCase().includes(search.trim().toLowerCase()))
          .map((chapter) => chapter.id)
      )
    : null;
  const saveLabel: Record<AutosaveState, string> = {
    idle: '等待输入',
    saving: '正在保存本地草稿',
    saved: '已保存',
    conflict: '已创建冲突副本',
    error: '保存失败，本地草稿仍保留'
  };
  const visualStyle = {
    '--editor-font-size': `${settings.fontSize}px`,
    '--editor-line-height': String(settings.lineHeight),
    '--left-column-width': `${settings.leftColumnWidth}px`,
    '--right-column-width': `${settings.rightColumnWidth}px`
  } as CSSProperties;

  return (
    <main className={`studio-shell theme-${settings.theme} ${focusMode ? 'is-focused' : ''}`} style={visualStyle}>
      <header className="studio-topbar">
        <button aria-label="返回工作台" className="brand-lockup" onClick={() => void returnToDashboard()} type="button">
          <span className="brand-mark">墨</span>
          <span>{shortBrand(siteName)}</span>
        </button>
        <div className="work-identity">
          <span>{activeWork.kind === 'long' ? '长篇小说' : activeWork.kind === 'short' ? '短篇小说' : '随笔'}</span>
          <strong>{activeWork.title}</strong>
        </div>
        <div className="topbar-actions">
          <span className={`network-state ${online ? '' : 'is-offline'}`}>{online ? '本机持久化' : '离线写作中'}</span>
          <button className="mobile-panel-button" onClick={() => setMobilePanel('directory')} type="button">目录</button>
          <button className="mobile-panel-button tablet-context-button" onClick={() => setMobilePanel('context')} type="button">工具</button>
          <button className="quiet-button" onClick={() => setFocusMode((value) => !value)} type="button">
            {focusMode ? '退出专注' : '专注模式'}
          </button>
        </div>
      </header>

      <aside aria-label="作品目录" className={`studio-sidebar ${mobilePanel === 'directory' ? 'is-mobile-open' : ''}`}>
        <div className="sidebar-heading">
          <div>
            <p className="eyebrow">目录</p>
            <h1>{activeWork.title}</h1>
          </div>
          <button aria-label="新建章节" className="icon-button" onClick={() => void addChapter()} type="button">＋</button>
        </div>
        <label className="directory-search">
          <span className="sr-only">搜索作品</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="查找章节或正文" value={search} />
        </label>
        <nav>
          {activeWork.volumes.map((volume) => (
            <section className="volume-group" key={volume.id}>
              <h2>{volume.title}</h2>
              {volume.chapters
                .filter((chapter) => !matchingChapterIds || matchingChapterIds.has(chapter.id))
                .map((chapter) => (
                  <button
                    className={`chapter-link ${chapter.id === activeChapter.id ? 'is-active' : ''}`}
                    key={chapter.id}
                    onClick={() => void switchChapter(chapter.id)}
                    type="button"
                  >
                    <span>{chapter.title}</span>
                    <small>{formatCount(chapter.wordCount)}</small>
                  </button>
                ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-settings">
          <label>
            <span>主题</span>
            <select onChange={(event) => void updateSettings({ theme: event.target.value as ProfileSettings['theme'] })} value={settings.theme}>
              <option value="paper">纸白</option>
              <option value="warm">暖黄</option>
              <option value="gray">低对比灰</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label>
            <span>编辑宽度</span>
            <select onChange={(event) => void updateSettings({ editorWidth: event.target.value as ProfileSettings['editorWidth'] })} value={settings.editorWidth}>
              <option value="narrow">窄</option>
              <option value="comfortable">舒适</option>
              <option value="wide">宽</option>
            </select>
          </label>
          <div className="font-controls">
            <span>字号</span>
            <button aria-label="减小字号" onClick={() => void updateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })} type="button">A−</button>
            <span>{settings.fontSize}</span>
            <button aria-label="增大字号" onClick={() => void updateSettings({ fontSize: Math.min(28, settings.fontSize + 1) })} type="button">A＋</button>
          </div>
          <div className="font-controls">
            <span>行距</span>
            <button aria-label="减小行距" onClick={() => void updateSettings({ lineHeight: Math.max(1.4, Number((settings.lineHeight - 0.1).toFixed(1))) })} type="button">−</button>
            <span>{settings.lineHeight.toFixed(1)}</span>
            <button aria-label="增大行距" onClick={() => void updateSettings({ lineHeight: Math.min(2.6, Number((settings.lineHeight + 0.1).toFixed(1))) })} type="button">＋</button>
          </div>
        </div>
      </aside>

      <section aria-label="正文编辑器" className={`editor-stage editor-width-${settings.editorWidth}`}>
        <div className="chapter-heading">
          <input
            aria-label="章节标题"
            onBlur={() => void renameChapter()}
            onChange={(event) => setChapterTitle(event.target.value)}
            value={chapterTitle}
          />
          <button className="quiet-button" onClick={() => void createSnapshot()} type="button">保存版本</button>
        </div>
        {draftNotice ? (
          <div className="draft-notice" role="status">
            <span>{draftNotice}</span>
            <button onClick={() => void restoreSyncedVersion()} type="button">使用已保存版本</button>
          </div>
        ) : null}
        <RichTextEditor chapterKey={`${activeChapter.id}-${editorReset}`} content={editorDocument} onChange={updateEditor} />
        <footer className="editor-statusbar">
          <span>{formatCount(liveWordCount)} 字</span>
          <span>全书 {formatCount(totalWords(activeWork))} 字</span>
          <span>今日新增 {formatCount(todayCount)} 字</span>
          <span>段落 {livePlainText ? livePlainText.split(/\n+/u).filter(Boolean).length : 0}</span>
          <span>预计阅读 {Math.max(1, Math.ceil(liveWordCount / 500))} 分钟</span>
          <span className={`save-state save-${saveState}`}>{saveLabel[saveState]}</span>
        </footer>
      </section>

      <aside aria-label="章节辅助信息" className={`context-sidebar ${mobilePanel === 'context' ? 'is-mobile-open' : ''}`}>
        <div className="context-tabs" role="tablist">
          <button aria-selected={rightPanel === 'note'} onClick={() => setRightPanel('note')} role="tab" type="button">备注</button>
          <button aria-selected={rightPanel === 'versions'} onClick={() => setRightPanel('versions')} role="tab" type="button">版本</button>
          <button aria-selected={rightPanel === 'project'} onClick={() => setRightPanel('project')} role="tab" type="button">设定</button>
          <button aria-selected={rightPanel === 'tools'} onClick={() => setRightPanel('tools')} role="tab" type="button">检查</button>
          <button aria-selected={rightPanel === 'templates'} onClick={() => setRightPanel('templates')} role="tab" type="button">模板</button>
          <button aria-selected={rightPanel === 'lessons'} onClick={() => setRightPanel('lessons')} role="tab" type="button">课堂</button>
          <button aria-selected={rightPanel === 'export'} onClick={() => setRightPanel('export')} role="tab" type="button">导出</button>
        </div>
        {rightPanel === 'note' ? (
          <section className="note-panel">
            <p>备注不会进入正文，也不会出现在发布用导出内容中。</p>
            <textarea
              aria-label="本章备注"
              onBlur={() => void saveNote()}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录本章的伏笔、问题或改稿方向…"
              value={note}
            />
          </section>
        ) : null}
        {rightPanel === 'versions' ? (
          <section className="versions-panel">
            <p>恢复前会自动保留当前内容。</p>
            {snapshots.length ? (
              <ul>
                {snapshots.map((snapshot) => (
                  <li key={snapshot.id}>
                    <div>
                      <strong>{snapshot.label}</strong>
                      <small>{new Date(snapshot.createdAt).toLocaleString('zh-CN')}</small>
                    </div>
                    <button onClick={() => void restoreSnapshot(snapshot)} type="button">恢复</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="context-empty">尚无版本。可点击正文上方“保存版本”建立关键快照。</div>
            )}
          </section>
        ) : null}
        {rightPanel !== 'note' && rightPanel !== 'versions' ? (
          <AuxiliaryErrorBoundary title="辅助工具"><Suspense fallback={<p role="status">正在载入辅助模块…</p>}>
            {rightPanel === 'project' ? <ProjectPanel repository={repository} workId={activeWork.id} /> : null}
            {rightPanel === 'tools' ? <ToolsPanel text={livePlainText} /> : null}
            {rightPanel === 'templates' ? <TemplateLibrary /> : null}
            {rightPanel === 'lessons' ? <LessonsPanel /> : null}
            {rightPanel === 'export' ? <ImportExportPanel work={activeWork} /> : null}
          </Suspense></AuxiliaryErrorBoundary>
        ) : null}
      </aside>
    </main>
  );
}
