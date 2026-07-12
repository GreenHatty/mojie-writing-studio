'use client';

import { useMemo, useState } from 'react';
import { importProjectJson, splitTextIntoChapters, type ImportedChapter } from '../lib/import-export';
import { createWritingRepository, type WorkDetail, type WritingRepository } from '../lib/repository';

type ImportPanelProps = {
  work: WorkDetail;
  repository?: WritingRepository;
};

type ImportPreview = {
  mode: 'current-work' | 'new-work';
  fileName: string;
  workTitle?: string;
  kind?: WorkDetail['kind'];
  chapters: ImportedChapter[];
};

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function plainTextToHtml(value: string): string {
  const paragraphs = value.replace(/\r\n?/gu, '\n').split(/\n{2,}/u);
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, '<br>')}</p>`).join('');
}

export function ImportPanel({ work, repository: suppliedRepository }: ImportPanelProps) {
  const repository = useMemo(
    () => suppliedRepository ?? createWritingRepository({ ownerId: work.ownerId }),
    [suppliedRepository, work.ownerId]
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function readFile(file: File) {
    setStatus('');
    setPreview(null);
    if (file.size > 10 * 1024 * 1024) {
      setStatus('文件超过10MB，请先拆分后导入。');
      return;
    }
    try {
      const source = await file.text();
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.json') || lowerName.endsWith('.mojie')) {
        const project = importProjectJson(source);
        const chapters = project.work.volumes.flatMap((volume) =>
          volume.chapters.map((chapter) => ({
            title: project.work.volumes.length > 1 ? `${volume.title} · ${chapter.title}` : chapter.title,
            plainText: chapter.plainText
          }))
        );
        setPreview({
          mode: 'new-work',
          fileName: file.name,
          workTitle: project.work.title,
          kind: project.work.kind,
          chapters
        });
      } else {
        setPreview({ mode: 'current-work', fileName: file.name, chapters: splitTextIntoChapters(source) });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '文件读取失败。');
    }
  }

  async function saveChapter(repositoryInstance: WritingRepository, chapterId: string, title: string, plainText: string) {
    const renamed = await repositoryInstance.renameChapter(chapterId, title);
    await repositoryInstance.saveChapter(chapterId, {
      baseRevision: renamed.revision,
      content: plainTextToHtml(plainText),
      plainText,
      savedAt: new Date().toISOString()
    });
  }

  async function importIntoWork(targetWorkId: string, chapters: ImportedChapter[]) {
    const target = await repository.getWork(targetWorkId);
    const volume = target?.volumes[target.volumes.length - 1];
    if (!target || !volume) throw new Error('目标作品或分卷不存在。');
    const existingBlank = volume.chapters.length === 1 && volume.chapters[0]?.wordCount === 0;
    let startIndex = 0;
    if (existingBlank && chapters[0]) {
      await saveChapter(repository, volume.chapters[0]!.id, chapters[0].title, chapters[0].plainText);
      startIndex = 1;
    }
    for (const imported of chapters.slice(startIndex)) {
      const chapter = await repository.createChapter(target.id, volume.id, imported.title);
      await saveChapter(repository, chapter.id, imported.title, imported.plainText);
    }
  }

  async function confirmImport() {
    if (!preview || !preview.chapters.length) return;
    setBusy(true);
    setStatus('');
    try {
      if (preview.mode === 'new-work') {
        const created = await repository.createWork({
          title: preview.workTitle ?? '导入作品',
          kind: preview.kind ?? 'long'
        });
        await importIntoWork(created.work.id, preview.chapters);
      } else {
        await importIntoWork(work.id, preview.chapters);
      }
      setStatus(`已导入 ${preview.chapters.length} 章。请重新载入工作台查看完整目录。`);
      setPreview(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="import-panel">
      <div className="panel-section-heading">
        <div>
          <p className="eyebrow">导入</p>
          <h2>文本与墨界项目包</h2>
        </div>
      </div>
      <p>TXT、Markdown 按“第X章/第X回”等标题拆章；墨界 JSON 项目包作为新作品导入。导入前必须预览并确认。</p>
      <label className="file-picker">
        <span>选择 TXT、MD 或 JSON 文件</span>
        <input accept=".txt,.md,.markdown,.json,.mojie" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
          event.target.value = '';
        }} type="file" />
      </label>
      {preview ? (
        <div className="import-preview">
          <strong>{preview.fileName}</strong>
          <span>{preview.mode === 'new-work' ? `将创建新作品“${preview.workTitle}”` : `将加入“${work.title}”`}</span>
          <ol>{preview.chapters.slice(0, 20).map((chapter, index) => <li key={`${chapter.title}-${index}`}>{chapter.title} · {chapter.plainText.length}字符</li>)}</ol>
          {preview.chapters.length > 20 ? <p>另有 {preview.chapters.length - 20} 章未在预览中展开。</p> : null}
          <div>
            <button onClick={() => setPreview(null)} type="button">取消</button>
            <button disabled={busy} onClick={() => void confirmImport()} type="button">{busy ? '正在导入…' : `确认导入${preview.chapters.length}章`}</button>
          </div>
        </div>
      ) : null}
      <div className="import-status" role="status">
        <span>{status}</span>
        {status.startsWith('已导入') ? <button onClick={() => window.location.reload()} type="button">重新载入工作台</button> : null}
      </div>
    </section>
  );
}
