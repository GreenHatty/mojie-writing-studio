'use client';

import { useMemo, useState } from 'react';
import { findTextMatches, replaceText, replaceTextPreservingHtml } from '../lib/search-replace';
import type { WorkDetail, WritingRepository } from '../lib/repository';

type SearchReplacePanelProps = {
  repository: WritingRepository;
  workId: string;
};

type SearchResult = {
  chapterId: string;
  chapterTitle: string;
  revision: number;
  content: string;
  plainText: string;
  count: number;
  contexts: string[];
};

export function SearchReplacePanel({ repository, workId }: SearchReplacePanelProps) {
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regularExpression, setRegularExpression] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const totalMatches = useMemo(() => results.reduce((sum, result) => sum + result.count, 0), [results]);

  async function search() {
    if (!query) {
      setStatus('请输入查找内容。');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const loaded = await repository.getWork(workId);
      if (!loaded) throw new Error('作品不存在或无访问权限');
      const nextResults: SearchResult[] = [];
      for (const chapter of loaded.volumes.flatMap((volume) => volume.chapters)) {
        const matches = findTextMatches(chapter.plainText, query, {
          caseSensitive,
          regularExpression,
          maximumMatches: 100
        });
        const titleMatches = findTextMatches(chapter.title, query, {
          caseSensitive,
          regularExpression,
          maximumMatches: 20
        });
        const count = matches.length + titleMatches.length;
        if (!count) continue;
        nextResults.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          revision: chapter.revision,
          content: chapter.content,
          plainText: chapter.plainText,
          count,
          contexts: [...titleMatches, ...matches].slice(0, 4).map((match) => match.context)
        });
      }
      setWork(loaded);
      setResults(nextResults);
      setStatus(nextResults.length ? `在 ${nextResults.length} 章中找到 ${nextResults.reduce((sum, result) => sum + result.count, 0)} 处。` : '未找到匹配内容。');
    } catch (error) {
      setResults([]);
      setStatus(error instanceof Error ? error.message : '查找失败。');
    } finally {
      setBusy(false);
    }
  }

  async function replaceAll() {
    if (!work || !results.length || !query) return;
    if (!window.confirm(`将在 ${results.length} 章中替换约 ${totalMatches} 处。每章会先创建“批量替换前”版本，是否继续？`)) return;
    setBusy(true);
    setStatus('');
    try {
      let replacementCount = 0;
      for (const result of results) {
        const titleResult = replaceText(result.chapterTitle, query, replacement, { caseSensitive, regularExpression });
        const bodyResult = replaceText(result.plainText, query, replacement, { caseSensitive, regularExpression });
        const htmlResult = replaceTextPreservingHtml(result.content, query, replacement, { caseSensitive, regularExpression });
        await repository.createSnapshot(result.chapterId, '批量替换前');
        let revision = result.revision;
        if (titleResult.replacements) {
          const renamed = await repository.renameChapter(result.chapterId, titleResult.text);
          revision = renamed.revision;
        }
        const saveResult = await repository.saveChapter(result.chapterId, {
          baseRevision: revision,
          content: htmlResult.html,
          plainText: bodyResult.text,
          savedAt: new Date().toISOString()
        });
        if (saveResult.kind === 'conflict') throw new Error(`章节“${result.chapterTitle}”在替换期间发生版本冲突，已停止后续替换。`);
        replacementCount += titleResult.replacements + Math.max(bodyResult.replacements, htmlResult.replacements);
      }
      setStatus(`替换完成，共处理 ${replacementCount} 处。重新打开作品即可查看最新正文。`);
      setResults([]);
      setWork(await repository.getWork(workId));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '批量替换失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="search-replace-panel">
      <summary>全书查找与安全替换</summary>
      <div className="search-replace-form">
        <label><span>查找</span><input onChange={(event) => setQuery(event.target.value)} value={query} /></label>
        <label><span>替换为</span><input onChange={(event) => setReplacement(event.target.value)} value={replacement} /></label>
        <label className="check-label"><input checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" />区分大小写</label>
        <label className="check-label"><input checked={regularExpression} onChange={(event) => setRegularExpression(event.target.checked)} type="checkbox" />正则表达式</label>
        <button disabled={busy} onClick={() => void search()} type="button">{busy ? '处理中…' : '查找全书'}</button>
      </div>
      {results.length ? (
        <div className="search-results">
          <div className="search-result-summary"><strong>{results.length}章 · {totalMatches}处</strong><button disabled={busy} onClick={() => void replaceAll()} type="button">预览确认后全部替换</button></div>
          <ul>{results.map((result) => <li key={result.chapterId}><strong>{result.chapterTitle}</strong><span>{result.count}处</span>{result.contexts.map((context, index) => <p key={`${context}-${index}`}>{context}</p>)}</li>)}</ul>
        </div>
      ) : null}
      <p className="search-replace-status" role="status">{status}</p>
    </details>
  );
}
