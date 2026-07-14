import { authHandlersFromRuntime } from '../../../../../src/server/auth/route-dependencies';

export async function GET(request: Request): Promise<Response> {
  return authHandlersFromRuntime().session(request);
}
