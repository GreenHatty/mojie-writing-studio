const encoder = new TextEncoder();

export const PASSWORD_ALGORITHM = 'PBKDF2-HMAC-SHA-256' as const;
// Cloudflare's hosted Workers runtime rejects Web Crypto PBKDF2 requests above
// 100,000 iterations. Keep this explicit and versioned instead of silently
// retrying with a weaker value at runtime.
export const PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_SALT_BYTES = 16;
const MIN_ACCEPTED_ITERATIONS = 100_000;
const MAX_ACCEPTED_ITERATIONS = PASSWORD_ITERATIONS;

export type StoredPassword = {
  algorithm: typeof PASSWORD_ALGORITHM;
  iterations: number;
  salt: Uint8Array;
  digest: Uint8Array;
};

function assertPasswordInput(password: string): void {
  if (password.length < 12 || password.length > 256) throw new Error('INVALID_PASSWORD');
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations },
    source,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function hashPassword(password: string): Promise<StoredPassword> {
  assertPasswordInput(password);
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  return { algorithm: PASSWORD_ALGORITHM, iterations: PASSWORD_ITERATIONS, salt, digest: await derive(password, salt, PASSWORD_ITERATIONS) };
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  if (stored.algorithm !== PASSWORD_ALGORITHM || !Number.isInteger(stored.iterations) || stored.iterations < MIN_ACCEPTED_ITERATIONS || stored.iterations > MAX_ACCEPTED_ITERATIONS || stored.salt.byteLength < PASSWORD_SALT_BYTES || stored.digest.byteLength !== 32) return false;
  const candidate = await derive(password, stored.salt, stored.iterations);
  return constantTimeEqual(candidate, stored.digest);
}

export function passwordNeedsUpgrade(stored: StoredPassword): boolean {
  return stored.algorithm !== PASSWORD_ALGORITHM || stored.iterations !== PASSWORD_ITERATIONS || stored.salt.byteLength !== PASSWORD_SALT_BYTES || stored.digest.byteLength !== 32;
}
