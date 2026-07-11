export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  globalRole: 'owner' | 'admin' | 'writer' | 'editor' | 'commenter' | 'viewer';
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer) && !ArrayBuffer.isView(init.body) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    let payload: { error?: { message?: string; code?: string; details?: unknown } } = {};
    try {
      payload = await response.json() as typeof payload;
    } catch {
      // The status text is used below.
    }
    throw new ApiError(
      payload.error?.message || response.statusText || '请求失败',
      response.status,
      payload.error?.code || 'request_failed',
      payload.error?.details
    );
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
