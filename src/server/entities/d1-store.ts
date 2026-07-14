import type { ProjectEntity, ProjectEntityKind, ProjectFieldValue } from '../../lib/project-model';
import { AppError } from '../errors';

export type CoreProjectEntity = Omit<ProjectEntity, 'ownerId'> & { createdBy: string; updatedBy: string };
export type EntityReference = { id: string; kind: ProjectEntityKind; title: string; field: string };

type EntityRow = {
  id: string;
  work_id: string;
  kind: ProjectEntityKind;
  title: string;
  summary: string;
  fields_json: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function parseFields(source: string): Record<string, ProjectFieldValue> {
  try {
    const value = JSON.parse(source) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, ProjectFieldValue> : {};
  } catch {
    return {};
  }
}

function toEntity(row: EntityRow): CoreProjectEntity {
  return {
    id: row.id,
    workId: row.work_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    fields: parseFields(row.fields_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {})
  };
}

async function assertWorkAccess(database: D1Database, userId: string, workId: string, write: boolean): Promise<void> {
  const row = await database.prepare(`SELECT w.id FROM works w
    LEFT JOIN work_access wa ON wa.work_id = w.id AND wa.user_id = ? AND wa.revoked_at IS NULL
    WHERE w.id = ? AND w.deleted_at IS NULL
      AND (w.owner_id = ? OR ${write ? "wa.role = 'EDITOR'" : 'wa.user_id IS NOT NULL'})`)
    .bind(userId, workId, userId).first<{ id: string }>();
  if (!row) throw new AppError(write ? 'FORBIDDEN' : 'NOT_FOUND', write ? 403 : 404);
}

function fieldsReferencing(entity: CoreProjectEntity, targetId: string): string[] {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(entity.fields)) {
    if (value === targetId || (Array.isArray(value) && value.includes(targetId))) fields.push(key);
  }
  return fields;
}

export function createD1ProjectEntityStore(database: D1Database) {
  return {
    async list(userId: string, workId: string, kind?: ProjectEntityKind, includeDeleted = false): Promise<CoreProjectEntity[]> {
      await assertWorkAccess(database, userId, workId, false);
      const rows = await database.prepare(`SELECT id, work_id, kind, title, summary, fields_json, created_by, updated_by, created_at, updated_at, deleted_at
        FROM project_entities WHERE work_id = ? AND (? IS NULL OR kind = ?) AND (? = 1 OR deleted_at IS NULL)
        ORDER BY kind, updated_at DESC LIMIT 5000`)
        .bind(workId, kind ?? null, kind ?? null, includeDeleted ? 1 : 0).all<EntityRow>();
      return rows.results.map(toEntity);
    },
    async create(userId: string, workId: string, input: { kind: ProjectEntityKind; title: string; summary: string; fields: Record<string, ProjectFieldValue> }): Promise<CoreProjectEntity> {
      await assertWorkAccess(database, userId, workId, true);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await database.batch([
        database.prepare(`INSERT INTO project_entities
          (id, work_id, kind, title, summary, fields_json, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, workId, input.kind, input.title, input.summary, JSON.stringify(input.fields), userId, userId, now, now),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
      return { id, workId, kind: input.kind, title: input.title, summary: input.summary, fields: input.fields, createdBy: userId, updatedBy: userId, createdAt: now, updatedAt: now };
    },
    async update(userId: string, workId: string, entityId: string, input: { title: string; summary: string; fields: Record<string, ProjectFieldValue> }): Promise<CoreProjectEntity> {
      await assertWorkAccess(database, userId, workId, true);
      const existing = await database.prepare('SELECT id, work_id, kind, title, summary, fields_json, created_by, updated_by, created_at, updated_at, deleted_at FROM project_entities WHERE id = ? AND work_id = ? AND deleted_at IS NULL')
        .bind(entityId, workId).first<EntityRow>();
      if (!existing) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE project_entities SET title = ?, summary = ?, fields_json = ?, updated_by = ?, updated_at = ? WHERE id = ? AND work_id = ? AND deleted_at IS NULL')
          .bind(input.title, input.summary, JSON.stringify(input.fields), userId, now, entityId, workId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
      return toEntity({ ...existing, title: input.title, summary: input.summary, fields_json: JSON.stringify(input.fields), updated_by: userId, updated_at: now });
    },
    async references(userId: string, workId: string, entityId: string): Promise<EntityReference[]> {
      const entities = await this.list(userId, workId, undefined, false);
      if (!entities.some((entity) => entity.id === entityId)) throw new AppError('NOT_FOUND', 404);
      return entities.flatMap((entity) => entity.id === entityId ? [] : fieldsReferencing(entity, entityId).map((field) => ({ id: entity.id, kind: entity.kind, title: entity.title, field })));
    },
    async softDelete(userId: string, workId: string, entityId: string, reason: string): Promise<void> {
      await assertWorkAccess(database, userId, workId, true);
      const row = await database.prepare('SELECT id FROM project_entities WHERE id = ? AND work_id = ? AND deleted_at IS NULL').bind(entityId, workId).first<{ id: string }>();
      if (!row) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE project_entities SET deleted_at = ?, deleted_by = ?, delete_reason = ?, updated_by = ?, updated_at = ? WHERE id = ? AND work_id = ?')
          .bind(now, userId, reason, userId, now, entityId, workId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
    },
    async restore(userId: string, workId: string, entityId: string): Promise<void> {
      await assertWorkAccess(database, userId, workId, true);
      const row = await database.prepare('SELECT id FROM project_entities WHERE id = ? AND work_id = ? AND deleted_at IS NOT NULL').bind(entityId, workId).first<{ id: string }>();
      if (!row) throw new AppError('NOT_FOUND', 404);
      const now = new Date().toISOString();
      await database.batch([
        database.prepare('UPDATE project_entities SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_by = ?, updated_at = ? WHERE id = ? AND work_id = ?')
          .bind(userId, now, entityId, workId),
        database.prepare('UPDATE works SET updated_at = ?, version = version + 1 WHERE id = ?').bind(now, workId)
      ]);
    }
  };
}
