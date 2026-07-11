import type { WorkRole } from '../contracts';

export type DirectoryChapter = { id: string; title: string; position: number; revision: number; wordCount: number; status: string };
export type DirectoryVolume = { id: string; title: string; position: number; chapters: DirectoryChapter[] };
export type WorkDirectory = { work: { id: string; title: string; role: 'WORK_OWNER' | WorkRole }; volumes: DirectoryVolume[] };

export function createD1DirectoryStore(database: D1Database) {
  return {
    async get(userId: string, workId: string): Promise<WorkDirectory | null> {
      const work = await database.prepare(
        "SELECT w.id, w.title, CASE WHEN w.owner_id = ? THEN 'WORK_OWNER' ELSE wm.role END AS role FROM works w LEFT JOIN work_members wm ON wm.work_id = w.id AND wm.user_id = ? WHERE w.id = ? AND w.deleted_at IS NULL AND (w.owner_id = ? OR wm.user_id IS NOT NULL)"
      ).bind(userId, userId, workId, userId).first<{ id: string; title: string; role: WorkDirectory['work']['role'] }>();
      if (!work) return null;
      const volumes = await database.prepare('SELECT id, title, position FROM volumes WHERE work_id = ? AND deleted_at IS NULL ORDER BY position').bind(workId).all<{ id: string; title: string; position: number }>();
      const chapters = await database.prepare('SELECT id, volume_id, title, position, revision, word_count, status FROM chapters WHERE work_id = ? AND deleted_at IS NULL ORDER BY volume_id, position').bind(workId).all<{ id: string; volume_id: string; title: string; position: number; revision: number; word_count: number; status: string }>();
      return {
        work,
        volumes: volumes.results.map((volume) => ({
          id: volume.id,
          title: volume.title,
          position: Number(volume.position),
          chapters: chapters.results.filter((chapter) => chapter.volume_id === volume.id).map((chapter) => ({ id: chapter.id, title: chapter.title, position: Number(chapter.position), revision: Number(chapter.revision), wordCount: Number(chapter.word_count), status: chapter.status }))
        }))
      };
    }
  };
}
