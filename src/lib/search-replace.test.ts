import { describe, expect, it } from 'vitest';
import { findTextMatches, replaceTextPreservingHtml } from './search-replace';

describe('findTextMatches', () => {
  it('finds exact matches with context and case options', () => {
    const matches = findTextMatches('Alpha alpha 阿尔法', 'alpha', { caseSensitive: false });
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual(expect.objectContaining({ start: 0, end: 5 }));
  });

  it('supports regular expressions but rejects invalid patterns', () => {
    expect(findTextMatches('第1章 第12章', '第\\d+章', { regularExpression: true })).toHaveLength(2);
    expect(() => findTextMatches('正文', '[', { regularExpression: true })).toThrow(/正则/u);
  });
});

describe('replaceTextPreservingHtml', () => {
  it('replaces only text nodes and preserves paragraph and formatting tags', () => {
    const result = replaceTextPreservingHtml('<p>沈砚看见<b>沈砚</b>。</p>', '沈砚', '谢昭');
    expect(result.html).toBe('<p>谢昭看见<b>谢昭</b>。</p>');
    expect(result.replacements).toBe(2);
  });

  it('does not alter tag attributes that happen to contain the query', () => {
    const result = replaceTextPreservingHtml('<p data-name="沈砚">沈砚</p>', '沈砚', '谢昭');
    expect(result.html).toBe('<p data-name="沈砚">谢昭</p>');
  });
});
