'use client';

import { useEffect, useState, type FormEvent } from 'react';

type WorkSummary = { id: string; title: string; kind: 'long' | 'short' | 'essay'; status: string; updatedAt: string; role: string; totalWordCount: number };

function csrfFromBrowser(): string {
  if (typeof document === 'undefined') return '';
  for (const name of ['__Host-mojie-csrf', 'mojie-dev-csrf']) {
    const value = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
    if (value) return decodeURIComponent(value.slice(name.length + 1));
  }
  return '';
}

export function PrivateApp() {
  const [state, setState] = useState<'loading' | 'anonymous' | 'ready' | 'error'>('loading');
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [csrf, setCsrf] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function loadWorks() {
    const response = await fetch('/api/works', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('WORKS_LOAD_FAILED');
    const payload = await response.json() as { works: WorkSummary[] };
    setWorks(payload.works);
    setState('ready');
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (!active) return;
        if (response.status === 401) { setState('anonymous'); return; }
        if (!response.ok) { setState('error'); return; }
        setCsrf(csrfFromBrowser());
        await loadWorks();
      } catch { if (active) setState('error'); }
    })();
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setMessage('');
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account, password }) });
    if (!response.ok) { setMessage('账号或密码错误'); return; }
    const payload = await response.json() as { csrf: string };
    setCsrf(payload.csrf);
    await loadWorks();
  }

  async function createWork(kind: WorkSummary['kind']) {
    const title = window.prompt('作品名称');
    if (!title?.trim()) return;
    const response = await fetch('/api/works', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ title, kind }) });
    if (!response.ok) { setMessage('创建作品失败'); return; }
    await loadWorks();
  }

  if (state === 'loading') return <main className="app-loading">正在验证私人空间…</main>;
  if (state === 'error') return <main className="empty-workspace"><h1>运行环境尚未配置</h1><p className="empty-copy">请配置 D1、R2 和受保护密钥后重试。</p></main>;
  if (state === 'anonymous') return (
    <main className="empty-workspace">
      <span className="brand-mark">墨</span><h1>登录墨界</h1><p className="empty-copy">作品默认私人，仅授权账户可以访问。</p>
      <form className="create-work-form" onSubmit={(event) => void login(event)}>
        <label><span>账号</span><input aria-label="账号" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} /></label>
        <label><span>密码</span><input aria-label="密码" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message ? <p role="alert">{message}</p> : null}<button type="submit">登录</button>
      </form>
    </main>
  );
  return (
    <main className="private-dashboard">
      <header><div><p className="eyebrow">PRIVATE WRITING STUDIO</p><h1>我的作品</h1></div><div className="dashboard-actions"><button onClick={() => void createWork('long')}>新建长篇</button><button onClick={() => void createWork('short')}>新建短篇</button><button onClick={() => void createWork('essay')}>新建随笔</button></div></header>
      {message ? <p role="alert">{message}</p> : null}
      {works.length ? <section className="work-grid">{works.map((work) => <article className="work-card" key={work.id}><p>{work.kind === 'long' ? '长篇小说' : work.kind === 'short' ? '短篇小说' : '随笔'}</p><h2>{work.title}</h2><span>{work.totalWordCount} 字</span><small>{work.role}</small></article>)}</section> : <section className="dashboard-empty"><h2>还没有作品</h2><p>从长篇、短篇或随笔开始。</p></section>}
    </main>
  );
}
