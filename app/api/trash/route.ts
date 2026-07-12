import { trashHandlersFromRuntime } from '../../../src/server/works/trash-route-dependencies';
export async function GET(request: Request): Promise<Response> { return trashHandlersFromRuntime().list(request); }
