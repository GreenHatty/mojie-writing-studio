import { profileSettingsHandlersFromRuntime } from '../../../../src/server/profile-settings/route-dependencies';

export async function GET(request: Request): Promise<Response> {
  return profileSettingsHandlersFromRuntime().get(request);
}

export async function PUT(request: Request): Promise<Response> {
  return profileSettingsHandlersFromRuntime().put(request);
}
