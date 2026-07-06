import { publishProduct, adjustInventory, setPromoPrice, revertPrice } from './shopify.js';

export async function runDueRules(env) {
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
        case 'publish':
          await publishProduct(env, rule.product_id);
          break;
        case 'inventory_add':
          await adjustInventory(env, rule);
          break;
        case 'price_promo_start':
          await setPromoPrice(env, rule);
          break;
        case 'price_promo_end':
          await revertPrice(env, rule);
          break;
        default:
          throw new Error(`Tipo de regla desconocido: ${rule.type}`);
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
