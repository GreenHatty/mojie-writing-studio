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
  run(['d1', 'execute', database, '--local', '--config', config, '--command', 'DELETE FROM chapter_conflicts; DELETE FROM chapter_versions; DELETE FROM chapter_notes; DELETE FROM chapter_comments_v2; DELETE FROM change_suggestions; DELETE FROM sync_operations; DELETE FROM chapters; DELETE FROM volumes; DELETE FROM work_access; DELETE FROM work_invitations; DELETE FROM writing_goals; DELETE FROM writing_sessions; DELETE FROM migration_work_items; DELETE FROM migration_runs; DELETE FROM profile_settings; DELETE FROM platform_audit_logs; DELETE FROM platform_invitations; DELETE FROM user_local_draft_keys; DELETE FROM platform_sessions; DELETE FROM auth_rate_limit_buckets; DELETE FROM works; DELETE FROM platform_accounts;']);
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
    const chapterId = created.body.chapter?.id;
    if (!chapterId) throw new Error('Work creation did not return the first chapter');

    const firstSave = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ baseRevision: 0, clientOperationId: 'acceptance-save-1', canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '本地验收正文' }] }] } })
    });
    if (firstSave.response.status !== 200 || firstSave.body.kind !== 'saved' || firstSave.body.revision !== 1) throw new Error('Canonical chapter save failed');

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
    process.stdout.write('Local core Worker acceptance passed (auth, encrypted-draft key, work creation, idempotent save, conflict copy, and logout revocation).\n');
  } finally {
    if (!worker.killed) worker.kill('SIGTERM');
    if (process.platform === 'win32' && worker.pid) spawnSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'], { stdio: 'ignore' });
    if (workerOutput && process.exitCode) process.stderr.write(workerOutput);
  }
}

await main();
