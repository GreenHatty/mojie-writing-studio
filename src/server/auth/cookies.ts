import type { RuntimeBindings } from '../contracts';

export function cookieNames(bindings: Pick<RuntimeBindings, 'NODE_ENV'>): { session: string; csrf: string } {
  return bindings.NODE_ENV === 'production'
    ? { session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' }
    : { session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' };
}
