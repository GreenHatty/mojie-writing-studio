import { chapterHandlersFromRuntime } from '../../../../../src/server/chapters/route-dependencies';
import { trashHandlersFromRuntime } from '../../../../../src/server/trash/route-dependencies';

type RouteContext = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return chapterHandlersFromRuntime().get(request, (await context.params).chapterId);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return chapterHandlersFromRuntime().save(request, (await context.params).chapterId);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return chapterHandlersFromRuntime().rename(request, (await context.params).chapterId);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return trashHandlersFromRuntime().deleteChapter(request, (await context.params).chapterId);
}
