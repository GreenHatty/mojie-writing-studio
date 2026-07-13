import { AppError } from '../errors';

export async function readJsonBody<T>(request: Request, maximumBytes = 1_000_000): Promise<T> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new AppError('PAYLOAD_TOO_LARGE', 413);
  if (!request.body) throw new AppError('INVALID_INPUT', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new AppError('PAYLOAD_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { throw new AppError('INVALID_INPUT', 400); }
}
