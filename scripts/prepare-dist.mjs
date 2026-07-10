import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/server/index.js')) {
  throw new Error('Expected Vinext server output in ./dist/server/index.js');
}

mkdirSync('dist/.openai', { recursive: true });
const { project_id: projectId } = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (typeof projectId !== 'string' || !projectId) {
  throw new Error('Expected .openai/hosting.json to contain a project_id');
}
writeFileSync('dist/.openai/hosting.json', `${JSON.stringify({ project_id: projectId }, null, 2)}\n`);
