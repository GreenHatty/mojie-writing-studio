import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { LegacyWritingPayload } from './service';

function errorResponse(error: unknown): Response {
  return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
}

export function createMigrationHandlers(dependencies: {
  requireUserId(request: Request): Promise<string>;
  assertMutation(request: Request): Promise<void> | void;
  service: {
    preview(input: { migrationId: string; userId: string; source: LegacyWritingPayload }): Promise<unknown>;
    execute(input: { migrationId: string; userId: string; confirmed: boolean; source: LegacyWritingPayload }): Promise<unknown>;
    rollback(input: { migrationId: string; userId: string }): Promise<unknown>;
  };
}) {
  return {
    async preview(request: Request): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const userId = await dependencies.requireUserId(request);
        const input = await readJsonBody<{ migrationId?: string; source?: LegacyWritingPayload }>(request, 20_000_000);
        if (!input.migrationId || !input.source) throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.service.preview({ migrationId: input.migrationId, userId, source: input.source }), { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
    async execute(request: Request, migrationId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const userId = await dependencies.requireUserId(request);
        const input = await readJsonBody<{ confirmed?: boolean; source?: LegacyWritingPayload }>(request, 20_000_000);
        if (!input.source) throw new AppError('INVALID_INPUT', 400);
        return protectedJson(await dependencies.service.execute({ migrationId, userId, confirmed: input.confirmed === true, source: input.source }));
      } catch (error) { return errorResponse(error); }
    },
    async rollback(request: Request, migrationId: string): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        return protectedJson(await dependencies.service.rollback({ migrationId, userId: await dependencies.requireUserId(request) }));
      } catch (error) { return errorResponse(error); }
    }
  };
}
