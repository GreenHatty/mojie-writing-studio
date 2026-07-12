import { invitationHandlersFromRuntime } from '../../../src/server/invitations/route-dependencies';
export async function POST(request: Request): Promise<Response> { return invitationHandlersFromRuntime().create(request); }
