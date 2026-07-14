const originValue = String(process.env.MOJIE_DEPLOYMENT_URL || process.env.MOJIE_PREVIEW_URL || process.env.APP_ORIGIN || '').replace(/\/+$/u, '');

if (!originValue) throw new Error('MOJIE_DEPLOYMENT_URL, MOJIE_PREVIEW_URL or APP_ORIGIN is required');

const origin = new URL(originValue);
if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== originValue) {
  throw new Error('Deployment origin must be an exact HTTP(S) origin without a path');
}

async function fetchWithTimeout(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out fetching ${url}`)), timeoutMs);
  try {
    return await fetch(url, { redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyDeployment() {
  const root = await fetchWithTimeout(`${originValue}/`);
  if (root.status !== 200) {
    await root.body?.cancel();
    throw new Error(`Root document returned HTTP ${root.status}`);
  }
  const html = await root.text();
  const scriptPaths = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu)]
    .map((match) => new URL(match[1], originValue))
    .filter((url) => url.origin === origin.origin && url.pathname.startsWith('/_next/static/'));
  const uniqueScripts = [...new Map(scriptPaths.map((url) => [url.href, url])).values()].slice(0, 4);

  if (!uniqueScripts.length) throw new Error('Root document did not reference any versioned client script');

  for (const scriptUrl of uniqueScripts) {
    const response = await fetchWithTimeout(scriptUrl.href);
    const contentType = response.headers.get('content-type') || '';
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`${scriptUrl.pathname} returned HTTP ${response.status}`);
    }
    if (!/javascript|ecmascript/iu.test(contentType)) {
      await response.body?.cancel();
      throw new Error(`${scriptUrl.pathname} returned non-JavaScript content type ${contentType || '(missing)'}`);
    }
    await response.body?.cancel();
  }

  return uniqueScripts.length;
}

const attempts = Math.max(1, Number.parseInt(process.env.MOJIE_ASSET_VERIFY_ATTEMPTS || '12', 10) || 12);
let lastError;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const scriptCount = await verifyDeployment();
    process.stdout.write(`Client boot assets verified (${scriptCount} versioned scripts, attempt ${attempt}/${attempts}).\n`);
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

if (lastError) throw lastError;
