export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...valueParts] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(valueParts.join('='));
  }
  return null;
}

export function randomCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
