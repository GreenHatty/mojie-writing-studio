import { describe, expect, it } from 'vitest';
import { prepareChapterForPublication } from './publication';

describe('prepareChapterForPublication', () => {
  it('cleans excess blank lines and keeps title separate from body', () => {
    const result = prepareChapterForPublication({
      platform: 'qidian',
      title: ' 第12章 归途 ',
      body: '第一段。\n\n\n\n第二段。',
      advisoryMinimumCharacters: 5
    });

    expect(result.title).toBe('第12章 归途');
    expect(result.body).toBe('第一段。\n\n第二段。');
    expect(result.blockingIssues).toHaveLength(0);
  });

  it('blocks empty content and warns when private-note markers remain', () => {
    const result = prepareChapterForPublication({
      platform: 'fanqie',
      title: '',
      body: '【作者备注】后面补伏笔',
      advisoryMinimumCharacters: 1000
    });

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-title' })
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'private-note-marker' }),
      expect.objectContaining({ code: 'below-advisory-length' })
    ]));
  });

  it('never publishes or stores credentials as part of preparation', () => {
    const result = prepareChapterForPublication({ platform: 'qidian', title: '第1章', body: '正文。' });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('published');
    expect(result.requiresAuthorConfirmation).toBe(true);
  });
});
