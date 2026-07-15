import { describe, expect, it } from 'vitest';
import { formatWebficText } from '../src/lib/webfic-formatting';

describe('formatWebficText', () => {
  it('splits long narration into two or three sentence reading paragraphs', () => {
    const source = '雨连续下了三天。城门外的河水已经漫过石阶。守城人仍没有敲响警钟。沈砚把最后一袋粮食交给妹妹。他知道今晚必须离开。再迟一步，所有人都会被困在城里。';
    const result = formatWebficText(source, 'standard');
    expect(result.formattedParagraphs).toBeGreaterThan(1);
    expect(result.text.replace(/\n/gu, '')).toBe(source);
  });

  it('uses shorter paragraphs for mobile reading', () => {
    const source = '第一盏灯熄灭了。第二盏灯也开始闪烁。走廊尽头传来脚步声。她把钥匙攥进手心。门外的人没有敲门。他只是慢慢念出了她的名字。';
    expect(formatWebficText(source, 'mobile').formattedParagraphs).toBeGreaterThan(formatWebficText(source, 'standard').formattedParagraphs);
  });

  it('keeps headings and dialogue-first paragraphs independent', () => {
    const source = '第一章 雨夜\n\n“你终于来了。”他放下茶杯。\n\n门外的雨越来越大。';
    const result = formatWebficText(source, 'standard');
    expect(result.text.split('\n')).toEqual(['第一章 雨夜', '“你终于来了。”他放下茶杯。', '门外的雨越来越大。']);
  });
});
