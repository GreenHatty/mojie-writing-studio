import { backupAdapterFor, validateBackupUrl } from './backup-adapters.mjs';
import { rankingAdapterFor, validateRankingUrl } from './ranking-adapters.mjs';
import { CORE_PREMISE_SYSTEM_PROMPT } from './core-premise-prompt.mjs';

const terminalRankingStatuses = new Set(['completed', 'partial', 'failed', 'cancelled']);
const terminalBackupStatuses = new Set(['completed', 'partial', 'failed', 'cancelled']);

function nowIso() { return new Date().toISOString(); }
function makeId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function base64url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
async function sha256(value, output = 'base64url') {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return output === 'hex' ? [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('') : base64url(digest);
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' } });
}
function errorJson(code, status, details) { return responseJson({ error: { code, ...(details ? { details } : {}) } }, status); }
function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const [rawName, ...values] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(values.join('='));
  }
  return null;
}
function constantTimeEqual(left, right) {
  const a = String(left || ''); const b = String(right || '');
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}
function cookieNames(env) {
  const origin = new URL(env.APP_ORIGIN);
  if (env.NODE_ENV !== 'development' && origin.protocol !== 'https:') throw new OperationError('CONFIGURATION_REQUIRED', 503);
  return env.NODE_ENV === 'development' ? { session: 'mojie-dev-session', csrf: 'mojie-dev-csrf' } : { session: '__Host-mojie-session', csrf: '__Host-mojie-csrf' };
}

class OperationError extends Error {
  constructor(code, status = 400, details) { super(code); this.code = code; this.status = status; this.details = details; }
}

async function readJson(request, maximumBytes = 256_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maximumBytes) throw new OperationError('PAYLOAD_TOO_LARGE', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new OperationError('PAYLOAD_TOO_LARGE', 413);
  try { return text ? JSON.parse(text) : {}; } catch { throw new OperationError('INVALID_JSON', 400); }
}

async function sessionFor(request, env) {
  if (!env.DB || !env.APP_ORIGIN) throw new OperationError('CONFIGURATION_REQUIRED', 503);
  const names = cookieNames(env);
  const token = readCookie(request.headers.get('cookie'), names.session);
  if (!token) throw new OperationError('UNAUTHENTICATED', 401);
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT s.user_id,s.csrf_state,s.expires_at,s.absolute_expires_at,s.revoked_at,a.account_identifier,a.platform_role
    FROM platform_sessions s JOIN platform_accounts a ON a.id=s.user_id WHERE s.token_hash=? LIMIT 1`).bind(tokenHash).first();
  const now = Date.now();
  if (!row || row.revoked_at || now >= Date.parse(row.expires_at) || now >= Date.parse(row.absolute_expires_at)) throw new OperationError('UNAUTHENTICATED', 401);
  return { userId: row.user_id, account: row.account_identifier, platformRole: row.platform_role, csrfState: row.csrf_state, names };
}

async function requireMutation(request, env, ownerOnly = false) {
  const session = await sessionFor(request, env);
  if (new URL(request.url).origin !== env.APP_ORIGIN || request.headers.get('origin') !== env.APP_ORIGIN) throw new OperationError('CSRF_REJECTED', 403);
  const cookie = readCookie(request.headers.get('cookie'), session.names.csrf);
  const header = request.headers.get('x-csrf-token');
  if (!constantTimeEqual(cookie, header) || !constantTimeEqual(cookie, session.csrfState)) throw new OperationError('CSRF_REJECTED', 403);
  if (ownerOnly && session.platformRole !== 'OWNER') throw new OperationError('FORBIDDEN', 403);
  return session;
}

async function requireWorkAccess(env, userId, workId, write = false, ownerOnly = false) {
  const row = await env.DB.prepare(`SELECT w.id,w.owner_id,CASE WHEN w.owner_id=? THEN 'WORK_OWNER' ELSE wa.role END AS access_role
    FROM works w LEFT JOIN work_access wa ON wa.work_id=w.id AND wa.user_id=? AND wa.revoked_at IS NULL
    WHERE w.id=? AND w.deleted_at IS NULL AND (w.owner_id=? OR wa.user_id IS NOT NULL) LIMIT 1`)
    .bind(userId, userId, workId, userId).first();
  if (!row) throw new OperationError('NOT_FOUND', 404);
  if (ownerOnly && row.access_role !== 'WORK_OWNER') throw new OperationError('FORBIDDEN', 403);
  if (write && !['WORK_OWNER', 'EDITOR'].includes(row.access_role)) throw new OperationError('FORBIDDEN', 403);
  return row;
}

async function audit(env, actorId, action, targetType, targetId, metadata = {}) {
  await env.DB.prepare('INSERT INTO platform_audit_logs(id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(makeId('audit'), actorId, action, targetType, targetId || '', JSON.stringify(metadata), nowIso()).run();
}

function parseCsvLine(line) {
  const values = []; let current = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') { if (quoted && line[index + 1] === '"') { current += '"'; index += 1; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { values.push(current.trim()); current = ''; }
    else current += character;
  }
  values.push(current.trim()); return values;
}

function normalizeRankingItem(value, index) {
  const rank = Number(value.rank ?? index + 1);
  const title = String(value.title ?? value.bookName ?? '').trim();
  const author = String(value.author ?? value.authorName ?? '').trim();
  if (!Number.isInteger(rank) || rank < 1 || !title) throw new OperationError('INVALID_RANKING_ITEM', 400);
  const tags = Array.isArray(value.tags) ? value.tags.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 20) : String(value.tags || '').split(/[|、;,，]/u).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return { rank, title: title.slice(0, 200), author: author.slice(0, 120), blurb: String(value.blurb ?? value.description ?? '').trim().slice(0, 4_000), tags, url: String(value.url ?? value.publicUrl ?? '').trim().slice(0, 2_000) };
}

export function parseManualRankings(content, format) {
  let rows;
  if (format === 'json') {
    try { rows = JSON.parse(content); } catch { throw new OperationError('INVALID_RANKING_JSON', 400); }
    if (!Array.isArray(rows)) throw new OperationError('INVALID_RANKING_JSON', 400);
  } else if (format === 'csv') {
    const lines = content.replace(/\r\n?/gu, '\n').split('\n').filter((line) => line.trim());
    if (lines.length < 2) throw new OperationError('INVALID_RANKING_CSV', 400);
    const headers = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
    rows = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? '']))).map((row) => ({
      rank: row.rank ?? row['排名'], title: row.title ?? row['作品名'], author: row.author ?? row['作者'], blurb: row.blurb ?? row['简介'], tags: row.tags ?? row['标签'], url: row.url ?? row['链接']
    }));
  } else throw new OperationError('INVALID_IMPORT_FORMAT', 400);
  const deduped = new Map();
  for (const [index, row] of rows.entries()) {
    const item = normalizeRankingItem(row, index);
    const key = `${item.url || item.title}:${item.author}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const items = [...deduped.values()].sort((left, right) => left.rank - right.rank).slice(0, 10).map((item, index) => ({ ...item, rank: index + 1 }));
  if (!items.length) throw new OperationError('RANKING_EMPTY_RESULT', 400);
  return items;
}

export function analyzeRankingItems(items) {
  const lexicon = ['系统','穿越','重生','开局','高武','修仙','玄幻','都市','末世','无限流','诸天','种田','年代','甜宠','豪门','权谋','复仇','逆袭','救赎','团宠','读心','直播','御兽','模拟','空间','悬疑','历史','科幻','同人'];
  const counts = new Map();
  for (const item of items) {
    const text = `${item.title} ${item.tags.join(' ')} ${item.blurb}`;
    for (const word of lexicon) if (text.includes(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return {
    sampleSize: items.length,
    common: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([element, count]) => ({ element, count, share: Number((count / items.length).toFixed(2)) })),
    disclaimer: '只依据公开书名、标签和简介进行结构性推测，不代表平台或作者官方解释，也不得用于复制具体内容。'
  };
}

function withRankChanges(items, previousItems) {
  const previous = new Map(previousItems.map((item) => [`${item.url || item.title}:${item.author}`, Number(item.rank)]));
  return items.map((item) => ({ ...item, rankChange: previous.has(`${item.url || item.title}:${item.author}`) ? previous.get(`${item.url || item.title}:${item.author}`) - item.rank : null }));
}

async function saveRankingSnapshot(env, source, items, sourceHash, importMode, rankingDate = nowIso().slice(0, 10)) {
  const previous = await env.DB.prepare('SELECT items_json FROM core_ranking_snapshots WHERE source_id=? ORDER BY captured_at DESC LIMIT 1').bind(source.id).first();
  let previousItems = [];
  try { previousItems = previous ? JSON.parse(previous.items_json) : []; } catch { previousItems = []; }
  const changed = withRankChanges(items, previousItems);
  const capturedAt = nowIso();
  const id = makeId('ranking');
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO core_ranking_snapshots(id,source_id,ranking_date,captured_at,item_count,items_json,analysis_json,source_hash,import_mode) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(id, source.id, rankingDate, capturedAt, changed.length, JSON.stringify(changed), JSON.stringify(analyzeRankingItems(changed)), sourceHash, importMode),
      env.DB.prepare('UPDATE core_ranking_sources SET last_success_at=?,last_error_code=NULL,updated_at=? WHERE id=?').bind(capturedAt, capturedAt, source.id)
    ]);
  } catch (error) {
    if (!String(error).includes('UNIQUE')) throw error;
  }
  return id;
}

async function updateRankingTask(env, taskId, status, progress, errorCode = null) {
  await env.DB.prepare('UPDATE core_ranking_tasks SET status=?,progress=?,error_code=?,updated_at=?,finished_at=? WHERE id=?')
    .bind(status, progress, errorCode, nowIso(), terminalRankingStatuses.has(status) ? nowIso() : null, taskId).run();
}

export async function processCoreRankingTask(env, taskId) {
  const task = await env.DB.prepare('SELECT * FROM core_ranking_tasks WHERE id=?').bind(taskId).first();
  if (!task || task.status === 'cancelled' || terminalRankingStatuses.has(task.status)) return;
  const sources = task.source_id
    ? await env.DB.prepare('SELECT * FROM core_ranking_sources WHERE id=? AND enabled=1').bind(task.source_id).all()
    : await env.DB.prepare('SELECT * FROM core_ranking_sources WHERE enabled=1 ORDER BY platform,list_name,category LIMIT 20').all();
  const rows = sources.results || [];
  if (!rows.length) { await updateRankingTask(env, taskId, 'failed', 100, 'RANKING_SOURCE_UNAVAILABLE'); return; }
  await env.DB.prepare('UPDATE core_ranking_tasks SET status=?,attempts=attempts+1,progress=5,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?').bind('fetching', nowIso(), nowIso(), taskId).run();
  let successes = 0; const failures = [];
  for (let index = 0; index < rows.length; index += 1) {
    if ((await env.DB.prepare('SELECT status FROM core_ranking_tasks WHERE id=?').bind(taskId).first())?.status === 'cancelled') return;
    const source = rows[index];
    try {
      await updateRankingTask(env, taskId, 'fetching', 10 + Math.floor(index / rows.length * 55));
      const result = await rankingAdapterFor(source.platform).fetchAndParse({ platform: source.platform, source_url: source.source_url });
      await updateRankingTask(env, taskId, 'parsing', 70);
      const items = result.items.map(normalizeRankingItem).slice(0, 10);
      if (!items.length) throw new Error('RANKING_EMPTY_RESULT');
      await updateRankingTask(env, taskId, 'validating', 85);
      await saveRankingSnapshot(env, source, items, await sha256(result.raw, 'hex'), 'adapter');
      successes += 1;
    } catch (error) {
      const code = (error instanceof Error ? error.message : 'RANKING_FAILED').slice(0, 120);
      failures.push(code);
      await env.DB.prepare('UPDATE core_ranking_sources SET last_error_code=?,updated_at=? WHERE id=?').bind(code, nowIso(), source.id).run();
    }
  }
  await updateRankingTask(env, taskId, successes === rows.length ? 'completed' : successes ? 'partial' : 'failed', 100, failures[0] || null);
  await audit(env, task.created_by, 'ranking.task.complete', 'core_ranking_task', taskId, { sourceCount: rows.length, successes, failures: failures.length });
}

async function rankingRoutes(request, env, pathname, ctx) {
  if (pathname === '/api/core/rankings/sources' && request.method === 'GET') {
    await sessionFor(request, env);
    const rows = await env.DB.prepare(`SELECT s.*,
      (SELECT rs.id FROM core_ranking_snapshots rs WHERE rs.source_id=s.id ORDER BY rs.captured_at DESC LIMIT 1) AS snapshot_id,
      (SELECT rs.ranking_date FROM core_ranking_snapshots rs WHERE rs.source_id=s.id ORDER BY rs.captured_at DESC LIMIT 1) AS ranking_date,
      (SELECT rs.items_json FROM core_ranking_snapshots rs WHERE rs.source_id=s.id ORDER BY rs.captured_at DESC LIMIT 1) AS items_json,
      (SELECT rs.analysis_json FROM core_ranking_snapshots rs WHERE rs.source_id=s.id ORDER BY rs.captured_at DESC LIMIT 1) AS analysis_json
      FROM core_ranking_sources s ORDER BY s.platform,s.list_name,s.category`).all();
    return responseJson({ sources: (rows.results || []).map((row) => ({ id: row.id, platform: row.platform, listName: row.list_name, category: row.category, sourceUrl: row.source_url, enabled: Boolean(row.enabled), authorizationNote: row.authorization_note, lastSuccessAt: row.last_success_at, lastErrorCode: row.last_error_code, latestSnapshot: row.snapshot_id ? { id: row.snapshot_id, rankingDate: row.ranking_date, items: JSON.parse(row.items_json), analysis: JSON.parse(row.analysis_json) } : null })) });
  }
  if (pathname === '/api/core/rankings/sources' && request.method === 'POST') {
    const session = await requireMutation(request, env, true); const body = await readJson(request);
    if (!['qidian', 'fanqie'].includes(body.platform)) throw new OperationError('INVALID_PLATFORM', 400);
    let sourceUrl;
    try { sourceUrl = validateRankingUrl(String(body.sourceUrl || ''), body.platform).toString(); } catch { throw new OperationError('INVALID_SOURCE_HOST', 400); }
    const authorizationNote = String(body.authorizationNote || '').trim();
    if (authorizationNote.length < 5) throw new OperationError('AUTHORIZATION_NOTE_REQUIRED', 400);
    const id = makeId('source'); const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO core_ranking_sources(id,platform,adapter_version,list_name,category,source_url,enabled,authorization_note,created_by,created_at,updated_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
      .bind(id, body.platform, String(body.listName || '综合榜').trim().slice(0, 100), String(body.category || '全部').trim().slice(0, 100), sourceUrl, body.enabled === false ? 0 : 1, authorizationNote.slice(0, 1000), session.userId, timestamp, timestamp).run();
    await audit(env, session.userId, 'ranking.source.create', 'core_ranking_source', id, { platform: body.platform });
    return responseJson({ sourceId: id }, 201);
  }
  if (pathname === '/api/core/rankings/import' && request.method === 'POST') {
    const session = await requireMutation(request, env, true); const body = await readJson(request, 2_200_000);
    const source = await env.DB.prepare('SELECT * FROM core_ranking_sources WHERE id=?').bind(String(body.sourceId || '')).first();
    if (!source) throw new OperationError('RANKING_SOURCE_NOT_FOUND', 404);
    const content = String(body.content || ''); const format = body.format === 'csv' ? 'csv' : 'json';
    const items = parseManualRankings(content, format);
    const date = /^\d{4}-\d{2}-\d{2}$/u.test(String(body.rankingDate || '')) ? body.rankingDate : nowIso().slice(0, 10);
    const snapshotId = await saveRankingSnapshot(env, source, items, await sha256(content, 'hex'), `manual-${format}`, date);
    await audit(env, session.userId, 'ranking.import', 'core_ranking_snapshot', snapshotId, { sourceId: source.id, format, itemCount: items.length });
    return responseJson({ snapshotId, itemCount: items.length }, 201);
  }
  if (pathname === '/api/core/rankings/tasks' && request.method === 'POST') {
    const session = await requireMutation(request, env, true); const body = await readJson(request);
    if (body.sourceId && !(await env.DB.prepare('SELECT id FROM core_ranking_sources WHERE id=? AND enabled=1').bind(body.sourceId).first())) throw new OperationError('RANKING_SOURCE_NOT_FOUND', 404);
    const active = await env.DB.prepare("SELECT COUNT(*) AS count FROM core_ranking_tasks WHERE created_by=? AND status IN ('queued','fetching','parsing','validating')").bind(session.userId).first();
    if (Number(active?.count || 0) >= 2) throw new OperationError('RANKING_TASK_LIMIT', 429);
    const taskId = makeId('ranking-task'); const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO core_ranking_tasks(id,source_id,status,attempts,progress,created_by,created_at,updated_at) VALUES(?,?,?,0,0,?,?,?)').bind(taskId, body.sourceId || null, 'queued', session.userId, timestamp, timestamp).run();
    ctx?.waitUntil?.(processCoreRankingTask(env, taskId).catch(async (error) => updateRankingTask(env, taskId, 'failed', 100, error instanceof Error ? error.message.slice(0, 120) : 'RANKING_FAILED')));
    return responseJson({ taskId, status: 'queued' }, 202);
  }
  const taskMatch = pathname.match(/^\/api\/core\/rankings\/tasks\/([^/]+)$/u);
  if (taskMatch && request.method === 'GET') {
    const session = await sessionFor(request, env);
    const task = await env.DB.prepare('SELECT id,source_id,status,attempts,progress,error_code,created_at,updated_at,started_at,finished_at FROM core_ranking_tasks WHERE id=? AND (created_by=? OR ?=\'OWNER\')').bind(taskMatch[1], session.userId, session.platformRole).first();
    if (!task) throw new OperationError('RANKING_TASK_NOT_FOUND', 404); return responseJson({ task });
  }
  if (taskMatch && request.method === 'DELETE') {
    const session = await requireMutation(request, env, true);
    await updateRankingTask(env, taskMatch[1], 'cancelled', 100); await audit(env, session.userId, 'ranking.task.cancel', 'core_ranking_task', taskMatch[1]);
    return responseJson({ taskId: taskMatch[1], status: 'cancelled' });
  }
  if (pathname === '/api/core/rankings/snapshots' && request.method === 'GET') {
    await sessionFor(request, env); const params = new URL(request.url).searchParams; const sourceId = params.get('sourceId');
    if (!sourceId) throw new OperationError('SOURCE_ID_REQUIRED', 400);
    const cursor = params.get('cursor') || '9999-12-31T23:59:59.999Z';
    const rows = await env.DB.prepare('SELECT id,source_id,ranking_date,captured_at,item_count,items_json,analysis_json,import_mode FROM core_ranking_snapshots WHERE source_id=? AND captured_at<? ORDER BY captured_at DESC LIMIT 20').bind(sourceId, cursor).all();
    return responseJson({ snapshots: (rows.results || []).map((row) => ({ id: row.id, sourceId: row.source_id, rankingDate: row.ranking_date, capturedAt: row.captured_at, itemCount: row.item_count, items: JSON.parse(row.items_json), analysis: JSON.parse(row.analysis_json), importMode: row.import_mode })), nextCursor: rows.results?.length === 20 ? rows.results[19].captured_at : null });
  }
  return null;
}

async function publicationRoutes(request, env, pathname) {
  if (pathname !== '/api/core/publications') return null;
  if (request.method === 'GET') {
    const session = await sessionFor(request, env); const workId = new URL(request.url).searchParams.get('workId');
    if (!workId) throw new OperationError('WORK_ID_REQUIRED', 400); await requireWorkAccess(env, session.userId, workId, false);
    const rows = await env.DB.prepare('SELECT id,work_id,chapter_id,platform,platform_chapter_id,title,source_revision,content_hash,published_at,recorded_by,created_at FROM core_publication_records WHERE work_id=? ORDER BY published_at DESC LIMIT 200').bind(workId).all();
    return responseJson({ records: rows.results || [] });
  }
  if (request.method === 'POST') {
    const session = await requireMutation(request, env); const body = await readJson(request);
    const workId = String(body.workId || ''); const chapterId = String(body.chapterId || '');
    await requireWorkAccess(env, session.userId, workId, true);
    if (!['qidian', 'fanqie'].includes(body.platform)) throw new OperationError('INVALID_PLATFORM', 400);
    const chapter = await env.DB.prepare('SELECT id,title,revision,plain_text FROM chapters WHERE id=? AND work_id=? AND deleted_at IS NULL').bind(chapterId, workId).first();
    if (!chapter) throw new OperationError('CHAPTER_NOT_FOUND', 404);
    const publishedAt = String(body.publishedAt || nowIso());
    if (!Number.isFinite(Date.parse(publishedAt))) throw new OperationError('INVALID_PUBLISHED_AT', 400);
    const id = makeId('publication'); const createdAt = nowIso();
    await env.DB.prepare('INSERT INTO core_publication_records(id,work_id,chapter_id,platform,platform_chapter_id,title,source_revision,content_hash,published_at,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, workId, chapterId, body.platform, String(body.platformChapterId || '').trim().slice(0, 200) || null, chapter.title, chapter.revision, await sha256(chapter.plain_text, 'hex'), new Date(publishedAt).toISOString(), session.userId, createdAt).run();
    await audit(env, session.userId, 'publication.record', 'chapter', chapterId, { platform: body.platform, sourceRevision: chapter.revision });
    return responseJson({ recordId: id }, 201);
  }
  return null;
}

async function backupKey(env) {
  const secret = env.MOJIE_BACKUP_MASTER_KEY || env.BACKUP_MASTER_KEY;
  if (!secret) throw new OperationError('BACKUP_KEY_NOT_CONFIGURED', 503);
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptConfig(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await backupKey(env), new TextEncoder().encode(JSON.stringify(value))));
  return { ciphertext, iv };
}
async function decryptConfig(env, row) {
  try {
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(row.config_iv) }, await backupKey(env), new Uint8Array(row.config_ciphertext));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { if (error instanceof OperationError) throw error; throw new OperationError('BACKUP_CONFIG_DECRYPTION_FAILED', 503); }
}

function allowedAiHosts(env) {
  return new Set([
    'api.deepseek.com',
    'api.openai.com',
    'api.siliconflow.cn',
    'dashscope.aliyuncs.com',
    ...String(env.MOJIE_AI_ALLOWED_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
  ]);
}

function validateAiBaseUrl(env, input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { throw new OperationError('INVALID_AI_BASE_URL', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !allowedAiHosts(env).has(url.hostname.toLowerCase())) throw new OperationError('AI_HOST_NOT_ALLOWED', 400);
  return url.toString().replace(/\/$/u, '');
}

async function aiConfigKey(env, ownerId) {
  const secret = env.MOJIE_AI_CONFIG_MASTER_KEY || env.MOJIE_BACKUP_MASTER_KEY || env.BACKUP_MASTER_KEY;
  if (!secret) throw new OperationError('AI_CONFIG_KEY_NOT_CONFIGURED', 503);
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:ai-provider:${ownerId}:v1`));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptAiApiKey(env, ownerId, apiKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aiConfigKey(env, ownerId), new TextEncoder().encode(apiKey)));
  return { ciphertext, iv };
}

async function decryptAiApiKey(env, ownerId, row) {
  try {
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(row.api_key_iv) }, await aiConfigKey(env, ownerId), new Uint8Array(row.api_key_ciphertext));
    return new TextDecoder().decode(clear);
  } catch (error) { if (error instanceof OperationError) throw error; throw new OperationError('AI_CONFIG_DECRYPTION_FAILED', 503); }
}

async function readLimitedResponse(response, maximumBytes = 512_000) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new OperationError('AI_RESPONSE_TOO_LARGE', 502);
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) { await reader.cancel(); throw new OperationError('AI_RESPONSE_TOO_LARGE', 502); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function aiChatUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/u, '')}/chat/completions`;
}

async function aiRoutes(request, env, pathname) {
  if (pathname === '/api/core/ai/provider' && request.method === 'GET') {
    const session = await sessionFor(request, env);
    const row = await env.DB.prepare('SELECT provider,label,base_url,model,key_version,created_at,updated_at FROM ai_provider_configs WHERE owner_id=? LIMIT 1').bind(session.userId).first();
    return responseJson({ configured: Boolean(row), config: row ? { provider: row.provider, label: row.label, baseUrl: row.base_url, model: row.model, keyVersion: row.key_version, createdAt: row.created_at, updatedAt: row.updated_at } : null, keyStorageReady: Boolean(env.MOJIE_AI_CONFIG_MASTER_KEY || env.MOJIE_BACKUP_MASTER_KEY || env.BACKUP_MASTER_KEY) });
  }
  if (pathname === '/api/core/ai/provider' && request.method === 'PUT') {
    const session = await requireMutation(request, env); const body = await readJson(request, 32_000);
    const provider = String(body.provider || 'deepseek');
    if (!['deepseek', 'openai-compatible'].includes(provider)) throw new OperationError('INVALID_AI_PROVIDER', 400);
    const baseUrl = validateAiBaseUrl(env, body.baseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com' : ''));
    const model = String(body.model || '').trim().slice(0, 160);
    if (!model) throw new OperationError('AI_MODEL_REQUIRED', 400);
    const existing = await env.DB.prepare('SELECT api_key_ciphertext,api_key_iv FROM ai_provider_configs WHERE owner_id=? LIMIT 1').bind(session.userId).first();
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey && !existing) throw new OperationError('AI_API_KEY_REQUIRED', 400);
    if (apiKey.length > 1_000) throw new OperationError('AI_API_KEY_INVALID', 400);
    const encrypted = apiKey ? await encryptAiApiKey(env, session.userId, apiKey) : { ciphertext: new Uint8Array(existing.api_key_ciphertext), iv: new Uint8Array(existing.api_key_iv) };
    const timestamp = nowIso();
    await env.DB.prepare(`INSERT INTO ai_provider_configs(owner_id,provider,label,base_url,model,api_key_ciphertext,api_key_iv,key_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,?,?) ON CONFLICT(owner_id) DO UPDATE SET provider=excluded.provider,label=excluded.label,base_url=excluded.base_url,model=excluded.model,api_key_ciphertext=excluded.api_key_ciphertext,api_key_iv=excluded.api_key_iv,key_version=excluded.key_version,updated_at=excluded.updated_at`)
      .bind(session.userId, provider, String(body.label || '核心设定模型').trim().slice(0, 100), baseUrl, model, encrypted.ciphertext.buffer, encrypted.iv.buffer, timestamp, timestamp).run();
    await audit(env, session.userId, 'ai.provider.configure', 'ai_provider_config', session.userId, { provider, model, host: new URL(baseUrl).hostname });
    return responseJson({ configured: true });
  }
  if (pathname === '/api/core/ai/provider' && request.method === 'DELETE') {
    const session = await requireMutation(request, env);
    await env.DB.prepare('DELETE FROM ai_provider_configs WHERE owner_id=?').bind(session.userId).run();
    await audit(env, session.userId, 'ai.provider.delete', 'ai_provider_config', session.userId);
    return responseJson({ ok: true });
  }
  if (pathname === '/api/core/ai/optimize' && request.method === 'POST') {
    const session = await requireMutation(request, env); const body = await readJson(request, 96_000);
    const workId = String(body.workId || ''); await requireWorkAccess(env, session.userId, workId, true);
    const input = String(body.input || '').trim();
    if (input.length < 20) throw new OperationError('AI_INPUT_TOO_SHORT', 400);
    if (input.length > 60_000) throw new OperationError('AI_INPUT_TOO_LONG', 413);
    const config = await env.DB.prepare('SELECT * FROM ai_provider_configs WHERE owner_id=? LIMIT 1').bind(session.userId).first();
    if (!config) throw new OperationError('AI_PROVIDER_NOT_CONFIGURED', 409);
    const runId = makeId('ai-run'); const timestamp = nowIso();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort('timeout'), 45_000);
    try {
      const response = await fetch(aiChatUrl(validateAiBaseUrl(env, config.base_url)), {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization: `Bearer ${await decryptAiApiKey(env, session.userId, config)}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: CORE_PREMISE_SYSTEM_PROMPT }, { role: 'user', content: input }], stream: false, max_tokens: 4_000 })
      });
      const raw = await readLimitedResponse(response);
      if (!response.ok) throw new OperationError(`AI_PROVIDER_HTTP_${response.status}`, response.status === 429 ? 429 : 502);
      let value; try { value = JSON.parse(raw); } catch { throw new OperationError('AI_PROVIDER_INVALID_JSON', 502); }
      const output = String(value?.choices?.[0]?.message?.content || '').trim();
      if (!output) throw new OperationError('AI_PROVIDER_EMPTY_RESULT', 502);
      await env.DB.prepare('INSERT INTO ai_optimizer_runs(id,owner_id,work_id,provider,model,input_hash,status,error_code,created_at,finished_at) VALUES(?,?,?,?,?,?,\'completed\',NULL,?,?)').bind(runId, session.userId, workId, config.provider, config.model, await sha256(input, 'hex'), timestamp, nowIso()).run();
      await audit(env, session.userId, 'ai.premise.optimize', 'work', workId, { provider: config.provider, model: config.model, runId });
      return responseJson({ runId, output, model: config.model });
    } catch (error) {
      const code = controller.signal.aborted ? 'AI_PROVIDER_TIMEOUT' : error instanceof OperationError ? error.code : 'AI_PROVIDER_FAILED';
      await env.DB.prepare('INSERT INTO ai_optimizer_runs(id,owner_id,work_id,provider,model,input_hash,status,error_code,created_at,finished_at) VALUES(?,?,?,?,?,?,\'failed\',?,?,?)').bind(runId, session.userId, workId, config.provider, config.model, await sha256(input, 'hex'), code, timestamp, nowIso()).run().catch(() => {});
      if (controller.signal.aborted) throw new OperationError('AI_PROVIDER_TIMEOUT', 504);
      throw error;
    } finally { clearTimeout(timer); }
  }
  return null;
}

function validateBackupConfig(targetType, config) {
  if (!['webdav', 's3-compatible'].includes(targetType)) throw new OperationError('INVALID_BACKUP_TARGET', 400);
  try { validateBackupUrl(targetType === 'webdav' ? config.baseUrl : config.endpoint); } catch { throw new OperationError('INVALID_BACKUP_HOST', 400); }
  if (targetType === 'webdav' && (!config.username || !config.password)) throw new OperationError('BACKUP_CONFIG_INCOMPLETE', 400);
  if (targetType === 's3-compatible' && (!config.bucket || !config.accessKeyId || !config.secretAccessKey)) throw new OperationError('BACKUP_CONFIG_INCOMPLETE', 400);
}

async function buildWorkBackup(env, ownerId, workId) {
  const work = await env.DB.prepare('SELECT * FROM works WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(workId, ownerId).first();
  if (!work) throw new OperationError('WORK_NOT_FOUND', 404);
  const [volumes, chapters, versions, notes, entities] = await Promise.all([
    env.DB.prepare('SELECT * FROM volumes WHERE work_id=? ORDER BY position').bind(workId).all(),
    env.DB.prepare('SELECT * FROM chapters WHERE work_id=? ORDER BY volume_id,position').bind(workId).all(),
    env.DB.prepare('SELECT v.* FROM chapter_versions v JOIN chapters c ON c.id=v.chapter_id WHERE c.work_id=? ORDER BY v.created_at').bind(workId).all(),
    env.DB.prepare('SELECT n.* FROM chapter_notes n JOIN chapters c ON c.id=n.chapter_id WHERE c.work_id=? AND n.author_id=? ORDER BY n.updated_at').bind(workId, ownerId).all(),
    env.DB.prepare('SELECT * FROM project_entities WHERE work_id=? ORDER BY kind,created_at').bind(workId).all()
  ]);
  return { schemaVersion: 1, createdAt: nowIso(), work, volumes: volumes.results || [], chapters: chapters.results || [], chapterVersions: versions.results || [], privateNotes: notes.results || [], projectEntities: entities.results || [] };
}

async function updateBackupRun(env, runId, status, errorCode = null, values = {}) {
  await env.DB.prepare('UPDATE backup_runs SET status=?,error_code=?,object_key=COALESCE(?,object_key),content_hash=COALESCE(?,content_hash),size_bytes=COALESCE(?,size_bytes),updated_at=?,finished_at=? WHERE id=?')
    .bind(status, errorCode, values.objectKey || null, values.contentHash || null, values.sizeBytes || null, nowIso(), terminalBackupStatuses.has(status) ? nowIso() : null, runId).run();
}

export async function processCoreBackupRun(env, runId) {
  const run = await env.DB.prepare('SELECT r.*,t.* FROM backup_runs r JOIN backup_targets t ON t.id=r.target_id WHERE r.id=?').bind(runId).first();
  if (!run || run.status === 'cancelled' || terminalBackupStatuses.has(run.status)) return;
  await env.DB.prepare('UPDATE backup_runs SET status=\'running\',attempt_count=attempt_count+1,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?').bind(nowIso(), nowIso(), runId).run();
  try {
    const envelope = await buildWorkBackup(env, run.owner_id, run.work_id);
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const contentHash = await sha256(bytes, 'hex');
    const objectKey = `mojie-backups/${run.owner_id}/${run.work_id}/${nowIso().replace(/[:.]/gu, '-')}-${contentHash.slice(0, 12)}.json`;
    await backupAdapterFor(run.target_type, await decryptConfig(env, run)).put(objectKey, bytes);
    const createdAt = nowIso(); const expiresAt = new Date(Date.now() + Number(run.retention_hours) * 3_600_000).toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO backup_objects_v2(id,target_id,run_id,owner_id,work_id,object_key,content_hash,size_bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(makeId('backup-object'), run.target_id, runId, run.owner_id, run.work_id, objectKey, contentHash, bytes.byteLength, createdAt, expiresAt),
      env.DB.prepare('UPDATE backup_targets SET last_backup_at=?,next_backup_at=?,last_error_code=NULL,updated_at=? WHERE id=?').bind(createdAt, new Date(Date.now() + Number(run.interval_minutes) * 60_000).toISOString(), createdAt, run.target_id)
    ]);
    await updateBackupRun(env, runId, 'completed', null, { objectKey, contentHash, sizeBytes: bytes.byteLength });
  } catch (error) {
    const code = (error instanceof Error ? error.message : 'BACKUP_FAILED').slice(0, 120);
    await Promise.all([updateBackupRun(env, runId, 'failed', code), env.DB.prepare('UPDATE backup_targets SET last_error_code=?,updated_at=? WHERE id=?').bind(code, nowIso(), run.target_id).run()]);
  }
}

async function cleanupExpiredBackups(env) {
  const rows = await env.DB.prepare(`SELECT o.*,t.target_type,t.config_ciphertext,t.config_iv,t.key_version FROM backup_objects_v2 o JOIN backup_targets t ON t.id=o.target_id
    WHERE o.deleted_at IS NULL AND o.expires_at<=? ORDER BY o.expires_at LIMIT 20`).bind(nowIso()).all();
  for (const row of rows.results || []) {
    try {
      await backupAdapterFor(row.target_type, await decryptConfig(env, row)).delete(row.object_key);
      await env.DB.prepare('UPDATE backup_objects_v2 SET deleted_at=?,delete_error_code=NULL WHERE id=?').bind(nowIso(), row.id).run();
    } catch (error) { await env.DB.prepare('UPDATE backup_objects_v2 SET delete_error_code=? WHERE id=?').bind((error instanceof Error ? error.message : 'BACKUP_DELETE_FAILED').slice(0, 120), row.id).run(); }
  }
}

async function backupRoutes(request, env, pathname, ctx) {
  if (pathname === '/api/core/backups/targets' && request.method === 'GET') {
    const session = await sessionFor(request, env);
    const [targets, runs, objects] = await Promise.all([
      env.DB.prepare('SELECT id,work_id,label,target_type,enabled,interval_minutes,retention_hours,last_backup_at,next_backup_at,last_error_code,created_at,updated_at FROM backup_targets WHERE owner_id=? ORDER BY created_at DESC').bind(session.userId).all(),
      env.DB.prepare('SELECT id,target_id,owner_id,status,attempt_count,error_code,object_key,content_hash,size_bytes,created_at,updated_at,started_at,finished_at FROM backup_runs WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(session.userId).all(),
      env.DB.prepare('SELECT id,target_id,run_id,work_id,object_key,content_hash,size_bytes,created_at,expires_at,deleted_at,delete_error_code FROM backup_objects_v2 WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100').bind(session.userId).all()
    ]);
    return responseJson({ targets: targets.results || [], runs: runs.results || [], objects: objects.results || [], configured: Boolean(env.MOJIE_BACKUP_MASTER_KEY || env.BACKUP_MASTER_KEY) });
  }
  if (pathname === '/api/core/backups/targets' && request.method === 'POST') {
    const session = await requireMutation(request, env); const body = await readJson(request);
    const workId = String(body.workId || ''); await requireWorkAccess(env, session.userId, workId, false, true);
    const targetType = String(body.targetType || ''); validateBackupConfig(targetType, body.config || {});
    const intervalMinutes = Number(body.intervalMinutes); const retentionHours = Number(body.retentionHours);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 43_200 || !Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 8_760) throw new OperationError('INVALID_BACKUP_SCHEDULE', 400);
    const encrypted = await encryptConfig(env, body.config); const id = makeId('backup-target'); const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO backup_targets(id,owner_id,work_id,label,target_type,enabled,interval_minutes,retention_hours,config_ciphertext,config_iv,key_version,next_backup_at,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?,1,?,?,?)')
      .bind(id, session.userId, workId, String(body.label || '外部备份').trim().slice(0, 100), targetType, intervalMinutes, retentionHours, encrypted.ciphertext.buffer, encrypted.iv.buffer, new Date(Date.now() + intervalMinutes * 60_000).toISOString(), timestamp, timestamp).run();
    await audit(env, session.userId, 'backup.target.create', 'backup_target', id, { targetType, workId }); return responseJson({ targetId: id }, 201);
  }
  const targetMatch = pathname.match(/^\/api\/core\/backups\/targets\/([^/]+)$/u);
  if (targetMatch && request.method === 'DELETE') {
    const session = await requireMutation(request, env);
    const result = await env.DB.prepare('UPDATE backup_targets SET enabled=0,updated_at=? WHERE id=? AND owner_id=?').bind(nowIso(), targetMatch[1], session.userId).run();
    if (!result.meta?.changes) throw new OperationError('BACKUP_TARGET_NOT_FOUND', 404);
    await audit(env, session.userId, 'backup.target.disable', 'backup_target', targetMatch[1]); return responseJson({ ok: true });
  }
  if (pathname === '/api/core/backups/runs' && request.method === 'POST') {
    const session = await requireMutation(request, env); const body = await readJson(request);
    const target = await env.DB.prepare('SELECT id FROM backup_targets WHERE id=? AND owner_id=? AND enabled=1').bind(String(body.targetId || ''), session.userId).first();
    if (!target) throw new OperationError('BACKUP_TARGET_NOT_FOUND', 404);
    const runId = makeId('backup-run'); const timestamp = nowIso();
    await env.DB.prepare('INSERT INTO backup_runs(id,target_id,owner_id,status,attempt_count,created_at,updated_at) VALUES(?,?,?,\'queued\',0,?,?)').bind(runId, target.id, session.userId, timestamp, timestamp).run();
    ctx?.waitUntil?.(processCoreBackupRun(env, runId)); return responseJson({ runId, status: 'queued' }, 202);
  }
  const objectMatch = pathname.match(/^\/api\/core\/backups\/objects\/([^/]+)$/u);
  if (objectMatch && request.method === 'GET') {
    const session = await sessionFor(request, env);
    const row = await env.DB.prepare('SELECT o.*,t.target_type,t.config_ciphertext,t.config_iv,t.key_version FROM backup_objects_v2 o JOIN backup_targets t ON t.id=o.target_id WHERE o.id=? AND o.owner_id=? AND o.deleted_at IS NULL').bind(objectMatch[1], session.userId).first();
    if (!row) throw new OperationError('BACKUP_OBJECT_NOT_FOUND', 404);
    const bytes = await backupAdapterFor(row.target_type, await decryptConfig(env, row)).get(row.object_key);
    if (await sha256(bytes, 'hex') !== row.content_hash) throw new OperationError('BACKUP_INTEGRITY_FAILED', 409);
    return new Response(bytes, { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="mojie-backup-${row.id}.json"`, 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' } });
  }
  if (objectMatch && request.method === 'DELETE') {
    const session = await requireMutation(request, env);
    const row = await env.DB.prepare('SELECT o.*,t.target_type,t.config_ciphertext,t.config_iv,t.key_version FROM backup_objects_v2 o JOIN backup_targets t ON t.id=o.target_id WHERE o.id=? AND o.owner_id=? AND o.deleted_at IS NULL').bind(objectMatch[1], session.userId).first();
    if (!row) throw new OperationError('BACKUP_OBJECT_NOT_FOUND', 404);
    await backupAdapterFor(row.target_type, await decryptConfig(env, row)).delete(row.object_key);
    await env.DB.prepare('UPDATE backup_objects_v2 SET deleted_at=?,delete_error_code=NULL WHERE id=?').bind(nowIso(), row.id).run();
    await audit(env, session.userId, 'backup.object.delete', 'backup_object', row.id); return responseJson({ ok: true });
  }
  return null;
}

export async function handleMojieCoreOperationsApi(request, env, ctx) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/core/rankings/') && pathname !== '/api/core/publications' && !pathname.startsWith('/api/core/backups/') && !pathname.startsWith('/api/core/ai/')) return null;
  try {
    for (const handler of [rankingRoutes, publicationRoutes, backupRoutes, aiRoutes]) {
      const response = await handler(request, env, pathname, ctx);
      if (response) return response;
    }
    return errorJson('NOT_FOUND', 404);
  } catch (error) {
    if (error instanceof OperationError) return errorJson(error.code, error.status, error.details);
    console.error(JSON.stringify({ event: 'core_operations_error', code: 'INTERNAL_ERROR' }));
    return errorJson('INTERNAL_ERROR', 500);
  }
}

export async function handleMojieCoreOperationsScheduled(env, ctx) {
  const work = (async () => {
    const ranking = await env.DB.prepare("SELECT id FROM core_ranking_tasks WHERE status='queued' ORDER BY created_at LIMIT 3").all();
    for (const row of ranking.results || []) await processCoreRankingTask(env, row.id);
    const dueTargets = await env.DB.prepare('SELECT id,owner_id FROM backup_targets WHERE enabled=1 AND (next_backup_at IS NULL OR next_backup_at<=?) ORDER BY next_backup_at LIMIT 3').bind(nowIso()).all();
    for (const target of dueTargets.results || []) {
      const runId = makeId('backup-run'); const timestamp = nowIso();
      await env.DB.prepare("INSERT INTO backup_runs(id,target_id,owner_id,status,attempt_count,created_at,updated_at) VALUES(?,?,?,'queued',0,?,?)").bind(runId, target.id, target.owner_id, timestamp, timestamp).run();
      await processCoreBackupRun(env, runId);
    }
    const queuedBackups = await env.DB.prepare("SELECT id FROM backup_runs WHERE status='queued' ORDER BY created_at LIMIT 3").all();
    for (const row of queuedBackups.results || []) await processCoreBackupRun(env, row.id);
    await cleanupExpiredBackups(env);
  })();
  ctx.waitUntil(work);
  return work;
}
