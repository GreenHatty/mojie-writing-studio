import handler from './vinext-handler.js';
import { handleMojieAuthApi } from './mojie-auth-api.mjs';
import { handleMojieApi } from './mojie-api.mjs';
import { handleMojieExtendedApi } from './mojie-extended-api.mjs';
import { handleMojieCoreOperationsApi, handleMojieCoreOperationsScheduled } from './mojie-core-operations-api.mjs';
import { guardMojiePrivateContent } from './mojie-privacy-guard.mjs';

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const PUBLIC_ASSET_PATHS = new Set([
  '/mojie-icon.svg',
  '/sw.js',
  '/text-check-worker.js',
  '/vinext-client-entry-manifest.json'
]);

function isPublicAssetRequest(request, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return pathname.startsWith('/_next/static/') || pathname.startsWith('/map-assets/') || PUBLIC_ASSET_PATHS.has(pathname);
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    // `run_worker_first` keeps the authenticated root and API under Worker
    // control. Delegate only known public build assets to the static binding so
    // Vinext client chunks never fall through to the application router.
    if (isPublicAssetRequest(request, pathname) && env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    const operationsResponse = await handleMojieCoreOperationsApi(request, env, ctx);
    if (operationsResponse) return privateResponse(operationsResponse);
    // The foundation routes are isolated while the legacy API remains in its
    // compatibility window. This prevents two authorization systems from
    // silently handling the same endpoint.
    if (pathname.startsWith('/api/core/')) return privateResponse(await handler.fetch(request, env, ctx));
    const guardResponse = await guardMojiePrivateContent(request, env);
    if (guardResponse) return guardResponse;
    const authResponse = await handleMojieAuthApi(request, env);
    if (authResponse) return authResponse;
    const extendedResponse = await handleMojieExtendedApi(request, env);
    if (extendedResponse) return extendedResponse;
    const apiResponse = await handleMojieApi(request, env, ctx);
    if (apiResponse) return apiResponse;
    const response = await handler.fetch(request, env, ctx);
    return request.mode === 'navigate' || request.destination === 'document' ? privateResponse(response) : response;
  },
  scheduled(_controller, env, ctx) {
    return handleMojieCoreOperationsScheduled(env, ctx);
  }
};
