import handler from './vinext-handler.js';
import { handleMojieApi, handleMojieScheduled } from './mojie-api.mjs';
import { handleMojieExtendedApi } from './mojie-extended-api.mjs';

export default {
  async fetch(request, env, ctx) {
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
