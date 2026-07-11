const encoder = new TextEncoder();

export type StoredPassword = {
  algorithm: 'PBKDF2-HMAC-SHA-256';
  iterations: 600_000;
  salt: Uint8Array;
  digest: Uint8Array;
};

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations: 600_000 },
    source,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<StoredPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { algorithm: 'PBKDF2-HMAC-SHA-256', iterations: 600_000, salt, digest: await derive(password, salt) };
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  const candidate = await derive(password, stored.salt);
  if (candidate.length !== stored.digest.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) difference |= candidate[index] ^ stored.digest[index];
  return difference === 0;
}
