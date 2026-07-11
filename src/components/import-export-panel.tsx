'use client';

import { useMemo, useState } from 'react';
import {
  createDownloadBlob,
  exportProjectJson,
  exportWorkAsHtml,
  exportWorkAsMarkdown,
  exportWorkAsText,
  type PortableProject,
  type PortableWork
} from '../lib/import-export';
import type { WorkDetail } from '../lib/repository';
import { PublicationPanel } from './publication-panel';

type ImportExportPanelProps = { work: WorkDetail };

function toPortableWork(work: WorkDetail): PortableWork {
  return {
    id: work.id,
    title: work.title,
    kind: work.kind,
    volumes: work.volumes.map((volume) => ({
      id: volume.id,
      title: volume.title,
      chapters: volume.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        content: chapter.content,
        plainText: chapter.plainText
      }))
    }))
  };
}

function download(content: string, mimeType: string, fileName: string): void {
  const blob = createDownloadBlob(content, mimeType);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(value: string): string {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, '-').trim() || '未命名作品';
}

export function ImportExportPanel({ work }: ImportExportPanelProps) {
  const portableWork = toPortableWork(work);
  const chapters = useMemo(() => work.volumes.flatMap((volume) => volume.chapters), [work]);
  const [selectedChapterId, setSelectedChapterId] = useState(chapters[0]?.id ?? '');
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];
  const fileName = safeFileName(work.title);
  const project: PortableProject = { schemaVersion: 1, exportedAt: new Date().toISOString(), work: portableWork };

  return (
    <section className="import-export-panel">
      <p>导出的发布文件不会包含章节备注。原生项目包用于完整本地备份和以后恢复。</p>
      <div className="export-grid">
        <button onClick={() => download(exportWorkAsText(portableWork), 'text/plain', `${fileName}.txt`)} type="button"><strong>TXT</strong><span>纯文本全书</span></button>
        <button onClick={() => download(exportWorkAsMarkdown(portableWork), 'text/markdown', `${fileName}.md`)} type="button"><strong>Markdown</strong><span>保留目录层级</span></button>
        <button onClick={() => download(exportWorkAsHtml(portableWork), 'text/html', `${fileName}.html`)} type="button"><strong>HTML</strong><span>安全转义预览</span></button>
        <button onClick={() => download(exportProjectJson(project), 'application/json', `${fileName}.mojie.json`)} type="button"><strong>项目包</strong><span>正文与目录备份</span></button>
      </div>
      <div className="export-warning">
        <strong>DOCX说明</strong>
        <p>当前版本尚未提供可靠的复杂 DOCX 往返。不要把 HTML 下载改名为 DOCX；后续接入正式解析器时必须保留原始上传文件。</p>
      </div>
      {selectedChapter ? (
        <div className="publication-workflow">
          <label>
            <span>发布准备章节</span>
            <select onChange={(event) => setSelectedChapterId(event.target.value)} value={selectedChapter.id}>
              {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
            </select>
          </label>
          <PublicationPanel chapterBody={selectedChapter.plainText} chapterTitle={selectedChapter.title} />
        </div>
      ) : null}
    </section>
  );
}
