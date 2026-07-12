import { rankingAdapterFor, validateRankingUrl } from './ranking-adapters.mjs';

const SESSION_COOKIE = 'mojie_session';
const SESSION_DAYS = 14;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PLATFORM_HOSTS = {
  qidian: ['qidian.com', 'www.qidian.com'],
  fanqie: ['fanqienovel.com', 'www.fanqienovel.com']
};
const ROLE_ACTIONS = {
  owner: new Set(['invite', 'members', 'backups', 'rankings', 'write', 'comment', 'read']),
  admin: new Set(['invite', 'members', 'backups', 'rankings', 'write', 'comment', 'read']),
  writer: new Set(['write', 'comment', 'read']),
  editor: new Set(['write', 'comment', 'read']),
  commenter: new Set(['comment', 'read']),
  viewer: new Set(['read'])
};

function responseJson(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function responseError(message, status = 400, code = 'bad_request', details) {
  return responseJson({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);
}

async function readJson(request, maximumBytes = 1_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maximumBytes) throw new HttpError(413, 'payload_too_large', '请求内容过大。');
  const text = await request.text();
  if (text.length > maximumBytes) throw new HttpError(413, 'payload_too_large', '请求内容过大。');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON格式无效。');
  }
}

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
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

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

async function hmacSha256(key, value, output = 'bytes') {
  const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const result = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, typeof value === 'string' ? new TextEncoder().encode(value) : value));
  return output === 'hex' ? [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('') : result;
}

async function hashPassword(password, salt = randomToken(18)) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    throw new HttpError(400, 'weak_password', '密码长度必须为10到256个字符。');
  }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(salt), iterations: 310_000 }, material, 256);
  return { salt, hash: toBase64Url(new Uint8Array(bits)) };
}

async function verifyPassword(password, salt, expected) {
  const result = await hashPassword(password, salt);
  if (result.hash.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= result.hash.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
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

function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function assertSameOrigin(request) {
  if (!MUTATING.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'csrf_rejected', '请求来源校验失败。');
}

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email', '邮箱格式无效。');
  return email;
}

function validateRole(value) {
  const role = typeof value === 'string' ? value : '';
  if (!ROLE_ACTIONS[role]) throw new HttpError(400, 'invalid_role', '角色无效。');
  return role;
}

function can(role, action) {
  return Boolean(ROLE_ACTIONS[role]?.has(action));
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
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.display_name, u.global_role, u.status
     FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1`
  ).bind(tokenHash).first();
  if (!row || row.status !== 'active' || row.expires_at <= nowIso()) {
    if (row?.session_id) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(row.session_id).run();
    if (required) throw new HttpError(401, 'session_expired', '登录状态已过期。');
    return null;
  }
  env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(nowIso(), row.session_id).run().catch(() => undefined);
  return {
    sessionId: row.session_id,
    user: { id: row.id, email: row.email, displayName: row.display_name, globalRole: row.global_role }
  };
}

async function createSession(request, env, userId) {
  const token = randomToken(32);
  const id = makeId('session');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(id, userId, await sha256Hex(token), expiresAt, createdAt, createdAt, (request.headers.get('user-agent') || '').slice(0, 500), await sha256Hex(ip)).run();
  return { token, expiresAt };
}

async function requireGlobalAction(request, env, action) {
  const session = await getSession(request, env);
  if (!can(session.user.globalRole, action)) throw new HttpError(403, 'permission_denied', '当前账号没有执行此操作的权限。');
  return session;
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

async function audit(env, actorId, action, targetType, targetId, metadata = {}) {
  if (!env.DB) return;
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(makeId('audit'), actorId || null, action, targetType, targetId || null, JSON.stringify(metadata), nowIso()).run();
}

async function authRoutes(request, env, pathname) {
  if (pathname === '/api/auth/bootstrap' && request.method === 'POST') {
    if (!env.DB || !env.MOJIE_ADMIN_TOKEN) throw new HttpError(503, 'bootstrap_not_configured', '初始化密钥或数据库未配置。');
    if (request.headers.get('authorization') !== `Bearer ${env.MOJIE_ADMIN_TOKEN}`) throw new HttpError(403, 'invalid_admin_token', '初始化密钥无效。');
    const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    if (Number(existing?.count || 0) > 0) throw new HttpError(409, 'already_bootstrapped', '站点已经完成初始化。');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const displayName = String(body.displayName || '').trim().slice(0, 80) || email.split('@')[0];
    const password = await hashPassword(body.password);
    const userId = makeId('user');
    const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash,password_salt,global_role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(userId, email, displayName, password.hash, password.salt, 'owner', 'active', timestamp, timestamp).run();
    const session = await createSession(request, env, userId);
    await audit(env, userId, 'site.bootstrap', 'user', userId);
    return responseJson({ user: { id: userId, email, displayName, globalRole: 'owner' } }, 201, { 'set-cookie': sessionCookie(session.token) });
  }

  if (pathname === '/api/auth/accept-invite' && request.method === 'POST') {
    if (!env.DB) throw new HttpError(503, 'database_not_configured', '服务端数据库尚未配置。');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const tokenHash = await sha256Hex(String(body.token || ''));
    const invitation = await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? LIMIT 1').bind(tokenHash).first();
    if (!invitation || invitation.email.toLowerCase() !== email || invitation.revoked_at || invitation.expires_at <= nowIso() || invitation.used_count >= invitation.max_uses) {
      throw new HttpError(400, 'invalid_invitation', '邀请无效、已过期或已使用。');
    }
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(email).first();
    if (exists) throw new HttpError(409, 'account_exists', '该邮箱已经注册，请直接登录。');
    const displayName = String(body.displayName || '').trim().slice(0, 80) || email.split('@')[0];
    const password = await hashPassword(body.password);
    const userId = makeId('user');
    const timestamp = nowIso();
    const statements = [
      env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash,password_salt,global_role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(userId, email, displayName, password.hash, password.salt, invitation.work_id ? 'viewer' : invitation.role, 'active', timestamp, timestamp),
      env.DB.prepare('UPDATE invitations SET used_count=used_count+1 WHERE id=?').bind(invitation.id)
    ];
    if (invitation.work_id) statements.push(env.DB.prepare('INSERT OR REPLACE INTO work_members(work_id,user_id,role,created_at,revoked_at) VALUES(?,?,?,?,NULL)').bind(invitation.work_id, userId, invitation.role, timestamp));
    await env.DB.batch(statements);
    const session = await createSession(request, env, userId);
    await audit(env, userId, 'invitation.accept', 'invitation', invitation.id);
    return responseJson({ user: { id: userId, email, displayName, globalRole: invitation.work_id ? 'viewer' : invitation.role } }, 201, { 'set-cookie': sessionCookie(session.token) });
  }

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    if (!env.DB) throw new HttpError(503, 'database_not_configured', '服务端数据库尚未配置。');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const user = await env.DB.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
    if (!user || user.status !== 'active' || !(await verifyPassword(String(body.password || ''), user.password_salt, user.password_hash))) {
      throw new HttpError(401, 'invalid_credentials', '邮箱或密码错误。');
    }
    const session = await createSession(request, env, user.id);
    await audit(env, user.id, 'auth.login', 'session', null);
    return responseJson({ user: { id: user.id, email: user.email, displayName: user.display_name, globalRole: user.global_role } }, 200, { 'set-cookie': sessionCookie(session.token) });
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const session = await getSession(request, env, false);
    if (session) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(session.sessionId).run();
    return responseJson({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const session = await getSession(request, env, false);
    return responseJson({ authenticated: Boolean(session), user: session?.user || null, serverReady: Boolean(env.DB) });
  }

  if (pathname === '/api/admin/invitations' && request.method === 'POST') {
    const session = await requireGlobalAction(request, env, 'invite');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const role = validateRole(body.role || 'writer');
    const expiresHours = Math.min(720, Math.max(1, Number(body.expiresHours || 72)));
    const rawToken = randomToken(32);
    const id = makeId('invite');
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + expiresHours * 3600_000).toISOString();
    await env.DB.prepare('INSERT INTO invitations(id,email,token_hash,role,work_id,expires_at,max_uses,used_count,revoked_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,NULL,?,?)')
      .bind(id, email, await sha256Hex(rawToken), role, body.workId || null, expiresAt, 1, 0, session.user.id, createdAt).run();
    await audit(env, session.user.id, 'invitation.create', 'invitation', id, { email, role, workId: body.workId || null });
    return responseJson({ invitation: { id, email, role, workId: body.workId || null, expiresAt, token: rawToken } }, 201);
  }

  if (pathname === '/api/admin/invitations' && request.method === 'GET') {
    await requireGlobalAction(request, env, 'invite');
    const result = await env.DB.prepare('SELECT id,email,role,work_id,expires_at,max_uses,used_count,revoked_at,created_at FROM invitations ORDER BY created_at DESC LIMIT 200').all();
    return responseJson({ invitations: result.results || [] });
  }

  const invitationMatch = pathname.match(/^\/api\/admin\/invitations\/([^/]+)$/u);
  if (invitationMatch && request.method === 'DELETE') {
    const session = await requireGlobalAction(request, env, 'invite');
    await env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE id=?').bind(nowIso(), invitationMatch[1]).run();
    await audit(env, session.user.id, 'invitation.revoke', 'invitation', invitationMatch[1]);
    return responseJson({ ok: true });
  }
  return null;
}

async function cloudRoutes(request, env, pathname) {
  if (pathname === '/api/cloud/works' && request.method === 'GET') {
    const session = await getSession(request, env);
    const query = can(session.user.globalRole, 'members')
      ? env.DB.prepare('SELECT work_id,title,revision,updated_at,owner_id FROM cloud_documents WHERE deleted_at IS NULL ORDER BY updated_at DESC')
      : env.DB.prepare(`SELECT d.work_id,d.title,d.revision,d.updated_at,d.owner_id FROM cloud_documents d JOIN work_members m ON m.work_id=d.work_id WHERE m.user_id=? AND m.revoked_at IS NULL AND d.deleted_at IS NULL ORDER BY d.updated_at DESC`).bind(session.user.id);
    const result = await query.all();
    return responseJson({ works: result.results || [] });
  }

  const workMatch = pathname.match(/^\/api\/cloud\/works\/([^/]+)$/u);
  if (workMatch && request.method === 'GET') {
    const workId = decodeURIComponent(workMatch[1]);
    await requireWorkAction(request, env, workId, 'read');
    const document = await env.DB.prepare('SELECT * FROM cloud_documents WHERE work_id=? AND deleted_at IS NULL').bind(workId).first();
    if (!document) throw new HttpError(404, 'work_not_found', '云端作品不存在。');
    return responseJson({ work: { ...document, payload: JSON.parse(document.payload_json) } });
  }

  if (workMatch && request.method === 'PUT') {
    const workId = decodeURIComponent(workMatch[1]);
    const session = await getSession(request, env);
    const body = await readJson(request, 8_000_000);
    const payloadJson = JSON.stringify(body.payload ?? {});
    const contentHash = await sha256Hex(payloadJson);
    const existing = await env.DB.prepare('SELECT * FROM cloud_documents WHERE work_id=?').bind(workId).first();
    const timestamp = nowIso();
    if (!existing) {
      if (!can(session.user.globalRole, 'write')) throw new HttpError(403, 'permission_denied', '当前账号不能创建云端作品。');
      const title = String(body.title || body.payload?.title || '未命名作品').trim().slice(0, 200);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO cloud_documents(work_id,owner_id,title,revision,payload_json,content_hash,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,NULL)')
          .bind(workId, session.user.id, title, 1, payloadJson, contentHash, timestamp, timestamp),
        env.DB.prepare('INSERT INTO cloud_document_revisions(id,work_id,revision,payload_json,content_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(makeId('revision'), workId, 1, payloadJson, contentHash, session.user.id, timestamp),
        env.DB.prepare('INSERT OR REPLACE INTO work_members(work_id,user_id,role,created_at,revoked_at) VALUES(?,?,?,?,NULL)')
          .bind(workId, session.user.id, 'owner', timestamp)
      ]);
      await audit(env, session.user.id, 'cloud_work.create', 'work', workId);
      return responseJson({ workId, revision: 1, contentHash }, 201);
    }
    const role = await roleForWork(env, session.user, workId);
    if (!role || !can(role, 'write')) throw new HttpError(403, 'permission_denied', '没有写入该作品的权限。');
    if (Number(body.baseRevision) !== Number(existing.revision)) {
      throw new HttpError(409, 'revision_conflict', '云端作品已被更新，请先合并最新版本。', { currentRevision: existing.revision, currentHash: existing.content_hash });
    }
    const nextRevision = Number(existing.revision) + 1;
    const title = String(body.title || body.payload?.title || existing.title).trim().slice(0, 200);
    await env.DB.batch([
      env.DB.prepare('UPDATE cloud_documents SET title=?,revision=?,payload_json=?,content_hash=?,updated_at=?,deleted_at=NULL WHERE work_id=?')
        .bind(title, nextRevision, payloadJson, contentHash, timestamp, workId),
      env.DB.prepare('INSERT INTO cloud_document_revisions(id,work_id,revision,payload_json,content_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(makeId('revision'), workId, nextRevision, payloadJson, contentHash, session.user.id, timestamp)
    ]);
    await audit(env, session.user.id, 'cloud_work.update', 'work', workId, { revision: nextRevision });
    return responseJson({ workId, revision: nextRevision, contentHash });
  }

  const membersMatch = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/members$/u);
  if (membersMatch && request.method === 'POST') {
    const workId = decodeURIComponent(membersMatch[1]);
    const session = await requireWorkAction(request, env, workId, 'members');
    const body = await readJson(request);
    const email = validateEmail(body.email);
    const role = validateRole(body.role);
    const user = await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(email).first();
    if (!user) throw new HttpError(404, 'user_not_found', '该邮箱尚未注册。');
    await env.DB.prepare('INSERT OR REPLACE INTO work_members(work_id,user_id,role,created_at,revoked_at) VALUES(?,?,?,?,NULL)')
      .bind(workId, user.id, role, nowIso()).run();
    await audit(env, session.user.id, 'work_member.upsert', 'work', workId, { memberId: user.id, role });
    return responseJson({ ok: true });
  }
  return null;
}

async function docxRoutes(request, env, pathname) {
  const uploadMatch = pathname.match(/^\/api\/docx\/([^/]+)\/original$/u);
  if (uploadMatch && request.method === 'POST') {
    if (!env.DOCX_BUCKET) throw new HttpError(503, 'object_storage_not_configured', 'DOCX对象存储尚未配置。');
    const workId = decodeURIComponent(uploadMatch[1]);
    const session = await requireWorkAction(request, env, workId, 'write');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new HttpError(400, 'invalid_docx_size', 'DOCX文件必须在1字节到100MB之间。');
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new HttpError(400, 'invalid_docx', '文件不是有效的DOCX/ZIP包。');
    const id = makeId('docx');
    const originalHash = await sha256Hex(bytes);
    const objectKey = `docx/${session.user.id}/${workId}/${id}/original.docx`;
    const fileName = decodeURIComponent(request.headers.get('x-file-name') || 'document.docx').slice(0, 255);
    await env.DOCX_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, customMetadata: { originalHash, fileName } });
    const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO docx_assets(id,work_id,owner_id,file_name,object_key,original_hash,edited_hash,paragraph_count,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?,?)')
      .bind(id, workId, session.user.id, fileName, objectKey, originalHash, Number(request.headers.get('x-paragraph-count') || 0), timestamp, timestamp).run();
    await audit(env, session.user.id, 'docx.upload_original', 'docx', id, { workId, originalHash });
    return responseJson({ asset: { id, workId, fileName, originalHash } }, 201);
  }

  const assetMatch = pathname.match(/^\/api\/docx\/assets\/([^/]+)\/(original|edited)$/u);
  if (assetMatch && request.method === 'GET') {
    if (!env.DOCX_BUCKET) throw new HttpError(503, 'object_storage_not_configured', 'DOCX对象存储尚未配置。');
    const asset = await env.DB.prepare('SELECT * FROM docx_assets WHERE id=?').bind(assetMatch[1]).first();
    if (!asset) throw new HttpError(404, 'docx_not_found', 'DOCX文件不存在。');
    await requireWorkAction(request, env, asset.work_id, 'read');
    const key = assetMatch[2] === 'edited' && asset.edited_hash ? `${asset.object_key}.edited` : asset.object_key;
    const object = await env.DOCX_BUCKET.get(key);
    if (!object) throw new HttpError(404, 'docx_object_missing', 'DOCX对象不存在。');
    return new Response(object.body, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.file_name)}`,
        'etag': object.httpEtag,
        'cache-control': 'private, no-store'
      }
    });
  }

  if (assetMatch && assetMatch[2] === 'edited' && request.method === 'PUT') {
    if (!env.DOCX_BUCKET) throw new HttpError(503, 'object_storage_not_configured', 'DOCX对象存储尚未配置。');
    const asset = await env.DB.prepare('SELECT * FROM docx_assets WHERE id=?').bind(assetMatch[1]).first();
    if (!asset) throw new HttpError(404, 'docx_not_found', 'DOCX文件不存在。');
    const session = await requireWorkAction(request, env, asset.work_id, 'write');
    const bytes = new Uint8Array(await request.arrayBuffer());
    const editedHash = await sha256Hex(bytes);
    await env.DOCX_BUCKET.put(`${asset.object_key}.edited`, bytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, customMetadata: { originalHash: asset.original_hash, editedHash } });
    await env.DB.prepare('UPDATE docx_assets SET edited_hash=?,updated_at=? WHERE id=?').bind(editedHash, nowIso(), asset.id).run();
    await audit(env, session.user.id, 'docx.upload_edited', 'docx', asset.id, { editedHash });
    return responseJson({ assetId: asset.id, originalHash: asset.original_hash, editedHash });
  }
  return null;
}

function analyzeCommonElements(items) {
  const lexicon = ['系统','穿越','重生','开局','签到','觉醒','高武','修仙','玄幻','都市','末世','无限流','诸天','种田','基建','年代','甜宠','先婚后爱','豪门','总裁','权谋','宫斗','宅斗','复仇','逆袭','救赎','团宠','马甲','读心','直播','御兽','模拟','空间','逃荒','女强','无CP','爽文','悬疑','灵异','规则怪谈','历史','争霸','科幻','游戏','同人','衍生'];
  const counts = new Map();
  for (const item of items) {
    const text = `${item.title} ${item.tags?.join(' ') || ''} ${item.blurb || ''}`;
    for (const word of lexicon) if (text.includes(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([element, count]) => ({ element, count, share: Number((count / Math.max(1, items.length)).toFixed(2)) }));
  const titlePatterns = {
    identityPromise: items.filter((item) => /我在|成为|身为|开局/u.test(item.title)).length,
    mechanismPromise: items.filter((item) => /系统|签到|觉醒|模拟|读心|空间/u.test(item.title)).length,
    conflictPromise: items.filter((item) => /退婚|离婚|流放|末日|逃荒|复仇|逆袭/u.test(item.title)).length
  };
  return { sampleSize: items.length, common, titlePatterns, generatedAt: nowIso(), disclaimer: '只基于已授权抓取的公开榜单书名、标签和简介统计共性，不读取付费正文。' };
}

async function fetchRankingSource(source) {
  const result = await rankingAdapterFor(source.platform).fetchAndParse(source);
  if (!result.items.length) throw new Error('ranking_empty_result');
  return { items: result.items, sourceHash: await sha256Hex(result.raw) };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function updateRankingTask(env, taskId, status, progress, errorCode = null) {
  const finishedAt = ['completed', 'partial', 'failed', 'cancelled'].includes(status) ? nowIso() : null;
  await env.DB.prepare('UPDATE ranking_tasks SET status=?,progress=?,error_code=?,updated_at=?,finished_at=COALESCE(?,finished_at) WHERE id=?')
    .bind(status, progress, errorCode, nowIso(), finishedAt, taskId).run();
}

export async function processRankingTask(env, taskId) {
  const task = await env.DB.prepare('SELECT * FROM ranking_tasks WHERE id=?').bind(taskId).first();
  if (!task || task.status === 'cancelled') return;
  const sources = task.source_id
    ? await env.DB.prepare('SELECT * FROM ranking_sources WHERE id=? AND enabled=1').bind(task.source_id).all()
    : await env.DB.prepare('SELECT * FROM ranking_sources WHERE enabled=1 ORDER BY platform,list_name,category').all();
  const rows = sources.results || [];
  let successes = 0; const failures = [];
  await env.DB.prepare('UPDATE ranking_tasks SET status=?,attempts=attempts+1,progress=5,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?').bind('fetching', nowIso(), nowIso(), taskId).run();
  for (let index = 0; index < rows.length; index += 1) {
    const current = await env.DB.prepare('SELECT status FROM ranking_tasks WHERE id=?').bind(taskId).first();
    if (current?.status === 'cancelled') return;
    const source = rows[index];
    try {
      await updateRankingTask(env, taskId, 'fetching', Math.max(5, Math.floor(index / Math.max(1, rows.length) * 70)));
      const { items, sourceHash } = await fetchRankingSource(source);
      const afterFetch = await env.DB.prepare('SELECT status FROM ranking_tasks WHERE id=?').bind(taskId).first();
      if (afterFetch?.status === 'cancelled') return;
      await updateRankingTask(env, taskId, 'parsing', 75);
      if (!items.length) throw new Error('ranking_empty_result');
      await updateRankingTask(env, taskId, 'validating', 85);
      const capturedAt = nowIso();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO ranking_snapshots(id,source_id,captured_at,ranking_date,items_json,common_elements_json,source_hash) VALUES(?,?,?,?,?,?,?)')
          .bind(makeId('ranking'), source.id, capturedAt, capturedAt.slice(0, 10), JSON.stringify(items), JSON.stringify(analyzeCommonElements(items)), sourceHash),
        env.DB.prepare('UPDATE ranking_sources SET last_success_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(capturedAt, capturedAt, source.id)
      ]);
      successes += 1;
    } catch (error) {
      const code = (error instanceof Error ? error.message : 'ranking_failed').slice(0, 120);
      failures.push({ sourceId: source.id, code });
      await env.DB.prepare('UPDATE ranking_sources SET last_error=?,updated_at=? WHERE id=?').bind(code, nowIso(), source.id).run();
    }
  }
  const status = successes === rows.length && rows.length ? 'completed' : successes ? 'partial' : 'failed';
  await updateRankingTask(env, taskId, status, 100, failures[0]?.code || null);
  await audit(env, task.created_by, 'ranking.task.complete', 'ranking_task', taskId, { sources: rows.length, successes, failures: failures.length });
}

export async function runRankingCollection(env, actorId = null) {
  if (!env.DB) return { sources: 0, successes: 0, failures: [] };
  const rows = await env.DB.prepare('SELECT * FROM ranking_sources WHERE enabled=1 ORDER BY platform,list_name,category').all();
  const failures = [];
  let successes = 0;
  for (const source of rows.results || []) {
    try {
      const { items, sourceHash } = await fetchRankingSource(source);
      const capturedAt = nowIso();
      const rankingDate = capturedAt.slice(0, 10);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO ranking_snapshots(id,source_id,captured_at,ranking_date,items_json,common_elements_json,source_hash) VALUES(?,?,?,?,?,?,?)')
          .bind(makeId('ranking'), source.id, capturedAt, rankingDate, JSON.stringify(items), JSON.stringify(analyzeCommonElements(items)), sourceHash),
        env.DB.prepare('UPDATE ranking_sources SET last_success_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(capturedAt, capturedAt, source.id)
      ]);
      successes += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : '抓取失败';
      failures.push({ sourceId: source.id, message });
      await env.DB.prepare('UPDATE ranking_sources SET last_error=?,updated_at=? WHERE id=?').bind(message.slice(0, 1000), nowIso(), source.id).run();
    }
  }
  await audit(env, actorId, 'ranking.collect', 'ranking_sources', null, { successes, failures: failures.length });
  return { sources: (rows.results || []).length, successes, failures };
}

async function rankingRoutes(request, env, pathname, ctx) {
  if (pathname === '/api/rankings/sources' && request.method === 'GET') {
    await getSession(request, env);
    const rows = await env.DB.prepare('SELECT id,platform,list_name,category,source_url,parser_type,enabled,authorization_note,last_success_at,last_error,created_at,updated_at FROM ranking_sources ORDER BY platform,list_name,category').all();
    return responseJson({ sources: rows.results || [] });
  }
  if (pathname === '/api/rankings/sources' && request.method === 'POST') {
    const session = await requireGlobalAction(request, env, 'rankings');
    const body = await readJson(request);
    if (!['qidian', 'fanqie'].includes(body.platform)) throw new HttpError(400, 'invalid_platform', '平台必须为qidian或fanqie。');
    let sourceUrl;
    try { sourceUrl = validateRankingUrl(String(body.sourceUrl || ''), body.platform); }
    catch { throw new HttpError(400, 'invalid_source_host', '来源必须是对应平台的HTTPS授权域名。'); }
    const authorizationNote = String(body.authorizationNote || '').trim();
    if (authorizationNote.length < 5) throw new HttpError(400, 'authorization_required', '请记录该抓取来源的授权依据。');
    const id = body.id || makeId('source');
    const timestamp = nowIso();
    await env.DB.prepare(`INSERT INTO ranking_sources(id,platform,list_name,category,source_url,parser_type,enabled,authorization_note,last_success_at,last_error,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,?,?) ON CONFLICT(id) DO UPDATE SET platform=excluded.platform,list_name=excluded.list_name,category=excluded.category,source_url=excluded.source_url,parser_type=excluded.parser_type,enabled=excluded.enabled,authorization_note=excluded.authorization_note,updated_at=excluded.updated_at`)
      .bind(id, body.platform, String(body.listName || '综合榜').slice(0, 100), String(body.category || '全部').slice(0, 100), sourceUrl.toString(), 'auto', body.enabled === false ? 0 : 1, authorizationNote.slice(0, 1000), session.user.id, timestamp, timestamp).run();
    await audit(env, session.user.id, 'ranking_source.upsert', 'ranking_source', id);
    return responseJson({ sourceId: id }, 201);
  }
  if ((pathname === '/api/rankings/tasks' || pathname === '/api/rankings/run') && request.method === 'POST') {
    const session = await requireGlobalAction(request, env, 'rankings');
    const body = await readJson(request);
    const taskId = makeId('ranking-task'); const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO ranking_tasks(id,source_id,status,attempts,progress,error_code,created_by,created_at,updated_at) VALUES(?,?,?,0,0,NULL,?,?,?)')
      .bind(taskId, body.sourceId || null, 'queued', session.user.id, timestamp, timestamp).run();
    const promise = processRankingTask(env, taskId).catch((error) => updateRankingTask(env, taskId, 'failed', 100, error instanceof Error ? error.message.slice(0, 120) : 'ranking_failed'));
    if (ctx?.waitUntil) ctx.waitUntil(promise); else void promise;
    return responseJson({ taskId, status: 'queued' }, 202);
  }
  const taskMatch = pathname.match(/^\/api\/rankings\/tasks\/([^/]+)$/u);
  if (taskMatch && request.method === 'GET') {
    await requireGlobalAction(request, env, 'rankings');
    const task = await env.DB.prepare('SELECT id,source_id,status,attempts,progress,error_code,created_at,updated_at,started_at,finished_at FROM ranking_tasks WHERE id=?').bind(taskMatch[1]).first();
    if (!task) throw new HttpError(404, 'ranking_task_not_found', '榜单任务不存在。');
    return responseJson({ task });
  }
  if (taskMatch && request.method === 'DELETE') {
    await requireGlobalAction(request, env, 'rankings');
    await updateRankingTask(env, taskMatch[1], 'cancelled', 100);
    return responseJson({ taskId: taskMatch[1], status: 'cancelled' });
  }
  if (pathname === '/api/rankings/snapshots' && request.method === 'GET') {
    await getSession(request, env);
    const sourceId = new URL(request.url).searchParams.get('sourceId');
    const query = sourceId
      ? env.DB.prepare('SELECT * FROM ranking_snapshots WHERE source_id=? ORDER BY captured_at DESC LIMIT 20').bind(sourceId)
      : env.DB.prepare('SELECT s.*,r.platform,r.list_name,r.category FROM ranking_snapshots s JOIN ranking_sources r ON r.id=s.source_id WHERE s.id=(SELECT s2.id FROM ranking_snapshots s2 WHERE s2.source_id=s.source_id ORDER BY s2.captured_at DESC LIMIT 1) ORDER BY s.captured_at DESC LIMIT 50');
    const rows = await query.all();
    return responseJson({ snapshots: (rows.results || []).map((row) => ({ ...row, items: JSON.parse(row.items_json), commonElements: JSON.parse(row.common_elements_json) })) });
  }
  return null;
}

async function encryptionKey(env) {
  if (!env.MOJIE_BACKUP_MASTER_KEY) throw new HttpError(503, 'backup_key_not_configured', '备份凭据加密主密钥尚未配置。');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.MOJIE_BACKUP_MASTER_KEY)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptConfig(env, value) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), new TextEncoder().encode(JSON.stringify(value))));
  return `${toBase64Url(iv)}.${toBase64Url(encrypted)}`;
}

async function decryptConfig(env, value) {
  const [iv, encrypted] = String(value).split('.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await encryptionKey(env), fromBase64Url(encrypted));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function backupPolicyValues(body) {
  const intervalMinutes = Number(body.intervalMinutes);
  const retentionHours = Number(body.retentionHours);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43_200) throw new HttpError(400, 'invalid_interval', '自动备份间隔必须为5分钟到30天。');
  if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 8_760) throw new HttpError(400, 'invalid_retention', '备份保留时间必须为1小时到365天。');
  if (!['r2', 'webdav', 's3-compatible'].includes(body.targetType)) throw new HttpError(400, 'invalid_backup_target', '备份目标类型无效。');
  return { intervalMinutes, retentionHours };
}

function basicAuthorization(username, password) {
  return `Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`;
}

async function s3Request(config, method, key, body) {
  const endpoint = new URL(config.endpoint);
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const pathStyle = config.pathStyle !== false;
  const host = pathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const pathname = pathStyle ? `/${encodeURIComponent(config.bucket)}/${encodedKey}` : `/${encodedKey}`;
  const url = `${endpoint.protocol}//${host}${pathname}`;
  const timestamp = new Date();
  const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  const date = amzDate.slice(0, 8);
  const region = config.region || 'auto';
  const payload = body || new Uint8Array();
  const payloadHash = await sha256Hex(payload);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;
  const dateKey = await hmacSha256(`AWS4${config.secretAccessKey}`, date);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, 's3');
  const signingKey = await hmacSha256(serviceKey, 'aws4_request');
  const signature = await hmacSha256(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetchWithTimeout(url, { method, body: method === 'PUT' ? payload : undefined, headers: { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, authorization, 'content-type': 'application/json' } }, 15_000);
  if (!response.ok && response.status !== 404) throw new Error(`S3兼容存储返回HTTP ${response.status}`);
}

async function putBackup(env, targetType, config, key, bytes) {
  if (targetType === 'r2') {
    if (!env.BACKUP_BUCKET) throw new Error('R2备份桶未配置');
    await env.BACKUP_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
    return;
  }
  if (targetType === 'webdav') {
    const url = new URL(`${String(config.baseUrl).replace(/\/+$/u, '')}/${key.split('/').map(encodeURIComponent).join('/')}`);
    const response = await fetchWithTimeout(url, { method: 'PUT', body: bytes, headers: { authorization: basicAuthorization(config.username || '', config.password || ''), 'content-type': 'application/json' } }, 15_000);
    if (!response.ok) throw new Error(`WebDAV返回HTTP ${response.status}`);
    return;
  }
  await s3Request(config, 'PUT', key, bytes);
}

async function deleteBackup(env, targetType, config, key) {
  if (targetType === 'r2') {
    if (!env.BACKUP_BUCKET) throw new Error('R2备份桶未配置');
    await env.BACKUP_BUCKET.delete(key);
    return;
  }
  if (targetType === 'webdav') {
    const url = new URL(`${String(config.baseUrl).replace(/\/+$/u, '')}/${key.split('/').map(encodeURIComponent).join('/')}`);
    const response = await fetchWithTimeout(url, { method: 'DELETE', headers: { authorization: basicAuthorization(config.username || '', config.password || '') } });
    if (!response.ok && response.status !== 404) throw new Error(`WebDAV删除返回HTTP ${response.status}`);
    return;
  }
  await s3Request(config, 'DELETE', key);
}

export async function runBackups(env, actorId = null) {
  if (!env.DB) return { policies: 0, created: 0, deleted: 0, failures: [] };
  const current = nowIso();
  const due = await env.DB.prepare('SELECT * FROM backup_policies WHERE enabled=1 AND (next_backup_at IS NULL OR next_backup_at<=?) ORDER BY next_backup_at LIMIT 100').bind(current).all();
  const failures = [];
  let created = 0;
  for (const policy of due.results || []) {
    try {
      const config = await decryptConfig(env, policy.target_config_encrypted);
      const documents = policy.work_id
        ? await env.DB.prepare('SELECT * FROM cloud_documents WHERE work_id=? AND deleted_at IS NULL').bind(policy.work_id).all()
        : await env.DB.prepare('SELECT * FROM cloud_documents WHERE owner_id=? AND deleted_at IS NULL').bind(policy.owner_id).all();
      const envelope = { schemaVersion: 1, createdAt: current, ownerId: policy.owner_id, workId: policy.work_id || null, documents: (documents.results || []).map((document) => ({ workId: document.work_id, title: document.title, revision: document.revision, contentHash: document.content_hash, payload: JSON.parse(document.payload_json), updatedAt: document.updated_at })) };
      const bytes = new TextEncoder().encode(JSON.stringify(envelope));
      const hash = await sha256Hex(bytes);
      const key = `mojie-temp-backups/${policy.owner_id}/${policy.work_id || 'all'}/${current.replace(/[:.]/gu, '-')}-${hash.slice(0, 12)}.json`;
      await putBackup(env, policy.target_type, config, key, bytes);
      const expiresAt = new Date(Date.now() + Number(policy.retention_hours) * 3600_000).toISOString();
      const nextBackupAt = new Date(Date.now() + Number(policy.interval_minutes) * 60_000).toISOString();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO backup_objects(id,policy_id,owner_id,work_id,target_type,object_key,content_hash,size_bytes,created_at,expires_at,deleted_at,delete_error) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)')
          .bind(makeId('backup'), policy.id, policy.owner_id, policy.work_id || null, policy.target_type, key, hash, bytes.byteLength, current, expiresAt),
        env.DB.prepare('UPDATE backup_policies SET last_backup_at=?,next_backup_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(current, nextBackupAt, current, policy.id)
      ]);
      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : '备份失败';
      failures.push({ policyId: policy.id, message });
      await env.DB.prepare('UPDATE backup_policies SET last_error=?,updated_at=? WHERE id=?').bind(message.slice(0, 1000), current, policy.id).run();
    }
  }

  const expired = await env.DB.prepare('SELECT b.*,p.target_config_encrypted FROM backup_objects b JOIN backup_policies p ON p.id=b.policy_id WHERE b.deleted_at IS NULL AND b.expires_at<=? ORDER BY b.expires_at LIMIT 200').bind(current).all();
  let deleted = 0;
  for (const backup of expired.results || []) {
    try {
      const config = await decryptConfig(env, backup.target_config_encrypted);
      await deleteBackup(env, backup.target_type, config, backup.object_key);
      await env.DB.prepare('UPDATE backup_objects SET deleted_at=?,delete_error=NULL WHERE id=?').bind(current, backup.id).run();
      deleted += 1;
    } catch (error) {
      await env.DB.prepare('UPDATE backup_objects SET delete_error=? WHERE id=?').bind((error instanceof Error ? error.message : '删除失败').slice(0, 1000), backup.id).run();
    }
  }
  await audit(env, actorId, 'backup.run', 'backup_policies', null, { created, deleted, failures: failures.length });
  return { policies: (due.results || []).length, created, deleted, failures };
}

async function backupRoutes(request, env, pathname) {
  if (pathname === '/api/backups/policies' && request.method === 'GET') {
    const session = await requireGlobalAction(request, env, 'backups');
    const rows = await env.DB.prepare('SELECT id,owner_id,work_id,target_type,enabled,interval_minutes,retention_hours,last_backup_at,next_backup_at,last_error,created_at,updated_at FROM backup_policies WHERE owner_id=? ORDER BY created_at DESC').bind(session.user.id).all();
    return responseJson({ policies: rows.results || [] });
  }
  if (pathname === '/api/backups/policies' && request.method === 'POST') {
    const session = await requireGlobalAction(request, env, 'backups');
    const body = await readJson(request);
    const values = backupPolicyValues(body);
    const id = body.id || makeId('policy');
    const timestamp = nowIso();
    const nextBackupAt = body.enabled === false ? null : new Date(Date.now() + values.intervalMinutes * 60_000).toISOString();
    const encrypted = await encryptConfig(env, body.config || {});
    await env.DB.prepare(`INSERT INTO backup_policies(id,owner_id,work_id,target_type,enabled,interval_minutes,retention_hours,target_config_encrypted,last_backup_at,next_backup_at,last_error,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,NULL,?,NULL,?,?) ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id,target_type=excluded.target_type,enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,retention_hours=excluded.retention_hours,target_config_encrypted=excluded.target_config_encrypted,next_backup_at=excluded.next_backup_at,last_error=NULL,updated_at=excluded.updated_at`)
      .bind(id, session.user.id, body.workId || null, body.targetType, body.enabled === false ? 0 : 1, values.intervalMinutes, values.retentionHours, encrypted, nextBackupAt, timestamp, timestamp).run();
    await audit(env, session.user.id, 'backup_policy.upsert', 'backup_policy', id, { targetType: body.targetType, intervalMinutes: values.intervalMinutes, retentionHours: values.retentionHours });
    return responseJson({ policyId: id, nextBackupAt }, 201);
  }
  if (pathname === '/api/backups/run' && request.method === 'POST') {
    const session = await requireGlobalAction(request, env, 'backups');
    return responseJson(await runBackups(env, session.user.id));
  }
  const policyMatch = pathname.match(/^\/api\/backups\/policies\/([^/]+)$/u);
  if (policyMatch && request.method === 'DELETE') {
    const session = await requireGlobalAction(request, env, 'backups');
    const policy = await env.DB.prepare('SELECT owner_id FROM backup_policies WHERE id=?').bind(policyMatch[1]).first();
    if (!policy || policy.owner_id !== session.user.id) throw new HttpError(404, 'policy_not_found', '备份策略不存在。');
    await env.DB.prepare('UPDATE backup_policies SET enabled=0,updated_at=? WHERE id=?').bind(nowIso(), policyMatch[1]).run();
    await audit(env, session.user.id, 'backup_policy.disable', 'backup_policy', policyMatch[1]);
    return responseJson({ ok: true });
  }
  return null;
}

export async function handleMojieApi(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    assertSameOrigin(request);
    const routeHandlers = [authRoutes, cloudRoutes, docxRoutes, rankingRoutes, backupRoutes];
    for (const handler of routeHandlers) {
      const response = await handler(request, env, url.pathname, ctx);
      if (response) return response;
    }
    return responseError('接口不存在。', 404, 'not_found');
  } catch (error) {
    if (error instanceof HttpError) return responseError(error.message, error.status, error.code, error.details);
    console.error('Mojie API error', error);
    return responseError('服务器内部错误。', 500, 'internal_error');
  }
}

export async function handleMojieScheduled(env, ctx) {
  const task = Promise.allSettled([runRankingCollection(env), runBackups(env)]);
  ctx.waitUntil(task);
  return task;
}
