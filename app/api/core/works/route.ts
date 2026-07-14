import { workHandlersFromRuntime } from '../../../../src/server/works/route-dependencies';

export async function GET(request: Request): Promise<Response> {
  return workHandlersFromRuntime().list(request);
}

export async function POST(request: Request): Promise<Response> {
  return workHandlersFromRuntime().create(request);
}
