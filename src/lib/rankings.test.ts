import { describe, expect, it } from 'vitest';
import { analyzeSellingPoints, parseRankingImport } from './rankings';

describe('parseRankingImport', () => {
  it('imports CSV metadata, sorts ranks and keeps only top ten per list', () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      `2026-07-11,起点,男频月票榜,玄幻,${12 - index},作品${index + 1},作者${index + 1},系统|升级,连载,100000,公开简介${index + 1},https://example.com/${index + 1}`
    );
    const csv = ['日期,平台,榜单,分类,排名,作品名,作者,标签,状态,字数,简介,链接', ...rows].join('\n');
    const items = parseRankingImport(csv, 'csv');

    expect(items).toHaveLength(10);
    expect(items[0]?.rank).toBe(1);
    expect(items[9]?.rank).toBe(10);
    expect(items.every((item) => item.sourceStatus === 'manual-import')).toBe(true);
  });

  it('imports JSON arrays and rejects missing public metadata', () => {
    const source = JSON.stringify([
      {
        date: '2026-07-11', platform: '番茄', listName: '男频热门榜', category: '都市', rank: 1,
        title: '示例作品', author: '示例作者', tags: ['高武'], status: '连载', publicWordCount: 50000,
        blurb: '公开简介', publicUrl: 'https://example.com/book'
      }
    ]);
    expect(parseRankingImport(source, 'json')).toEqual([
      expect.objectContaining({ title: '示例作品', platform: '番茄', rank: 1 })
    ]);
    expect(() => parseRankingImport('[{"rank":1}]', 'json')).toThrow(/缺少/u);
  });
});

describe('analyzeSellingPoints', () => {
  it('only analyzes public title tags and blurb and marks the result as inference', () => {
    const result = analyzeSellingPoints({
      id: 'item-1', date: '2026-07-11', platform: '番茄', listName: '热门榜', category: '都市', rank: 1,
      title: '开局觉醒万倍修炼系统', author: '作者', tags: ['系统', '高武', '升级'], status: '连载',
      publicWordCount: 100000, blurb: '普通学生在觉醒仪式得到受限系统，并必须在七天后守住城市。',
      publicUrl: 'https://example.com', importedAt: '2026-07-11T00:00:00.000Z', sourceStatus: 'manual-import'
    });

    expect(result.titleStructure).toContain('开局');
    expect(result.coreMechanism).toContain('系统');
    expect(result.disclaimer).toMatch(/公开书名、标签和简介/u);
    expect(result).not.toHaveProperty('body');
  });
});
