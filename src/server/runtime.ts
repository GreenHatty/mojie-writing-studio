import type { RequiredRuntimeBindings, RuntimeBindings } from './contracts';
import { AppError } from './errors';

const REQUIRED_KEYS = ['DB', 'OBJECTS', 'APP_ORIGIN', 'OWNER_INITIALIZATION_KEY', 'LOCAL_DRAFT_KEK'] as const;

export function requireRuntimeBindings(bindings: RuntimeBindings): RequiredRuntimeBindings {
  for (const key of REQUIRED_KEYS) {
    if (!bindings[key]) throw new AppError('CONFIGURATION_REQUIRED', 503);
  }

  return bindings as RequiredRuntimeBindings;
}
