'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  analyzeSellingPoints,
  parseRankingImport,
  type RankingItem,
  type RankingPlatform
} from '../lib/rankings';

const STORAGE_KEY = 'mojie:ranking-snapshots:v1';

function readStoredItems(): RankingItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RankingItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: RankingItem[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ranking snapshots remain usable in memory if storage is unavailable.
  }
}

export function RankingPanel() {
  const [items, setItems] = useState<RankingItem[]>([]);
  const [platform, setPlatform] = useState<RankingPlatform | '全部'>('全部');
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => setItems(readStoredItems()), []);

  const filtered = useMemo(
    () => items
      .filter((item) => platform === '全部' || item.platform === platform)
      .sort((left, right) => right.date.localeCompare(left.date) || left.rank - right.rank),
    [items, platform]
  );
  const latestDate = filtered[0]?.date;
  const latest = filtered.filter((item) => item.date === latestDate).slice(0, 10);
  const selected = items.find((item) => item.id === selectedId) ?? latest[0];
  const analysis = selected ? analyzeSellingPoints(selected) : null;

  async function importFile(file: File) {
    setStatus('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('榜单文件超过2MB');
      const source = await file.text();
      const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      const imported = parseRankingImport(source, format);
      const byId = new Map(items.map((item) => [item.id, item]));
      for (const item of imported) byId.set(item.id, item);
      const next = [...byId.values()];
      setItems(next);
      persist(next);
      setSelectedId(imported[0]?.id ?? '');
      setStatus(`已保存 ${imported.length} 条前10榜单记录。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '榜单导入失败。');
    }
  }

  function clearSnapshots() {
    if (!window.confirm('清空本浏览器保存的全部榜单快照吗？')) return;
    setItems([]);
    setSelectedId('');
    persist([]);
    setStatus('榜单快照已清空。');
  }

  return (
    <details className="ranking-panel">
      <summary>平台榜单与核心卖点拆解</summary>
      <div className="ranking-toolbar">
        <label><span>平台</span><select onChange={(event) => setPlatform(event.target.value as RankingPlatform | '全部')} value={platform}><option>全部</option><option>起点</option><option>番茄</option></select></label>
        <label className="ranking-file"><span>导入CSV或JSON</span><input accept=".csv,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} type="file" /></label>
        {items.length ? <button onClick={clearSnapshots} type="button">清空快照</button> : null}
      </div>
      <p className="ranking-note">只导入公开书名、作者、标签、简介和链接；不保存或分析付费正文。数据来源与更新时间由导入文件负责。</p>

      {latest.length ? (
        <div className="ranking-content">
          <div>
            <h3>{latestDate} · 前 {latest.length} 名</h3>
            <ol className="ranking-list">
              {latest.map((item) => (
                <li className={item.id === selected?.id ? 'is-active' : ''} key={item.id}>
                  <button onClick={() => setSelectedId(item.id)} type="button">
                    <strong><span>{item.rank}</span>{item.title}</strong>
                    <small>{item.platform} · {item.listName} · {item.category} · {item.author}</small>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {selected && analysis ? (
            <article className="ranking-analysis">
              <header><p className="eyebrow">公开元数据结构推测</p><h3>{selected.title}</h3></header>
              <dl>
                <div><dt>书名结构</dt><dd>{analysis.titleStructure}</dd></div>
                <div><dt>简介钩子</dt><dd>{analysis.blurbHook}</dd></div>
                <div><dt>主角身份</dt><dd>{analysis.protagonistIdentity}</dd></div>
                <div><dt>开局困境</dt><dd>{analysis.openingPredicament}</dd></div>
                <div><dt>核心机制</dt><dd>{analysis.coreMechanism}</dd></div>
                <div><dt>核心情绪</dt><dd>{analysis.coreEmotion}</dd></div>
                <div><dt>标签组合</dt><dd>{analysis.tagCombination}</dd></div>
                <div><dt>前三章任务</dt><dd>{analysis.firstThreeChapterTasks.join('；')}</dd></div>
                <div><dt>可学习结构</dt><dd>{analysis.learnableStructure.join('；')}</dd></div>
                <div><dt>禁止照搬</dt><dd>{analysis.avoidCopying}</dd></div>
              </dl>
              <footer>分析置信度：{analysis.confidence}。{analysis.disclaimer}</footer>
            </article>
          ) : null}
        </div>
      ) : <div className="ranking-empty">尚无榜单快照。请由管理员导入合法来源的CSV或JSON。</div>}
      <p className="ranking-status" role="status">{status}</p>
    </details>
  );
}
