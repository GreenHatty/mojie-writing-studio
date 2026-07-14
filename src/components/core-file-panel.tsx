'use client';

import { useState } from 'react';
import {
  createCoreChapter,
  createCoreVolume,
  createCoreWork,
  deleteCoreChapter,
  getCoreChapter,
  renameCoreChapter,
  renameCoreVolume,
  saveCoreChapter,
  type CoreWorkDirectory
} from '../lib/core-api';
import { exportBasicDocx, exportCoreProjectJson, exportCoreProjectZip, importCoreProjectJson, importCoreProjectZip, plainTextToCanonical, toPortableWork, type CorePortableWork, type CoreProjectPackage } from '../lib/core-project-file';
import { importDocxRoundTrip, toArrayBuffer } from '../lib/docx-roundtrip';
import { exportWorkAsHtml, exportWorkAsMarkdown, exportWorkAsText, splitTextIntoChapters } from '../lib/import-export';
import { DocxRoundTripPanel } from './docx-roundtrip-panel';

type ImportMode = 'current' | 'new';

function safeFileName(value: string): string { return value.replace(/[^\p{L}\p{N}._-]+/gu, '-').trim() || '未命名作品'; }
function download(content: BlobPart, mimeType: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadPortableWork(directory: CoreWorkDirectory, onProgress: (message: string) => void): Promise<CorePortableWork> {
  const result: CorePortableWork = { id: directory.id, title: directory.title, kind: directory.kind, volumes: directory.volumes.map((volume) => ({ id: volume.id, title: volume.title, chapters: [] })) };
  const chapters = directory.volumes.flatMap((volume) => volume.chapters.map((chapter) => ({ volumeId: volume.id, chapter })));
  for (let start = 0; start < chapters.length; start += 4) {
    const batch = chapters.slice(start, start + 4);
    const loaded = await Promise.all(batch.map(({ chapter }) => getCoreChapter(chapter.id)));
    loaded.forEach((chapter, index) => {
      const volume = result.volumes.find((item) => item.id === batch[index]!.volumeId)!;
      volume.chapters.push({ id: chapter.id, title: chapter.title, canonicalContent: { ...chapter.canonicalContent, schemaVersion: 1 }, plainText: chapter.plainText });
    });
    onProgress(`正在读取正文 ${Math.min(start + batch.length, chapters.length)}/${chapters.length}`);
  }
  return result;
}

function projectFromChapters(title: string, chapters: Array<{ title: string; plainText: string }>): CoreProjectPackage {
  return { schemaVersion: 2, exportedAt: new Date().toISOString(), work: { id: crypto.randomUUID(), title, kind: 'long', volumes: [{ id: crypto.randomUUID(), title: '导入内容', chapters: chapters.map((chapter) => ({ id: crypto.randomUUID(), title: chapter.title, plainText: chapter.plainText, canonicalContent: plainTextToCanonical(chapter.plainText) })) }] } };
}

function chaptersFromHtml(source: string): Array<{ title: string; plainText: string }> {
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script,style,iframe,object').forEach((node) => node.remove());
  const articles = [...document.querySelectorAll('article')];
  if (articles.length) return articles.map((article, index) => ({ title: article.querySelector('h3')?.textContent?.trim() || `第${index + 1}章`, plainText: [...article.querySelectorAll('p,blockquote,pre,li')].map((node) => node.textContent?.trim() || '').filter(Boolean).join('\n\n') }));
  const text = [...document.body.querySelectorAll('h1,h2,h3,h4,p,blockquote,pre,li')].map((node) => node.textContent?.trim() || '').filter(Boolean).join('\n');
  return splitTextIntoChapters(text);
}

export function CoreFilePanel({ directory, userId, csrf, onImported }: { directory: CoreWorkDirectory; userId: string; csrf: string; onImported(workId: string, chapterId?: string): Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<CoreProjectPackage | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [mode, setMode] = useState<ImportMode>('current');

  async function exportFile(kind: 'txt' | 'md' | 'html' | 'json' | 'zip' | 'docx') {
    setBusy(true); setStatus('正在读取作品正文…');
    try {
      const work = await loadPortableWork(directory, setStatus);
      const base = safeFileName(work.title);
      if (kind === 'txt') download(exportWorkAsText(toPortableWork(work)), 'text/plain;charset=utf-8', `${base}.txt`);
      if (kind === 'md') download(exportWorkAsMarkdown(toPortableWork(work)), 'text/markdown;charset=utf-8', `${base}.md`);
      if (kind === 'html') download(exportWorkAsHtml(toPortableWork(work)), 'text/html;charset=utf-8', `${base}.html`);
      const project: CoreProjectPackage = { schemaVersion: 2, exportedAt: new Date().toISOString(), work };
      if (kind === 'json') download(exportCoreProjectJson(project), 'application/json;charset=utf-8', `${base}.mojie.json`);
      if (kind === 'zip') download(toArrayBuffer(exportCoreProjectZip(project)), 'application/zip', `${base}.mojie.zip`);
      if (kind === 'docx') download(toArrayBuffer(exportBasicDocx(work)), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${base}.docx`);
      setStatus('导出完成。私人备注、批注和登录信息均未写入导出文件。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '导出失败。'); }
    finally { setBusy(false); }
  }

  async function readImport(file: File) {
    setBusy(true); setStatus('正在解析文件…'); setPreview(null);
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('导入文件不能超过 100MB。');
      const lower = file.name.toLocaleLowerCase();
      let project: CoreProjectPackage;
      if (lower.endsWith('.zip')) project = await importCoreProjectZip(new Uint8Array(await file.arrayBuffer()));
      else if (lower.endsWith('.json') || lower.endsWith('.mojie')) project = importCoreProjectJson(await file.text());
      else if (lower.endsWith('.docx')) {
        const docx = await importDocxRoundTrip(await file.arrayBuffer());
        project = projectFromChapters(file.name.replace(/\.docx$/iu, ''), splitTextIntoChapters(docx.paragraphs.map((item) => item.text).join('\n')));
      } else if (lower.endsWith('.html') || lower.endsWith('.htm')) project = projectFromChapters(file.name.replace(/\.html?$/iu, ''), chaptersFromHtml(await file.text()));
      else {
        const source = await file.text();
        const normalized = lower.endsWith('.md') || lower.endsWith('.markdown') ? source.replace(/^#{1,6}\s+/gmu, '') : source;
        project = projectFromChapters(file.name.replace(/\.[^.]+$/u, ''), splitTextIntoChapters(normalized));
      }
      setPreview(project); setPreviewName(file.name);
      const count = project.work.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
      setStatus(`已解析 ${project.work.volumes.length} 卷、${count} 章；确认前不会写入作品。`);
    } catch (error) { setStatus(error instanceof Error ? error.message : '文件解析失败。'); }
    finally { setBusy(false); }
  }

  async function saveImportedChapter(workId: string, volumeId: string, chapter: CorePortableWork['volumes'][number]['chapters'][number], existingChapterId?: string): Promise<string> {
    const targetId = existingChapterId ?? (await createCoreChapter(workId, { volumeId, title: chapter.title }, csrf)).id;
    if (existingChapterId) await renameCoreChapter(targetId, chapter.title, csrf);
    const saved = await saveCoreChapter({ chapterId: targetId, baseRevision: 0, canonicalContent: chapter.canonicalContent, clientOperationId: crypto.randomUUID() }, csrf);
    if (saved.kind !== 'saved') throw new Error(`导入章节“${chapter.title}”时发生版本冲突。`);
    return targetId;
  }

  async function importIntoWork(project: CoreProjectPackage) {
    let targetWorkId = directory.id;
    let firstChapterId: string | undefined;
    if (mode === 'new') {
      const created = await createCoreWork({ title: project.work.title || '导入作品', kind: project.work.kind }, csrf);
      targetWorkId = created.work.id;
      const firstVolume = project.work.volumes[0];
      if (firstVolume) await renameCoreVolume(targetWorkId, created.volume.id, firstVolume.title, csrf);
      let usedDefaultChapter = false;
      let importedAnyChapter = false;
      for (let volumeIndex = 0; volumeIndex < project.work.volumes.length; volumeIndex += 1) {
        const volume = project.work.volumes[volumeIndex]!;
        const targetVolumeId = volumeIndex === 0 ? created.volume.id : (await createCoreVolume(targetWorkId, volume.title, csrf)).id;
        for (const chapter of volume.chapters) {
          const useDefault = volumeIndex === 0 && !usedDefaultChapter;
          const id = await saveImportedChapter(targetWorkId, targetVolumeId, chapter, useDefault ? created.chapter.id : undefined);
          firstChapterId ??= id; importedAnyChapter = true; if (useDefault) usedDefaultChapter = true;
        }
      }
      if (importedAnyChapter && !usedDefaultChapter) await deleteCoreChapter(created.chapter.id, csrf, '导入时移除空白初始章节');
    } else {
      for (const volume of project.work.volumes) {
        const targetVolume = await createCoreVolume(targetWorkId, volume.title || '导入内容', csrf);
        for (const chapter of volume.chapters) {
          const id = await saveImportedChapter(targetWorkId, targetVolume.id, chapter);
          firstChapterId ??= id;
        }
      }
    }
    await onImported(targetWorkId, firstChapterId);
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true); setStatus('正在导入；每章独立保存，失败不会覆盖现有正文。');
    try { await importIntoWork(preview); setPreview(null); setStatus('导入完成。'); }
    catch (error) { setStatus(error instanceof Error ? error.message : '导入失败。'); }
    finally { setBusy(false); }
  }

  return <section className="core-file-panel">
    <div className="panel-section-heading"><div><p className="eyebrow">导入、导出与备份</p><h2>作品文件</h2></div></div>
    <p>导出正文不包含私人备注。项目包保留带 schemaVersion 的标准正文；DOCX 普通导出为基础兼容格式。</p>
    <div className="export-grid">
      {(['txt', 'md', 'html', 'json', 'zip', 'docx'] as const).map((kind) => <button disabled={busy} key={kind} onClick={() => void exportFile(kind)} type="button"><strong>{kind === 'md' ? 'Markdown' : kind === 'json' ? '项目 JSON' : kind === 'zip' ? '项目 ZIP' : kind.toUpperCase()}</strong><span>{kind === 'docx' ? '基础 Word 文档' : kind === 'zip' || kind === 'json' ? '正文与目录备份' : '可阅读正文'}</span></button>)}
    </div>
    <div className="core-import-box">
      <label className="file-picker"><span>选择 TXT、Markdown、HTML、JSON、ZIP 或 DOCX</span><input accept=".txt,.md,.markdown,.html,.htm,.json,.mojie,.zip,.docx" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImport(file); event.target.value = ''; }} type="file" /></label>
      <label><span>导入位置</span><select onChange={(event) => setMode(event.target.value as ImportMode)} value={mode}><option value="current">作为新分卷加入当前作品</option><option value="new">创建新作品</option></select></label>
      {preview ? <div className="import-preview"><strong>{previewName}</strong><span>{preview.work.title} · {preview.work.volumes.length} 卷 · {preview.work.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0)} 章</span><ol>{preview.work.volumes.flatMap((volume) => volume.chapters).slice(0, 20).map((chapter) => <li key={chapter.id}>{chapter.title} · {chapter.plainText.length} 字符</li>)}</ol><div><button onClick={() => setPreview(null)} type="button">取消</button><button disabled={busy} onClick={() => void confirmImport()} type="button">确认导入</button></div></div> : null}
    </div>
    <DocxRoundTripPanel userId={userId} workId={directory.id} />
    <p className="import-status" role="status">{status}</p>
  </section>;
}
