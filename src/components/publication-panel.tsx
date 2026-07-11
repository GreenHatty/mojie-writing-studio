'use client';

import { useMemo, useState } from 'react';
import { prepareChapterForPublication, type PublicationPlatform } from '../lib/publication';

type PublicationPanelProps = {
  chapterTitle: string;
  chapterBody: string;
};

const PLATFORM_LABEL: Record<PublicationPlatform, string> = {
  qidian: '起点中文网',
  fanqie: '番茄免费小说'
};

const AUTHOR_CONSOLE_URL: Record<PublicationPlatform, string | undefined> = {
  qidian: process.env.NEXT_PUBLIC_QIDIAN_AUTHOR_URL,
  fanqie: process.env.NEXT_PUBLIC_FANQIE_AUTHOR_URL
};

export function PublicationPanel({ chapterTitle, chapterBody }: PublicationPanelProps) {
  const [platform, setPlatform] = useState<PublicationPlatform>('qidian');
  const [advisoryMinimum, setAdvisoryMinimum] = useState(1000);
  const [status, setStatus] = useState('');
  const prepared = useMemo(
    () => prepareChapterForPublication({
      platform,
      title: chapterTitle,
      body: chapterBody,
      advisoryMinimumCharacters: advisoryMinimum
    }),
    [advisoryMinimum, chapterBody, chapterTitle, platform]
  );

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label}已复制。正式发布仍需你在平台后台确认。`);
    } catch {
      setStatus('浏览器未允许剪贴板访问，请手动选择复制。');
    }
  }

  const authorUrl = AUTHOR_CONSOLE_URL[platform];

  return (
    <section className="publication-panel">
      <div className="publication-controls">
        <label>
          <span>目标平台</span>
          <select onChange={(event) => setPlatform(event.target.value as PublicationPlatform)} value={platform}>
            <option value="qidian">起点中文网</option>
            <option value="fanqie">番茄免费小说</option>
          </select>
        </label>
        <label>
          <span>本地字数提醒值</span>
          <input
            min={0}
            onChange={(event) => setAdvisoryMinimum(Math.max(0, Number(event.target.value) || 0))}
            type="number"
            value={advisoryMinimum}
          />
        </label>
      </div>

      <div className="publication-summary">
        <strong>{PLATFORM_LABEL[platform]}发布准备</strong>
        <span>{prepared.characterCount} 字</span>
      </div>
      <p className="publication-disclaimer">字数提醒和文本检查是本地辅助，不代表平台官方审核结论。</p>

      {prepared.blockingIssues.length ? (
        <section className="publication-issues is-blocking">
          <h3>需要先处理</h3>
          <ul>{prepared.blockingIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>
        </section>
      ) : null}
      {prepared.warnings.length ? (
        <section className="publication-issues">
          <h3>建议人工复核</h3>
          <ul>{prepared.warnings.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul>
        </section>
      ) : null}

      <div className="publication-preview">
        <label>
          <span>章节标题</span>
          <textarea readOnly value={prepared.title} />
        </label>
        <label>
          <span>正文副本</span>
          <textarea readOnly value={prepared.body} />
        </label>
      </div>

      <div className="publication-actions">
        <button disabled={!prepared.title} onClick={() => void copy(prepared.title, '标题')} type="button">复制标题</button>
        <button disabled={!prepared.body} onClick={() => void copy(prepared.body, '正文')} type="button">复制正文</button>
        {authorUrl ? (
          <a href={authorUrl} rel="noreferrer" target="_blank">打开作者后台</a>
        ) : (
          <span title="需由站点所有者配置对应的公开作者后台地址">作者后台地址未配置</span>
        )}
      </div>
      <p className="publication-status" role="status">{status}</p>
    </section>
  );
}
