import { directoryMutationHandlersFromRuntime } from '../../../../../src/server/works/directory-mutation-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string }> };
export async function PATCH(request: Request, context: RouteContext): Promise<Response> { return directoryMutationHandlersFromRuntime().updateChapter(request, (await context.params).chapterId); }
