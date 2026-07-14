import { migrationHandlersFromRuntime } from '../../../../../../src/server/migrations/route-dependencies';

type RouteContext = { params: Promise<{ migrationId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return migrationHandlersFromRuntime().rollback(request, (await context.params).migrationId);
}
