import { invitationHandlersFromRuntime } from '../../../../../src/server/invitations/route-dependencies';
type RouteContext = { params: Promise<{ invitationId: string }> };
export async function POST(request: Request, context: RouteContext): Promise<Response> { return invitationHandlersFromRuntime().accept(request, (await context.params).invitationId); }
