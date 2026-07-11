import type { CanonicalContent } from '../contracts';
import { AppError } from '../errors';

type Chapter = { id: string; workId: string; ownerId: string; canonicalContent: CanonicalContent; plainText: string; revision: number; lastSnapshotAt: string | null };
type Version = { id: string; chapterId: string; canonicalContent: CanonicalContent; sourceRevision: number; reason: 'AUTO' | 'CONFLICT_COPY'; createdAt: string };
type Conflict = { id: string; chapterId: string; currentRevision: number; submittedRevision: number; conflictVersionId: string };
type SaveResult = { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };

class MemorySyncStore {
  private readonly chapters = new Map<string, Chapter>();
  private readonly operationResults = new Map<string, SaveResult>();
  private readonly versionRows: Version[] = [];
  private readonly conflictRows: Conflict[] = [];
  addChapter(workId: string, ownerId: string): Chapter { const row: Chapter = { id: crypto.randomUUID(), workId, ownerId, canonicalContent: { type: 'doc' }, plainText: '', revision: 0, lastSnapshotAt: null }; this.chapters.set(row.id, row); return row; }
  chapter(id: string): Chapter | null { return this.chapters.get(id) ?? null; }
  saveChapter(row: Chapter): void { this.chapters.set(row.id, row); }
  operation(id: string): SaveResult | null { return this.operationResults.get(id) ?? null; }
  saveOperation(id: string, result: SaveResult): void { this.operationResults.set(id, result); }
  addVersion(row: Version): void { this.versionRows.push(row); }
  versions(chapterId: string): Version[] { return this.versionRows.filter((row) => row.chapterId === chapterId); }
  addConflict(row: Conflict): void { this.conflictRows.push(row); }
  conflicts(chapterId: string): Conflict[] { return this.conflictRows.filter((row) => row.chapterId === chapterId); }
}

export function createMemorySyncStore(): MemorySyncStore { return new MemorySyncStore(); }

function plainText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: unknown; content?: unknown[] };
  return `${typeof node.text === 'string' ? node.text : ''}${Array.isArray(node.content) ? node.content.map(plainText).join('') : ''}`;
}

export function createSyncService(store: MemorySyncStore) {
  return {
    async saveChapter(command: { userId: string; chapterId: string; baseRevision: number; canonicalContent: CanonicalContent; clientOperationId: string; savedAt: string }): Promise<SaveResult> {
      const prior = store.operation(command.clientOperationId);
      if (prior) return prior;
      const current = store.chapter(command.chapterId);
      if (!current || current.ownerId !== command.userId) throw new AppError('FORBIDDEN', 403);
      if (current.revision !== command.baseRevision) {
        const conflictVersion: Version = { id: crypto.randomUUID(), chapterId: current.id, canonicalContent: command.canonicalContent, sourceRevision: command.baseRevision, reason: 'CONFLICT_COPY', createdAt: command.savedAt };
        store.addVersion(conflictVersion);
        const conflict: Conflict = { id: crypto.randomUUID(), chapterId: current.id, currentRevision: current.revision, submittedRevision: command.baseRevision, conflictVersionId: conflictVersion.id };
        store.addConflict(conflict);
        const result: SaveResult = { kind: 'conflict', currentRevision: current.revision, conflictId: conflict.id };
        store.saveOperation(command.clientOperationId, result);
        return result;
      }
      const next = { ...current, canonicalContent: command.canonicalContent, plainText: plainText(command.canonicalContent), revision: current.revision + 1, lastSnapshotAt: command.savedAt };
      if (!current.lastSnapshotAt || new Date(command.savedAt).getTime() - new Date(current.lastSnapshotAt).getTime() >= 5 * 60_000) {
        store.addVersion({ id: crypto.randomUUID(), chapterId: current.id, canonicalContent: command.canonicalContent, sourceRevision: next.revision, reason: 'AUTO', createdAt: command.savedAt });
      }
      store.saveChapter(next);
      const result: SaveResult = { kind: 'saved', revision: next.revision };
      store.saveOperation(command.clientOperationId, result);
      return result;
    }
  };
}
