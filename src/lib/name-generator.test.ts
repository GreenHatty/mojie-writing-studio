import { describe, expect, it } from 'vitest';
import { generateNames } from './name-generator';

describe('generateNames', () => {
  it('generates deterministic unique names for a seed', () => {
    const first = generateNames({ category: '古代中文姓名', count: 5, seed: 42 });
    const second = generateNames({ category: '古代中文姓名', count: 5, seed: 42 });

    expect(first).toEqual(second);
    expect(new Set(first.map((item) => item.value)).size).toBe(5);
    expect(first.every((item) => item.meaning.length > 0)).toBe(true);
  });

  it('avoids existing character names and rare characters when requested', () => {
    const results = generateNames({
      category: '现代中文姓名',
      count: 12,
      seed: 7,
      avoid: ['林知夏', '顾言'],
      avoidRareCharacters: true
    });

    expect(results.map((item) => item.value)).not.toContain('林知夏');
    expect(results.map((item) => item.value)).not.toContain('顾言');
    expect(results.every((item) => /^[\u4e00-\u9fa5]{2,4}$/u.test(item.value))).toBe(true);
  });

  it('supports world-building categories', () => {
    const results = generateNames({ category: '宗门名', count: 3, seed: 99 });
    expect(results).toHaveLength(3);
    expect(results.every((item) => /宗|门|宫|谷|阁|山庄/u.test(item.value))).toBe(true);
  });
});
