import { describe, expect, it } from 'vitest';
import { analyzeRankingItems, parseManualRankings } from './mojie-core-operations-api.mjs';

describe('core operations pure boundaries', () => {
  it('normalizes and deduplicates manual JSON ranking imports to at most ten rows', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ rank: index + 1, title: `脱敏作品${index}`, author: '作者', tags: ['玄幻'] }));
    rows.splice(1, 0, { ...rows[0], rank: 2 });
    const parsed = parseManualRankings(JSON.stringify(rows), 'json');
    expect(parsed).toHaveLength(10);
    expect(parsed.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('accepts localized CSV headers without copying unknown fields', () => {
    const parsed = parseManualRankings('排名,作品名,作者,标签,简介,链接\n1,"脱敏,作品",作者甲,系统|玄幻,公开简介,https://example.test/book/1', 'csv');
    expect(parsed[0]).toMatchObject({ rank: 1, title: '脱敏,作品', author: '作者甲', tags: ['系统', '玄幻'] });
    expect(parsed[0]).not.toHaveProperty('password');
  });

  it('rejects empty imports and labels analysis as inference from public metadata', () => {
    expect(() => parseManualRankings('[]', 'json')).toThrow('RANKING_EMPTY_RESULT');
    const analysis = analyzeRankingItems([{ rank: 1, title: '开局觉醒系统', author: '作者', tags: ['高武'], blurb: '逆袭', url: '' }]);
    expect(analysis.common.map((item) => item.element)).toEqual(expect.arrayContaining(['系统', '开局', '高武', '逆袭']));
    expect(analysis.disclaimer).toContain('结构性推测');
  });
});
