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

  it('uses genre-specific story engines instead of one duplicated formula', () => {
    const genres = ['凡人流', '幕后流', '无限流', '历史穿越', '宫斗', '现言甜宠', '快穿'];
    const selected = genres.map((genre) => WRITING_TEMPLATES.find((item) => item.genre === genre)!);
    expect(new Set(selected.map((item) => item.storyFormula)).size).toBe(genres.length);
    expect(selected.find((item) => item.genre === '凡人流')?.storyFormula).toContain('灵药');
    expect(selected.find((item) => item.genre === '幕后流')?.mechanismLimits).toContain('马甲');
    expect(selected.find((item) => item.genre === '宫斗')?.minimumWorldbuilding).toContain('品级权限');
    expect(selected.find((item) => item.genre === '现言甜宠')?.commonMistakes.join('')).toContain('事业线');
  });

  it('gives every genre a complete, genre-matched success example', () => {
    for (const template of WRITING_TEMPLATES) {
      expect(template.successExample.caseTitle).toContain(template.genre);
      expect(template.successExample.genrePromise.length).toBeGreaterThan(35);
      expect(template.successExample.openingProof.length).toBeGreaterThan(30);
      expect(template.successExample.mechanismAndCost).toContain(template.specialMechanism);
      expect(template.successExample.firstArc.length).toBeGreaterThan(30);
      expect(template.successExample.microInnovation).toContain(template.genre);
      expect(template.successExample.whyItWorks).toContain(template.genre);
    }
    const selected = ['凡人流', '幕后流', '宫斗', '现言甜宠', '规则怪谈'].map((genre) => WRITING_TEMPLATES.find((item) => item.genre === genre)!.successExample.openingProof);
    expect(new Set(selected).size).toBe(selected.length);
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
