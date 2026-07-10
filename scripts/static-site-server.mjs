import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(serverDirectory, '..', 'public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendStatus(response, statusCode) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(statusCode === 404 ? 'Not found' : 'Method not allowed');
}

function resolveRequestPath(requestUrl) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(requestUrl ?? '/', 'http://localhost').pathname);
  } catch {
    return null;
  }

  const candidate = resolve(publicDirectory, `.${pathname}`);
  const directoryPrefix = `${publicDirectory}${sep}`;

  return candidate === publicDirectory || candidate.startsWith(directoryPrefix) ? candidate : null;
}

async function resolveFile(requestUrl) {
  let filePath = resolveRequestPath(requestUrl);
  if (!filePath) return null;

  try {
    if ((await fs.stat(filePath)).isDirectory()) filePath = resolve(filePath, 'index.html');
    await fs.access(filePath);
    return filePath;
  } catch {
    if (extname(filePath)) return null;
    return resolve(publicDirectory, 'index.html');
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendStatus(response, 405);
    return;
  }

  const filePath = await resolveFile(request.url);
  if (!filePath) {
    sendStatus(response, 404);
    return;
  }

  const extension = extname(filePath);
  response.writeHead(200, {
    'Cache-Control': filePath.includes(`${sep}_next${sep}static${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Type': contentTypes[extension] ?? 'application/octet-stream'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

server.listen(port, host, () => {
  console.log(`Static server listening on ${host}:${port}`);
});
