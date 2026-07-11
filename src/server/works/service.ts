import type { CanonicalContent, WorkRole } from '../contracts';
import { AppError } from '../errors';

export type WorkKind = 'long' | 'short' | 'essay';
export type ServerWork = { id: string; ownerId: string; title: string; kind: WorkKind; status: string; updatedAt: string; deletedAt: string | null; deleteReason: string | null };
export type ServerVolume = { id: string; workId: string; title: string; position: number };
export type ServerChapter = { id: string; workId: string; volumeId: string; title: string; canonicalContent: CanonicalContent; plainText: string; wordCount: number; revision: number; position: number };
export type WorkSummary = Pick<ServerWork, 'id' | 'title' | 'kind' | 'status' | 'updatedAt'> & { role: 'WORK_OWNER' | WorkRole; totalWordCount: number };
export type WorkGraph = { work: ServerWork; volume: ServerVolume; chapter: ServerChapter };

class MemoryWorkStore {
  readonly works = new Map<string, ServerWork>();
  readonly volumes = new Map<string, ServerVolume>();
  readonly chapters = new Map<string, ServerChapter>();
  readonly members = new Map<string, WorkRole>();
  grant(workId: string, userId: string, role: WorkRole): void { this.members.set(`${workId}:${userId}`, role); }
}

export function createMemoryWorkStore(): MemoryWorkStore { return new MemoryWorkStore(); }

export function createWorkService(store: MemoryWorkStore, now = () => new Date().toISOString()) {
  function owned(userId: string, workId: string): ServerWork {
    const work = store.works.get(workId);
    if (!work || work.ownerId !== userId) throw new AppError('FORBIDDEN', 403);
    return work;
  }
  return {
    async createWork(ownerId: string, input: { title: string; kind: WorkKind }) {
      const work: ServerWork = { id: crypto.randomUUID(), ownerId, title: input.title.trim() || '未命名作品', kind: input.kind, status: 'DRAFT', updatedAt: now(), deletedAt: null, deleteReason: null };
      const volume: ServerVolume = { id: crypto.randomUUID(), workId: work.id, title: '第一卷', position: 0 };
      const chapter: ServerChapter = { id: crypto.randomUUID(), workId: work.id, volumeId: volume.id, title: '第1章', canonicalContent: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: '', wordCount: 0, revision: 0, position: 0 };
      store.works.set(work.id, work); store.volumes.set(volume.id, volume); store.chapters.set(chapter.id, chapter);
      return { work, volume, chapter };
    },
    async listVisibleWorks(userId: string): Promise<WorkSummary[]> {
      return [...store.works.values()].filter((work) => !work.deletedAt && (work.ownerId === userId || store.members.has(`${work.id}:${userId}`))).map((work) => ({
        id: work.id, title: work.title, kind: work.kind, status: work.status, updatedAt: work.updatedAt,
        role: work.ownerId === userId ? 'WORK_OWNER' : store.members.get(`${work.id}:${userId}`)!,
        totalWordCount: [...store.chapters.values()].filter((chapter) => chapter.workId === work.id).reduce((sum, chapter) => sum + chapter.wordCount, 0)
      }));
    },
    async softDelete(userId: string, workId: string, reason: string): Promise<void> { const work = owned(userId, workId); store.works.set(workId, { ...work, deletedAt: now(), deleteReason: reason }); },
    async restore(userId: string, workId: string): Promise<void> { const work = owned(userId, workId); store.works.set(workId, { ...work, deletedAt: null, deleteReason: null }); }
  };
}
