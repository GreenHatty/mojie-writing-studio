import { AppError } from '../errors';

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function assertCsrf(input: { origin: string | null; expectedOrigin: string; cookieToken: string | null; headerToken: string | null }): void {
  if (!input.origin || input.origin !== input.expectedOrigin || !input.cookieToken || !input.headerToken || !constantTimeEqual(input.cookieToken, input.headerToken)) {
    throw new AppError('CSRF_REJECTED', 403);
  }
}
