'use client';

import { lazy, Suspense, useState } from 'react';

import type { WorkKind, WorkRecord } from '../lib/repository';
import { CreateWorkForm } from './create-work-form';
import { AuxiliaryErrorBoundary } from './auxiliary-error-boundary';

const RankingAutomationPanel = lazy(() => import('./ranking-automation-panel').then((module) => ({ default: module.RankingAutomationPanel })));

type WorkspaceDashboardProps = {
  works: WorkRecord[];
  creating?: boolean;
  todayCount: number;
  onCreate: (input: { title: string; kind: WorkKind }) => void;
  onOpen: (workId: string) => void;
};

const KIND_LABEL: Record<WorkKind, string> = {
  long: '长篇小说',
  short: '短篇小说',
  essay: '随笔'
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function WorkspaceDashboard({ works, creating = false, todayCount, onCreate, onOpen }: WorkspaceDashboardProps) {
  const [rankingOpen, setRankingOpen] = useState(false);
  return (
    <main className="workspace-dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">受邀私人写作空间</p>
          <h1>我的作品</h1>
          <p>本机草稿用于即时写作，云端同步、作品成员权限和自动备份由服务端单独校验。</p>
        </div>
        <div className="dashboard-stat" aria-label={`今日新增${todayCount}字`}>
          <strong>{new Intl.NumberFormat('zh-CN').format(todayCount)}</strong>
          <span>今日新增字数</span>
        </div>
      </header>

      <section aria-label="作品列表" className="work-grid">
        {works.map((work) => (
          <article className="work-card" key={work.id}>
            <div>
              <span className="work-kind">{KIND_LABEL[work.kind]}</span>
              <h2>{work.title}</h2>
              <p>最近更新：{formatDate(work.updatedAt)}</p>
            </div>
            <button aria-label={`继续写作：${work.title}`} onClick={() => onOpen(work.id)} type="button">
              继续写作
            </button>
          </article>
        ))}
      </section>

      <section className="dashboard-optional-module">
        <button onClick={() => setRankingOpen((value) => !value)} type="button">
          {rankingOpen ? '关闭平台榜单' : '打开平台榜单'}
        </button>
        {rankingOpen ? (
          <AuxiliaryErrorBoundary title="平台榜单">
            <Suspense fallback={<p role="status">正在载入榜单模块…</p>}><RankingAutomationPanel /></Suspense>
          </AuxiliaryErrorBoundary>
        ) : null}
      </section>

      <section className="dashboard-create">
        <div>
          <p className="eyebrow">新建</p>
          <h2>开始另一部作品</h2>
          <p>创建后自动生成第一卷和第一章，原有作品不会受到影响。</p>
        </div>
        <CreateWorkForm busy={creating} onCreate={onCreate} />
      </section>
    </main>
  );
}
