import { workSearchHandlersFromRuntime } from '../../../../../../src/server/search/route-dependencies';

type RouteContext = { params: Promise<{ workId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return workSearchHandlersFromRuntime().search(request, (await context.params).workId);
}
