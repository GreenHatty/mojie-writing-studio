import type { ProjectEntityKind, ProjectFieldValue } from '../../lib/project-model';
import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { CoreProjectEntity, EntityReference } from './d1-store';

const KINDS = new Set<ProjectEntityKind>(['outline', 'chapter-plan', 'character', 'location', 'timeline', 'relationship', 'material', 'world', 'faction']);

type EntityInput = { kind?: unknown; title?: unknown; summary?: unknown; fields?: unknown };
type EntityStore = {
  list(userId: string, workId: string, kind?: ProjectEntityKind, includeDeleted?: boolean): Promise<CoreProjectEntity[]>;
  create(userId: string, workId: string, input: { kind: ProjectEntityKind; title: string; summary: string; fields: Record<string, ProjectFieldValue> }): Promise<CoreProjectEntity>;
  update(userId: string, workId: string, entityId: string, input: { title: string; summary: string; fields: Record<string, ProjectFieldValue> }): Promise<CoreProjectEntity>;
  references(userId: string, workId: string, entityId: string): Promise<EntityReference[]>;
  softDelete(userId: string, workId: string, entityId: string, reason: string): Promise<void>;
  restore(userId: string, workId: string, entityId: string): Promise<void>;
};

function errorResponse(error: unknown): Response {
  return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
}

function validateFields(value: unknown): Record<string, ProjectFieldValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID_FIELDS', 400);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new AppError('FIELDS_TOO_LARGE', 413);
  const result: Record<string, ProjectFieldValue> = {};
  for (const [key, field] of entries) {
    if (!key || key.length > 100) throw new AppError('INVALID_FIELDS', 400);
    if (field === null || typeof field === 'boolean' || (typeof field === 'number' && Number.isFinite(field))) result[key] = field;
    else if (typeof field === 'string' && field.length <= 50_000) result[key] = field;
    else if (Array.isArray(field) && field.length <= 1_000 && field.every((item) => typeof item === 'string' && item.length <= 500)) result[key] = field;
    else throw new AppError('INVALID_FIELDS', 400);
  }
  return result;
}

function validateInput(input: EntityInput, requireKind: boolean): { kind?: ProjectEntityKind; title: string; summary: string; fields: Record<string, ProjectFieldValue> } {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!title || title.length > 120 || summary.length > 20_000) throw new AppError('INVALID_INPUT', 400);
  const kind = typeof input.kind === 'string' && KINDS.has(input.kind as ProjectEntityKind) ? input.kind as ProjectEntityKind : undefined;
  if (requireKind && !kind) throw new AppError('INVALID_KIND', 400);
  return { ...(kind ? { kind } : {}), title, summary, fields: validateFields(input.fields ?? {}) };
}

export function createProjectEntityHandlers(dependencies: { requireUserId(request: Request): Promise<string>; assertMutation(request: Request): Promise<void> | void; store: EntityStore }) {
  return {
    async list(request: Request, workId: string): Promise<Response> {
      try {
        const params = new URL(request.url).searchParams;
        const rawKind = params.get('kind');
        const kind = rawKind && KINDS.has(rawKind as ProjectEntityKind) ? rawKind as ProjectEntityKind : undefined;
        if (rawKind && !kind) throw new AppError('INVALID_KIND', 400);
        return protectedJson({ entities: await dependencies.store.list(await dependencies.requireUserId(request), workId, kind, params.get('includeDeleted') === 'true') });
      } catch (error) { return errorResponse(error); }
    },
    async create(request: Request, workId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = validateInput(await readJsonBody<EntityInput>(request, 256_000), true);
        return protectedJson({ entity: await dependencies.store.create(await dependencies.requireUserId(request), workId, input as Required<typeof input>) }, { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async update(request: Request, workId: string, entityId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = validateInput(await readJsonBody<EntityInput>(request, 256_000), false);
        return protectedJson({ entity: await dependencies.store.update(await dependencies.requireUserId(request), workId, entityId, input) });
      } catch (error) { return errorResponse(error); }
    },
    async references(request: Request, workId: string, entityId: string): Promise<Response> {
      try { return protectedJson({ references: await dependencies.store.references(await dependencies.requireUserId(request), workId, entityId) }); }
      catch (error) { return errorResponse(error); }
    },
    async remove(request: Request, workId: string, entityId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<{ reason?: unknown; confirmReferences?: unknown }>(request, 32_000);
        const userId = await dependencies.requireUserId(request);
        const references = await dependencies.store.references(userId, workId, entityId);
        if (references.length && input.confirmReferences !== true) return protectedJson({ error: { code: 'ENTITY_REFERENCED', message: '该设定仍被其他内容引用。', details: { references } } }, { status: 409 });
        const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
        await dependencies.store.softDelete(userId, workId, entityId, reason);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    },
    async restore(request: Request, workId: string, entityId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        await dependencies.store.restore(await dependencies.requireUserId(request), workId, entityId);
        return protectedJson({ ok: true });
      } catch (error) { return errorResponse(error); }
    }
  };
}
