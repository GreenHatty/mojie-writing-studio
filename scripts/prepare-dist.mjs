import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/server/index.js')) {
  throw new Error('Expected Vinext worker output in ./dist/server/index.js');
}

renameSync('dist/server/index.js', 'dist/server/vinext-handler.js');
copyFileSync('scripts/cloudflare-fetch-entry.mjs', 'dist/server/index.js');
copyFileSync('scripts/mojie-api.mjs', 'dist/server/mojie-api.mjs');
copyFileSync('scripts/mojie-extended-api.mjs', 'dist/server/mojie-extended-api.mjs');
copyFileSync('scripts/mojie-privacy-guard.mjs', 'dist/server/mojie-privacy-guard.mjs');
mkdirSync('dist/.openai', { recursive: true });
const { project_id: projectId } = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (typeof projectId !== 'string' || !projectId) {
  throw new Error('Expected .openai/hosting.json to contain a project_id');
}
writeFileSync('dist/.openai/hosting.json', `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);

const wrangler = {
  name: process.env.CLOUDFLARE_WORKER_NAME || 'mojie-writing-studio',
  compatibility_date: '2026-07-11',
  compatibility_flags: ['nodejs_compat'],
  main: 'server/index.js',
  assets: {
    binding: 'ASSETS',
    directory: 'client',
    not_found_handling: 'none'
  },
  triggers: {
    crons: [process.env.MOJIE_CRON_SCHEDULE || '*/15 * * * *']
  }
};

if (process.env.CLOUDFLARE_D1_DATABASE_ID) {
  wrangler.d1_databases = [{
    binding: 'DB',
    database_name: process.env.CLOUDFLARE_D1_DATABASE_NAME || 'mojie-writing-studio',
    database_id: process.env.CLOUDFLARE_D1_DATABASE_ID,
    migrations_dir: '../migrations'
  }];
}

const r2Buckets = [];
if (process.env.CLOUDFLARE_DOCX_BUCKET_NAME) {
  r2Buckets.push({ binding: 'DOCX_BUCKET', bucket_name: process.env.CLOUDFLARE_DOCX_BUCKET_NAME });
}
if (process.env.CLOUDFLARE_BACKUP_BUCKET_NAME) {
  r2Buckets.push({ binding: 'BACKUP_BUCKET', bucket_name: process.env.CLOUDFLARE_BACKUP_BUCKET_NAME });
}
if (r2Buckets.length) wrangler.r2_buckets = r2Buckets;

writeFileSync('dist/wrangler.json', `${JSON.stringify(wrangler, null, 2)}\n`);
