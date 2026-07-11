import { describe, expect, it } from 'vitest';
import {
  analyzeChapterRhythm,
  buildScenePlan,
  createNovelBlurb,
  generateEndingHooks,
  tightenChineseText
} from './writing-assistant';

describe('analyzeChapterRhythm', () => {
  it('measures dialogue ratio, paragraph rhythm and hook strength', () => {
    const result = analyzeChapterRhythm('“别回头。”沈砚低声道。\n\n门外忽然传来第三个人的脚步声。');
    expect(result.paragraphCount).toBe(2);
    expect(result.dialogueRatio).toBeGreaterThan(0);
    expect(result.endingHook.level).toBe('strong');
  });
});

describe('buildScenePlan', () => {
  it('creates an executable scene beat chain', () => {
    const beats = buildScenePlan({
      viewpoint: '沈砚',
      goal: '拿到账册',
      conflict: '守卫提前换班',
      reveal: '账册是伪造的',
      consequence: '真正的账册已被送入宫中'
    });
    expect(beats).toHaveLength(8);
    expect(beats.join(' ')).toContain('守卫提前换班');
    expect(beats.join(' ')).toContain('真正的账册已被送入宫中');
  });
});

describe('createNovelBlurb', () => {
  it('combines identity, goal, mechanism and stakes without inventing names', () => {
    const blurb = createNovelBlurb({
      protagonist: '姜瑾',
      identity: '亡国公主',
      goal: '夺回故土',
      obstacle: '三方诸侯围剿',
      mechanism: '能看见军队士气',
      stakes: '失败则最后一座城也会陷落'
    });
    expect(blurb).toContain('姜瑾');
    expect(blurb).toContain('能看见军队士气');
    expect(blurb).toContain('最后一座城');
  });
});

describe('text helpers', () => {
  it('generates ending hooks and removes common filler conservatively', () => {
    expect(generateEndingHooks('他推开门。', '门后的人本应已经死去')).toHaveLength(4);
    expect(tightenChineseText('他不由得慢慢地抬起头，然后看向门外。')).toBe('他抬起头，看向门外。');
  });
});
