import { readFileSync } from 'node:fs';

const entry = readFileSync('dist/server/index.js', 'utf8');
const workerConfig = JSON.parse(readFileSync('dist/wrangler.json', 'utf8'));

if (!/export\s+default\s+\{[\s\S]*?fetch\s*\(/.test(entry)) {
  throw new Error('Expected dist/server/index.js to export an ES Module Worker fetch handler.');
}

const todayUtc = new Date().toISOString().slice(0, 10);
if (typeof workerConfig.compatibility_date !== 'string' || workerConfig.compatibility_date > todayUtc) {
  throw new Error(`Expected a supported Worker compatibility date, got ${String(workerConfig.compatibility_date)}.`);
}

console.log('Worker entry exports an ES Module fetch handler with a supported compatibility date.');
