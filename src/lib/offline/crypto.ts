const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedLocalPayload = { ciphertext: Uint8Array; iv: Uint8Array; version: 1 };
async function importDek(dek: Uint8Array): Promise<CryptoKey> {
  if (dek.byteLength !== 32) throw new Error('LOCAL_DRAFT_KEY_UNAVAILABLE');
  return crypto.subtle.importKey('raw', new Uint8Array(dek).buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export function offlineDatabaseName(userId: string): string { return `mojie-writing-studio:${userId}`; }
export async function encryptLocalPayload(dek: Uint8Array, payload: unknown): Promise<EncryptedLocalPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv).buffer }, await importDek(dek), encoder.encode(JSON.stringify(payload))));
  return { ciphertext, iv, version: 1 };
}
export async function decryptLocalPayload<T>(dek: Uint8Array, payload: EncryptedLocalPayload): Promise<T> {
  if (payload.version !== 1) throw new Error('LOCAL_DRAFT_KEY_UNAVAILABLE');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(payload.iv).buffer }, await importDek(dek), new Uint8Array(payload.ciphertext).buffer);
  return JSON.parse(decoder.decode(plain)) as T;
}
