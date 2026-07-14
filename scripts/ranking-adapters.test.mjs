import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FanqieRankingAdapterV1, QidianRankingAdapterV1, validateRankingUrl } from './ranking-adapters.mjs';

const fixture = (name) => readFileSync(resolve(process.cwd(), 'test', 'fixtures', 'rankings', name), 'utf8');
const source = (platform, url) => ({ platform, source_url: url });

describe('versioned ranking adapters', () => {
  it('uses platform-specific selectors for normal sanitized pages', () => {
    expect(new QidianRankingAdapterV1().parse(fixture('qidian-normal.html'), 'text/html', new URL('https://www.qidian.com/rank/')).map((item) => item.title)).toEqual(['作品一', '作品二']);
    expect(new FanqieRankingAdapterV1().parse(fixture('fanqie-normal.html'), 'text/html', new URL('https://fanqienovel.com/rank')).map((item) => item.title)).toEqual(['作品一', '作品二']);
  });

  it('falls back to structured embedded data after a page structure change', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"books":[{"bookId":"1","bookName":"脱敏结构化作品","authorName":"作者"}]}</script>';
    expect(new QidianRankingAdapterV1().parse(html, 'text/html', new URL('https://www.qidian.com/rank/'))).toHaveLength(1);
  });

  it('deduplicates works and accepts fewer than ten valid rows', () => {
    const payload = JSON.stringify({ books: [{ bookId: '1', bookName: '脱敏作品甲', authorName: '甲' }, { bookId: '1', bookName: '脱敏作品甲', authorName: '甲' }, { bookId: '2', bookName: '脱敏作品乙', authorName: '乙' }] });
    expect(new FanqieRankingAdapterV1().parse(payload, 'application/json', new URL('https://fanqienovel.com/rank'))).toHaveLength(2);
  });

  it('returns an empty result without manufacturing a snapshot', () => {
    expect(new QidianRankingAdapterV1().parse('<main>empty</main>', 'text/html', new URL('https://www.qidian.com/rank/'))).toEqual([]);
  });

  it.each([[403, 'ranking_access_forbidden'], [429, 'ranking_rate_limited']])('rejects HTTP %i', async (status, code) => {
    const fetchImpl = async () => new Response('', { status });
    await expect(new QidianRankingAdapterV1().fetchAndParse(source('qidian', 'https://www.qidian.com/rank/'), fetchImpl)).rejects.toThrow(code);
  });

  it('rejects challenge pages and unauthorized redirects', async () => {
    const challenge = async () => new Response('请完成验证码', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(new FanqieRankingAdapterV1().fetchAndParse(source('fanqie', 'https://fanqienovel.com/rank'), challenge)).rejects.toThrow('ranking_access_challenge');
    const redirect = async () => new Response('', { status: 302, headers: { location: 'https://127.0.0.1/private' } });
    await expect(new QidianRankingAdapterV1().fetchAndParse(source('qidian', 'https://www.qidian.com/rank/'), redirect)).rejects.toThrow('ranking_host_forbidden');
  });

  it('rejects oversized responses before parsing', async () => {
    const fetchImpl = async () => new Response('x', { headers: { 'content-length': '3000000', 'content-type': 'text/html' } });
    await expect(new QidianRankingAdapterV1().fetchAndParse(source('qidian', 'https://www.qidian.com/rank/'), fetchImpl)).rejects.toThrow('ranking_response_too_large');
  });

  it('requires HTTPS and authorized public hosts', () => {
    expect(() => validateRankingUrl('http://www.qidian.com/rank/', 'qidian')).toThrow('ranking_https_required');
    expect(() => validateRankingUrl('https://localhost/rank/', 'qidian')).toThrow('ranking_host_forbidden');
    expect(() => validateRankingUrl('https://example.com/rank/', 'fanqie')).toThrow('ranking_host_not_authorized');
  });
});
