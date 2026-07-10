import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('.next/standalone/server.js')) {
  throw new Error('Expected Next.js standalone output in ./.next/standalone/server.js');
}

rmSync('dist', { force: true, recursive: true });
mkdirSync('dist/server', { recursive: true });
cpSync('.next/standalone', 'dist/server', { recursive: true });

if (existsSync('.next/static')) {
  mkdirSync('dist/server/.next', { recursive: true });
  cpSync('.next/static', 'dist/server/.next/static', { recursive: true });
}

if (existsSync('public')) {
  cpSync('public', 'dist/server/public', { recursive: true });
}

renameSync('dist/server/server.js', 'dist/server/index.js');
mkdirSync('dist/.openai', { recursive: true });
const { project_id: projectId } = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (typeof projectId !== 'string' || !projectId) {
  throw new Error('Expected .openai/hosting.json to contain a project_id');
}
writeFileSync('dist/.openai/hosting.json', `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);
