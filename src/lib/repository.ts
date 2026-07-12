import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { createDatabaseCoordinator, withDatabaseTimeout, type DatabaseLifecycleListener, type DatabaseLifecycleState } from './indexeddb-lifecycle';
import {
  createProjectEntity,
  type ProjectEntity,
  type ProjectEntityKind,
  type ProjectFieldValue
} from './project-model';
import {
  buildSnapshot,
  saveChapterRevision,
  type ChapterRecord,
  type ChapterSnapshot,
  type SaveChapterRequest,
  type SaveChapterResult
} from './writing';

export type WorkKind = 'long' | 'short' | 'essay';

export type WorkRecord = {
  id: string;
  ownerId: string;
  title: string;
  kind: WorkKind;
  createdAt: string;
  updatedAt: string;
};

export type VolumeRecord = {
  id: string;
  workId: string;
  title: string;
  position: number;
};

export type StoredChapter = ChapterRecord & {
  ownerId: string;
  position: number;
  lastSnapshotAt?: string;
};

export type ChapterNote = {
  id: string;
  chapterId: string;
  body: string;
  updatedAt: string;
};

export type ChapterDraft = SaveChapterRequest & {
  chapterId: string;
};

export type WritingSession = {
  id: string;
  ownerId: string;
  date: string;
  addedCharacters: number;
  updatedAt: string;
};

export type ProfileSettings = {
  ownerId: string;
  theme: 'paper' | 'warm' | 'gray' | 'dark';
  fontSize: number;
  lineHeight: number;
  editorWidth: 'narrow' | 'comfortable' | 'wide';
  leftColumnWidth: number;
  rightColumnWidth: number;
};

export type AuditRecord = {
  id: string;
  ownerId: string;
  action: string;
  targetId: string;
  createdAt: string;
};

export type WorkDetail = WorkRecord & {
  volumes: Array<VolumeRecord & { chapters: StoredChapter[] }>;
};

export type SaveEntityInput = {
  id?: string;
  kind: ProjectEntityKind;
  title: string;
  summary?: string;
  fields?: Record<string, ProjectFieldValue>;
};

type WritingDatabase = DBSchema & {
  works: { key: string; value: WorkRecord; indexes: { ownerId: string } };
  volumes: { key: string; value: VolumeRecord; indexes: { workId: string } };
  chapters: {
    key: string;
    value: StoredChapter;
    indexes: { workId: string; volumeId: string };
  };
  notes: { key: string; value: ChapterNote; indexes: { chapterId: string } };
  snapshots: { key: string; value: ChapterSnapshot; indexes: { chapterId: string } };
  drafts: { key: string; value: ChapterDraft };
  sessions: { key: string; value: WritingSession; indexes: { ownerId: string; date: string } };
  settings: { key: string; value: ProfileSettings };
  audit: { key: string; value: AuditRecord; indexes: { ownerId: string } };
  entities: {
    key: string;
    value: ProjectEntity;
    indexes: { ownerId: string; workId: string; kind: ProjectEntityKind };
  };
};

export type WritingRepositoryOptions = {
  databaseName?: string;
  ownerId: string;
  now?: () => string;
  onLifecycleState?: DatabaseLifecycleListener;
  openTimeoutMs?: number;
};

export type WritingRepository = {
  readonly databaseName: string;
  getLifecycleState(): DatabaseLifecycleState;
  close(): void;
  createWork(input: { title: string; kind: WorkKind }): Promise<{
    work: WorkRecord;
    volume: VolumeRecord;
    chapter: StoredChapter;
  }>;
  listWorks(): Promise<WorkRecord[]>;
  getWork(workId: string): Promise<WorkDetail | null>;
  getChapter(chapterId: string): Promise<StoredChapter | null>;
  createChapter(workId: string, volumeId: string, title?: string): Promise<StoredChapter>;
  renameChapter(chapterId: string, title: string): Promise<StoredChapter>;
  saveChapter(chapterId: string, request: SaveChapterRequest): Promise<SaveChapterResult>;
  saveDraft(chapterId: string, draft: SaveChapterRequest): Promise<ChapterDraft>;
  getDraft(chapterId: string): Promise<ChapterDraft | null>;
  clearDraft(chapterId: string): Promise<void>;
  createSnapshot(chapterId: string, label: string): Promise<ChapterSnapshot>;
  listSnapshots(chapterId: string): Promise<ChapterSnapshot[]>;
  restoreSnapshot(chapterId: string, snapshotId: string): Promise<StoredChapter>;
  saveNote(chapterId: string, body: string): Promise<ChapterNote>;
  listNotes(chapterId: string): Promise<ChapterNote[]>;
  saveEntity(workId: string, input: SaveEntityInput): Promise<ProjectEntity>;
  listEntities(
    workId: string,
    kind?: ProjectEntityKind,
    options?: { includeDeleted?: boolean }
  ): Promise<ProjectEntity[]>;
  getEntity(entityId: string): Promise<ProjectEntity | null>;
  softDeleteEntity(entityId: string): Promise<ProjectEntity>;
  restoreEntity(entityId: string): Promise<ProjectEntity>;
  getSettings(): Promise<ProfileSettings>;
  saveSettings(settings: ProfileSettings): Promise<void>;
  getTodayWritingCount(date: string): Promise<number>;
  destroy(): Promise<void>;
};

const DEFAULT_SETTINGS: Omit<ProfileSettings, 'ownerId'> = {
  theme: 'paper',
  fontSize: 18,
  lineHeight: 1.9,
  editorWidth: 'comfortable',
  leftColumnWidth: 280,
  rightColumnWidth: 320
};

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeTitle(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function needsAutomaticSnapshot(chapter: StoredChapter, savedAt: string): boolean {
  if (!chapter.lastSnapshotAt) return false;
  return new Date(savedAt).getTime() - new Date(chapter.lastSnapshotAt).getTime() >= 5 * 60_000;
}

export function createWritingRepository(options: WritingRepositoryOptions): WritingRepository {
  const databaseName = options.databaseName ?? 'mojie-writing-studio';
  const now = options.now ?? (() => new Date().toISOString());
  const ownerId = options.ownerId;
  let lifecycleState: DatabaseLifecycleState = 'idle';
  const notify = (state: DatabaseLifecycleState, detail?: string) => {
    lifecycleState = state;
    options.onLifecycleState?.(state, detail);
  };
  const coordinator = createDatabaseCoordinator(databaseName, options.onLifecycleState);
  notify('opening');
  const database = withDatabaseTimeout(openDB<WritingDatabase>(databaseName, 4, {
    upgrade(db) {
      notify('upgrading');
      if (!db.objectStoreNames.contains('works')) {
        const works = db.createObjectStore('works', { keyPath: 'id' });
        works.createIndex('ownerId', 'ownerId');
      }
      if (!db.objectStoreNames.contains('volumes')) {
        const volumes = db.createObjectStore('volumes', { keyPath: 'id' });
        volumes.createIndex('workId', 'workId');
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const chapters = db.createObjectStore('chapters', { keyPath: 'id' });
        chapters.createIndex('workId', 'workId');
        chapters.createIndex('volumeId', 'volumeId');
      }
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('chapterId', 'chapterId');
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapshots.createIndex('chapterId', 'chapterId');
      }
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'chapterId' });
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('ownerId', 'ownerId');
        sessions.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'ownerId' });
      if (!db.objectStoreNames.contains('audit')) {
        const audit = db.createObjectStore('audit', { keyPath: 'id' });
        audit.createIndex('ownerId', 'ownerId');
      }
      if (!db.objectStoreNames.contains('entities')) {
        const entities = db.createObjectStore('entities', { keyPath: 'id' });
        entities.createIndex('ownerId', 'ownerId');
        entities.createIndex('workId', 'workId');
        entities.createIndex('kind', 'kind');
      }
    },
    blocked() {
      notify('blocked', '请关闭使用该写作空间的其他标签页后重试。');
      coordinator.announce('upgrade-requested');
    },
    blocking(_currentVersion, _blockedVersion, event) {
      notify('versionchange', '检测到新版本，已停止新的本地写入。');
      coordinator.announce('versionchange');
      (event.target as IDBDatabase | null)?.close();
    },
    terminated() { notify('closed', '本地数据库连接意外关闭。'); }
  }), options.openTimeoutMs).then((connection) => {
    notify('ready');
    return connection;
  }).catch((error) => {
    notify('upgrade-failed', error instanceof Error ? error.message : '本地数据库升级失败。');
    throw error;
  });

  async function db(): Promise<IDBPDatabase<WritingDatabase>> {
    return database;
  }

  async function getOwnedWork(workId: string): Promise<WorkRecord | null> {
    const work = await (await db()).get('works', workId);
    return work?.ownerId === ownerId ? work : null;
  }

  async function getOwnedChapter(chapterId: string): Promise<StoredChapter | null> {
    const chapter = await (await db()).get('chapters', chapterId);
    return chapter?.ownerId === ownerId ? chapter : null;
  }

  async function getOwnedEntity(entityId: string): Promise<ProjectEntity | null> {
    const entity = await (await db()).get('entities', entityId);
    return entity?.ownerId === ownerId ? entity : null;
  }

  async function audit(action: string, targetId: string, createdAt = now()): Promise<void> {
    await (await db()).put('audit', {
      id: makeId('audit'),
      ownerId,
      action,
      targetId,
      createdAt
    });
  }

  async function recordWritingProgress(savedAt: string, addedCharacters: number): Promise<void> {
    if (addedCharacters <= 0) return;
    const date = savedAt.slice(0, 10);
    const id = `${ownerId}:${date}`;
    const databaseConnection = await db();
    const session = await databaseConnection.get('sessions', id);
    await databaseConnection.put('sessions', {
      id,
      ownerId,
      date,
      addedCharacters: (session?.addedCharacters ?? 0) + addedCharacters,
      updatedAt: savedAt
    });
  }

  return {
    databaseName,
    getLifecycleState: () => lifecycleState,
    close() { void database.then((connection) => connection.close()).catch(() => undefined); coordinator.close(); notify('closed'); },
    async createWork(input) {
      const createdAt = now();
      const work: WorkRecord = {
        id: makeId('work'),
        ownerId,
        title: normalizeTitle(input.title, '未命名作品'),
        kind: input.kind,
        createdAt,
        updatedAt: createdAt
      };
      const volume: VolumeRecord = {
        id: makeId('volume'),
        workId: work.id,
        title: '第一卷',
        position: 0
      };
      const chapter: StoredChapter = {
        id: makeId('chapter'),
        ownerId,
        workId: work.id,
        volumeId: volume.id,
        title: '第1章',
        content: '<p></p>',
        plainText: '',
        wordCount: 0,
        revision: 0,
        updatedAt: createdAt,
        position: 0
      };
      const transaction = (await db()).transaction(['works', 'volumes', 'chapters'], 'readwrite');
      await transaction.objectStore('works').put(work);
      await transaction.objectStore('volumes').put(volume);
      await transaction.objectStore('chapters').put(chapter);
      await transaction.done;
      await audit('work.created', work.id, createdAt);
      return { work, volume, chapter };
    },

    async listWorks() {
      const records = await (await db()).getAllFromIndex('works', 'ownerId', ownerId);
      return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async getWork(workId) {
      const work = await getOwnedWork(workId);
      if (!work) return null;
      const databaseConnection = await db();
      const volumes = (await databaseConnection.getAllFromIndex('volumes', 'workId', work.id)).sort(
        (left, right) => left.position - right.position
      );
      const chapters = await databaseConnection.getAllFromIndex('chapters', 'workId', work.id);
      return {
        ...work,
        volumes: volumes.map((volume) => ({
          ...volume,
          chapters: chapters
            .filter((chapter) => chapter.volumeId === volume.id)
            .sort((left, right) => left.position - right.position)
        }))
      };
    },

    async getChapter(chapterId) {
      return getOwnedChapter(chapterId);
    },

    async createChapter(workId, volumeId, title) {
      const work = await getOwnedWork(workId);
      if (!work) throw new Error('作品不存在或无访问权限');
      const databaseConnection = await db();
      const volume = await databaseConnection.get('volumes', volumeId);
      if (!volume || volume.workId !== work.id) throw new Error('分卷不存在');
      const chapters = await databaseConnection.getAllFromIndex('chapters', 'volumeId', volumeId);
      const createdAt = now();
      const chapter: StoredChapter = {
        id: makeId('chapter'),
        ownerId,
        workId,
        volumeId,
        title: normalizeTitle(title ?? '', `第${chapters.length + 1}章`),
        content: '<p></p>',
        plainText: '',
        wordCount: 0,
        revision: 0,
        updatedAt: createdAt,
        position: chapters.length
      };
      await databaseConnection.put('chapters', chapter);
      await databaseConnection.put('works', { ...work, updatedAt: createdAt });
      await audit('chapter.created', chapter.id, createdAt);
      return chapter;
    },

    async renameChapter(chapterId, title) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) throw new Error('章节不存在或无访问权限');
      const renamed = { ...chapter, title: normalizeTitle(title, chapter.title), updatedAt: now() };
      await (await db()).put('chapters', renamed);
      await audit('chapter.renamed', chapterId, renamed.updatedAt);
      return renamed;
    },

    async saveChapter(chapterId, request) {
      const current = await getOwnedChapter(chapterId);
      if (!current) throw new Error('章节不存在或无访问权限');
      const result = saveChapterRevision(current, request);
      const databaseConnection = await db();
      if (result.kind === 'conflict') {
        const conflictCopy: StoredChapter = {
          ...result.conflictCopy,
          ownerId,
          workId: current.workId,
          volumeId: current.volumeId,
          position: current.position + 0.01
        };
        await databaseConnection.put('chapters', conflictCopy);
        await audit('chapter.conflict-created', conflictCopy.id, request.savedAt);
        return { ...result, conflictCopy };
      }

      const saved: StoredChapter = { ...current, ...result.chapter };
      if (needsAutomaticSnapshot(current, request.savedAt)) {
        const snapshot = buildSnapshot(saved);
        await databaseConnection.put('snapshots', snapshot);
        saved.lastSnapshotAt = request.savedAt;
      }
      const work = await getOwnedWork(saved.workId);
      await databaseConnection.put('chapters', saved);
      if (work) await databaseConnection.put('works', { ...work, updatedAt: request.savedAt });
      await recordWritingProgress(request.savedAt, saved.wordCount - current.wordCount);
      await audit('chapter.saved', saved.id, request.savedAt);
      return { kind: 'saved', chapter: saved };
    },

    async saveDraft(chapterId, draft) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) throw new Error('章节不存在或无访问权限');
      const record: ChapterDraft = { chapterId, ...draft };
      await (await db()).put('drafts', record);
      return record;
    },

    async getDraft(chapterId) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) return null;
      return (await (await db()).get('drafts', chapterId)) ?? null;
    },

    async clearDraft(chapterId) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) return;
      await (await db()).delete('drafts', chapterId);
    },

    async createSnapshot(chapterId, label) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) throw new Error('章节不存在或无访问权限');
      const snapshot = buildSnapshot(chapter, normalizeTitle(label, '命名版本'));
      await (await db()).put('snapshots', snapshot);
      await audit('chapter.snapshot-created', snapshot.id, snapshot.createdAt);
      return snapshot;
    },

    async listSnapshots(chapterId) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) return [];
      return (await (await db()).getAllFromIndex('snapshots', 'chapterId', chapterId)).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
    },

    async restoreSnapshot(chapterId, snapshotId) {
      const chapter = await getOwnedChapter(chapterId);
      const databaseConnection = await db();
      const snapshot = await databaseConnection.get('snapshots', snapshotId);
      if (!chapter || !snapshot || snapshot.chapterId !== chapter.id) {
        throw new Error('版本不存在或无访问权限');
      }
      await databaseConnection.put('snapshots', buildSnapshot(chapter, '恢复前快照'));
      const restored: StoredChapter = {
        ...chapter,
        content: snapshot.content,
        plainText: snapshot.plainText,
        wordCount: snapshot.wordCount,
        revision: chapter.revision + 1,
        updatedAt: now()
      };
      await databaseConnection.put('chapters', restored);
      await audit('chapter.snapshot-restored', snapshot.id, restored.updatedAt);
      return restored;
    },

    async saveNote(chapterId, body) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) throw new Error('章节不存在或无访问权限');
      const existing = (await (await db()).getAllFromIndex('notes', 'chapterId', chapterId))[0];
      const note: ChapterNote = {
        id: existing?.id ?? makeId('note'),
        chapterId,
        body,
        updatedAt: now()
      };
      await (await db()).put('notes', note);
      return note;
    },

    async listNotes(chapterId) {
      const chapter = await getOwnedChapter(chapterId);
      if (!chapter) return [];
      return (await (await db()).getAllFromIndex('notes', 'chapterId', chapterId)).sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
    },

    async saveEntity(workId, input) {
      const work = await getOwnedWork(workId);
      if (!work) throw new Error('作品不存在或无访问权限');
      const savedAt = now();
      const existing = input.id ? await getOwnedEntity(input.id) : null;
      if (input.id && !existing) throw new Error('设定不存在或无访问权限');
      if (existing && existing.workId !== workId) throw new Error('设定不属于当前作品');
      if (existing && existing.kind !== input.kind) throw new Error('不能修改设定类型');

      const entity: ProjectEntity = existing
        ? {
            ...existing,
            title: normalizeTitle(input.title, existing.title),
            summary: input.summary?.trim() ?? existing.summary,
            fields: input.fields ? { ...input.fields } : existing.fields,
            updatedAt: savedAt
          }
        : createProjectEntity({
            id: makeId(input.kind),
            ownerId,
            workId,
            kind: input.kind,
            title: input.title,
            summary: input.summary,
            fields: input.fields,
            now: savedAt
          });
      await (await db()).put('entities', entity);
      await audit(existing ? 'entity.updated' : 'entity.created', entity.id, savedAt);
      return entity;
    },

    async listEntities(workId, kind, listOptions) {
      const work = await getOwnedWork(workId);
      if (!work) return [];
      const records = await (await db()).getAllFromIndex('entities', 'workId', workId);
      return records
        .filter((entity) => entity.ownerId === ownerId)
        .filter((entity) => !kind || entity.kind === kind)
        .filter((entity) => listOptions?.includeDeleted || !entity.deletedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async getEntity(entityId) {
      return getOwnedEntity(entityId);
    },

    async softDeleteEntity(entityId) {
      const entity = await getOwnedEntity(entityId);
      if (!entity) throw new Error('设定不存在或无访问权限');
      const deletedAt = now();
      const deleted = { ...entity, deletedAt, updatedAt: deletedAt };
      await (await db()).put('entities', deleted);
      await audit('entity.deleted', entity.id, deletedAt);
      return deleted;
    },

    async restoreEntity(entityId) {
      const entity = await getOwnedEntity(entityId);
      if (!entity) throw new Error('设定不存在或无访问权限');
      const { deletedAt: _deletedAt, ...remaining } = entity;
      const restored: ProjectEntity = { ...remaining, updatedAt: now() };
      await (await db()).put('entities', restored);
      await audit('entity.restored', entity.id, restored.updatedAt);
      return restored;
    },

    async getSettings() {
      const settings = await (await db()).get('settings', ownerId);
      return settings ?? { ownerId, ...DEFAULT_SETTINGS };
    },

    async saveSettings(settings) {
      if (settings.ownerId !== ownerId) throw new Error('无权修改其他用户的设置');
      await (await db()).put('settings', settings);
    },

    async getTodayWritingCount(date) {
      const session = await (await db()).get('sessions', `${ownerId}:${date}`);
      return session?.addedCharacters ?? 0;
    },

    async destroy() {
      const databaseConnection = await database;
      databaseConnection.close();
      await deleteDB(databaseName);
    }
  };
}
