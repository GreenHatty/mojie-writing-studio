const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

function isForbiddenHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true;
  if (/^(?:127|10|0)\./u.test(host) || /^169\.254\./u.test(host) || /^192\.168\./u.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./u);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^(?:fc|fd|fe8|fe9|fea|feb)/u.test(host)) return true;
  return false;
}

export function validateBackupUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('backup_url_invalid'); }
  if (url.protocol !== 'https:') throw new Error('backup_https_required');
  if (url.username || url.password) throw new Error('backup_url_credentials_forbidden');
  if (isForbiddenHost(url.hostname)) throw new Error('backup_host_forbidden');
  return url;
}

function encodePath(value) {
  return value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function basicAuthorization(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function sha256(value, output = 'hex') {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (output === 'bytes') return digest;
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, value, output = 'bytes') {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)));
  return output === 'hex' ? [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('') : signature;
}

async function fetchBounded(url, init, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const target = validateBackupUrl(url.toString());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(target, { ...init, redirect: 'manual', signal: controller.signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error('backup_redirect_rejected');
    return response;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('backup_request_timeout');
    throw error;
  } finally { clearTimeout(timer); }
}

async function readBounded(response, maximumBytes = MAX_DOWNLOAD_BYTES) {
  if (Number(response.headers.get('content-length') || 0) > maximumBytes) throw new Error('backup_response_too_large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) { await reader.cancel(); throw new Error('backup_response_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function withBackoff(operation) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      const code = error instanceof Error ? error.message : '';
      if (!/(?:_http_(?:429|5\d\d)|request_timeout)$/u.test(code) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (2 ** attempt) + 25 * attempt));
    }
  }
  throw lastError;
}

export class WebDavBackupAdapter {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.baseUrl = validateBackupUrl(config.baseUrl);
  }

  urlFor(key) {
    const base = this.baseUrl.toString().replace(/\/+$/u, '');
    return new URL(`${base}/${encodePath(key)}`);
  }

  headers() {
    return { authorization: basicAuthorization(this.config.username || '', this.config.password || '') };
  }

  async put(key, bytes) {
    await withBackoff(async () => {
      const response = await fetchBounded(this.urlFor(key), { method: 'PUT', body: bytes, headers: { ...this.headers(), 'content-type': 'application/json' } }, this.fetchImpl);
      if (!response.ok) throw new Error(`backup_webdav_http_${response.status}`);
    });
  }

  async get(key) {
    return withBackoff(async () => {
      const response = await fetchBounded(this.urlFor(key), { method: 'GET', headers: this.headers() }, this.fetchImpl);
      if (!response.ok) throw new Error(`backup_webdav_http_${response.status}`);
      return readBounded(response);
    });
  }

  async delete(key) {
    await withBackoff(async () => {
      const response = await fetchBounded(this.urlFor(key), { method: 'DELETE', headers: this.headers() }, this.fetchImpl);
      if (!response.ok && response.status !== 404) throw new Error(`backup_webdav_http_${response.status}`);
    });
  }
}

export class S3CompatibleBackupAdapter {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.endpoint = validateBackupUrl(config.endpoint);
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) throw new Error('backup_s3_config_incomplete');
  }

  requestUrl(key) {
    const encodedKey = encodePath(key);
    const pathStyle = this.config.pathStyle !== false;
    const host = pathStyle ? this.endpoint.host : `${this.config.bucket}.${this.endpoint.host}`;
    if (isForbiddenHost(host.split(':')[0])) throw new Error('backup_host_forbidden');
    const pathname = pathStyle ? `/${encodeURIComponent(this.config.bucket)}/${encodedKey}` : `/${encodedKey}`;
    return { url: new URL(`${this.endpoint.protocol}//${host}${pathname}`), host, pathname };
  }

  async request(method, key, body) {
    const { url, host, pathname } = this.requestUrl(key);
    const timestamp = new Date();
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const date = amzDate.slice(0, 8);
    const region = this.config.region || 'auto';
    const payload = body || new Uint8Array();
    const payloadHash = await sha256(payload);
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `${method}\n${pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`;
    const dateKey = await hmac(`AWS4${this.config.secretAccessKey}`, date);
    const regionKey = await hmac(dateKey, region);
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    const signature = await hmac(signingKey, stringToSign, 'hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetchBounded(url, {
      method,
      body: method === 'PUT' ? payload : undefined,
      headers: { 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, authorization, 'content-type': 'application/json' }
    }, this.fetchImpl);
    if (!response.ok && !(method === 'DELETE' && response.status === 404)) throw new Error(`backup_s3_http_${response.status}`);
    return response;
  }

  async put(key, bytes) { await withBackoff(() => this.request('PUT', key, bytes)); }
  async get(key) { return withBackoff(async () => readBounded(await this.request('GET', key))); }
  async delete(key) { await withBackoff(() => this.request('DELETE', key)); }
}

export function backupAdapterFor(targetType, config, fetchImpl = fetch) {
  if (targetType === 'webdav') return new WebDavBackupAdapter(config, fetchImpl);
  if (targetType === 's3-compatible') return new S3CompatibleBackupAdapter(config, fetchImpl);
  throw new Error('backup_target_unsupported');
}
