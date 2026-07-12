'use client';
import { useState, type FormEvent } from 'react';

export function AcceptInvitation({ token }: { token: string }) {
  const [account, setAccount] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setMessage(''); const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account, password }) }); setMessage(response.ok ? '邀请已接受，请返回登录' : '邀请无效、已过期或账号验证失败'); }
  return <main className="empty-workspace"><span className="brand-mark">墨</span><h1>接受墨界邀请</h1><p className="empty-copy">邀请令牌不会显示或保存到正文空间。</p><form className="create-work-form" onSubmit={(event) => void submit(event)}><label><span>账号</span><input aria-label="账号" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} /></label><label><span>密码</span><input aria-label="密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message ? <p role="status">{message}</p> : null}<button type="submit">接受邀请</button><a href="/">返回登录</a></form></main>;
}
