import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

if (!existsSync('dist/server/index.js')) {
  throw new Error('Expected Vinext server output in ./dist/server/index.js');
}

mkdirSync('dist/.openai', { recursive: true });
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
