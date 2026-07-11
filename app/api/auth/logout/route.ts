import { authHandlersFromRuntime } from '../../../../src/server/auth/route-dependencies';
export async function POST(request: Request): Promise<Response> { return authHandlersFromRuntime().logout(request); }
