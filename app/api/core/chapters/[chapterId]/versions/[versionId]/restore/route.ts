import { chapterVersionHandlersFromRuntime } from '../../../../../../../../src/server/versions/route-dependencies';

type RouteContext = { params: Promise<{ chapterId: string; versionId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { chapterId, versionId } = await context.params;
  return chapterVersionHandlersFromRuntime().restore(request, chapterId, versionId);
}
