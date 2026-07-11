import { draftKeyHandlerFromRuntime } from '../../../../src/server/auth/draft-key-route-dependencies';
export async function GET(request: Request): Promise<Response> { return draftKeyHandlerFromRuntime()(request); }
