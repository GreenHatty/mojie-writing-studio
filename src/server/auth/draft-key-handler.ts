import { AppError } from '../errors';
import { protectedJson } from '../http/response';

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function createDraftKeyHandler(dependencies: { requireUserId(request: Request): Promise<string>; unwrap(userId: string): Promise<Uint8Array> }) {
  return async (request: Request): Promise<Response> => {
    try {
      const userId = await dependencies.requireUserId(request);
      const dek = await dependencies.unwrap(userId);
      if (dek.byteLength !== 32) throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503);
      const response = protectedJson({ dek: encodeBase64Url(dek), version: 1 });
      dek.fill(0);
      return response;
    } catch (error) {
      return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
    }
  };
}
