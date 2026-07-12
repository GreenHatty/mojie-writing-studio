import { collaborationHandlersFromRuntime } from '../../../../../../src/server/chapters/collaboration-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string; suggestionId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { const params = await context.params; return collaborationHandlersFromRuntime().handle(request, params.chapterId, params.suggestionId); }
