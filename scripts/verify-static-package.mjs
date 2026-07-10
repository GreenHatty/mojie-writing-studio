import { existsSync } from 'node:fs';

if (!existsSync('dist/public/index.html')) {
  throw new Error('Expected the static site shell at dist/public/index.html.');
}

if (existsSync('dist/server/node_modules')) {
  throw new Error('The deployment server must not bundle node_modules for this client-only application.');
}

console.log('Static deployment package is present and dependency-free.');
