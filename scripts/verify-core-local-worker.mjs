import { spawn, spawnSync } from 'node:child_process';

const port = 8790;
const origin = `http://127.0.0.1:${port}`;
const config = 'test/wrangler.core.local.jsonc';
const database = 'mojie-writing-studio-core-local-acceptance';
const wrangler = 'node_modules/wrangler/bin/wrangler.js';

function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Core worker prerequisite failed: ${args.join(' ')}`);
  }
}

function cookies(response) {
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function tokenDigest(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Buffer.from(digest).toString('base64url');
}

async function request(path, init = {}) {
  const response = await fetch(`${origin}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function waitForWorker() {
  let lastError = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${origin}/`);
      if (response.status < 500) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Local core worker did not become reachable${lastError ? `: ${lastError.message}` : ''}`);
}

async function main() {
  run(['d1', 'migrations', 'apply', database, '--local', '--config', config]);
  // This named database exists only under test/.wrangler. Resetting its
  // foundation rows makes the acceptance executable repeatable without
  // touching any user or remote D1 data.
  run(['d1', 'execute', database, '--local', '--config', config, '--command', 'DELETE FROM project_entities; DELETE FROM chapter_conflicts; DELETE FROM chapter_versions; DELETE FROM chapter_notes; DELETE FROM chapter_comments_v2; DELETE FROM change_suggestions; DELETE FROM sync_operations; DELETE FROM chapters; DELETE FROM volumes; DELETE FROM work_access; DELETE FROM work_invitations; DELETE FROM writing_goals; DELETE FROM writing_sessions; DELETE FROM migration_work_items; DELETE FROM migration_runs; DELETE FROM profile_settings; DELETE FROM platform_audit_logs; DELETE FROM platform_invitations; DELETE FROM user_local_draft_keys; DELETE FROM platform_sessions; DELETE FROM auth_rate_limit_buckets; DELETE FROM works; DELETE FROM platform_accounts;']);
  const worker = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--local', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let workerOutput = '';
  worker.stdout.on('data', (chunk) => { workerOutput += chunk.toString(); });
  worker.stderr.on('data', (chunk) => { workerOutput += chunk.toString(); });

  try {
    await waitForWorker();
    const initialize = await request('/api/core/auth/initialize', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test-only-owner-initialization-key-not-for-production', account: 'owner@example.test', password: 'local-test-password-123' })
    });
    if (initialize.response.status !== 201 || initialize.response.headers.get('cache-control') !== 'no-store, private') throw new Error(`Owner initialization failed: ${initialize.response.status}`);

    const login = await request('/api/core/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'owner@example.test', password: 'local-test-password-123' })
    });
    if (login.response.status !== 200 || !login.body.csrf) throw new Error(`Login failed: ${login.response.status}`);
    const cookie = cookies(login.response);
    if (!cookie.includes('mojie-dev-session=') || !cookie.includes('mojie-dev-csrf=')) throw new Error('Development session cookies were not issued');
    const headers = { Origin: origin, Cookie: cookie, 'X-CSRF-Token': login.body.csrf, 'Content-Type': 'application/json' };

    const draftKey = await request('/api/core/auth/draft-key', { headers: { Cookie: cookie } });
    if (draftKey.response.status !== 200 || typeof draftKey.body.dek !== 'string' || draftKey.body.dek.length < 40 || draftKey.response.headers.get('cache-control') !== 'no-store, private') throw new Error('Protected draft key retrieval failed');

    const created = await request('/api/core/works', { method: 'POST', headers, body: JSON.stringify({ title: '本地核心验收作品', kind: 'long' }) });
    if (created.response.status !== 201) throw new Error(`Work creation failed: ${created.response.status}`);
    const workId = created.body.work?.id;
    const chapterId = created.body.chapter?.id;
    const volumeId = created.body.volume?.id;
    if (!workId || !chapterId || !volumeId) throw new Error('Work creation did not return its initial directory');

    const settings = await request('/api/core/profile-settings', { headers: { Cookie: cookie } });
    if (settings.response.status !== 200 || settings.body.settings?.theme !== 'paper') throw new Error('Default profile settings failed');
    const updateSettings = await request('/api/core/profile-settings', { method: 'PUT', headers, body: JSON.stringify({ theme: 'dark', fontSize: 19, lineHeight: 2, editorWidth: 'wide', leftColumnWidth: 300, rightColumnWidth: 360 }) });
    if (updateSettings.response.status !== 200 || updateSettings.body.settings?.theme !== 'dark') throw new Error('Profile settings update failed');

    const newVolume = await request(`/api/core/works/${encodeURIComponent(workId)}/volumes`, { method: 'POST', headers, body: JSON.stringify({ title: '第二卷' }) });
    if (newVolume.response.status !== 201 || !newVolume.body.volume?.id) throw new Error('Volume creation failed');

    const firstSave = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: 0, clientOperationId: 'acceptance-save-1', canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '本地验收正文' }] }] } })
    });
    if (firstSave.response.status !== 200 || firstSave.body.kind !== 'saved' || firstSave.body.revision !== 1) throw new Error('Canonical chapter save failed');

    const note = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}/note`, { method: 'PUT', headers, body: JSON.stringify({ body: '仅所有者可见的验收备注' }) });
    if (note.response.status !== 200 || note.body.note?.body !== '仅所有者可见的验收备注') throw new Error('Private note save failed');

    const namedVersion = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}/versions`, { method: 'POST', headers, body: JSON.stringify({ label: '验收命名版本' }) });
    if (namedVersion.response.status !== 201 || !namedVersion.body.version?.id) throw new Error('Manual chapter version failed');

    const secondSave = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: 1, clientOperationId: 'acceptance-save-2', canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '本地验收正文已修改' }] }] } })
    });
    if (secondSave.response.status !== 200 || secondSave.body.revision !== 2) throw new Error('Second canonical chapter save failed');

    const restored = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}/versions/${encodeURIComponent(namedVersion.body.version.id)}/restore`, { method: 'POST', headers, body: JSON.stringify({ baseRevision: 2 }) });
    if (restored.response.status !== 200 || restored.body.chapter?.revision !== 3 || !restored.body.chapter?.plainText.includes('本地验收正文')) throw new Error('Chapter version restore failed');

    const secondChapter = await request(`/api/core/works/${encodeURIComponent(workId)}/chapters`, { method: 'POST', headers, body: JSON.stringify({ volumeId, title: '验收第二章' }) });
    if (secondChapter.response.status !== 201 || !secondChapter.body.chapter?.id) throw new Error('Second chapter creation failed');
    const reorder = await request(`/api/core/works/${encodeURIComponent(workId)}/volumes/${encodeURIComponent(volumeId)}/chapters/order`, { method: 'PUT', headers, body: JSON.stringify({ chapterIds: [secondChapter.body.chapter.id, chapterId] }) });
    if (reorder.response.status !== 200) throw new Error('Chapter ordering failed');
    const directory = await request(`/api/core/works/${encodeURIComponent(workId)}`, { headers: { Cookie: cookie } });
    if (directory.response.status !== 200 || directory.body.work?.volumes?.[0]?.chapters?.[0]?.id !== secondChapter.body.chapter.id) throw new Error('Directory order was not persisted');

    const search = await request(`/api/core/works/${encodeURIComponent(workId)}/search?q=${encodeURIComponent('验收正文')}`, { headers: { Cookie: cookie } });
    if (search.response.status !== 200 || !search.body.results?.some((entry) => entry.chapterId === chapterId)) throw new Error('Scoped work search failed');

    const trash = await request(`/api/core/chapters/${encodeURIComponent(secondChapter.body.chapter.id)}`, { method: 'DELETE', headers, body: JSON.stringify({ reason: '本地验收回收站' }) });
    if (trash.response.status !== 200) throw new Error('Chapter trash operation failed');
    const trashList = await request(`/api/core/works/${encodeURIComponent(workId)}/trash`, { headers: { Cookie: cookie } });
    if (trashList.response.status !== 200 || !trashList.body.chapters?.some((entry) => entry.id === secondChapter.body.chapter.id)) throw new Error('Trash list failed');
    const restoreTrash = await request(`/api/core/works/${encodeURIComponent(workId)}/trash/${encodeURIComponent(secondChapter.body.chapter.id)}/restore`, { method: 'POST', headers });
    if (restoreTrash.response.status !== 200) throw new Error('Trash restore failed');

    const stats = await request('/api/core/writing-stats', { headers: { Cookie: cookie } });
    if (stats.response.status !== 200 || stats.body.stats?.addedCharacters < 1) throw new Error('Writing stats failed');

    const character = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { method: 'POST', headers, body: JSON.stringify({ kind: 'character', title: '验收人物', summary: '本地设定验收', fields: { aliases: ['阿验'] } }) });
    if (character.response.status !== 201 || !character.body.entity?.id) throw new Error('Project character creation failed');
    const timeline = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { method: 'POST', headers, body: JSON.stringify({ kind: 'timeline', title: '验收事件', summary: '', fields: { startAt: '2026-07-14T00:00:00.000Z', endAt: '2026-07-14T01:00:00.000Z', characterIds: [character.body.entity.id] } }) });
    if (timeline.response.status !== 201) throw new Error('Timeline entity creation failed');
    const referencedDelete = await request(`/api/core/works/${encodeURIComponent(workId)}/entities/${encodeURIComponent(character.body.entity.id)}`, { method: 'DELETE', headers, body: '{}' });
    if (referencedDelete.response.status !== 409 || referencedDelete.body.error?.code !== 'ENTITY_REFERENCED') throw new Error('Referenced entity was deleted without confirmation');
    const confirmedDelete = await request(`/api/core/works/${encodeURIComponent(workId)}/entities/${encodeURIComponent(character.body.entity.id)}`, { method: 'DELETE', headers, body: JSON.stringify({ confirmReferences: true, reason: '本地设定验收' }) });
    if (confirmedDelete.response.status !== 200) throw new Error('Confirmed entity trash failed');
    const deletedEntities = await request(`/api/core/works/${encodeURIComponent(workId)}/entities?includeDeleted=true`, { headers: { Cookie: cookie } });
    if (!deletedEntities.body.entities?.some((entity) => entity.id === character.body.entity.id && entity.deletedAt)) throw new Error('Deleted project entity was not retained');
    const restoredEntity = await request(`/api/core/works/${encodeURIComponent(workId)}/entities/${encodeURIComponent(character.body.entity.id)}/restore`, { method: 'POST', headers });
    if (restoredEntity.response.status !== 200) throw new Error('Project entity restore failed');

    const writerToken = 'test-only-writer-session-token';
    const writerCsrf = 'test-only-writer-csrf';
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60 * 60_000).toISOString();
    const absoluteExpires = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    run(['d1', 'execute', database, '--local', '--config', config, '--command', `INSERT INTO platform_accounts (id, account_identifier, platform_role, password_algorithm, password_iterations, password_salt, password_digest, created_at, updated_at) VALUES ('accept-writer', 'writer-acceptance@example.test', 'WRITER', 'PBKDF2-SHA-256', 600000, X'00', X'00', '${now}', '${now}'); INSERT INTO platform_sessions (id, token_hash, user_id, csrf_state, expires_at, absolute_expires_at, last_seen_at, created_at, updated_at) VALUES ('accept-writer-session', '${await tokenDigest(writerToken)}', 'accept-writer', '${writerCsrf}', '${expires}', '${absoluteExpires}', '${now}', '${now}', '${now}');`]);
    const writerCookie = `mojie-dev-session=${writerToken}; mojie-dev-csrf=${writerCsrf}`;
    const hiddenFromWriter = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { headers: { Cookie: writerCookie } });
    if (hiddenFromWriter.response.status !== 404) throw new Error('Unrelated writer could read private project entities');
    run(['d1', 'execute', database, '--local', '--config', config, '--command', `INSERT INTO work_access (work_id, user_id, role, created_at) VALUES ('${workId}', 'accept-writer', 'VIEWER', '${now}');`]);
    const visibleToViewer = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { headers: { Cookie: writerCookie } });
    if (visibleToViewer.response.status !== 200 || !visibleToViewer.body.entities?.length) throw new Error('Authorized viewer could not read project entities');
    const viewerWrite = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { method: 'POST', headers: { Origin: origin, Cookie: writerCookie, 'X-CSRF-Token': writerCsrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'character', title: '越权人物', fields: {} }) });
    if (viewerWrite.response.status !== 403) throw new Error('Viewer could write project entities');
    run(['d1', 'execute', database, '--local', '--config', config, '--command', `UPDATE work_access SET role = 'EDITOR' WHERE work_id = '${workId}' AND user_id = 'accept-writer';`]);
    const editorWrite = await request(`/api/core/works/${encodeURIComponent(workId)}/entities`, { method: 'POST', headers: { Origin: origin, Cookie: writerCookie, 'X-CSRF-Token': writerCsrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'character', title: '编辑新增人物', fields: {} }) });
    if (editorWrite.response.status !== 201) throw new Error('Authorized editor could not write project entities');

    const replay = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: 0, clientOperationId: 'acceptance-save-1', canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '本地验收正文' }] }] } })
    });
    if (replay.response.status !== 200 || replay.body.revision !== 1) throw new Error('Idempotent chapter retry failed');

    const conflict = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: 0, clientOperationId: 'acceptance-save-stale', canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '冲突副本' }] }] } })
    });
    if (conflict.response.status !== 200 || conflict.body.kind !== 'conflict') throw new Error('Stale revision did not create a conflict copy');

    const logout = await request('/api/core/auth/logout', { method: 'POST', headers });
    if (logout.response.status !== 200) throw new Error('Logout failed');
    const afterLogout = await request('/api/core/works', { headers: { Cookie: cookie } });
    if (afterLogout.response.status !== 401) throw new Error('Revoked session retained protected work access');
    process.stdout.write('Local core Worker acceptance passed (auth, encrypted-draft key, settings, directory, notes, versions, search, trash, permission-isolated worldbuilding, reference-aware restore, stats, idempotent save, conflict copy, and logout revocation).\n');
  } finally {
    if (!worker.killed) worker.kill('SIGTERM');
    if (process.platform === 'win32' && worker.pid) spawnSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'], { stdio: 'ignore' });
    if (workerOutput && process.exitCode) process.stderr.write(workerOutput);
  }
}

await main();
