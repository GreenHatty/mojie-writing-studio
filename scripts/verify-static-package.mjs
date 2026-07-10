import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('dist/public/index.html')) {
  throw new Error('Expected the static site shell at dist/public/index.html.');
}

if (existsSync('dist/server/node_modules')) {
  throw new Error('The deployment server must not bundle node_modules for this client-only application.');
}

const serverEntry = readFileSync('dist/server/index.js', 'utf8');
if (serverEntry.includes('import.meta.url')) {
  throw new Error('The deployment server must not depend on import.meta.url in the Sites runtime.');
}

console.log('Static deployment package is present and dependency-free.');
