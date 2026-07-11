import { directoryHandlerFromRuntime } from '../../../../src/server/works/directory-route-dependencies';
type RouteContext = { params: Promise<{ workId: string }> };
export async function GET(request: Request, context: RouteContext): Promise<Response> { return directoryHandlerFromRuntime()(request, (await context.params).workId); }
