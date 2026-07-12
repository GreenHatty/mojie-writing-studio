import { trashHandlersFromRuntime } from '../../../../../src/server/works/trash-route-dependencies';
type RouteContext = { params: Promise<{ workId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { return trashHandlersFromRuntime().mutate(request, (await context.params).workId); }
