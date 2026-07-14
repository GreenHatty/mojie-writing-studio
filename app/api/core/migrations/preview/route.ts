import { migrationHandlersFromRuntime } from '../../../../../src/server/migrations/route-dependencies';

export async function POST(request: Request): Promise<Response> {
  return migrationHandlersFromRuntime().preview(request);
}
