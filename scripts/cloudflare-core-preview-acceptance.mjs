import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const origin = String(process.env.MOJIE_PREVIEW_URL || '').replace(/\/+$/u, '');
const initializationKey = process.env.OWNER_INITIALIZATION_KEY || '';
const reportPath = process.env.MOJIE_CORE_ACCEPTANCE_REPORT || 'cloudflare-core-preview-acceptance.json';
if (!origin || !initializationKey) throw new Error('MOJIE_PREVIEW_URL and OWNER_INITIALIZATION_KEY are required');

function assert(condition, message) { if (!condition) throw new Error(message); }
function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}
async function request(path, init = {}) {
  const response = await fetch(`${origin}${path}`, init);
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

const stamp = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const account = `core-owner-${stamp}@preview.mojie.invalid`;
const password = `Preview-${randomBytes(24).toString('base64url')}!`;
const checks = [];
function passed(name) { checks.push({ name, status: 'passed' }); console.log(`✓ ${name}`); }

const anonymous = await request('/api/core/auth/session');
assert(anonymous.response.status === 401, 'Anonymous core session did not return 401');
assert(anonymous.response.headers.get('cache-control') === 'no-store, private', 'Protected core response is cacheable');
passed('anonymous core access and no-store boundary');

const initialized = await request('/api/core/auth/initialize', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: initializationKey, account, password })
});
assert(initialized.response.status === 201 && initialized.body.user?.platformRole === 'OWNER', 'Core owner initialization failed');
passed('single-owner core initialization');

const login = await request('/api/core/auth/login', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ account, password })
});
const cookie = cookieHeader(login.response);
assert(login.response.status === 200 && login.body.csrf, 'Core login failed');
assert(cookie.includes('__Host-mojie-session=') && cookie.includes('__Host-mojie-csrf='), 'Production __Host cookies were not issued');
const headers = { Origin: origin, Cookie: cookie, 'X-CSRF-Token': login.body.csrf, 'Content-Type': 'application/json' };
passed('production cookie and CSRF login boundary');

const draftKey = await request('/api/core/auth/draft-key', { headers: { Cookie: cookie } });
assert(draftKey.response.status === 200 && typeof draftKey.body.dek === 'string' && draftKey.body.dek.length >= 40, 'Encrypted local draft key retrieval failed');
passed('per-user encrypted draft key retrieval');

const created = await request('/api/core/works', { method: 'POST', headers, body: JSON.stringify({ title: '隔离预览核心验收', kind: 'long' }) });
assert(created.response.status === 201 && created.body.work?.id && created.body.chapter?.id, 'Core work creation failed');
const workId = created.body.work.id;
const chapterId = created.body.chapter.id;
const saveInput = { baseRevision: 0, clientOperationId: `preview-save-${stamp}`, canonicalContent: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '隔离预览正文' }] }] } };
const saved = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, { method: 'PUT', headers, body: JSON.stringify(saveInput) });
const repeatedSave = await request(`/api/core/chapters/${encodeURIComponent(chapterId)}`, { method: 'PUT', headers, body: JSON.stringify(saveInput) });
assert(saved.response.status === 200 && saved.body.revision === 1, 'Canonical core save failed');
assert(repeatedSave.response.status === 200 && JSON.stringify(repeatedSave.body) === JSON.stringify(saved.body), 'Repeated client operation was not idempotent');
passed('canonical save and client operation idempotency');

const migrationId = `preview-migration-${stamp}`;
const source = { works: [{ id: 'legacy-work', title: '旧格式预览', volumes: [{ id: 'v1', title: '旧卷', chapters: [{ id: 'c1', title: '旧章', content: '<p>旧正文<strong>保留</strong></p>' }] }] }] };
const preview = await request('/api/core/migrations/preview', { method: 'POST', headers, body: JSON.stringify({ migrationId, source }) });
const repeatedPreview = await request('/api/core/migrations/preview', { method: 'POST', headers, body: JSON.stringify({ migrationId, source }) });
const execute = await request(`/api/core/migrations/${encodeURIComponent(migrationId)}/execute`, { method: 'POST', headers, body: JSON.stringify({ confirmed: true, source }) });
const rollback = await request(`/api/core/migrations/${encodeURIComponent(migrationId)}/rollback`, { method: 'POST', headers });
assert(preview.response.status === 201 && preview.body.repeated === false, 'Migration preview failed');
assert(repeatedPreview.body.repeated === true, 'Migration preview was not idempotent');
assert(execute.response.status === 200 && execute.body.run?.status === 'COMPLETED', 'Migration execution failed');
assert(rollback.response.status === 200 && rollback.body.status === 'ROLLED_BACK', 'Migration rollback failed');
passed('legacy dual-read migration preview, execution and rollback');

const logout = await request('/api/core/auth/logout', { method: 'POST', headers, body: '{}' });
const revoked = await request('/api/core/auth/session', { headers: { Cookie: cookie } });
assert(logout.response.status === 200 && revoked.response.status === 401, 'Logout did not revoke the core session');
passed('session revocation');

writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), previewUrl: origin, workId, checks, summary: { passed: checks.length, failed: 0 } }, null, 2)}\n`);
console.log(`All ${checks.length} normalized core preview checks passed.`);
