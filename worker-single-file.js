// ============================================================
// Shopify Scheduler — archivo único para pegar en el editor
// online del dashboard de Cloudflare (Workers & Pages → Create
// → Workers → editor en el navegador). No requiere terminal.
// ============================================================

const API_VERSION = '2025-01';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDueRules(env));
  }
};

// ---------------- API que consume el frontend ----------------

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (url.pathname === '/products' && request.method === 'GET') {
    const q = url.searchParams.get('query') || '';
    return json(await searchProducts(env, q));
  }

  if (url.pathname === '/locations' && request.method === 'GET') {
    return json(await listLocations(env));
  }

  if (url.pathname === '/rules' && request.method === 'GET') {
    const list = await env.RULES.list({ prefix: 'rule:' });
    const rules = await Promise.all(
      list.keys.map(async k => JSON.parse(await env.RULES.get(k.name)))
    );
    rules.sort((a, b) => new Date(a.run_at) - new Date(b.run_at));
    return json(rules);
  }

  if (url.pathname === '/rules' && request.method === 'POST') {
    const body = await request.json();
    const id = crypto.randomUUID();
    const rule = { id, status: 'pending', created_at: new Date().toISOString(), ...body };
    await env.RULES.put(`rule:${id}`, JSON.stringify(rule));
    return json(rule);
  }

  if (url.pathname.startsWith('/rules/') && request.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    await env.RULES.delete(`rule:${id}`);
    return json({ deleted: id });
  }

  return new Response('Not found', { status: 404, headers: CORS });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// ---------------- Llamadas a Shopify ----------------

async function shopifyGraphQL(env, query, variables) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));

  const userErrors = Object.values(data.data || {})
    .filter(v => v && Array.isArray(v.userErrors))
    .flatMap(v => v.userErrors);
  if (userErrors.length) throw new Error(userErrors.map(e => e.message).join('; '));

  return data.data;
}

async function searchProducts(env, queryText) {
  const data = await shopifyGraphQL(env, `
    query($query: String!) {
      products(first: 15, query: $query) {
        edges {
          node {
            id
            title
            status
            featuredImage { url }
            variants(first: 25) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  inventoryItem { id }
                }
              }
            }
          }
        }
      }
    }
  `, { query: queryText || '' });

  return data.products.edges.map(e => ({
    id: e.node.id,
    title: e.node.title,
    status: e.node.status,
    image: e.node.featuredImage?.url || null,
    variants: e.node.variants.edges.map(v => ({
      id: v.node.id,
      title: v.node.title,
      price: v.node.price,
      compareAtPrice: v.node.compareAtPrice,
      inventoryItemId: v.node.inventoryItem?.id
    }))
  }));
}

async function listLocations(env) {
  const data = await shopifyGraphQL(env, `
    query { locations(first: 25) { edges { node { id name } } } }
  `, {});
  return data.locations.edges.map(e => e.node);
}

async function publishProduct(env, productId) {
  return shopifyGraphQL(env, `
    mutation($id: ID!) {
      productUpdate(input: { id: $id, status: ACTIVE }) {
        userErrors { field message }
      }
    }
  `, { id: productId });
}

async function adjustInventory(env, rule) {
  return shopifyGraphQL(env, `
    mutation($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `, {
    input: {
      reason: 'correction',
      name: 'available',
      changes: [{
        delta: Number(rule.quantity),
        inventoryItemId: rule.inventory_item_id,
        locationId: rule.location_id
      }]
    }
  });
}

async function setPromoPrice(env, rule) {
  return shopifyGraphQL(env, `
    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }
  `, {
    productId: rule.product_id,
    variants: [{ id: rule.variant_id, price: rule.promo_price, compareAtPrice: rule.original_price }]
  });
}

async function revertPrice(env, rule) {
  return shopifyGraphQL(env, `
    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }
  `, {
    productId: rule.product_id,
    variants: [{ id: rule.variant_id, price: rule.original_price, compareAtPrice: null }]
  });
}

// ---------------- El cron: revisa y ejecuta lo vencido ----------------

async function runDueRules(env) {
  const list = await env.RULES.list({ prefix: 'rule:' });
  const now = new Date();

  for (const key of list.keys) {
    const raw = await env.RULES.get(key.name);
    if (!raw) continue;

    const rule = JSON.parse(raw);
    if (rule.status !== 'pending') continue;
    if (new Date(rule.run_at) > now) continue;

    try {
      switch (rule.type) {
        case 'publish': await publishProduct(env, rule.product_id); break;
        case 'inventory_add': await adjustInventory(env, rule); break;
        case 'price_promo_start': await setPromoPrice(env, rule); break;
        case 'price_promo_end': await revertPrice(env, rule); break;
        default: throw new Error(`Tipo de regla desconocido: ${rule.type}`);
      }
      rule.status = 'done';
      rule.executed_at = now.toISOString();
    } catch (err) {
      rule.status = 'failed';
      rule.error = err.message;
    }

    await env.RULES.put(key.name, JSON.stringify(rule));
  }
}
