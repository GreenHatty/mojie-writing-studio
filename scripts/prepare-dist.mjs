import { cpSync, existsSync, rmSync } from 'node:fs';

if (!existsSync('out')) {
  throw new Error('Expected Next static export output in ./out');
}

rmSync('dist', { force: true, recursive: true });
cpSync('out', 'dist', { recursive: true });
