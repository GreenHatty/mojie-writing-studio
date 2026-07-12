const SESSION_COOKIE = 'mojie_session';
const ROLE_ACTIONS = {
  owner: new Set(['members', 'write', 'comment', 'read']),
  admin: new Set(['members', 'write', 'comment', 'read']),
  writer: new Set(['write', 'comment', 'read']),
  editor: new Set(['write', 'comment', 'read']),
  commenter: new Set(['comment', 'read']),
  viewer: new Set(['read'])
};

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function denied(message = '没有该作品的访问权限。') {
  return responseJson({ error: { code: 'permission_denied', message } }, 403);
}

function unauthenticated() {
  return responseJson({ error: { code: 'not_authenticated', message: '请先登录。' } }, 401);
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

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sessionUser(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? LIMIT 1`
  ).bind(await sha256Hex(token)).first();
  if (!row || row.status !== 'active' || row.expires_at <= new Date().toISOString()) return null;
  return { id: row.id };
}

async function memberRole(env, userId, workId) {
  const row = await env.DB.prepare(
    'SELECT role FROM work_members WHERE work_id=? AND user_id=? AND revoked_at IS NULL LIMIT 1'
  ).bind(workId, userId).first();
  return row?.role || null;
}

function can(role, action) {
  return Boolean(ROLE_ACTIONS[role]?.has(action));
}

function routeRequirement(pathname, method) {
  let match = pathname.match(/^\/api\/cloud\/works\/([^/]+)$/u);
  if (match) return { workId: decodeURIComponent(match[1]), action: method === 'GET' ? 'read' : method === 'PUT' ? 'write' : null };

  match = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/(members|invitations)$/u);
  if (match) return { workId: decodeURIComponent(match[1]), action: 'members' };

  match = pathname.match(/^\/api\/cloud\/works\/([^/]+)\/members\/[^/]+$/u);
  if (match) return { workId: decodeURIComponent(match[1]), action: 'members' };

  match = pathname.match(/^\/api\/docx\/([^/]+)\/original$/u);
  if (match) return { workId: decodeURIComponent(match[1]), action: 'write' };

  match = pathname.match(/^\/api\/collaboration\/works\/([^/]+)\/(items|comments|suggestions)$/u);
  if (match) {
    const action = match[2] === 'items' ? 'read' : 'comment';
    return { workId: decodeURIComponent(match[1]), action };
  }
  return null;
}

async function assetRequirement(env, pathname, method) {
  const docx = pathname.match(/^\/api\/docx\/assets\/([^/]+)\/(original|edited)$/u);
  if (docx) {
    const row = await env.DB.prepare('SELECT work_id FROM docx_assets WHERE id=? LIMIT 1').bind(docx[1]).first();
    return row?.work_id ? { workId: row.work_id, action: method === 'GET' ? 'read' : 'write' } : null;
  }
  const comment = pathname.match(/^\/api\/collaboration\/comments\/([^/]+)$/u);
  if (comment) {
    const row = await env.DB.prepare('SELECT work_id FROM chapter_comments WHERE id=? LIMIT 1').bind(comment[1]).first();
    return row?.work_id ? { workId: row.work_id, action: 'read' } : null;
  }
  const suggestion = pathname.match(/^\/api\/collaboration\/suggestions\/([^/]+)$/u);
  if (suggestion) {
    const row = await env.DB.prepare('SELECT work_id FROM chapter_suggestions WHERE id=? LIMIT 1').bind(suggestion[1]).first();
    return row?.work_id ? { workId: row.work_id, action: 'write' } : null;
  }
  return null;
}

export async function guardMojiePrivateContent(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;

  if (url.pathname === '/api/cloud/works' && request.method === 'GET') {
    const user = await sessionUser(request, env);
    if (!user) return unauthenticated();
    const rows = await env.DB.prepare(`SELECT d.work_id,d.title,d.revision,d.updated_at,d.owner_id,m.role
      FROM cloud_documents d JOIN work_members m ON m.work_id=d.work_id
      WHERE m.user_id=? AND m.revoked_at IS NULL AND d.deleted_at IS NULL ORDER BY d.updated_at DESC`)
      .bind(user.id).all();
    return responseJson({ works: rows.results || [] });
  }

  let requirement = routeRequirement(url.pathname, request.method);
  if (!requirement) requirement = await assetRequirement(env, url.pathname, request.method);
  if (!requirement?.action) return null;

  const user = await sessionUser(request, env);
  if (!user) return unauthenticated();
  const role = await memberRole(env, user.id, requirement.workId);
  if (!role || !can(role, requirement.action)) return denied();
  return null;
}
