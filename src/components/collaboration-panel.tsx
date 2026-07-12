'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest, jsonBody } from '../lib/api-client';
import { normalizeSelectionSnapshot, selectionPreview, type EditorSelectionSnapshot } from '../lib/collaboration';

type Member = {
  user_id: string;
  role: string;
  created_at: string;
  revoked_at?: string | null;
  email: string;
  display_name: string;
  status: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked_at?: string | null;
  created_at: string;
};

type CommentRecord = {
  id: string;
  chapter_id: string;
  paragraph_key?: string | null;
  anchor_from: number;
  anchor_to: number;
  quoted_text: string;
  body: string;
  status: 'open' | 'resolved';
  creator_name: string;
  created_at: string;
};

type SuggestionRecord = {
  id: string;
  chapter_id: string;
  paragraph_key?: string | null;
  anchor_from: number;
  anchor_to: number;
  original_text: string;
  replacement_text: string;
  reason: string;
  status: 'open' | 'accepted' | 'rejected' | 'superseded';
  creator_name: string;
  resolver_name?: string | null;
  created_at: string;
};

type CollaborationPanelProps = {
  workId: string;
};

type ApplyResult = { applied: boolean; reason?: string };

const ROLE_LABEL: Record<string, string> = {
  owner: '所有者', admin: '管理员', writer: '作者', editor: '编辑', commenter: '批注者', viewer: '只读'
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

export function CollaborationPanel({ workId }: CollaborationPanelProps) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<EditorSelectionSnapshot>({ chapterId: '', from: 0, to: 0, paragraphKey: '', text: '' });
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRecord[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('editor');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteHours, setInviteHours] = useState(72);
  const [createdInvite, setCreatedInvite] = useState<{ email: string; token: string; expiresAt: string } | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [replacementText, setReplacementText] = useState('');
  const [suggestionReason, setSuggestionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const activeMembers = useMemo(() => members.filter((member) => !member.revoked_at), [members]);

  useEffect(() => {
    const updateContext = (event: Event) => {
      setSelection(normalizeSelectionSnapshot((event as CustomEvent<EditorSelectionSnapshot>).detail));
    };
    window.addEventListener('mojie:editor-context', updateContext);
    return () => window.removeEventListener('mojie:editor-context', updateContext);
  }, []);

  async function loadAccess() {
    const [memberResponse, invitationResponse] = await Promise.all([
      apiRequest<{ members: Member[] }>(`/api/cloud/works/${encodeURIComponent(workId)}/members`),
      apiRequest<{ invitations: Invitation[] }>(`/api/cloud/works/${encodeURIComponent(workId)}/invitations`)
    ]);
    setMembers(memberResponse.members);
    setInvitations(invitationResponse.invitations);
  }

  async function loadItems(chapterId = selection.chapterId) {
    if (!chapterId) return;
    const response = await apiRequest<{ comments: CommentRecord[]; suggestions: SuggestionRecord[] }>(
      `/api/collaboration/works/${encodeURIComponent(workId)}/items?chapterId=${encodeURIComponent(chapterId)}`
    );
    setComments(response.comments);
    setSuggestions(response.suggestions);
  }

  async function refresh() {
    setBusy(true);
    setStatus('');
    try {
      await Promise.all([loadAccess(), loadItems()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '协作信息读取失败。请先把作品同步到云端。');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadItems().catch(() => undefined);
  }, [open, selection.chapterId]);

  async function addMember() {
    setBusy(true);
    setStatus('');
    try {
      await apiRequest(`/api/cloud/works/${encodeURIComponent(workId)}/members`, {
        method: 'POST', body: jsonBody({ email: memberEmail, role: memberRole })
      });
      setMemberEmail('');
      await loadAccess();
      setStatus('已授权已注册用户。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '成员授权失败。');
    } finally {
      setBusy(false);
    }
  }

  async function revokeMember(member: Member) {
    if (!window.confirm(`撤销 ${member.display_name || member.email} 对该作品的访问权限吗？`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/cloud/works/${encodeURIComponent(workId)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
      await loadAccess();
      setStatus('访问权限已撤销，现有登录会话也已失效。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '撤权失败。');
    } finally {
      setBusy(false);
    }
  }

  async function createInvitation() {
    setBusy(true);
    setStatus('');
    try {
      const response = await apiRequest<{ invitation: { email: string; token: string; expiresAt: string } }>(
        `/api/cloud/works/${encodeURIComponent(workId)}/invitations`,
        { method: 'POST', body: jsonBody({ email: inviteEmail, role: inviteRole, expiresHours: inviteHours, maxUses: 1 }) }
      );
      setCreatedInvite(response.invitation);
      setInviteEmail('');
      await loadAccess();
      setStatus('作品邀请已创建。令牌只显示在当前界面。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '邀请创建失败。');
    } finally {
      setBusy(false);
    }
  }

  async function createComment() {
    if (!selection.chapterId || !commentBody.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/collaboration/works/${encodeURIComponent(workId)}/comments`, {
        method: 'POST',
        body: jsonBody({
          chapterId: selection.chapterId,
          paragraphKey: selection.paragraphKey,
          anchorFrom: selection.from,
          anchorTo: selection.to,
          quotedText: selection.text,
          body: commentBody
        })
      });
      setCommentBody('');
      await loadItems();
      setStatus('批注已保存，不会修改正文。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '批注保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function resolveComment(comment: CommentRecord) {
    setBusy(true);
    try {
      await apiRequest(`/api/collaboration/comments/${encodeURIComponent(comment.id)}`, {
        method: 'PATCH', body: jsonBody({ status: comment.status === 'open' ? 'resolved' : 'open' })
      });
      await loadItems();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '批注状态更新失败。');
    } finally {
      setBusy(false);
    }
  }

  async function createSuggestion() {
    if (!selection.chapterId || !selection.text || replacementText === selection.text) {
      setStatus('请先在正文中选择一段文字，并填写不同的替换内容。');
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/collaboration/works/${encodeURIComponent(workId)}/suggestions`, {
        method: 'POST',
        body: jsonBody({
          chapterId: selection.chapterId,
          paragraphKey: selection.paragraphKey,
          anchorFrom: selection.from,
          anchorTo: selection.to,
          originalText: selection.text,
          replacementText,
          reason: suggestionReason
        })
      });
      setReplacementText('');
      setSuggestionReason('');
      await loadItems();
      setStatus('修改建议已保存，正文保持不变。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '建议保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function updateSuggestion(suggestion: SuggestionRecord, nextStatus: SuggestionRecord['status']) {
    setBusy(true);
    try {
      if (nextStatus === 'accepted') {
        const result: ApplyResult = { applied: false };
        window.dispatchEvent(new CustomEvent('mojie:apply-suggestion', {
          detail: {
            chapterId: suggestion.chapter_id,
            from: suggestion.anchor_from,
            to: suggestion.anchor_to,
            originalText: suggestion.original_text,
            replacementText: suggestion.replacement_text,
            result
          }
        }));
        if (!result.applied) {
          setStatus(result.reason === 'stale-anchor' ? '正文已变化，建议锚点失效。请重新选中当前文字后人工处理。' : '建议未应用。');
          return;
        }
      }
      await apiRequest(`/api/collaboration/suggestions/${encodeURIComponent(suggestion.id)}`, {
        method: 'PATCH', body: jsonBody({ status: nextStatus })
      });
      await loadItems();
      setStatus(nextStatus === 'accepted' ? '建议已应用并进入正常自动保存流程。' : '建议已标记为拒绝。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '建议状态更新失败。');
    } finally {
      setBusy(false);
    }
  }

  const inviteLink = createdInvite && typeof window !== 'undefined'
    ? `${window.location.origin}/?email=${encodeURIComponent(createdInvite.email)}&invite=${encodeURIComponent(createdInvite.token)}`
    : '';

  return (
    <details className="collaboration-panel" onToggle={(event) => {
      const nextOpen = event.currentTarget.open;
      setOpen(nextOpen);
      if (nextOpen) void refresh();
    }}>
      <summary>作品权限、批注与修改建议</summary>
      <p className="collaboration-intro">作品默认私人。所有建议必须由作者或编辑明确接受，系统不会静默覆盖正文。</p>

      <section className="collaboration-section">
        <div className="panel-section-heading"><div><p className="eyebrow">当前选区</p><h3>{selection.chapterId ? '章节已定位' : '请先点击正文'}</h3></div><button disabled={busy} onClick={() => void refresh()} type="button">刷新</button></div>
        <blockquote>{selection.text ? selectionPreview(selection.text, 180) : '当前没有选择文字；仍可创建章节级批注。'}</blockquote>
      </section>

      <section className="collaboration-section">
        <h3>作品成员</h3>
        {activeMembers.length ? <ul className="collaboration-list">{activeMembers.map((member) => (
          <li key={member.user_id}><div><strong>{member.display_name || member.email}</strong><span>{member.email} · {ROLE_LABEL[member.role] || member.role}</span></div>{member.role !== 'owner' ? <button disabled={busy} onClick={() => void revokeMember(member)} type="button">撤权</button> : null}</li>
        ))}</ul> : <p>尚未读取到云端成员。</p>}
        <div className="collaboration-form-row">
          <input aria-label="已注册用户邮箱" onChange={(event) => setMemberEmail(event.target.value)} placeholder="已注册用户邮箱" type="email" value={memberEmail} />
          <select aria-label="成员角色" onChange={(event) => setMemberRole(event.target.value)} value={memberRole}><option value="writer">作者</option><option value="editor">编辑</option><option value="commenter">批注者</option><option value="viewer">只读</option></select>
          <button disabled={busy || !memberEmail} onClick={() => void addMember()} type="button">直接授权</button>
        </div>
      </section>

      <section className="collaboration-section">
        <h3>作品级邀请</h3>
        <div className="collaboration-form-grid">
          <input aria-label="受邀邮箱" onChange={(event) => setInviteEmail(event.target.value)} placeholder="受邀邮箱" type="email" value={inviteEmail} />
          <select aria-label="邀请角色" onChange={(event) => setInviteRole(event.target.value)} value={inviteRole}><option value="writer">作者</option><option value="editor">编辑</option><option value="commenter">批注者</option><option value="viewer">只读</option></select>
          <label><span>有效小时</span><input min={1} max={720} onChange={(event) => setInviteHours(Math.max(1, Math.min(720, Number(event.target.value) || 72)))} type="number" value={inviteHours} /></label>
          <button disabled={busy || !inviteEmail} onClick={() => void createInvitation()} type="button">创建一次性邀请</button>
        </div>
        {createdInvite ? <div className="created-collaboration-invite"><span>有效至 {formatDate(createdInvite.expiresAt)}</span><code>{inviteLink}</code><button onClick={() => void navigator.clipboard.writeText(inviteLink)} type="button">复制邀请链接</button></div> : null}
        {invitations.length ? <p className="muted-copy">该作品已有 {invitations.filter((item) => !item.revoked_at && item.used_count < item.max_uses).length} 条未使用邀请。</p> : null}
      </section>

      <section className="collaboration-section">
        <h3>添加批注</h3>
        <textarea onChange={(event) => setCommentBody(event.target.value)} placeholder="说明疑问、逻辑问题或修改方向；不会改动正文" value={commentBody} />
        <button disabled={busy || !selection.chapterId || !commentBody.trim()} onClick={() => void createComment()} type="button">保存批注</button>
        {comments.length ? <ul className="collaboration-thread">{comments.map((comment) => (
          <li key={comment.id} data-status={comment.status}><header><strong>{comment.creator_name}</strong><span>{formatDate(comment.created_at)}</span></header>{comment.quoted_text ? <blockquote>{selectionPreview(comment.quoted_text)}</blockquote> : null}<p>{comment.body}</p><button disabled={busy} onClick={() => void resolveComment(comment)} type="button">{comment.status === 'open' ? '标记已处理' : '重新打开'}</button></li>
        ))}</ul> : null}
      </section>

      <section className="collaboration-section">
        <h3>提出替换建议</h3>
        <div className="suggestion-compare"><div><span>原文</span><p>{selection.text ? selectionPreview(selection.text, 500) : '请先选择正文'}</p></div><div><span>建议</span><textarea onChange={(event) => setReplacementText(event.target.value)} value={replacementText} /></div></div>
        <input onChange={(event) => setSuggestionReason(event.target.value)} placeholder="修改理由（可选）" value={suggestionReason} />
        <button disabled={busy || !selection.text || !replacementText} onClick={() => void createSuggestion()} type="button">保存为建议，不覆盖正文</button>
        {suggestions.length ? <ul className="collaboration-thread">{suggestions.map((suggestion) => (
          <li key={suggestion.id} data-status={suggestion.status}><header><strong>{suggestion.creator_name}</strong><span>{formatDate(suggestion.created_at)} · {suggestion.status}</span></header><div className="suggestion-compare"><div><span>原文</span><p>{selectionPreview(suggestion.original_text, 500)}</p></div><div><span>建议</span><p>{selectionPreview(suggestion.replacement_text, 500)}</p></div></div>{suggestion.reason ? <p>{suggestion.reason}</p> : null}{suggestion.status === 'open' ? <div className="suggestion-actions"><button disabled={busy} onClick={() => void updateSuggestion(suggestion, 'accepted')} type="button">核对锚点并接受</button><button disabled={busy} onClick={() => void updateSuggestion(suggestion, 'rejected')} type="button">拒绝</button></div> : null}</li>
        ))}</ul> : null}
      </section>
      <p className="collaboration-status" role="status">{status}</p>
    </details>
  );
}
