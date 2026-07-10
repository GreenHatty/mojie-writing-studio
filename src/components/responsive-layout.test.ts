import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'app', 'globals.css'), 'utf8');

describe('responsive writing layout', () => {
  it('keeps the context drawer trigger available on tablet layouts', () => {
    const tabletStyles = stylesheet
      .split('@media (max-width: 1080px) {')[1]
      .split('@media (max-width: 720px) {')[0];

    expect(tabletStyles).toContain('.tablet-context-button { display: inline-flex;');
  });
});
