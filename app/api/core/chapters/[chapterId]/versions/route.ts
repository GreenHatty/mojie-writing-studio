import { chapterVersionHandlersFromRuntime } from '../../../../../../src/server/versions/route-dependencies';

type RouteContext = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return chapterVersionHandlersFromRuntime().list(request, (await context.params).chapterId);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return chapterVersionHandlersFromRuntime().create(request, (await context.params).chapterId);
}
