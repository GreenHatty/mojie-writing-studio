import { describe, expect, it } from 'vitest';
import { readLocalContentFile } from './local-content-import';

describe('readLocalContentFile', () => {
  it('normalizes local text and markdown without executing content', async () => {
    const text = await readLocalContentFile(new File(['第一段\r\n第二段'], 'chapter.txt', { type: 'text/plain' }));
    const markdown = await readLocalContentFile(new File(['# 章名\n\n正文'], 'outline.md', { type: 'text/markdown' }));
    expect(text.text).toBe('第一段\n第二段');
    expect(markdown.kind).toBe('markdown');
    expect(markdown.text).toContain('# 章名');
  });

  it('removes executable HTML and imports only visible text', async () => {
    const imported = await readLocalContentFile(new File(['<h1>标题</h1><script>alert(1)</script><p>正文</p>'], 'setting.html', { type: 'text/html' }));
    expect(imported.text).toContain('标题');
    expect(imported.text).toContain('正文');
    expect(imported.text).not.toContain('alert');
  });

  it('rejects oversized text before reading it', async () => {
    const large = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' });
    await expect(readLocalContentFile(large)).rejects.toThrow('10MB');
  });
});
