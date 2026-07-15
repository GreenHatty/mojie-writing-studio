import { AppError } from '../errors';
import { readJsonBody } from '../http/request';
import { protectedJson } from '../http/response';
import type { ProfileSettingsDto } from './d1-store';

type ProfileInput = Omit<ProfileSettingsDto, 'updatedAt'>;

const themes = new Set<ProfileInput['theme']>(['paper', 'warm', 'gray', 'dark']);
const widths = new Set<ProfileInput['editorWidth']>(['narrow', 'comfortable', 'mobile', 'document', 'wide']);

function valid(input: Partial<ProfileInput>): input is ProfileInput {
  return typeof input.theme === 'string' && themes.has(input.theme as ProfileInput['theme'])
    && typeof input.fontSize === 'number' && Number.isInteger(input.fontSize) && input.fontSize >= 14 && input.fontSize <= 28
    && typeof input.lineHeight === 'number' && Number.isFinite(input.lineHeight) && input.lineHeight >= 1.4 && input.lineHeight <= 2.6
    && typeof input.editorWidth === 'string' && widths.has(input.editorWidth as ProfileInput['editorWidth'])
    && typeof input.leftColumnWidth === 'number' && Number.isInteger(input.leftColumnWidth) && input.leftColumnWidth >= 220 && input.leftColumnWidth <= 460
    && typeof input.rightColumnWidth === 'number' && Number.isInteger(input.rightColumnWidth) && input.rightColumnWidth >= 260 && input.rightColumnWidth <= 520;
}

function errorResponse(error: unknown): Response {
  return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
}

export function createProfileSettingsHandlers(dependencies: {
  requireUserId(request: Request): Promise<string>;
  assertMutation(request: Request): Promise<void> | void;
  store: { get(userId: string): Promise<ProfileSettingsDto>; put(userId: string, input: ProfileInput): Promise<ProfileSettingsDto> };
}) {
  return {
    async get(request: Request): Promise<Response> {
      try { return protectedJson({ settings: await dependencies.store.get(await dependencies.requireUserId(request)) }); }
      catch (error) { return errorResponse(error); }
    },
    async put(request: Request): Promise<Response> {
      try {
        await dependencies.assertMutation(request);
        const input = await readJsonBody<Partial<ProfileInput>>(request, 64_000);
        if (!valid(input)) throw new AppError('INVALID_INPUT', 400);
        return protectedJson({ settings: await dependencies.store.put(await dependencies.requireUserId(request), input) });
      } catch (error) { return errorResponse(error); }
    }
  };
}
