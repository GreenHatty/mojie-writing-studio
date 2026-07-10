import handler from './vinext-handler.js';

export default {
  fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  }
};
