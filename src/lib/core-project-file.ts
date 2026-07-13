import type { JSONContent } from '@tiptap/core';
import { createStoredZip, readZipEntries } from './docx-roundtrip';
import { importProjectJson, type PortableProject, type PortableWork } from './import-export';

export type CorePortableChapter = { id: string; title: string; canonicalContent: JSONContent & { type: 'doc'; schemaVersion: 1 }; plainText: string };
export type CorePortableVolume = { id: string; title: string; chapters: CorePortableChapter[] };
export type CorePortableWork = { id: string; title: string; kind: 'long' | 'short' | 'essay'; volumes: CorePortableVolume[] };
export type CoreProjectPackage = { schemaVersion: 2; exportedAt: string; work: CorePortableWork };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`无效项目包：${label}必须是文本。`);
}

export function plainTextToCanonical(text: string): CorePortableChapter['canonicalContent'] {
  const normalized = text.replace(/\r\n?/gu, '\n');
  const paragraphs = normalized.split('\n').map((paragraph) => ({
    type: 'paragraph',
    ...(paragraph ? { content: [{ type: 'text', text: paragraph }] } : {})
  }));
  return { type: 'doc', schemaVersion: 1, content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
}

function assertCoreProject(value: unknown): asserts value is CoreProjectPackage {
  if (!value || typeof value !== 'object') throw new Error('无效项目包。');
  const project = value as Partial<CoreProjectPackage>;
  if (project.schemaVersion !== 2 || !project.work || typeof project.work !== 'object') throw new Error('不支持的项目包版本。');
  assertString(project.work.id, '作品ID');
  assertString(project.work.title, '作品标题');
  if (!['long', 'short', 'essay'].includes(project.work.kind ?? '')) throw new Error('无效项目包：作品类型。');
  if (!Array.isArray(project.work.volumes)) throw new Error('无效项目包：分卷列表。');
  if (project.work.volumes.length > 500) throw new Error('项目包分卷数量超过 500 个安全上限。');
  let chapterCount = 0;
  for (const volume of project.work.volumes) {
    assertString(volume.id, '分卷ID');
    assertString(volume.title, '分卷标题');
    if (!Array.isArray(volume.chapters)) throw new Error('无效项目包：章节列表。');
    chapterCount += volume.chapters.length;
    if (chapterCount > 10_000) throw new Error('项目包章节数量超过 10000 章安全上限。');
    for (const chapter of volume.chapters) {
      assertString(chapter.id, '章节ID');
      assertString(chapter.title, '章节标题');
      assertString(chapter.plainText, '章节纯文本');
      if (chapter.plainText.length > 10_000_000) throw new Error(`章节“${chapter.title}”超过 1000 万字符安全上限。`);
      if (!chapter.canonicalContent || chapter.canonicalContent.type !== 'doc' || chapter.canonicalContent.schemaVersion !== 1) throw new Error('无效项目包：章节标准正文。');
    }
  }
}

function upgradeLegacyProject(project: PortableProject): CoreProjectPackage {
  return {
    schemaVersion: 2,
    exportedAt: project.exportedAt,
    work: {
      id: project.work.id,
      title: project.work.title,
      kind: project.work.kind,
      volumes: project.work.volumes.map((volume) => ({
        id: volume.id,
        title: volume.title,
        chapters: volume.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, plainText: chapter.plainText, canonicalContent: plainTextToCanonical(chapter.plainText) }))
      }))
    }
  };
}

export function exportCoreProjectJson(project: CoreProjectPackage): string {
  assertCoreProject(project);
  return JSON.stringify(project, null, 2);
}

export function importCoreProjectJson(source: string): CoreProjectPackage {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw new Error('项目包 JSON 解析失败。'); }
  if ((value as { schemaVersion?: number } | null)?.schemaVersion === 1) return upgradeLegacyProject(importProjectJson(source));
  assertCoreProject(value);
  return value;
}

export function exportCoreProjectZip(project: CoreProjectPackage): Uint8Array {
  return createStoredZip([{ name: 'project.json', data: encoder.encode(exportCoreProjectJson(project)) }]);
}

export async function importCoreProjectZip(bytes: Uint8Array): Promise<CoreProjectPackage> {
  const entries = await readZipEntries(bytes, { maximumArchiveBytes: 50 * 1024 * 1024, maximumEntries: 32, maximumUncompressedBytes: 100 * 1024 * 1024 });
  const project = entries.get('project.json');
  if (!project) throw new Error('ZIP 项目包缺少 project.json。');
  return importCoreProjectJson(decoder.decode(project));
}

export function toPortableWork(work: CorePortableWork): PortableWork {
  return { ...work, volumes: work.volumes.map((volume) => ({ ...volume, chapters: volume.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, content: '', plainText: chapter.plainText })) })) };
}

function xml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function paragraph(text: string, bold = false): string {
  return `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

export function exportBasicDocx(work: CorePortableWork): Uint8Array {
  const paragraphs = [paragraph(work.title, true)];
  for (const volume of work.volumes) {
    paragraphs.push(paragraph(volume.title, true));
    for (const chapter of volume.chapters) {
      paragraphs.push(paragraph(chapter.title, true));
      for (const line of chapter.plainText.replace(/\r\n?/gu, '\n').split('\n')) paragraphs.push(paragraph(line));
    }
  }
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const relationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  return createStoredZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(relationships) },
    { name: 'word/document.xml', data: encoder.encode(document) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>') }
  ]);
}
