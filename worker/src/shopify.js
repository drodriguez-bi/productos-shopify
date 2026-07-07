const API_VERSION = '2025-01';

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

  const userErrors = collectUserErrors(data.data);
  if (userErrors.length) throw new Error(userErrors.map(e => e.message).join('; '));

  return data.data;
}

function collectUserErrors(data) {
  if (!data) return [];
  return Object.values(data)
    .filter(v => v && Array.isArray(v.userErrors))
    .flatMap(v => v.userErrors);
}

// ---------- Lectura: para poblar la interfaz ----------

export async function searchProducts(env, queryText) {
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

export async function listLocations(env) {
  const data = await shopifyGraphQL(env, `
    query {
      locations(first: 25) {
        edges { node { id name } }
      }
    }
  `, {});
  return data.locations.edges.map(e => e.node);
}

// ---------- Escritura: lo que ejecuta el cron ----------

export async function publishProduct(env, productId) {
  return shopifyGraphQL(env, `
    mutation($id: ID!) {
      productUpdate(input: { id: $id, status: ACTIVE }) {
        userErrors { field message }
      }
    }
  `, { id: productId });
}

export async function adjustInventory(env, rule) {
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

export async function setPromoPrice(env, rule) {
  return shopifyGraphQL(env, `
    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }
  `, {
    productId: rule.product_id,
    variants: [{
      id: rule.variant_id,
      price: rule.promo_price,
      compareAtPrice: rule.original_price
    }]
  });
}

export async function revertPrice(env, rule) {
  return shopifyGraphQL(env, `
    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }
  `, {
    productId: rule.product_id,
    variants: [{
      id: rule.variant_id,
      price: rule.original_price,
      compareAtPrice: null
    }]
  });
}
