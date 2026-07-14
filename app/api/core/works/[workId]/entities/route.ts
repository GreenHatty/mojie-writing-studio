import { projectEntityHandlersFromRuntime } from '../../../../../../src/server/entities/route-dependencies';

type RouteContext = { params: Promise<{ workId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return projectEntityHandlersFromRuntime().list(request, (await context.params).workId);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return projectEntityHandlersFromRuntime().create(request, (await context.params).workId);
}
