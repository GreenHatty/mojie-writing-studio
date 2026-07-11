'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, jsonBody } from '../lib/api-client';

type RankingSource = {
  id: string;
  platform: 'qidian' | 'fanqie';
  list_name: string;
  category: string;
  source_url: string;
  enabled: number;
  authorization_note: string;
  last_success_at: string | null;
  last_error: string | null;
};

type RankingItem = {
  rank: number;
  title: string;
  author: string;
  blurb: string;
  tags: string[];
  url: string;
};

type CommonElement = { element: string; count: number; share: number };

type RankingSnapshot = {
  id: string;
  source_id: string;
  ranking_date: string;
  captured_at: string;
  platform?: string;
  list_name?: string;
  category?: string;
  items: RankingItem[];
  commonElements: {
    sampleSize: number;
    common: CommonElement[];
    titlePatterns: Record<string, number>;
    disclaimer: string;
  };
};

const DEFAULT_URLS = {
  qidian: 'https://www.qidian.com/rank/',
  fanqie: 'https://fanqienovel.com/rank'
};

export function RankingAutomationPanel() {
  const [sources, setSources] = useState<RankingSource[]>([]);
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [platform, setPlatform] = useState<'qidian' | 'fanqie'>('qidian');
  const [listName, setListName] = useState('综合榜');
  const [category, setCategory] = useState('全部');
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_URLS.qidian);
  const [authorizationNote, setAuthorizationNote] = useState('已获得平台书面授权，仅抓取公开榜单元数据');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const latestBySource = useMemo(() => {
    const map = new Map<string, RankingSnapshot>();
    for (const snapshot of snapshots) if (!map.has(snapshot.source_id)) map.set(snapshot.source_id, snapshot);
    return map;
  }, [snapshots]);
  const selectedSnapshot = latestBySource.get(selectedSourceId) ?? snapshots[0];

  async function refresh() {
    const [sourceResponse, snapshotResponse] = await Promise.all([
      apiRequest<{ sources: RankingSource[] }>('/api/rankings/sources'),
      apiRequest<{ snapshots: RankingSnapshot[] }>('/api/rankings/snapshots')
    ]);
    setSources(sourceResponse.sources);
    setSnapshots(snapshotResponse.snapshots);
    if (!selectedSourceId && sourceResponse.sources[0]) setSelectedSourceId(sourceResponse.sources[0].id);
  }

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? error.message : '榜单服务读取失败。'));
  }, []);

  async function saveSource() {
    setBusy(true);
    setStatus('');
    try {
      await apiRequest('/api/rankings/sources', {
        method: 'POST',
        body: jsonBody({ platform, listName, category, sourceUrl, authorizationNote, enabled: true })
      });
      await refresh();
      setStatus('榜单来源已保存。Worker 定时任务会自动抓取，也可立即运行。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '榜单来源保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setStatus('');
    try {
      const result = await apiRequest<{ sources: number; successes: number; failures: Array<{ sourceId: string; message: string }> }>('/api/rankings/run', { method: 'POST' });
      await refresh();
      setStatus(`本次处理 ${result.sources} 个来源，成功 ${result.successes} 个${result.failures.length ? `；失败：${result.failures.map((item) => item.message).join('；')}` : '。'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '自动抓取失败。');
    } finally {
      setBusy(false);
    }
  }

  function changePlatform(next: 'qidian' | 'fanqie') {
    setPlatform(next);
    setSourceUrl(DEFAULT_URLS[next]);
  }

  return (
    <details className="ranking-automation-panel" open>
      <summary>起点 / 番茄授权榜单自动抓取</summary>
      <p className="ranking-note">定时任务只访问配置的官方授权域名，读取公开排行榜元数据，并对每个榜单前十名统计题材、机制、身份承诺和冲突承诺等共性元素；不抓取收费章节正文。</p>
      <div className="ranking-source-form">
        <label><span>平台</span><select onChange={(event) => changePlatform(event.target.value as typeof platform)} value={platform}><option value="qidian">起点中文网</option><option value="fanqie">番茄小说</option></select></label>
        <label><span>榜单名称</span><input onChange={(event) => setListName(event.target.value)} placeholder="月票榜 / 阅读榜 / 新书榜" value={listName} /></label>
        <label><span>分类</span><input onChange={(event) => setCategory(event.target.value)} placeholder="玄幻 / 都市 / 古言" value={category} /></label>
        <label className="wide"><span>授权榜单网址</span><input onChange={(event) => setSourceUrl(event.target.value)} type="url" value={sourceUrl} /></label>
        <label className="wide"><span>授权记录</span><textarea onChange={(event) => setAuthorizationNote(event.target.value)} value={authorizationNote} /></label>
        <div className="ranking-form-actions"><button disabled={busy} onClick={() => void saveSource()} type="button">保存自动来源</button><button disabled={busy || !sources.length} onClick={() => void runNow()} type="button">立即抓取全部来源</button></div>
      </div>

      {sources.length ? (
        <div className="ranking-source-list">
          {sources.map((source) => (
            <button className={selectedSourceId === source.id ? 'is-active' : ''} key={source.id} onClick={() => setSelectedSourceId(source.id)} type="button">
              <strong>{source.platform === 'qidian' ? '起点' : '番茄'} · {source.list_name}</strong>
              <span>{source.category}</span>
              <small>{source.last_error || (source.last_success_at ? `最近成功：${new Date(source.last_success_at).toLocaleString('zh-CN')}` : '等待首次抓取')}</small>
            </button>
          ))}
        </div>
      ) : <div className="ranking-empty">尚未配置授权榜单来源。</div>}

      {selectedSnapshot ? (
        <section className="automated-ranking-result">
          <header><div><p className="eyebrow">{selectedSnapshot.ranking_date}</p><h3>{selectedSnapshot.platform === 'qidian' ? '起点' : selectedSnapshot.platform === 'fanqie' ? '番茄' : ''} {selectedSnapshot.list_name} · {selectedSnapshot.category}</h3></div><span>{new Date(selectedSnapshot.captured_at).toLocaleString('zh-CN')}</span></header>
          <div className="hot-elements">
            {selectedSnapshot.commonElements.common.length ? selectedSnapshot.commonElements.common.map((item) => <div key={item.element}><strong>{item.element}</strong><span>{item.count}/{selectedSnapshot.commonElements.sampleSize} · {Math.round(item.share * 100)}%</span></div>) : <p>前十名中暂未识别到内置热点词，请结合标题和简介人工判断。</p>}
          </div>
          <ol className="automated-top-ten">
            {selectedSnapshot.items.map((item) => <li key={`${item.rank}-${item.title}`}><span>{item.rank}</span><div><strong>{item.title}</strong><small>{item.author || '作者未解析'}{item.tags?.length ? ` · ${item.tags.join(' / ')}` : ''}</small><p>{item.blurb || '公开简介未解析'}</p>{item.url ? <a href={item.url} rel="noreferrer" target="_blank">查看公开作品页</a> : null}</div></li>)}
          </ol>
          <footer>{selectedSnapshot.commonElements.disclaimer}</footer>
        </section>
      ) : null}
      <p className="ranking-status" role="status">{status}</p>
    </details>
  );
}
