import { protectedJson } from '../http/response';
import { AppError } from '../errors';

function encodeBase64(value: Uint8Array): string { return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join('')); }

export function createDraftKeyHandler(dependencies: { requireUserId(request: Request): Promise<string>; unwrap(userId: string): Promise<Uint8Array> }) {
  return async (request: Request): Promise<Response> => {
    try {
      const userId = await dependencies.requireUserId(request);
      const dek = await dependencies.unwrap(userId);
      if (dek.byteLength !== 32) throw new AppError('LOCAL_DRAFT_KEY_UNAVAILABLE', 503);
      return protectedJson({ dek: encodeBase64(dek) });
    } catch (error) {
      return protectedJson({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }, { status: error instanceof AppError ? error.status : 500 });
    }
  };
}
