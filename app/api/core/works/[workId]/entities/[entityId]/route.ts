import { projectEntityHandlersFromRuntime } from '../../../../../../../src/server/entities/route-dependencies';

type RouteContext = { params: Promise<{ workId: string; entityId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { workId, entityId } = await context.params;
  return projectEntityHandlersFromRuntime().references(request, workId, entityId);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { workId, entityId } = await context.params;
  return projectEntityHandlersFromRuntime().update(request, workId, entityId);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { workId, entityId } = await context.params;
  return projectEntityHandlersFromRuntime().remove(request, workId, entityId);
}
