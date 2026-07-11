import { chapterContextHandlersFromRuntime } from '../../../../../../../src/server/chapters/context-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string; conflictId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { const params = await context.params; return chapterContextHandlersFromRuntime().resolve(request, params.chapterId, params.conflictId); }
