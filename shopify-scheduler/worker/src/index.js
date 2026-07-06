import { handleApi } from './api.js';
import { runDueRules } from './runner.js';

export default {
  // Peticiones HTTP normales -> la API que usa el frontend
  async fetch(request, env, ctx) {
    try {
      return await handleApi(request, env);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  },

  // Se ejecuta solo, cada 10 minutos, según wrangler.toml
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDueRules(env));
  }
};
