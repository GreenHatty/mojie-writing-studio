import { projectEntityHandlersFromRuntime } from '../../../../../../../../src/server/entities/route-dependencies';

type RouteContext = { params: Promise<{ workId: string; entityId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workId, entityId } = await context.params;
  return projectEntityHandlersFromRuntime().restore(request, workId, entityId);
}
