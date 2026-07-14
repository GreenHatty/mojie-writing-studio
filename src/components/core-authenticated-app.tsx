'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api-client';
import { getCoreSession, getLocalDraftDek, initializeCoreOwner, loginCore, logoutCore, type CoreSession } from '../lib/core-api';
import { openUserDraftStore, type UserDraftStore } from '../lib/offline/draft-store';
import { zeroizeLocalDek } from '../lib/offline/crypto';
import { SiteProfileProvider, useSiteProfile } from './site-profile-context';
import { CoreWritingStudio } from './core-writing-studio';
import { PwaRegistration } from './pwa-registration';

type BootState = 'booting' | 'checking-session' | 'opening-local-db' | 'ready' | 'offline-ready' | 'read-only-recovery' | 'authentication-required' | 'blocked' | 'failed';
type AuthMode = 'login' | 'initialize';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INITIALIZATION_UNAVAILABLE') return '站点已初始化，或初始化密钥无效。';
    if (error.code === 'INVALID_CREDENTIALS') return '账号或密码不正确。';
    if (error.code === 'CONFIGURATION_REQUIRED') return '服务端尚未完成 D1 或安全密钥配置。';
    return error.code;
  }
  return error instanceof Error ? error.message : '无法完成当前操作。';
}

export function CoreAuthenticatedApp() {
  return <SiteProfileProvider><CoreAuthenticatedAppContent /></SiteProfileProvider>;
}

function CoreAuthenticatedAppContent() {
  const { siteName } = useSiteProfile();
  const [bootState, setBootState] = useState<BootState>('booting');
  const [session, setSession] = useState<CoreSession | null>(null);
  const [draftStore, setDraftStore] = useState<UserDraftStore | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [initializationKey, setInitializationKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestController.current?.abort();
    draftStore?.close();
  }, [draftStore]);

  async function unlockDraftStore(nextSession: CoreSession, signal?: AbortSignal): Promise<void> {
    setBootState('opening-local-db');
    let dek: Uint8Array | null = null;
    try {
      dek = await getLocalDraftDek(signal);
      const store = await openUserDraftStore(nextSession.user.id, dek, {
        onLifecycleState(state, detail) {
          if (state === 'blocked' || state === 'versionchange') setBootState('blocked');
          else if (state === 'upgrade-failed' || state === 'read-only') { setBootState('read-only-recovery'); setStatus(detail ?? '本地加密草稿只能只读恢复。'); }
        }
      });
      const lifecycle = store.getLifecycleState();
      if (lifecycle === 'ready') { setDraftStore(store); setBootState('ready'); }
      else {
        store.close();
        setDraftStore(null);
        setBootState(lifecycle === 'blocked' || lifecycle === 'versionchange' ? 'blocked' : 'read-only-recovery');
        setStatus('本地加密草稿库当前不可写，请关闭其他标签页后重试。');
      }
    } catch (error) {
      setBootState('failed');
      setStatus(errorMessage(error));
      throw error;
    } finally {
      zeroizeLocalDek(dek);
    }
  }

  async function refreshSession(): Promise<void> {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setBootState('checking-session');
    setStatus('');
    try {
      const next = await getCoreSession(controller.signal);
      if (!next) {
        draftStore?.close();
        setDraftStore(null);
        setSession(null);
        setBootState('authentication-required');
        return;
      }
      setSession(next);
      if (!draftStore || draftStore.databaseName !== `mojie-writing-studio:${next.user.id}`) await unlockDraftStore(next, controller.signal);
      else setBootState('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setBootState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline-ready' : 'failed');
      setStatus(errorMessage(error));
    }
  }

  useEffect(() => { void refreshSession(); }, []);

  async function submitAuth(): Promise<void> {
    setBusy(true);
    setStatus('');
    const controller = new AbortController();
    requestController.current = controller;
    try {
      if (authMode === 'initialize') {
        await initializeCoreOwner({ key: initializationKey, account, password }, controller.signal);
        setInitializationKey('');
        setPassword('');
        setAuthMode('login');
        setStatus('站点所有者已创建，请使用该账号登录。');
      } else {
        const login = await loginCore({ account, password }, controller.signal);
        const next: CoreSession = { user: login.user, csrf: login.csrf, expiresAt: '', renewed: false };
        setSession(next);
        await unlockDraftStore(next, controller.signal);
        setPassword('');
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(errorMessage(error));
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setBusy(false);
    }
  }

  async function logout(): Promise<void> {
    if (!session) return;
    setBusy(true);
    try {
      await logoutCore(session.csrf);
      draftStore?.close();
      setDraftStore(null);
      setSession(null);
      setBootState('authentication-required');
      setStatus('已安全退出。');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (bootState === 'booting' || bootState === 'checking-session' || bootState === 'opening-local-db') {
    return <main className="auth-loading"><PwaRegistration />正在准备私人写作台…</main>;
  }

  if ((bootState === 'failed' || bootState === 'offline-ready' || bootState === 'blocked' || bootState === 'read-only-recovery') && (!session || !draftStore)) {
    return <main className="recovery-page" role="alert"><PwaRegistration />
      <h1>{bootState === 'blocked' ? '本地写作空间被其他标签页占用' : bootState === 'offline-ready' ? '当前网络不可用' : bootState === 'read-only-recovery' ? '本地草稿只能只读恢复' : '写作台启动失败'}</h1>
      <p>{status || '启动没有完成，但不会删除或重建本地草稿。'}</p>
      <div><button onClick={() => void refreshSession()} type="button">重试</button>{session ? <button onClick={() => void logout()} type="button">安全退出</button> : <button onClick={() => setBootState('authentication-required')} type="button">返回登录</button>}</div>
      <p>离线模式只支持同一账号已解锁、已打开的写作会话，不能绕过登录读取其他账号的数据。</p>
    </main>;
  }

  if (!session || !draftStore) {
    return <main className="auth-page"><PwaRegistration />
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">墨</div>
        <p className="eyebrow">私有写作空间</p>
        <h1>{siteName}</h1>
        <p>正文、离线草稿与版本均由当前账号隔离。首次初始化只允许创建一位平台所有者。</p>
        <div className="auth-tabs" role="tablist">
          <button aria-selected={authMode === 'login'} onClick={() => setAuthMode('login')} role="tab" type="button">登录</button>
          <button aria-selected={authMode === 'initialize'} onClick={() => setAuthMode('initialize')} role="tab" type="button">首次初始化</button>
        </div>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submitAuth(); }}>
          <label><span>账号</span><input aria-label="账号" autoComplete="username" onChange={(event) => setAccount(event.target.value)} placeholder="邮箱或登录名" required value={account} /></label>
          {authMode === 'initialize' ? <label><span>站点初始化密钥</span><input aria-label="站点初始化密钥" autoComplete="off" onChange={(event) => setInitializationKey(event.target.value)} required type="password" value={initializationKey} /></label> : null}
          <label><span>密码</span><input aria-label="密码" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <button disabled={busy || !account || !password || (authMode === 'initialize' && !initializationKey)} type="submit">{busy ? '正在处理…' : authMode === 'login' ? '登录创作台' : '创建首位所有者'}</button>
        </form>
        <p className="auth-status" role="status">{status}</p>
      </section>
    </main>;
  }

  return <CoreWritingStudio csrf={session.csrf} draftStore={draftStore} onLogout={() => void logout()} user={session.user} />;
}
