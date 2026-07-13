import { trashHandlersFromRuntime } from '../../../../../../src/server/trash/route-dependencies';

type RouteContext = { params: Promise<{ workId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return trashHandlersFromRuntime().list(request, (await context.params).workId);
}
