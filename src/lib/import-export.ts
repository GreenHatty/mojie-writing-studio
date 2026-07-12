export type PortableChapter = {
  id: string;
  title: string;
  content: string;
  plainText: string;
  notes?: string;
};

export type PortableVolume = {
  id: string;
  title: string;
  chapters: PortableChapter[];
};

export type PortableWork = {
  id: string;
  title: string;
  kind: 'long' | 'short' | 'essay';
  volumes: PortableVolume[];
};

export type PortableProject = {
  schemaVersion: 1;
  exportedAt: string;
  work: PortableWork;
};

export type ImportedChapter = {
  title: string;
  plainText: string;
};

const CHAPTER_HEADING = /^\s*(第[零〇一二三四五六七八九十百千万两0-9]+[章节回卷幕篇][^\n]*)\s*$/u;

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`无效项目文件：${label}必须是文本`);
}

function assertPortableProject(value: unknown): asserts value is PortableProject {
  if (!value || typeof value !== 'object') throw new Error('无效项目文件');
  const project = value as Partial<PortableProject>;
  if (project.schemaVersion !== 1) throw new Error('不支持的项目文件版本');
  if (!project.work || typeof project.work !== 'object') throw new Error('无效项目文件：缺少作品');
  assertString(project.work.id, '作品ID');
  assertString(project.work.title, '作品标题');
  if (!['long', 'short', 'essay'].includes(project.work.kind ?? '')) throw new Error('无效项目文件：作品类型');
  if (!Array.isArray(project.work.volumes)) throw new Error('无效项目文件：缺少分卷');
  for (const volume of project.work.volumes) {
    assertString(volume.id, '分卷ID');
    assertString(volume.title, '分卷标题');
    if (!Array.isArray(volume.chapters)) throw new Error('无效项目文件：章节列表');
    for (const chapter of volume.chapters) {
      assertString(chapter.id, '章节ID');
      assertString(chapter.title, '章节标题');
      assertString(chapter.content, '章节内容');
      assertString(chapter.plainText, '章节纯文本');
      if (chapter.notes !== undefined) assertString(chapter.notes, '章节备注');
    }
  }
}

export function splitTextIntoChapters(source: string): ImportedChapter[] {
  const normalized = source.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return [{ title: '第1章', plainText: '' }];
  const lines = normalized.split('\n');
  const chapters: ImportedChapter[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentTitle && currentBody.length === 0) return;
    chapters.push({
      title: currentTitle || `第${chapters.length + 1}章`,
      plainText: currentBody.join('\n').trim()
    });
    currentTitle = '';
    currentBody = [];
  };

  for (const line of lines) {
    const match = line.match(CHAPTER_HEADING);
    if (match) {
      flush();
      currentTitle = match[1]!.trim();
      continue;
    }
    currentBody.push(line);
  }
  flush();

  return chapters.length ? chapters : [{ title: '第1章', plainText: normalized }];
}

export function exportProjectJson(project: PortableProject): string {
  assertPortableProject(project);
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(source: string): PortableProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('无效项目文件：JSON解析失败');
  }
  assertPortableProject(parsed);
  return parsed;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function markdownEscapeTitle(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>-])/gu, '\\$1');
}

export function exportWorkAsText(work: PortableWork): string {
  return work.volumes
    .flatMap((volume) => [
      volume.title,
      '',
      ...volume.chapters.flatMap((chapter) => [chapter.title, chapter.plainText.trim(), ''])
    ])
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function exportWorkAsMarkdown(work: PortableWork): string {
  const sections = [`# ${markdownEscapeTitle(work.title)}`];
  for (const volume of work.volumes) {
    sections.push(`## ${markdownEscapeTitle(volume.title)}`);
    for (const chapter of volume.chapters) {
      sections.push(`### ${markdownEscapeTitle(chapter.title)}`);
      sections.push(chapter.plainText.trim());
    }
  }
  return `${sections.join('\n\n').trim()}\n`;
}

export function exportWorkAsHtml(work: PortableWork): string {
  const body: string[] = [`<h1>${escapeHtml(work.title)}</h1>`];
  for (const volume of work.volumes) {
    body.push(`<h2>${escapeHtml(volume.title)}</h2>`);
    for (const chapter of volume.chapters) {
      body.push(`<article><h3>${escapeHtml(chapter.title)}</h3>`);
      for (const paragraph of chapter.plainText.replace(/\r\n?/gu, '\n').split(/\n{2,}/u)) {
        body.push(`<p>${escapeHtml(paragraph).replace(/\n/gu, '<br>')}</p>`);
      }
      body.push('</article>');
    }
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(work.title)}</title></head><body>${body.join('')}</body></html>`;
}

export function createDownloadBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: `${mimeType};charset=utf-8` });
}
