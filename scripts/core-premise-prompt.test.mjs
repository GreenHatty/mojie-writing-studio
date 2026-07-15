import { describe, expect, it } from 'vitest';
import { CORE_PREMISE_SYSTEM_PROMPT } from './core-premise-prompt.mjs';

describe('core premise optimizer prompt', () => {
  it('keeps the requested five-stage relationship-reset workflow intact', () => {
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('强行重置人与人之间的相处规则');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('看点');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('爽点');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('热点');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('第一步·接收与确认');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('第五步·确保长效张力');
    expect(CORE_PREMISE_SYSTEM_PROMPT).toContain('拒绝空泛的鼓励');
  });
});
