'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, jsonBody, type AuthenticatedUser } from '../lib/api-client';
import { createWritingRepository } from '../lib/repository';
import { AdminPanel } from './admin-panel';
import { PwaRegistration } from './pwa-registration';
import { WritingStudio } from './writing-studio';
import { SiteProfileProvider, useSiteProfile } from './site-profile-context';

type SessionResponse = {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  serverReady: boolean;
};

type AuthMode = 'login' | 'invite' | 'bootstrap';
type AppBootState = 'booting' | 'checking-session' | 'opening-local-db' | 'ready' | 'offline-ready' | 'read-only-recovery' | 'authentication-required' | 'blocked' | 'failed';

type PublicSiteResponse = {
  profile: { siteName: string; defaultInviteHours: number; recycleRetentionDays: number };
  serverReady: boolean;
};

function initialMode(): AuthMode {
  if (typeof window === 'undefined') return 'login';
  return new URLSearchParams(window.location.search).has('invite') ? 'invite' : 'login';
}

export function AuthenticatedApp() {
  return <SiteProfileProvider><AuthenticatedAppContent /></SiteProfileProvider>;
}

function AuthenticatedAppContent() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [bootState, setBootState] = useState<AppBootState>('booting');
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('email') || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteToken, setInviteToken] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('invite') || '');
  const [adminToken, setAdminToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('writer');
  const [createdInvite, setCreatedInvite] = useState<{ token: string; expiresAt: string; email: string } | null>(null);
  const { siteName, setSiteName, defaultInviteHours, setDefaultInviteHours } = useSiteProfile();

  const canInvite = session?.user?.globalRole === 'owner' || session?.user?.globalRole === 'admin';
  const canAdmin = canInvite;
  const repository = useMemo(() => session?.user
    ? createWritingRepository({
        databaseName: `mojie-writing-studio:${session.user.id}`,
        ownerId: session.user.id,
        onLifecycleState(state) {
          queueMicrotask(() => setBootState(state === 'ready' ? 'ready' : state === 'blocked' ? 'blocked' : state === 'upgrade-failed' ? 'read-only-recovery' : state === 'opening' || state === 'upgrading' ? 'opening-local-db' : state === 'versionchange' ? 'blocked' : 'failed'));
        }
      })
    : null, [session?.user]);

  useEffect(() => () => repository?.close(), [repository]);

  async function refreshSession(signal?: AbortSignal) {
    setBootState('checking-session');
    try {
      const next = await apiRequest<SessionResponse>('/api/auth/session', { signal });
      setSession(next);
      setBootState(next.authenticated ? 'opening-local-db' : 'authentication-required');
      setStatus('');
    } catch (error) {
      if (signal?.aborted) return;
      setBootState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline-ready' : 'failed');
      setStatus(error instanceof Error ? error.message : '无法连接身份验证服务。');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      refreshSession(controller.signal),
      apiRequest<PublicSiteResponse>('/api/site/public', { signal: controller.signal }).then((response) => {
        setSiteName(response.profile.siteName || '墨界·私人网文创作台');
        setDefaultInviteHours(response.profile.defaultInviteHours || 72);
      }).catch(() => undefined)
    ]);
    return () => controller.abort();
  }, []);

  async function submitAuth() {
    setBusy(true);
    setStatus('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : mode === 'invite' ? '/api/auth/accept-invite' : '/api/auth/bootstrap';
      const body = mode === 'login'
        ? { email, password }
        : mode === 'invite'
          ? { email, password, displayName, token: inviteToken }
          : { email, password, displayName };
      const headers = mode === 'bootstrap' ? { authorization: `Bearer ${adminToken}` } : undefined;
      await apiRequest(endpoint, { method: 'POST', headers, body: jsonBody(body) });
      await refreshSession();
      if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '登录失败。');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      setSession({ authenticated: false, user: null, serverReady: true });
      setAccountOpen(false);
      setAdminOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);
    setStatus('');
    try {
      const response = await apiRequest<{ invitation: { token: string; expiresAt: string; email: string } }>('/api/admin/invitations', {
        method: 'POST',
        body: jsonBody({ email: inviteEmail, role: inviteRole, expiresHours: defaultInviteHours })
      });
      setCreatedInvite(response.invitation);
      setInviteEmail('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '邀请创建失败。');
    } finally {
      setBusy(false);
    }
  }

  if (!session && ['failed', 'offline-ready', 'blocked', 'read-only-recovery'].includes(bootState)) return (
    <main className="recovery-page" role="alert">
      <h1>{bootState === 'blocked' ? '本地写作空间被其他标签页占用' : bootState === 'offline-ready' ? '当前网络不可用' : '写作台启动失败'}</h1>
      <p>{status || '启动流程没有完成，但不会删除本地作品。'}</p>
      <div><button onClick={() => void refreshSession()} type="button">重试</button><button onClick={() => window.location.assign('/')} type="button">返回工作台</button></div>
      <p>离线草稿需要先由同一账号完成身份解锁；无法确认身份时不会打开其他用户的本地数据。</p>
    </main>
  );
  if (!session) return <main className="auth-loading">{bootState === 'checking-session' ? '正在验证受邀身份…' : '正在启动私人写作台…'}</main>;

  if (!session.authenticated || !session.user) {
    return (
      <main className="auth-page">
        <PwaRegistration />
        <section className="auth-card">
          <div className="brand-mark" aria-hidden="true">墨</div>
          <p className="eyebrow">受邀用户入口</p>
          <h1>{siteName}</h1>
          {!session.serverReady ? <div className="auth-warning">服务端 D1 数据库尚未绑定。完成部署配置和数据库迁移后才能登录。</div> : null}
          <div className="auth-tabs" role="tablist">
            <button aria-selected={mode === 'login'} onClick={() => setMode('login')} role="tab" type="button">登录</button>
            <button aria-selected={mode === 'invite'} onClick={() => setMode('invite')} role="tab" type="button">接受邀请</button>
            <button aria-selected={mode === 'bootstrap'} onClick={() => setMode('bootstrap')} role="tab" type="button">首次初始化</button>
          </div>
          <div className="auth-form">
            <label><span>邮箱</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
            {mode !== 'login' ? <label><span>显示名称</span><input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label> : null}
            {mode === 'invite' ? <label><span>邀请令牌</span><input onChange={(event) => setInviteToken(event.target.value)} value={inviteToken} /></label> : null}
            {mode === 'bootstrap' ? <label><span>站点初始化密钥</span><input autoComplete="off" onChange={(event) => setAdminToken(event.target.value)} type="password" value={adminToken} /></label> : null}
            <label><span>密码</span><input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
            <button disabled={busy || !email || !password || (mode === 'invite' && !inviteToken) || (mode === 'bootstrap' && !adminToken)} onClick={() => void submitAuth()} type="button">
              {busy ? '正在处理…' : mode === 'login' ? '登录创作台' : mode === 'invite' ? '接受邀请并注册' : '创建首位站点所有者'}
            </button>
          </div>
          <p className="auth-status" role="status">{status}</p>
        </section>
      </main>
    );
  }

  return (
    <div className="authenticated-shell">
      <PwaRegistration />
      <div className="account-bar">
        <button onClick={() => setAccountOpen((value) => !value)} type="button">
          <strong>{session.user.displayName}</strong>
          <span>{session.user.globalRole}</span>
        </button>
      </div>
      {accountOpen ? (
        <aside className="account-panel">
          <header><div><strong>{session.user.displayName}</strong><span>{session.user.email}</span></div><button onClick={() => setAccountOpen(false)} type="button">×</button></header>
          {canInvite ? (
            <section>
              <h2>创建账户级受邀用户</h2>
              <p>作品协作者请在作品“设定 → 作品权限”中创建作品级邀请。</p>
              <label><span>受邀邮箱</span><input onChange={(event) => setInviteEmail(event.target.value)} type="email" value={inviteEmail} /></label>
              <label><span>角色</span><select onChange={(event) => setInviteRole(event.target.value)} value={inviteRole}><option value="admin">管理员</option><option value="writer">作者</option><option value="editor">编辑</option><option value="commenter">批注者</option><option value="viewer">只读</option></select></label>
              <button disabled={busy || !inviteEmail} onClick={() => void createInvite()} type="button">生成{defaultInviteHours}小时一次性邀请</button>
              {createdInvite ? (
                <div className="created-invite">
                  <p>令牌只显示一次，请通过安全渠道发送给 {createdInvite.email}。</p>
                  <code>{createdInvite.token}</code>
                  <button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/?email=${encodeURIComponent(createdInvite.email)}&invite=${encodeURIComponent(createdInvite.token)}`)} type="button">复制邀请链接</button>
                </div>
              ) : null}
            </section>
          ) : null}
          {canAdmin ? <button className="admin-open-button" onClick={() => { setAdminOpen(true); setAccountOpen(false); }} type="button">打开管理后台</button> : null}
          <button className="logout-button" disabled={busy} onClick={() => void logout()} type="button">退出登录</button>
          <p role="status">{status}</p>
        </aside>
      ) : null}
      {repository ? <WritingStudio repository={repository} /> : null}
      {adminOpen && canAdmin ? <AdminPanel currentUser={session.user} onClose={() => setAdminOpen(false)} onSiteNameChange={setSiteName} /> : null}
    </div>
  );
}
