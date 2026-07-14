import { chapterHandlersFromRuntime } from '../../../../../src/server/chapters/route-dependencies';

type RouteContext = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return chapterHandlersFromRuntime().get(request, (await context.params).chapterId);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return chapterHandlersFromRuntime().save(request, (await context.params).chapterId);
}
