import { chapterContextHandlersFromRuntime } from '../../../../../../../src/server/chapters/context-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string; versionId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { const params = await context.params; return chapterContextHandlersFromRuntime().restore(request, params.chapterId, params.versionId); }
