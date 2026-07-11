import { directoryMutationHandlersFromRuntime } from '../../../../../src/server/works/directory-mutation-route-dependencies';
type RouteContext = { params: Promise<{ workId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { return directoryMutationHandlersFromRuntime().createChapter(request, (await context.params).workId); }
