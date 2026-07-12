import { describe, expect, it } from 'vitest';
import { buildPlanningCard, filterTemplates, WRITING_TEMPLATES } from './templates';

describe('filterTemplates', () => {
  it('combines platform, audience, length, genre and element filters', () => {
    const results = filterTemplates(WRITING_TEMPLATES, {
      platform: '番茄',
      audience: '男频',
      length: '长篇',
      genre: '都市高武',
      elements: ['系统', '群像']
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual(
      expect.objectContaining({ platform: '番茄', audience: '男频', length: '长篇' })
    );
    expect(results[0]?.elements).toEqual(expect.arrayContaining(['系统', '群像']));
  });

  it('contains representative male, female and short-story templates', () => {
    expect(WRITING_TEMPLATES.some((item) => item.genre === '凡人流')).toBe(true);
    expect(WRITING_TEMPLATES.some((item) => item.genre === '现言甜宠')).toBe(true);
    expect(WRITING_TEMPLATES.some((item) => item.length === '短故事')).toBe(true);
  });
});

describe('buildPlanningCard', () => {
  it('creates an editable planning card without generating full prose', () => {
    const template = WRITING_TEMPLATES.find((item) => item.genre === '都市高武');
    expect(template).toBeDefined();
    const card = buildPlanningCard(template!, ['系统', '群像']);

    expect(card.templateId).toBe(template!.id);
    expect(card.sections.map((section) => section.key)).toEqual(
      expect.arrayContaining(['premise', 'protagonist', 'conflict', 'firstChapter', 'firstVolume'])
    );
    expect(card.generatedProse).toBeUndefined();
    expect(card.selectedElements).toEqual(['系统', '群像']);
  });
});
