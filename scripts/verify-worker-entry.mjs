import { existsSync, readFileSync } from 'node:fs';

const entry = readFileSync('dist/server/index.js', 'utf8');
const workerConfig = JSON.parse(readFileSync('dist/wrangler.json', 'utf8'));

if (!/export\s+default\s+\{[\s\S]*?fetch\s*\(/.test(entry)) {
  throw new Error('Expected dist/server/index.js to export an ES Module Worker fetch handler.');
}
if (!/scheduled\s*\(/.test(entry)) {
  throw new Error('Expected Worker entry to export a scheduled handler for rankings and backups.');
}
for (const modulePath of ['dist/server/mojie-auth-api.mjs', 'dist/server/mojie-api.mjs', 'dist/server/mojie-extended-api.mjs', 'dist/server/mojie-privacy-guard.mjs', 'dist/server/ranking-adapters.mjs']) {
  if (!existsSync(modulePath)) throw new Error(`Expected Worker API module at ${modulePath}.`);
}

const authApi = readFileSync('dist/server/mojie-auth-api.mjs', 'utf8');
for (const requiredCapability of ['handleMojieAuthApi', 'PASSWORD_ITERATIONS = 100_000', 'pbkdf2-sha256', 'acceptInvite', 'createSession']) {
  if (!authApi.includes(requiredCapability)) throw new Error(`Expected authentication bundle to include ${requiredCapability}.`);
}
if (authApi.includes('iterations: 310_000')) {
  throw new Error('Authentication bundle contains a PBKDF2 iteration count unsupported by Cloudflare Workers.');
}

const api = readFileSync('dist/server/mojie-api.mjs', 'utf8');
for (const requiredCapability of ['rankingRoutes', 'processRankingTask', "status: 'queued' }, 202", 'backupRoutes', 'handleMojieScheduled']) {
  if (!api.includes(requiredCapability)) throw new Error(`Expected core API bundle to include ${requiredCapability}.`);
}
const rankingAdapters = readFileSync('dist/server/ranking-adapters.mjs', 'utf8');
for (const requiredCapability of ['QidianRankingAdapterV1', 'FanqieRankingAdapterV1', 'ranking_response_too_large', 'ranking_redirect_rejected']) {
  if (!rankingAdapters.includes(requiredCapability)) throw new Error(`Expected ranking adapter bundle to include ${requiredCapability}.`);
}

const extendedApi = readFileSync('dist/server/mojie-extended-api.mjs', 'utf8');
for (const requiredCapability of ['publicRoutes', 'adminRoutes', 'memberRoutes', 'collaborationRoutes', 'chapter_comments', 'chapter_suggestions', 'site_settings']) {
  if (!extendedApi.includes(requiredCapability)) throw new Error(`Expected extended API bundle to include ${requiredCapability}.`);
}

const privacyGuard = readFileSync('dist/server/mojie-privacy-guard.mjs', 'utf8');
for (const requiredPolicy of ['guardMojiePrivateContent', 'work_members', 'docx_assets', 'chapter_comments', 'chapter_suggestions']) {
  if (!privacyGuard.includes(requiredPolicy)) throw new Error(`Expected privacy guard to include ${requiredPolicy}.`);
}
if (!entry.includes('guardMojiePrivateContent') || !entry.includes('handleMojieAuthApi') || !entry.includes('handleMojieExtendedApi')) {
  throw new Error('Expected Worker entry to apply privacy guard and dedicated authentication before administration and core APIs.');
}
if (!Array.isArray(workerConfig.triggers?.crons) || !workerConfig.triggers.crons.length) {
  throw new Error('Expected at least one cron trigger for automatic rankings and backup retention.');
}

const todayUtc = new Date().toISOString().slice(0, 10);
if (typeof workerConfig.compatibility_date !== 'string' || workerConfig.compatibility_date > todayUtc) {
  throw new Error(`Expected a supported Worker compatibility date, got ${String(workerConfig.compatibility_date)}.`);
}

console.log('Worker bundle exposes privacy-guarded versioned authentication, collaboration, administration, scheduled tasks and a supported compatibility date.');
