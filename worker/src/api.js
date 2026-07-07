import { searchProducts, listLocations } from './shopify.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  // Buscar productos en Shopify por título
  if (url.pathname === '/products' && request.method === 'GET') {
    const q = url.searchParams.get('query') || '';
    const products = await searchProducts(env, q);
    return json(products);
  }

  // Listar ubicaciones (para el selector de inventario)
  if (url.pathname === '/locations' && request.method === 'GET') {
    const locations = await listLocations(env);
    return json(locations);
  }

  // Listar todas las reglas programadas
  if (url.pathname === '/rules' && request.method === 'GET') {
    const list = await env.RULES.list({ prefix: 'rule:' });
    const rules = await Promise.all(
      list.keys.map(async k => JSON.parse(await env.RULES.get(k.name)))
    );
    rules.sort((a, b) => new Date(a.run_at) - new Date(b.run_at));
    return json(rules);
  }

  // Crear una regla nueva
  if (url.pathname === '/rules' && request.method === 'POST') {
    const body = await request.json();
    const id = crypto.randomUUID();
    const rule = {
      id,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...body
    };
    await env.RULES.put(`rule:${id}`, JSON.stringify(rule));
    return json(rule);
  }

  // Borrar una regla (o una pareja start/end si comparten group_id)
  if (url.pathname.startsWith('/rules/') && request.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    await env.RULES.delete(`rule:${id}`);
    return json({ deleted: id });
  }

  return new Response('Not found', { status: 404, headers: CORS });
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
