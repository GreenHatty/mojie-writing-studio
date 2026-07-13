import type { RequiredRuntimeBindings, RuntimeBindings } from './contracts';
import { AppError } from './errors';

const REQUIRED_KEYS = ['DB', 'APP_ORIGIN', 'OWNER_INITIALIZATION_KEY', 'LOCAL_DRAFT_KEK'] as const;

export function requireRuntimeBindings(bindings: RuntimeBindings): RequiredRuntimeBindings {
  for (const key of REQUIRED_KEYS) {
    if (!bindings[key]) throw new AppError('CONFIGURATION_REQUIRED', 503);
  }

  try {
    const origin = new URL(bindings.APP_ORIGIN!);
    if (origin.origin !== bindings.APP_ORIGIN || (bindings.NODE_ENV !== 'development' && origin.protocol !== 'https:')) {
      throw new Error('Invalid application origin');
    }
  } catch {
    throw new AppError('CONFIGURATION_REQUIRED', 503);
  }

  return bindings as RequiredRuntimeBindings;
}
