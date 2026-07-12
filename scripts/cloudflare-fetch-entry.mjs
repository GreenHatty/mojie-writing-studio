import handler from './vinext-handler.js';
import { handleMojieAuthApi } from './mojie-auth-api.mjs';
import { handleMojieApi, handleMojieScheduled } from './mojie-api.mjs';
import { handleMojieExtendedApi } from './mojie-extended-api.mjs';
import { guardMojiePrivateContent } from './mojie-privacy-guard.mjs';

export default {
  async fetch(request, env, ctx) {
    const guardResponse = await guardMojiePrivateContent(request, env);
    if (guardResponse) return guardResponse;
    const authResponse = await handleMojieAuthApi(request, env);
    if (authResponse) return authResponse;
    const extendedResponse = await handleMojieExtendedApi(request, env);
    if (extendedResponse) return extendedResponse;
    const apiResponse = await handleMojieApi(request, env);
    if (apiResponse) return apiResponse;
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller, env, ctx) {
    return handleMojieScheduled(env, ctx);
  }
};
