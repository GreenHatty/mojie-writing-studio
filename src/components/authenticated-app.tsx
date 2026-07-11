'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, jsonBody, type AuthenticatedUser } from '../lib/api-client';
import { WritingStudio } from './writing-studio';

type SessionResponse = {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  serverReady: boolean;
};

type AuthMode = 'login' | 'invite' | 'bootstrap';

function initialMode(): AuthMode {
  if (typeof window === 'undefined') return 'login';
  return new URLSearchParams(window.location.search).has('invite') ? 'invite' : 'login';
}

export function AuthenticatedApp() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('email') || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteToken, setInviteToken] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('invite') || '');
  const [adminToken, setAdminToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('writer');
  const [createdInvite, setCreatedInvite] = useState<{ token: string; expiresAt: string; email: string } | null>(null);

  const canInvite = session?.user?.globalRole === 'owner' || session?.user?.globalRole === 'admin';
  const localDatabaseName = useMemo(() => session?.user ? `mojie-writing-studio:${session.user.id}` : 'mojie-writing-studio:anonymous', [session?.user]);

  async function refreshSession() {
    try {
      const next = await apiRequest<SessionResponse>('/api/auth/session');
      setSession(next);
      setStatus('');
    } catch (error) {
      setSession({ authenticated: false, user: null, serverReady: false });
      setStatus(error instanceof Error ? error.message : '无法连接身份验证服务。');
    }
  }

  useEffect(() => {
    void refreshSession();
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
        body: jsonBody({ email: inviteEmail, role: inviteRole, expiresHours: 72 })
      });
      setCreatedInvite(response.invitation);
      setInviteEmail('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '邀请创建失败。');
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <main className="auth-loading">正在验证受邀身份…</main>;

  if (!session.authenticated || !session.user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark" aria-hidden="true">墨</div>
          <p className="eyebrow">受邀用户入口</p>
          <h1>墨界·私人网文创作台</h1>
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
              <h2>创建受邀用户</h2>
              <label><span>受邀邮箱</span><input onChange={(event) => setInviteEmail(event.target.value)} type="email" value={inviteEmail} /></label>
              <label><span>角色</span><select onChange={(event) => setInviteRole(event.target.value)} value={inviteRole}><option value="admin">管理员</option><option value="writer">作者</option><option value="editor">编辑</option><option value="commenter">评论者</option><option value="viewer">只读</option></select></label>
              <button disabled={busy || !inviteEmail} onClick={() => void createInvite()} type="button">生成72小时一次性邀请</button>
              {createdInvite ? (
                <div className="created-invite">
                  <p>令牌只显示一次，请通过安全渠道发送给 {createdInvite.email}。</p>
                  <code>{createdInvite.token}</code>
                  <button onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/?email=${encodeURIComponent(createdInvite.email)}&invite=${encodeURIComponent(createdInvite.token)}`)} type="button">复制邀请链接</button>
                </div>
              ) : null}
            </section>
          ) : null}
          <button className="logout-button" disabled={busy} onClick={() => void logout()} type="button">退出登录</button>
          <p role="status">{status}</p>
        </aside>
      ) : null}
      <WritingStudio databaseName={localDatabaseName} ownerId={session.user.id} />
    </div>
  );
}
