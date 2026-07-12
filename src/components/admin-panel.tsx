'use client';

import { useEffect, useState } from 'react';
import { apiRequest, jsonBody, type AuthenticatedUser } from '../lib/api-client';

type SiteProfile = {
  siteName: string;
  defaultInviteHours: number;
  recycleRetentionDays: number;
};

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  global_role: AuthenticatedUser['globalRole'];
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  work_id?: string | null;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked_at?: string | null;
  created_at: string;
};

type AuditRecord = {
  id: string;
  action: string;
  target_type: string;
  target_id?: string | null;
  metadata_json: string;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
};

type Overview = {
  profile: SiteProfile;
  counts: { users: number; works: number; sessions: number; pendingInvites: number; openComments: number; openSuggestions: number };
  recentAudit: AuditRecord[];
};

type AdminPanelProps = {
  currentUser: AuthenticatedUser;
  onClose: () => void;
  onSiteNameChange: (siteName: string) => void;
};

const ROLE_LABEL: Record<string, string> = {
  owner: '所有者', admin: '管理员', writer: '作者', editor: '编辑', commenter: '批注者', viewer: '只读'
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

export function AdminPanel({ currentUser, onClose, onSiteNameChange }: AdminPanelProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [profile, setProfile] = useState<SiteProfile>({ siteName: '墨界·私人网文创作台', defaultInviteHours: 72, recycleRetentionDays: 30 });
  const [tab, setTab] = useState<'overview' | 'users' | 'invites' | 'audit' | 'settings'>('overview');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const ownerOnly = currentUser.globalRole === 'owner';

  async function load() {
    setBusy(true);
    setStatus('');
    try {
      const [overviewResponse, userResponse, invitationResponse, auditResponse] = await Promise.all([
        apiRequest<Overview>('/api/admin/overview'),
        apiRequest<{ users: AdminUser[] }>('/api/admin/users'),
        apiRequest<{ invitations: Invitation[] }>('/api/admin/invitations'),
        apiRequest<{ audit: AuditRecord[] }>('/api/admin/audit')
      ]);
      setOverview(overviewResponse);
      setProfile(overviewResponse.profile);
      setUsers(userResponse.users);
      setInvitations(invitationResponse.invitations);
      setAudit(auditResponse.audit);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '管理数据读取失败。请确认已执行最新数据库迁移。');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveProfile() {
    setBusy(true);
    try {
      const response = await apiRequest<{ profile: SiteProfile }>('/api/admin/settings', {
        method: 'PUT', body: jsonBody(profile)
      });
      setProfile(response.profile);
      onSiteNameChange(response.profile.siteName);
      setStatus('站点设置已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '站点设置保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(user: AdminUser, patch: Partial<Pick<AdminUser, 'global_role' | 'status'>>) {
    setBusy(true);
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', body: jsonBody({ globalRole: patch.global_role ?? user.global_role, status: patch.status ?? user.status })
      });
      await load();
      setStatus('用户权限已更新。被停用用户的现有会话已清除。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '用户权限更新失败。');
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm(`撤销发送给 ${invitation.email} 的邀请吗？`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
      await load();
      setStatus('邀请已撤销。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '邀请撤销失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-backdrop" role="presentation">
      <section aria-label="管理后台" aria-modal="true" className="admin-panel" role="dialog">
        <header className="admin-header"><div><p className="eyebrow">Owner Console</p><h1>管理后台</h1><p>权限、邀请、审计与站点设置。普通界面不会提供浏览其他作者正文的入口。</p></div><button aria-label="关闭管理后台" onClick={onClose} type="button">×</button></header>
        <nav className="admin-tabs" aria-label="管理后台栏目">{[
          ['overview', '概览'], ['users', '用户'], ['invites', '邀请'], ['audit', '审计'], ['settings', '设置']
        ].map(([value, label]) => <button aria-selected={tab === value} key={value} onClick={() => setTab(value as typeof tab)} type="button">{label}</button>)}</nav>

        <div className="admin-content">
          {tab === 'overview' ? (
            <section>
              <div className="admin-metrics">
                <article><strong>{overview?.counts.users ?? '—'}</strong><span>用户</span></article>
                <article><strong>{overview?.counts.works ?? '—'}</strong><span>云端作品</span></article>
                <article><strong>{overview?.counts.sessions ?? '—'}</strong><span>有效会话</span></article>
                <article><strong>{overview?.counts.pendingInvites ?? '—'}</strong><span>待使用邀请</span></article>
                <article><strong>{overview?.counts.openComments ?? '—'}</strong><span>未处理批注</span></article>
                <article><strong>{overview?.counts.openSuggestions ?? '—'}</strong><span>待处理建议</span></article>
              </div>
              <div className="admin-privacy-note"><strong>隐私边界</strong><p>Owner 具备数据库级运维能力，但管理后台不提供任意打开用户正文的功能。所有敏感操作应以审计日志为依据。</p></div>
              <button disabled={busy} onClick={() => void load()} type="button">刷新运行状态</button>
            </section>
          ) : null}

          {tab === 'users' ? (
            <section><h2>用户与容量权限</h2><div className="admin-table-wrap"><table><thead><tr><th>用户</th><th>全局角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{users.map((user) => (
              <tr key={user.id}><td><strong>{user.display_name}</strong><small>{user.email}</small></td><td><select disabled={!ownerOnly || user.global_role === 'owner'} onChange={(event) => void updateUser(user, { global_role: event.target.value as AdminUser['global_role'] })} value={user.global_role}><option value="owner">所有者</option><option value="admin">管理员</option><option value="writer">作者</option><option value="editor">编辑</option><option value="commenter">批注者</option><option value="viewer">只读</option></select></td><td>{user.status === 'active' ? '正常' : '已停用'}</td><td>{formatDate(user.created_at)}</td><td>{user.global_role !== 'owner' && ownerOnly ? <button disabled={busy} onClick={() => void updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })} type="button">{user.status === 'active' ? '停用' : '恢复'}</button> : '受保护'}</td></tr>
            ))}</tbody></table></div></section>
          ) : null}

          {tab === 'invites' ? (
            <section><h2>邀请记录</h2><ul className="admin-record-list">{invitations.map((invitation) => {
              const active = !invitation.revoked_at && invitation.expires_at > new Date().toISOString() && invitation.used_count < invitation.max_uses;
              return <li key={invitation.id}><div><strong>{invitation.email}</strong><span>{ROLE_LABEL[invitation.role] || invitation.role} · {invitation.work_id ? '作品级' : '账户级'} · 有效至 {formatDate(invitation.expires_at)}</span></div><span>{active ? '待使用' : invitation.revoked_at ? '已撤销' : invitation.used_count >= invitation.max_uses ? '已使用' : '已过期'}</span>{active ? <button disabled={busy} onClick={() => void revokeInvitation(invitation)} type="button">撤销</button> : null}</li>;
            })}</ul></section>
          ) : null}

          {tab === 'audit' ? (
            <section><h2>审计日志</h2><ul className="admin-record-list">{audit.map((record) => <li key={record.id}><div><strong>{record.action}</strong><span>{record.actor_name || record.actor_email || '系统'} · {record.target_type}{record.target_id ? ` / ${record.target_id}` : ''}</span></div><time>{formatDate(record.created_at)}</time></li>)}</ul></section>
          ) : null}

          {tab === 'settings' ? (
            <section className="admin-settings"><h2>站点设置</h2><label><span>站点名称</span><input disabled={!ownerOnly} maxLength={80} onChange={(event) => setProfile((current) => ({ ...current, siteName: event.target.value }))} value={profile.siteName} /></label><label><span>默认邀请有效期（小时）</span><input disabled={!ownerOnly} min={1} max={720} onChange={(event) => setProfile((current) => ({ ...current, defaultInviteHours: Number(event.target.value) || 72 }))} type="number" value={profile.defaultInviteHours} /></label><label><span>回收站默认保留期（天）</span><input disabled={!ownerOnly} min={1} max={365} onChange={(event) => setProfile((current) => ({ ...current, recycleRetentionDays: Number(event.target.value) || 30 }))} type="number" value={profile.recycleRetentionDays} /></label><p>名称由服务端设置提供，不再只依赖前端硬编码。回收站保留期作为后续自动清理任务的默认策略。</p><button disabled={busy || !ownerOnly || profile.siteName.trim().length < 2} onClick={() => void saveProfile()} type="button">保存站点设置</button></section>
          ) : null}
        </div>
        <footer className="admin-footer"><span role="status">{status}</span><button disabled={busy} onClick={() => void load()} type="button">{busy ? '正在处理…' : '重新读取'}</button></footer>
      </section>
    </div>
  );
}
