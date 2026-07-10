import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WritingStudio } from './writing-studio';

describe('WritingStudio server rendering', () => {
  it('does not create a browser storage connection while the page is prerendered', () => {
    expect(() => renderToString(<WritingStudio />)).not.toThrow();
  });
});
