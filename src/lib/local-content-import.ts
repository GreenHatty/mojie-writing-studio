import { importDocxRoundTrip } from './docx-roundtrip';

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_DOCX_BYTES = 40 * 1024 * 1024;

export type ImportedLocalContent = {
  fileName: string;
  text: string;
  kind: 'text' | 'markdown' | 'html' | 'docx';
};

function htmlToText(source: string): string {
  if (typeof DOMParser === 'undefined') return source.replace(/<[^>]+>/gu, ' ');
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
  return (document.body.textContent ?? '').replace(/\u00a0/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim();
}

async function fileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

export async function readLocalContentFile(file: File): Promise<ImportedLocalContent> {
  const name = file.name.toLocaleLowerCase('zh-CN');
  const isDocx = name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (file.size > (isDocx ? MAX_DOCX_BYTES : MAX_TEXT_BYTES)) {
    throw new Error(isDocx ? 'DOCX 超过 40MB，无法在浏览器中安全读取。' : '文本文件超过 10MB，请拆分后再导入。');
  }

  if (isDocx) {
    const session = await importDocxRoundTrip(await fileBytes(file));
    return { fileName: file.name, kind: 'docx', text: session.paragraphs.map((paragraph) => paragraph.text).join('\n').trim() };
  }

  const source = new TextDecoder().decode(await fileBytes(file));
  if (name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html') {
    return { fileName: file.name, kind: 'html', text: htmlToText(source) };
  }
  if (name.endsWith('.md') || name.endsWith('.markdown') || file.type === 'text/markdown') {
    return { fileName: file.name, kind: 'markdown', text: source.replace(/\r\n?/gu, '\n').trim() };
  }
  return { fileName: file.name, kind: 'text', text: source.replace(/\r\n?/gu, '\n').trim() };
}
