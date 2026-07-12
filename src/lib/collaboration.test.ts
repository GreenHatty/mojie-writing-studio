import { describe, expect, it } from 'vitest';
import { normalizeSelectionSnapshot, selectionPreview, validateSuggestionApplication } from './collaboration';

describe('collaboration helpers', () => {
  it('normalizes a selection without allowing negative or inverted ranges', () => {
    expect(normalizeSelectionSnapshot({ chapterId: ' chapter-1 ', from: -8, to: -2, text: '原文' })).toEqual({
      chapterId: 'chapter-1',
      from: 0,
      to: 0,
      paragraphKey: '',
      text: '原文'
    });
  });

  it('only applies suggestions to the unchanged anchored text', () => {
    expect(validateSuggestionApplication('原文', { text: '原文', replacementText: '新文' })).toEqual({ applied: true });
    expect(validateSuggestionApplication('已变化', { text: '原文', replacementText: '新文' })).toEqual({ applied: false, reason: 'stale-anchor' });
    expect(validateSuggestionApplication('原文', { text: '原文', replacementText: '原文' })).toEqual({ applied: false, reason: 'unchanged' });
  });

  it('creates a compact privacy-safe preview', () => {
    expect(selectionPreview('  第一行\n第二行  ', 6)).toBe('第一行 第二…');
  });
});
