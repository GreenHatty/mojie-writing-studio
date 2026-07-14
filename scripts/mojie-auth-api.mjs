const SESSION_COOKIE = 'mojie_session';
const SESSION_DAYS = 14;
const PASSWORD_KDF = 'pbkdf2-sha256';
const PASSWORD_ITERATIONS = 100_000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '');
  const padded = normalized.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - normalized.length % 4) % 4);
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

async function derivePasswordDigest(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: fromBase64Url(salt),
    iterations
  }, material, 256);
  return toBase64Url(new Uint8Array(bits));
}

async function hashPassword(password, salt = randomToken(18)) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    throw new HttpError(400, 'weak_password', '密码长度必须为10到256个字符。');
  }
  const digest = await derivePasswordDigest(password, salt, PASSWORD_ITERATIONS);
  return { salt, hash: `${PASSWORD_KDF}$${PASSWORD_ITERATIONS}$${digest}` };
}

function parsePasswordHash(value) {
  const text = String(value || '');
  const match = text.match(/^pbkdf2-sha256\$(\d+)\$(.+)$/u);
  if (!match) return { iterations: PASSWORD_ITERATIONS, digest: text };
  return { iterations: Number(match[1]), digest: match[2] };
}

async function verifyPassword(password, salt, expected) {
  const parsed = parsePasswordHash(expected);
  if (!Number.isInteger(parsed.iterations) || parsed.iterations < 10_000 || parsed.iterations > PASSWORD_ITERATIONS) return false;
  let actual;
  try {
    actual = await derivePasswordDigest(String(password || ''), salt, parsed.iterations);
  } catch {
    return false;
  }
  if (actual.length !== parsed.digest.length) return false;
  let difference = 0;
  for (let index = 0; index < parsed.digest.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ parsed.digest.charCodeAt(index);
  }
  return difference === 0;
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

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
    throw new HttpError(400, 'invalid_email', '邮箱格式无效。');
  }
  return email;
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

async function createSession(request, env, userId) {
  const token = randomToken(32);
  const id = makeId('session');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(
    id,
    userId,
    await sha256Hex(token),
    expiresAt,
    createdAt,
    createdAt,
    (request.headers.get('user-agent') || '').slice(0, 500),
    await sha256Hex(ip)
  ).run();
  return { token, expiresAt };
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
  await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(nowIso(), row.session_id).run();
  return {
    sessionId: row.session_id,
    user: { id: row.id, email: row.email, displayName: row.display_name, globalRole: row.global_role }
  };
}

async function audit(env, actorId, action, targetType, targetId, metadata = {}) {
  await env.DB.prepare(
    'INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)'
  ).bind(makeId('audit'), actorId || null, action, targetType, targetId || null, JSON.stringify(metadata), nowIso()).run();
}

async function bootstrap(request, env) {
  if (!env.DB || !env.MOJIE_ADMIN_TOKEN) throw new HttpError(503, 'bootstrap_not_configured', '初始化密钥或数据库未配置。');
  if (request.headers.get('authorization') !== `Bearer ${env.MOJIE_ADMIN_TOKEN}`) {
    throw new HttpError(403, 'invalid_admin_token', '初始化密钥无效。');
  }
  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (Number(existing?.count || 0) > 0) throw new HttpError(409, 'already_bootstrapped', '站点已经完成初始化。');
  const body = await readJson(request);
  const email = validateEmail(body.email);
  const displayName = String(body.displayName || '').trim().slice(0, 80) || email.split('@')[0];
  const password = await hashPassword(body.password);
  const userId = makeId('user');
  const timestamp = nowIso();
  await env.DB.prepare(
    'INSERT INTO users(id,email,display_name,password_hash,password_salt,global_role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(userId, email, displayName, password.hash, password.salt, 'owner', 'active', timestamp, timestamp).run();
  const session = await createSession(request, env, userId);
  await audit(env, userId, 'site.bootstrap', 'user', userId, { passwordKdf: PASSWORD_KDF, iterations: PASSWORD_ITERATIONS });
  return responseJson({ user: { id: userId, email, displayName, globalRole: 'owner' } }, 201, { 'set-cookie': sessionCookie(session.token) });
}

async function acceptInvite(request, env) {
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
    env.DB.prepare(
      'INSERT INTO users(id,email,display_name,password_hash,password_salt,global_role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
    ).bind(userId, email, displayName, password.hash, password.salt, invitation.work_id ? 'viewer' : invitation.role, 'active', timestamp, timestamp),
    env.DB.prepare('UPDATE invitations SET used_count=used_count+1 WHERE id=?').bind(invitation.id)
  ];
  if (invitation.work_id) {
    statements.push(env.DB.prepare(
      'INSERT OR REPLACE INTO work_members(work_id,user_id,role,created_at,revoked_at) VALUES(?,?,?,?,NULL)'
    ).bind(invitation.work_id, userId, invitation.role, timestamp));
  }
  await env.DB.batch(statements);
  const session = await createSession(request, env, userId);
  await audit(env, userId, 'invitation.accept', 'invitation', invitation.id, { passwordKdf: PASSWORD_KDF, iterations: PASSWORD_ITERATIONS });
  return responseJson({
    user: { id: userId, email, displayName, globalRole: invitation.work_id ? 'viewer' : invitation.role }
  }, 201, { 'set-cookie': sessionCookie(session.token) });
}

async function login(request, env) {
  if (!env.DB) throw new HttpError(503, 'database_not_configured', '服务端数据库尚未配置。');
  const body = await readJson(request);
  const email = validateEmail(body.email);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
  const dummySalt = 'AAAAAAAAAAAAAAAAAAAAAAAA';
  const dummyHash = `${PASSWORD_KDF}$${PASSWORD_ITERATIONS}$${'A'.repeat(43)}`;
  const passwordMatches = await verifyPassword(
    String(body.password || ''),
    user?.password_salt || dummySalt,
    user?.password_hash || dummyHash
  );
  if (!user || user.status !== 'active' || !passwordMatches) {
    throw new HttpError(401, 'invalid_credentials', '邮箱或密码错误。');
  }
  const session = await createSession(request, env, user.id);
  await audit(env, user.id, 'auth.login', 'session', null);
  return responseJson({
    user: { id: user.id, email: user.email, displayName: user.display_name, globalRole: user.global_role }
  }, 200, { 'set-cookie': sessionCookie(session.token) });
}

export async function handleMojieAuthApi(request, env) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/auth/')) return null;
  try {
    assertSameOrigin(request);
    if (pathname === '/api/auth/bootstrap' && request.method === 'POST') return await bootstrap(request, env);
    if (pathname === '/api/auth/accept-invite' && request.method === 'POST') return await acceptInvite(request, env);
    if (pathname === '/api/auth/login' && request.method === 'POST') return await login(request, env);
    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      const session = await getSession(request, env, false);
      if (session) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(session.sessionId).run();
      return responseJson({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    }
    if (pathname === '/api/auth/session' && request.method === 'GET') {
      const session = await getSession(request, env, false);
      return responseJson({ authenticated: Boolean(session), user: session?.user || null, serverReady: Boolean(env.DB) });
    }
    return responseError('接口不存在。', 404, 'not_found');
  } catch (error) {
    if (error instanceof HttpError) return responseError(error.message, error.status, error.code, error.details);
    console.error(JSON.stringify({ event: 'legacy_auth_error', code: 'internal_error' }));
    return responseError('服务器内部错误。', 500, 'internal_error');
  }
}
