import type { WorkGraph } from './service';

export function createD1WorkStore(database: D1Database) {
  return {
    async createGraph(graph: WorkGraph): Promise<void> {
      const { work, volume, chapter } = graph;
      await database.batch([
        database.prepare('INSERT INTO works (id, owner_id, title, kind, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(work.id, work.ownerId, work.title, work.kind, work.status, work.updatedAt, work.updatedAt),
        database.prepare('INSERT INTO volumes (id, work_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(volume.id, volume.workId, volume.title, volume.position, work.updatedAt, work.updatedAt),
        database.prepare('INSERT INTO chapters (id, work_id, volume_id, title, canonical_content, plain_text, word_count, status, position, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(chapter.id, chapter.workId, chapter.volumeId, chapter.title, JSON.stringify(chapter.canonicalContent), chapter.plainText, chapter.wordCount, 'DRAFT', chapter.position, chapter.revision, work.updatedAt, work.updatedAt)
      ]);
    }
  };
}
