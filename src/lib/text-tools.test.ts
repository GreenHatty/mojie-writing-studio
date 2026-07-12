import { describe, expect, it } from 'vitest';
import { findRepeatedPhrases, inspectText, normalizeChinesePunctuation } from './text-tools';

describe('normalizeChinesePunctuation', () => {
  it('normalizes common ASCII punctuation without changing letters or spacing', () => {
    expect(normalizeChinesePunctuation('他说:"你好..." 真的?!')).toBe('他说：“你好……” 真的？！');
  });
});

describe('findRepeatedPhrases', () => {
  it('reports repeated Chinese phrases with their positions', () => {
    const matches = findRepeatedPhrases('他推开门，看见雨。他推开门，看见光。', { minimumLength: 4 });
    expect(matches.some((match) => match.phrase === '他推开门')).toBe(true);
    expect(matches[0]?.occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores configured proper nouns', () => {
    const matches = findRepeatedPhrases('青云宗弟子回到青云宗。', {
      minimumLength: 3,
      ignoredTerms: ['青云宗']
    });
    expect(matches.some((match) => match.phrase.includes('青云宗'))).toBe(false);
  });
});

describe('inspectText', () => {
  it('classifies objective errors separately from style suggestions', () => {
    const issues = inspectText('他说：“这是测试。。然后然后他离开了。', {
      sensitiveWords: [{ term: '测试', platform: '通用', severity: 'review' }],
      overusedWords: ['然后']
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unclosed-pair', severity: 'error' }),
        expect.objectContaining({ code: 'duplicate-punctuation', severity: 'error' }),
        expect.objectContaining({ code: 'sensitive-word', severity: 'review' }),
        expect.objectContaining({ code: 'repeated-word', severity: 'warning' })
      ])
    );
  });

  it('honors the work whitelist and never mutates the source text', () => {
    const source = '玄墨是世界观专用名词。';
    const issues = inspectText(source, {
      sensitiveWords: [{ term: '玄墨', platform: '番茄', severity: 'warning' }],
      whitelist: ['玄墨']
    });

    expect(issues).toHaveLength(0);
    expect(source).toBe('玄墨是世界观专用名词。');
  });
});
