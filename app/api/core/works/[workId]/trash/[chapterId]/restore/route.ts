import { trashHandlersFromRuntime } from '../../../../../../../../src/server/trash/route-dependencies';

type RouteContext = { params: Promise<{ workId: string; chapterId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workId, chapterId } = await context.params;
  return trashHandlersFromRuntime().restoreChapter(request, workId, chapterId);
}
