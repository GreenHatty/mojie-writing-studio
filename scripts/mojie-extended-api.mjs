const SESSION_COOKIE = 'mojie_session';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ROLE_ACTIONS = {
  owner: new Set(['invite', 'members', 'backups', 'rankings', 'write', 'comment', 'read']),
  admin: new Set(['invite', 'members', 'backups', 'rankings', 'write', 'comment', 'read']),
  writer: new Set(['write', 'comment', 'read']),
  editor: new Set(['write', 'comment', 'read']),
  commenter: new Set(['comment', 'read']),
  viewer: new Set(['read'])
};
const WORK_INVITE_ROLES = new Set(['writer', 'editor', 'commenter', 'viewer']);

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function responseJson(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function responseError(message, status = 400, code = 'bad_request', details) {
  return responseJson({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request, maximumBytes = 1_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maximumBytes) throw new HttpError(413, 'payload_too_large', '请求内容过大。');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new HttpError(413, 'payload_too_large', '请求内容过大。');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON格式无效。');
  }
}

function assertSameOrigin(request) {
  if (!MUTATING.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'csrf_rejected', '请求来源校验失败。');
}

function parseCookies(request) {
  const cookies = new Map();
  for (const pair of (request.headers.get('cookie') || '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    cookies.set(pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim()));
  }
  return cookies;
}

function can(role, action) {
  return Boolean(ROLE_ACTIONS[role]?.has(action));
}

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email', '邮箱格式无效。');
  return email;
}

function boundedText(value, maximum, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maximum);
}

function boundedInteger(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

async function getSession(request, env, required = true) {
  if (!env.DB) {
    if (required) throw new HttpError(503, 'database_not_configured', '服务端数据库尚未配置。');
    return null;
  }
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) {
    if (required) throw new HttpError(401, 'not_authenticated', '请先登录。');
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id,s.expires_at,u.id,u.email,u.display_name,u.global_role,u.status
     FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`
  ).bind(await sha256Hex(token)).first();
  if (!row || row.status !== 'active' || row.expires_at <= nowIso()) {
    if (row?.session_id) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(row.session_id).run();
    if (required) throw new HttpError(401, 'session_expired', '登录状态已过期。');
    return null;
  }
  return { sessionId: row.session_id, user: { id: row.id, email: row.email, displayName: row.display_name, globalRole: row.global_role } };
}

async function roleForWork(env, user, workId) {
  if (user.globalRole === 'owner' || user.globalRole === 'admin') return user.globalRole;
  const row = await env.DB.prepare('SELECT role FROM work_members WHERE work_id=? AND user_id=? AND revoked_at IS NULL').bind(workId, user.id).first();
  return row?.role || null;
}

async function requireWorkAction(request, env, workId, action) {
  const session = await getSession(request, env);
  const role = await roleForWork(env, session.user, workId);
  if (!role || !can(role, action)) throw new HttpError(403, 'permission_denied', '没有该作品的访问权限。');
  return { ...session, role };
}

async function requireAdmin(request, env, ownerOnly = false) {
  const session = await getSession(request, env);
  const allowed = ownerOnly ? session.user.globalRole === 'owner' : ['owner', 'admin'].includes(session.user.globalRole);
  if (!allowed) throw new HttpError(403, 'permission_denied', '当前账号没有管理权限。');
  return session;
}

async function audit(env, actorId, action, targetType, targetId, metadata = {}) {
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(makeId('audit'), actorId || null, action, targetType, targetId || null, JSON.stringify(metadata), nowIso()).run();
}

async function readSiteProfile(env) {
  const fallback = { siteName: '墨界·私人网文创作台', defaultInviteHours: 72, recycleRetentionDays: 30 };
  if (!env.DB) return fallback;
  try {
    const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE setting_key='site_profile'").first();
    return row?.value_json ? { ...fallback, ...JSON.parse(row.value_json) } : fallback;
  } catch {
    return fallback;
  }
}

async function publicRoutes(request, env, pathname) {
  if (pathname === '/api/site/public' && request.method === 'GET') {
    return responseJson({ profile: await readSiteProfile(env), serverReady: Boolean(env.DB) });
  }
  return null;
}

async function adminRoutes(request, env, pathname) {
  if (pathname === '/api/admin/overview' && request.method === 'GET') {
    await requireAdmin(request, env);
    const [users, works, sessions, pendingInvites, openComments, openSuggestions, audits] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM cloud_documents WHERE deleted_at IS NULL').first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at>?').bind(nowIso()).first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM invitations WHERE revoked_at IS NULL AND expires_at>? AND used_count<max_uses').bind(nowIso()).first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM chapter_comments WHERE status='open'").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM chapter_suggestions WHERE status='open'").first(),
      env.DB.prepare('SELECT a.*,u.display_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 20').all()
    ]);
    return responseJson({
      profile: await readSiteProfile(env),
      counts: {
        users: Number(users?.count || 0), works: Number(works?.count || 0), sessions: Number(sessions?.count || 0),
        pendingInvites: Number(pendingInvites?.count || 0), openComments: Number(openComments?.count || 0), openSuggestions: Number(openSuggestions?.count || 0)
      },
      recentAudit: audits.results || []
    });
  }

  if (pathname === '/api/admin/settings' && request.method === 'GET') {
    await requireAdmin(request, env);
    return responseJson({ profile: await readSiteProfile(env) });
  }

  if (pathname === '/api/admin/settings' && request.method === 'PUT') {
    const session = await requireAdmin(request, env, true);
    const body = await readJson(request);
    const profile = {
      siteName: boundedText(body.siteName, 80, '墨界·私人网文创作台'),
      defaultInviteHours: boundedInteger(body.defaultInviteHours, 1, 720, 72),
      recycleRetentionDays: boundedInteger(body.recycleRetentionDays, 1, 365, 30)
    };
    const timestamp = nowIso();
    await env.DB.prepare(`INSERT INTO site_settings(setting_key,value_json,updated_by,updated_at) VALUES('site_profile',?,?,?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(JSON.stringify(profile), session.user.id, timestamp).run();
    await audit(env, session.user.id, 'site_settings.update', 'site_settings', 'site_profile', profile);
    return responseJson({ profile });
  }

  if (pathname === '/api/admin/users' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = await env.DB.prepare('SELECT id,email,display_name,global_role,status,created_at,updated_at FROM users ORDER BY created_at DESC LIMIT 500').all();
    return responseJson({ users: rows.results || [] });
  }

  const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/u);
  if (userMatch && request.method === 'PATCH') {
    const session = await requireAdmin(request, env, true);
    const userId = decodeURIComponent(userMatch[1]);
    const target = await env.DB.prepare('SELECT id,global_role,status FROM users WHERE id=?').bind(userId).first();
    if (!target) throw new HttpError(404, 'user_not_found', '用户不存在。');
    if (target.global_role === 'owner') throw new HttpError(409, 'owner_protected', '不能通过管理接口修改站点所有者。');
    if (userId === session.user.id) throw new HttpError(409, 'self_protected', '不能在这里停用自己的账号。');
    const body = await readJson(request);
    const role = ['admin', 'writer', 'editor', 'commenter', 'viewer'].includes(body.globalRole) ? body.globalRole : target.global_role;
    const status = ['active', 'disabled'].includes(body.status) ? body.status : target.status;
    await env.DB.prepare('UPDATE users SET global_role=?,status=?,updated_at=? WHERE id=?').bind(role, status, nowIso(), userId).run();
    if (status === 'disabled') await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
    await audit(env, session.user.id, 'user.update', 'user', userId, { role, status });
    return responseJson({ userId, globalRole: role, status });
  }

  if (pathname === '/api/admin/audit' && request.method === 'GET') {
    await requireAdmin(request, env);
    const rows = await env.DB.prepare('SELECT a.*,u.display_name AS actor_name,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200').all();
    return responseJson({ audit: rows.results || [] });
  }
  return null;
}

async function memberRoutes(request, env, pathname) {
  const membersMatch = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/members$/u);
  if (membersMatch && request.method === 'GET') {
    const workId = decodeURIComponent(membersMatch[1]);
    await requireWorkAction(request, env, workId, 'members');
    const rows = await env.DB.prepare(`SELECT m.user_id,m.role,m.created_at,m.revoked_at,u.email,u.display_name,u.status
      FROM work_members m JOIN users u ON u.id=m.user_id WHERE m.work_id=? ORDER BY m.revoked_at IS NOT NULL,m.created_at`).bind(workId).all();
    return responseJson({ members: rows.results || [] });
  }

  const memberMatch = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/members\/([^/]+)$/u);
  if (memberMatch && request.method === 'DELETE') {
    const workId = decodeURIComponent(memberMatch[1]);
    const userId = decodeURIComponent(memberMatch[2]);
    const session = await requireWorkAction(request, env, workId, 'members');
    const target = await env.DB.prepare('SELECT role,revoked_at FROM work_members WHERE work_id=? AND user_id=?').bind(workId, userId).first();
    if (!target) throw new HttpError(404, 'member_not_found', '作品成员不存在。');
    if (target.role === 'owner') throw new HttpError(409, 'owner_protected', '不能撤销作品所有者。');
    await env.DB.prepare('UPDATE work_members SET revoked_at=? WHERE work_id=? AND user_id=?').bind(nowIso(), workId, userId).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
    await audit(env, session.user.id, 'work_member.revoke', 'work', workId, { memberId: userId });
    return responseJson({ ok: true });
  }

  const invitationsMatch = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/invitations$/u);
  if (invitationsMatch && request.method === 'GET') {
    const workId = decodeURIComponent(invitationsMatch[1]);
    await requireWorkAction(request, env, workId, 'members');
    const rows = await env.DB.prepare('SELECT id,email,role,expires_at,max_uses,used_count,revoked_at,created_at FROM invitations WHERE work_id=? ORDER BY created_at DESC LIMIT 200').bind(workId).all();
    return responseJson({ invitations: rows.results || [] });
  }
  if (invitationsMatch && request.method === 'POST') {
    const workId = decodeURIComponent(invitationsMatch[1]);
    const session = await requireWorkAction(request, env, workId, 'members');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const role = WORK_INVITE_ROLES.has(body.role) ? body.role : 'viewer';
    const profile = await readSiteProfile(env);
    const expiresHours = boundedInteger(body.expiresHours, 1, 720, profile.defaultInviteHours || 72);
    const maxUses = boundedInteger(body.maxUses, 1, 20, 1);
    const rawToken = randomToken(32);
    const id = makeId('invite');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + expiresHours * 3600_000).toISOString();
    await env.DB.prepare('INSERT INTO invitations(id,email,token_hash,role,work_id,expires_at,max_uses,used_count,revoked_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,NULL,?,?)')
      .bind(id, email, await sha256Hex(rawToken), role, workId, expiresAt, maxUses, 0, session.user.id, createdAt).run();
    await audit(env, session.user.id, 'work_invitation.create', 'work', workId, { invitationId: id, email, role, expiresAt, maxUses });
    return responseJson({ invitation: { id, email, role, workId, expiresAt, maxUses, token: rawToken } }, 201);
  }
  return null;
}

async function collaborationRoutes(request, env, pathname, url) {
  const itemsMatch = pathname.match(/^\/api\/collaboration\/works\/([^/]+)\/items$/u);
  if (itemsMatch && request.method === 'GET') {
    const workId = decodeURIComponent(itemsMatch[1]);
    await requireWorkAction(request, env, workId, 'read');
    const chapterId = boundedText(url.searchParams.get('chapterId'), 200);
    if (!chapterId) throw new HttpError(400, 'chapter_required', '缺少章节ID。');
    const [comments, suggestions] = await Promise.all([
      env.DB.prepare(`SELECT c.*,u.display_name AS creator_name FROM chapter_comments c JOIN users u ON u.id=c.created_by
        WHERE c.work_id=? AND c.chapter_id=? AND c.status!='deleted' ORDER BY c.created_at DESC LIMIT 300`).bind(workId, chapterId).all(),
      env.DB.prepare(`SELECT s.*,u.display_name AS creator_name,r.display_name AS resolver_name FROM chapter_suggestions s
        JOIN users u ON u.id=s.created_by LEFT JOIN users r ON r.id=s.resolved_by
        WHERE s.work_id=? AND s.chapter_id=? ORDER BY s.created_at DESC LIMIT 300`).bind(workId, chapterId).all()
    ]);
    return responseJson({ comments: comments.results || [], suggestions: suggestions.results || [] });
  }

  const commentsMatch = pathname.match(/^\/api\/collaboration\/works\/([^/]+)\/comments$/u);
  if (commentsMatch && request.method === 'POST') {
    const workId = decodeURIComponent(commentsMatch[1]);
    const session = await requireWorkAction(request, env, workId, 'comment');
    const body = await readJson(request);
    const id = makeId('comment');
    const timestamp = nowIso();
    const chapterId = boundedText(body.chapterId, 200);
    const commentBody = boundedText(body.body, 4000);
    if (!chapterId || !commentBody) throw new HttpError(400, 'invalid_comment', '章节和批注内容不能为空。');
    await env.DB.prepare(`INSERT INTO chapter_comments(id,work_id,chapter_id,paragraph_key,anchor_from,anchor_to,quoted_text,body,status,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, workId, chapterId, boundedText(body.paragraphKey, 240) || null,
        boundedInteger(body.anchorFrom, 0, 20_000_000, 0), boundedInteger(body.anchorTo, 0, 20_000_000, 0),
        boundedText(body.quotedText, 4000), commentBody, 'open', session.user.id, timestamp, timestamp
      ).run();
    await audit(env, session.user.id, 'comment.create', 'comment', id, { workId, chapterId });
    return responseJson({ commentId: id }, 201);
  }

  const commentMatch = pathname.match(/^\/api\/collaboration\/comments\/([^/]+)$/u);
  if (commentMatch && request.method === 'PATCH') {
    const comment = await env.DB.prepare('SELECT * FROM chapter_comments WHERE id=?').bind(commentMatch[1]).first();
    if (!comment) throw new HttpError(404, 'comment_not_found', '批注不存在。');
    const session = await requireWorkAction(request, env, comment.work_id, 'read');
    const body = await readJson(request);
    const nextStatus = ['open', 'resolved', 'deleted'].includes(body.status) ? body.status : comment.status;
    if (comment.created_by !== session.user.id && !can(session.role, 'write')) throw new HttpError(403, 'permission_denied', '只能处理自己的批注，或由作者和编辑处理。');
    await env.DB.prepare('UPDATE chapter_comments SET status=?,updated_at=? WHERE id=?').bind(nextStatus, nowIso(), comment.id).run();
    await audit(env, session.user.id, 'comment.status', 'comment', comment.id, { status: nextStatus });
    return responseJson({ commentId: comment.id, status: nextStatus });
  }

  const suggestionsMatch = pathname.match(/^\/api\/collaboration\/works\/([^/]+)\/suggestions$/u);
  if (suggestionsMatch && request.method === 'POST') {
    const workId = decodeURIComponent(suggestionsMatch[1]);
    const session = await requireWorkAction(request, env, workId, 'comment');
    const body = await readJson(request);
    const id = makeId('suggestion');
    const timestamp = nowIso();
    const chapterId = boundedText(body.chapterId, 200);
    const originalText = boundedText(body.originalText, 8000);
    const replacementText = typeof body.replacementText === 'string' ? body.replacementText.slice(0, 8000) : '';
    if (!chapterId || !originalText || originalText === replacementText) throw new HttpError(400, 'invalid_suggestion', '请选择原文并填写不同的替换内容。');
    await env.DB.prepare(`INSERT INTO chapter_suggestions(id,work_id,chapter_id,paragraph_key,anchor_from,anchor_to,original_text,replacement_text,reason,status,created_by,resolved_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?, 'open', ?,NULL,?,?)`).bind(
        id, workId, chapterId, boundedText(body.paragraphKey, 240) || null,
        boundedInteger(body.anchorFrom, 0, 20_000_000, 0), boundedInteger(body.anchorTo, 0, 20_000_000, 0),
        originalText, replacementText, boundedText(body.reason, 2000), session.user.id, timestamp, timestamp
      ).run();
    await audit(env, session.user.id, 'suggestion.create', 'suggestion', id, { workId, chapterId });
    return responseJson({ suggestionId: id }, 201);
  }

  const suggestionMatch = pathname.match(/^\/api\/collaboration\/suggestions\/([^/]+)$/u);
  if (suggestionMatch && request.method === 'PATCH') {
    const suggestion = await env.DB.prepare('SELECT * FROM chapter_suggestions WHERE id=?').bind(suggestionMatch[1]).first();
    if (!suggestion) throw new HttpError(404, 'suggestion_not_found', '修改建议不存在。');
    const session = await requireWorkAction(request, env, suggestion.work_id, 'write');
    const body = await readJson(request);
    const status = ['accepted', 'rejected', 'open', 'superseded'].includes(body.status) ? body.status : suggestion.status;
    await env.DB.prepare('UPDATE chapter_suggestions SET status=?,resolved_by=?,updated_at=? WHERE id=?')
      .bind(status, status === 'open' ? null : session.user.id, nowIso(), suggestion.id).run();
    await audit(env, session.user.id, 'suggestion.status', 'suggestion', suggestion.id, { status });
    return responseJson({ suggestionId: suggestion.id, status });
  }
  return null;
}

export async function handleMojieExtendedApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    assertSameOrigin(request);
    const handlers = [publicRoutes, adminRoutes, memberRoutes];
    for (const handler of handlers) {
      const response = await handler(request, env, url.pathname, url);
      if (response) return response;
    }
    return await collaborationRoutes(request, env, url.pathname, url);
  } catch (error) {
    if (error instanceof HttpError) return responseError(error.message, error.status, error.code, error.details);
    console.error('Mojie extended API error', error);
    return responseError('服务器内部错误。', 500, 'internal_error');
  }
}
