import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('out/index.html')) {
  throw new Error('Expected Next.js static output in ./out/index.html');
}

rmSync('dist', { force: true, recursive: true });
mkdirSync('dist/public', { recursive: true });
mkdirSync('dist/server', { recursive: true });
cpSync('out', 'dist/public', { recursive: true });
copyFileSync('scripts/static-site-server.mjs', 'dist/server/index.js');
mkdirSync('dist/.openai', { recursive: true });
const { project_id: projectId } = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (typeof projectId !== 'string' || !projectId) {
  throw new Error('Expected .openai/hosting.json to contain a project_id');
}
writeFileSync('dist/.openai/hosting.json', `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);
