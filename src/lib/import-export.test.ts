import { describe, expect, it } from 'vitest';
import {
  exportProjectJson,
  exportWorkAsHtml,
  exportWorkAsMarkdown,
  importProjectJson,
  splitTextIntoChapters,
  type PortableProject
} from './import-export';

const project: PortableProject = {
  schemaVersion: 1,
  exportedAt: '2026-07-11T00:00:00.000Z',
  work: {
    id: 'work-1',
    title: '山河既白',
    kind: 'long',
    volumes: [
      {
        id: 'volume-1',
        title: '第一卷',
        chapters: [
          {
            id: 'chapter-1',
            title: '第1章 雨夜',
            content: '<p>他推开门。</p>',
            plainText: '他推开门。',
            notes: '这是作者备注'
          }
        ]
      }
    ]
  }
};

describe('splitTextIntoChapters', () => {
  it('splits common Chinese chapter headings and preserves body text', () => {
    const chapters = splitTextIntoChapters('第1章 雨夜\n他推开门。\n\n第二章 旧城\n天亮了。');
    expect(chapters).toEqual([
      { title: '第1章 雨夜', plainText: '他推开门。' },
      { title: '第二章 旧城', plainText: '天亮了。' }
    ]);
  });

  it('creates one unnamed chapter when no heading exists', () => {
    expect(splitTextIntoChapters('只有一段正文。')).toEqual([
      { title: '第1章', plainText: '只有一段正文。' }
    ]);
  });
});

describe('project round trip', () => {
  it('exports and imports a validated project without losing the directory', () => {
    const restored = importProjectJson(exportProjectJson(project));
    expect(restored.work.title).toBe('山河既白');
    expect(restored.work.volumes[0]?.chapters[0]?.plainText).toBe('他推开门。');
  });

  it('rejects malformed or unsupported project files', () => {
    expect(() => importProjectJson('{"schemaVersion":99}')).toThrow(/不支持|无效/u);
  });
});

describe('publishing exports', () => {
  it('excludes private notes from Markdown and HTML', () => {
    const markdown = exportWorkAsMarkdown(project.work);
    const html = exportWorkAsHtml(project.work);
    expect(markdown).not.toContain('这是作者备注');
    expect(html).not.toContain('这是作者备注');
  });

  it('escapes unsafe HTML from titles and plain text', () => {
    const unsafe: PortableProject['work'] = {
      ...project.work,
      title: '<script>alert(1)</script>',
      volumes: [
        {
          ...project.work.volumes[0]!,
          chapters: [
            {
              ...project.work.volumes[0]!.chapters[0]!,
              plainText: '<img src=x onerror=alert(1)>'
            }
          ]
        }
      ]
    };
    const html = exportWorkAsHtml(unsafe);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
