const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

export const RANKING_TASK_STATUSES = ['queued', 'fetching', 'parsing', 'validating', 'completed', 'partial', 'failed', 'cancelled'];

const HOSTS = {
  qidian: ['qidian.com'],
  fanqie: ['fanqienovel.com']
};

function stripHtml(value) {
  return String(value || '').replace(/<script[\s\S]*?<\/script>/giu, '').replace(/<style[\s\S]*?<\/style>/giu, '').replace(/<[^>]+>/gu, ' ').replace(/&nbsp;|&#160;/gu, ' ').replace(/&amp;/gu, '&').replace(/\s+/gu, ' ').trim();
}

function isForbiddenIp(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1' || normalized === '0.0.0.0') return true;
  if (/^127\./u.test(normalized) || /^10\./u.test(normalized) || /^169\.254\./u.test(normalized) || /^192\.168\./u.test(normalized)) return true;
  const match = normalized.match(/^(\d{1,3})\.(\d{1,3})\./u);
  if (match && Number(match[1]) === 172 && Number(match[2]) >= 16 && Number(match[2]) <= 31) return true;
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

export function validateRankingUrl(value, platform) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('ranking_https_required');
  if (url.username || url.password || isForbiddenIp(url.hostname)) throw new Error('ranking_host_forbidden');
  const allowed = HOSTS[platform] || [];
  if (!allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('ranking_host_not_authorized');
  return url;
}

function normalizeCandidate(candidate, baseUrl) {
  const title = stripHtml(candidate.title || candidate.bookName || candidate.book_name || candidate.name);
  if (title.length < 2 || title.length > 200) return null;
  const rawUrl = candidate.url || candidate.bookUrl || candidate.book_url || candidate.href || '';
  let url = '';
  try { url = rawUrl ? new URL(rawUrl, baseUrl).toString() : ''; } catch { url = ''; }
  return {
    rank: Number(candidate.rank || candidate.rankNo || candidate.index || 999),
    title,
    author: stripHtml(candidate.author || candidate.authorName || candidate.author_name),
    blurb: stripHtml(candidate.blurb || candidate.intro || candidate.description || candidate.abstract),
    tags: Array.isArray(candidate.tags) ? candidate.tags.map(stripHtml).filter(Boolean).slice(0, 12) : [],
    bookId: String(candidate.bookId || candidate.book_id || candidate.id || url.match(/\d+/u)?.[0] || ''),
    url
  };
}

function collectJsonBooks(value, output, baseUrl, depth = 0) {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) { for (const item of value.slice(0, 500)) collectJsonBooks(item, output, baseUrl, depth + 1); return; }
  if (typeof value !== 'object') return;
  const candidate = normalizeCandidate(value, baseUrl);
  if (candidate && ('bookId' in value || 'book_id' in value || 'bookName' in value || 'book_name' in value || 'authorName' in value)) output.push(candidate);
  for (const child of Object.values(value)) collectJsonBooks(child, output, baseUrl, depth + 1);
}

function embeddedJson(html) {
  const values = [];
  for (const match of html.matchAll(/<script\b[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/giu)) {
    try { values.push(JSON.parse(match[1])); } catch { /* structural fallback follows */ }
  }
  return values;
}

function parseQidianHtml(html, baseUrl) {
  const output = [];
  const pattern = /<li\b[^>]*(?:class=["'][^"']*(?:rank|book)[^"']*["'])?[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/book\/\d+[^"']*)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/giu;
  for (const match of html.matchAll(pattern)) output.push(normalizeCandidate({ url: match[1], title: match[2] || match[3], rank: output.length + 1 }, baseUrl));
  return output.filter(Boolean);
}

function parseFanqieHtml(html, baseUrl) {
  const output = [];
  const pattern = /<div\b[^>]*class=["'][^"']*(?:rank|book-item)[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/(?:page|book)\/\d+[^"']*)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>/giu;
  for (const match of html.matchAll(pattern)) output.push(normalizeCandidate({ url: match[1], title: match[2] || match[3], rank: output.length + 1 }, baseUrl));
  return output.filter(Boolean);
}

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const item of items.filter(Boolean).sort((a, b) => a.rank - b.rank)) {
    const key = item.bookId ? `id:${item.bookId}` : `title:${item.title}:${item.author}`;
    if (seen.has(key)) continue;
    seen.add(key); result.push({ ...item, rank: result.length + 1 });
    if (result.length === 10) break;
  }
  return result;
}

function parsePayload(text, contentType, platform, baseUrl) {
  if (/验证码|安全验证|访问过于频繁|captcha|verify you are human/iu.test(text)) throw new Error('ranking_access_challenge');
  const candidates = [];
  if (contentType.includes('json') || /^[\s]*[\[{]/u.test(text)) {
    try { collectJsonBooks(JSON.parse(text), candidates, baseUrl); } catch { /* embedded and HTML fallbacks follow */ }
  }
  for (const value of embeddedJson(text)) collectJsonBooks(value, candidates, baseUrl);
  candidates.push(...(platform === 'qidian' ? parseQidianHtml(text, baseUrl) : parseFanqieHtml(text, baseUrl)));
  return dedupe(candidates);
}

async function readLimitedBody(response, maximumBytes = MAX_RESPONSE_BYTES) {
  if (Number(response.headers.get('content-length') || 0) > maximumBytes) throw new Error('ranking_response_too_large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) { await reader.cancel(); throw new Error('ranking_response_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function secureFetchOnce(source, fetchImpl = fetch) {
  let current = validateRankingUrl(source.source_url, source.platform);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'MojieRankingBot/2.0 (+authorized public metadata only)', accept: 'application/json,text/html;q=0.9' } });
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('ranking_redirect_rejected');
      current = validateRankingUrl(new URL(location, current).toString(), source.platform);
      continue;
    }
    if (response.status === 403) throw new Error('ranking_access_forbidden');
    if (response.status === 429) throw new Error('ranking_rate_limited');
    if (!response.ok) throw new Error(`ranking_http_${response.status}`);
    return { text: await readLimitedBody(response), contentType: response.headers.get('content-type') || '', url: current };
  }
  throw new Error('ranking_redirect_rejected');
}

async function secureFetch(source, fetchImpl = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await secureFetchOnce(source, fetchImpl); }
    catch (error) {
      lastError = error;
      const code = error instanceof Error ? error.message : '';
      if (code !== 'ranking_rate_limited' && !/^ranking_http_5\d\d$/u.test(code)) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt) + 25 * attempt));
    }
  }
  throw lastError;
}

class PlatformRankingAdapterV1 {
  constructor(platform) { this.platform = platform; this.version = 1; }
  parse(text, contentType, baseUrl) { return parsePayload(text, contentType, this.platform, baseUrl); }
  async fetchAndParse(source, fetchImpl) {
    if (source.platform !== this.platform) throw new Error('ranking_adapter_platform_mismatch');
    const response = await secureFetch(source, fetchImpl);
    return { items: this.parse(response.text, response.contentType, response.url), raw: response.text };
  }
}

export class QidianRankingAdapterV1 extends PlatformRankingAdapterV1 { constructor() { super('qidian'); } }
export class FanqieRankingAdapterV1 extends PlatformRankingAdapterV1 { constructor() { super('fanqie'); } }

export function rankingAdapterFor(platform) {
  if (platform === 'qidian') return new QidianRankingAdapterV1();
  if (platform === 'fanqie') return new FanqieRankingAdapterV1();
  throw new Error('ranking_platform_unsupported');
}
