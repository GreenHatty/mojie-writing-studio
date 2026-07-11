'use client';

import { localOnlyReasons } from '../lib/capabilities';
import type { WorkKind, WorkRecord } from '../lib/repository';
import { CreateWorkForm } from './create-work-form';

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
  const capabilityNotes = localOnlyReasons();

  return (
    <main className="workspace-dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">私人写作空间</p>
          <h1>我的作品</h1>
          <p>作品、草稿和版本保存在本机。需要云端协作时，必须先配置服务端身份验证与存储。</p>
        </div>
        <div className="dashboard-stat" aria-label={`今日新增${todayCount}字`}>
          <strong>{new Intl.NumberFormat('zh-CN').format(todayCount)}</strong>
          <span>今日新增字数</span>
        </div>
      </header>

      {capabilityNotes.length ? (
        <details className="capability-notice">
          <summary>当前运行模式：本地优先</summary>
          <ul>{capabilityNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </details>
      ) : null}

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
