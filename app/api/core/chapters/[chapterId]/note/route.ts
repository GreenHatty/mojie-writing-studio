import { privateNoteHandlersFromRuntime } from '../../../../../../src/server/notes/route-dependencies';

type RouteContext = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return privateNoteHandlersFromRuntime().get(request, (await context.params).chapterId);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return privateNoteHandlersFromRuntime().put(request, (await context.params).chapterId);
}
