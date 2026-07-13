import { workHandlersFromRuntime } from '../../../../../../../../../src/server/works/route-dependencies';

type RouteContext = { params: Promise<{ workId: string; volumeId: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { workId, volumeId } = await context.params;
  return workHandlersFromRuntime().reorderChapters(request, workId, volumeId);
}
