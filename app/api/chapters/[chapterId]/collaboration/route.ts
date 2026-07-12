import { collaborationHandlersFromRuntime } from '../../../../../src/server/chapters/collaboration-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { return collaborationHandlersFromRuntime().create(request, (await context.params).chapterId); }
