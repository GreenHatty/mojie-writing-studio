import { workHandlersFromRuntime } from '../../../../../../src/server/works/route-dependencies';

type RouteContext = { params: Promise<{ workId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return workHandlersFromRuntime().createVolume(request, (await context.params).workId);
}
