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

export type RequestFailureCode = 'timeout' | 'cancelled' | 'offline' | 'invalid_response' | 'request_failed';

export class RequestFailure extends Error {
  constructor(message: string, readonly code: RequestFailureCode, readonly cause?: unknown) {
    super(message);
    this.name = 'RequestFailure';
  }
}

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

export const REQUEST_TIMEOUT_MS = 12_000;
export const MUTATION_TIMEOUT_MS = 15_000;

function timeoutFor(init: ApiRequestInit): number {
  if (init.timeoutMs !== undefined) return init.timeoutMs;
  return ['POST', 'PUT', 'PATCH'].includes((init.method || 'GET').toUpperCase())
    ? MUTATION_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS;
}

function composeSignal(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  };
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer) && !ArrayBuffer.isView(init.body) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const composed = composeSignal(init.signal, timeoutFor(init));
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin', signal: composed.signal });
  } catch (error) {
    if (composed.timedOut()) throw new RequestFailure('请求超时，请重试。', 'timeout', error);
    if (init.signal?.aborted) throw new RequestFailure('请求已取消。', 'cancelled', error);
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new RequestFailure('当前处于离线状态。', 'offline', error);
    throw new RequestFailure('网络请求失败，请检查连接后重试。', 'request_failed', error);
  } finally {
    composed.dispose();
  }
  if (!response.ok) {
    let payload: { error?: { message?: string; code?: string; details?: unknown } | string } = {};
    try {
      payload = await response.json() as typeof payload;
    } catch {
      // The status text is used below.
    }
    const error = payload.error;
    const code = typeof error === 'string' ? error : error?.code || 'request_failed';
    const message = typeof error === 'string' ? error : error?.message || response.statusText || '请求失败';
    throw new ApiError(message, response.status, code, typeof error === 'string' ? undefined : error?.details);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch (error) {
    throw new RequestFailure('服务器响应格式无效。', 'invalid_response', error);
  }
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
