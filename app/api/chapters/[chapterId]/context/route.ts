import { chapterContextHandlersFromRuntime } from '../../../../../src/server/chapters/context-route-dependencies';
type RouteContext = { params: Promise<{ chapterId: string }> };
export async function GET(request: Request, context: RouteContext): Promise<Response> { return chapterContextHandlersFromRuntime().get(request, (await context.params).chapterId); }
export async function POST(request: Request, context: RouteContext): Promise<Response> { return chapterContextHandlersFromRuntime().saveNote(request, (await context.params).chapterId); }
