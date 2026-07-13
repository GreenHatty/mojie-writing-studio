import { workHandlersFromRuntime } from '../../../../../src/server/works/route-dependencies';

type RouteContext = { params: Promise<{ workId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return workHandlersFromRuntime().detail(request, (await context.params).workId);
}
