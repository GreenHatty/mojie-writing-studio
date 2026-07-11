import { AppError } from '../errors';

export type EncryptedBackup = { ciphertext: Uint8Array; iv: Uint8Array; version: 1 };
async function importKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.byteLength !== 32) throw new AppError('CONFIGURATION_REQUIRED', 503);
  return crypto.subtle.importKey('raw', new Uint8Array(key).buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(key: Uint8Array, body: Uint8Array): Promise<EncryptedBackup> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv).buffer }, await importKey(key), new Uint8Array(body).buffer));
  return { ciphertext, iv, version: 1 };
}
export async function decryptBackup(key: Uint8Array, backup: EncryptedBackup): Promise<Uint8Array> {
  if (backup.version !== 1) throw new AppError('BACKUP_KEY_UNAVAILABLE', 503);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(backup.iv).buffer }, await importKey(key), new Uint8Array(backup.ciphertext).buffer));
}
