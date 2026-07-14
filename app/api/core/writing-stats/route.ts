import { writingStatsHandlersFromRuntime } from '../../../../src/server/writing-stats/route-dependencies';

export async function GET(request: Request): Promise<Response> {
  return writingStatsHandlersFromRuntime().get(request);
}
