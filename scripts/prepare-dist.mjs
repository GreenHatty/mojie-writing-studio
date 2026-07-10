import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/server/index.js')) {
  throw new Error('Expected Vinext worker output in ./dist/server/index.js');
}

renameSync('dist/server/index.js', 'dist/server/vinext-handler.js');
copyFileSync('scripts/cloudflare-fetch-entry.mjs', 'dist/server/index.js');
mkdirSync('dist/.openai', { recursive: true });
const { project_id: projectId } = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (typeof projectId !== 'string' || !projectId) {
  throw new Error('Expected .openai/hosting.json to contain a project_id');
}
writeFileSync('dist/.openai/hosting.json', `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);
writeFileSync(
  'dist/wrangler.json',
  `${JSON.stringify({
    name: 'mojie-writing-studio',
    compatibility_date: '2026-07-10',
    compatibility_flags: ['nodejs_compat'],
    main: 'server/index.js',
    assets: {
      binding: 'ASSETS',
      directory: 'client',
      not_found_handling: 'none'
    }
  }, null, 2)}\n`
);
