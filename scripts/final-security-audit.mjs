import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean);
const forbiddenTracked = tracked.filter((path) => {
  const name = path.split('/').at(-1);
  return (name?.startsWith('.env') && name !== '.env.example') || /(^|\/)(?:node_modules|dist|test-results|playwright-report)(?:\/|$)/u.test(path);
});
assert(forbiddenTracked.length === 0, `Sensitive or generated paths are tracked: ${forbiddenTracked.join(', ')}`);

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/u,
  /\bghp_[A-Za-z0-9]{30,}\b/u,
  /\bAKIA[A-Z0-9]{16}\b/u
];
for (const path of tracked.filter((value) => /\.(?:[cm]?[jt]sx?|jsonc?|sql|md|css)$/u.test(value))) {
  const source = read(path);
  for (const pattern of secretPatterns) assert(!pattern.test(source), `Possible secret material found in ${path}`);
}

const serviceWorker = read('public/sw.js');
assert(serviceWorker.includes("url.pathname.startsWith('/api/')"), 'Service Worker must exclude all API requests');
assert(serviceWorker.includes("request.mode === 'navigate'"), 'Service Worker must exclude navigation requests');
assert(serviceWorker.includes("request.destination === 'document'"), 'Service Worker must exclude private HTML documents');
assert(serviceWorker.includes("Cache-Control')?.includes('no-store')"), 'Service Worker must honor no-store responses');

const response = read('src/server/http/response.ts');
assert(response.includes("headers.set('Cache-Control', 'no-store, private')"), 'Core protected responses must be no-store');
const cookies = read('src/server/auth/cookies.ts');
assert(cookies.includes('__Host-mojie-session') && cookies.includes('; Secure'), 'Production session cookies must use __Host- and Secure');
assert(cookies.includes('mojie-dev-session'), 'Development cookies must have an explicit dev-only name');

const operations = read('scripts/mojie-core-operations-api.mjs');
assert(!operations.includes('cloud_documents'), 'Core operations must not use the legacy cloud document aggregate');
assert(!operations.includes('BACKUP_BUCKET') && !operations.includes("targetType === 'r2'"), 'Core operations must not enable R2 backups');
assert(operations.includes("cache-control': 'no-store, private"), 'Core operations responses must be private and no-store');
assert(!/console\.error\([^\n]*error\s*\)/u.test(operations), 'Core operations must not log raw Error objects');

for (const path of ['scripts/mojie-api.mjs', 'scripts/mojie-auth-api.mjs', 'scripts/mojie-extended-api.mjs']) {
  assert(!/console\.error\([^\n]*,\s*error\s*\)/u.test(read(path)), `${path} logs raw errors`);
}

const build = read('scripts/prepare-dist.mjs');
assert(!build.includes('CLOUDFLARE_BACKUP_BUCKET_NAME') && !build.includes("binding: 'BACKUP_BUCKET'"), 'Generated Worker config must not create an R2 backup binding');
const entry = read('scripts/cloudflare-fetch-entry.mjs');
assert(entry.includes('handleMojieCoreOperationsScheduled') && !entry.includes('handleMojieScheduled(env'), 'Cron must use the normalized core operations scheduler');

const migration = read('src/server/migrations/d1-store.ts');
assert(migration.includes('legacy_html') && !migration.includes('DELETE FROM cloud_documents'), 'Migration must preserve legacy HTML and source data');
assert(migration.includes('${work.id}:volume:') && migration.includes('${work.id}:chapter:'), 'Migration IDs must be scoped by legacy work');

const app = read('src/components/authenticated-app.tsx');
assert(!app.includes('MutationObserver'), 'Global DOM MutationObserver regression detected');

process.stdout.write(`Final security audit passed (${tracked.length} tracked files checked; cache, cookies, logs, migrations, R2-off and secret boundaries verified).\n`);
