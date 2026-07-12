import { existsSync, readFileSync } from 'node:fs';

const entry = readFileSync('dist/server/index.js', 'utf8');
const workerConfig = JSON.parse(readFileSync('dist/wrangler.json', 'utf8'));

if (!/export\s+default\s+\{[\s\S]*?fetch\s*\(/.test(entry)) {
  throw new Error('Expected dist/server/index.js to export an ES Module Worker fetch handler.');
}
if (!/scheduled\s*\(/.test(entry)) {
  throw new Error('Expected Worker entry to export a scheduled handler for rankings and backups.');
}
for (const modulePath of ['dist/server/mojie-api.mjs', 'dist/server/mojie-extended-api.mjs']) {
  if (!existsSync(modulePath)) throw new Error(`Expected Worker API module at ${modulePath}.`);
}
const api = readFileSync('dist/server/mojie-api.mjs', 'utf8');
for (const requiredRoute of ['/api/auth/login', '/api/rankings/run', '/api/backups/run']) {
  if (!api.includes(requiredRoute)) throw new Error(`Expected API bundle to include ${requiredRoute}.`);
}
const extendedApi = readFileSync('dist/server/mojie-extended-api.mjs', 'utf8');
for (const requiredRoute of ['/api/site/public', '/api/admin/overview', '/api/admin/settings', '/members', '/comments', '/suggestions']) {
  if (!extendedApi.includes(requiredRoute)) throw new Error(`Expected extended API bundle to include ${requiredRoute}.`);
}
if (!entry.includes('handleMojieExtendedApi')) {
  throw new Error('Expected Worker entry to route administration and collaboration APIs.');
}
if (!Array.isArray(workerConfig.triggers?.crons) || !workerConfig.triggers.crons.length) {
  throw new Error('Expected at least one cron trigger for automatic rankings and backup retention.');
}

const todayUtc = new Date().toISOString().slice(0, 10);
if (typeof workerConfig.compatibility_date !== 'string' || workerConfig.compatibility_date > todayUtc) {
  throw new Error(`Expected a supported Worker compatibility date, got ${String(workerConfig.compatibility_date)}.`);
}

console.log('Worker bundle exposes authentication, collaboration, administration, scheduled tasks and a supported compatibility date.');
