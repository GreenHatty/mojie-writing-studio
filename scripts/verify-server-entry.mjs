import { spawn } from 'node:child_process';

const port = 34127;
const server = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    PORT: String(port)
  },
  stdio: 'pipe'
});

let output = '';
let exited = false;
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
server.on('exit', () => {
  exited = true;
});

async function waitForServer() {
  const deadline = Date.now() + 12_000;

  while (Date.now() < deadline) {
    if (exited) throw new Error('dist/server/index.js exited before opening a listener.');

    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(500)
      });

      if (response.status > 0) return;
    } catch {
      // The production server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`dist/server/index.js did not respond on port ${port}. ${output}`);
}

try {
  await waitForServer();
  console.log('Server entry responded to an HTTP request.');
} finally {
  if (!exited) server.kill();
}
