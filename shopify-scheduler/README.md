# Panel de programación para Shopify

Programa 3 cosas desde una sola interfaz, sin SQL:

1. **Publicar productos en fecha** — quedan en borrador y se activan solos.
2. **Agregar inventario en fecha** — sumas piezas al stock el día que definas.
3. **Precio con tachado por rango de fechas** — precio promo + `compareAtPrice`, y al terminar el rango vuelve solo al precio normal.

Todo se guarda como JSON en **Cloudflare KV** (nada de bases de datos SQL). Un **Cron Trigger** de Cloudflare Workers revisa cada 10 minutos qué reglas ya vencieron y las ejecuta contra la Admin API de Shopify.

## Estructura

```
shopify-scheduler/
├── worker/          → API + cron (Cloudflare Worker)
│   ├── wrangler.toml
│   └── src/
│       ├── index.js    (entrada: fetch + scheduled)
│       ├── api.js      (CRUD de reglas, búsqueda de productos)
│       ├── shopify.js  (mutations GraphQL a Shopify)
│       └── runner.js   (ejecuta lo vencido)
└── frontend/
    └── index.html   → el panel visual (Cloudflare Pages)
```

## 1. Preparar Shopify

Necesitas un **Custom App** en el admin de la tienda (Settings → Apps → Develop apps) con estos permisos (scopes):

- `write_products`, `read_products`
- `write_inventory`, `read_inventory`
- `read_locations`

Copia el **Admin API access token** que te da al instalarla — lo vas a necesitar como secreto en el Worker.

## 2. Desplegar el Worker (API + cron)

```bash
cd worker
npm install
npx wrangler login

# Crea el namespace de KV (tu "base de datos" JSON)
npx wrangler kv:namespace create RULES
```

Copia el `id` que te devuelve y pégalo en `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "RULES", id = "PEGA_AQUI_EL_ID" }
]
```

Guarda tus credenciales de Shopify como secretos (nunca van en el código ni en GitHub):

```bash
npx wrangler secret put SHOPIFY_SHOP_DOMAIN
# ejemplo: stanley-1913-mx.myshopify.com

npx wrangler secret put SHOPIFY_ADMIN_TOKEN
# el token que copiaste en el paso 1
```

Despliega:

```bash
npx wrangler deploy
```

Esto te da una URL tipo `https://shopify-scheduler.tu-usuario.workers.dev` — es la que usa el frontend.

Si tienes varias tiendas (stanley-1913-mx, LALIC DERIEN, Máthe, etc.), lo más simple es desplegar **un Worker por tienda** repitiendo estos pasos con otro nombre en `wrangler.toml` — cada uno con su propio token y su propio namespace de KV.

## 3. Desplegar el frontend en Cloudflare Pages

Sube la carpeta `frontend/` a un repo de GitHub, y en Cloudflare:

1. **Workers & Pages → Create → Pages → Connect to Git**
2. Selecciona el repo
3. Build command: (déjalo vacío, es HTML puro)
4. Output directory: `frontend`

Cloudflare te da una URL tipo `https://shopify-scheduler.pages.dev`.

Ábrela, y arriba a la derecha pega la URL de tu Worker (la del paso 2) y da clic en **Conectar**. Ya puedes buscar productos, elegir fechas y programar.

> Si no quieres pegar la URL cada vez que abres el panel, edita la constante `DEFAULT_API_BASE` al inicio del `<script>` en `index.html` antes de subirlo, y déjala ya escrita.

## Cómo se ve el flujo

- Buscas el producto por nombre → eliges la variante.
- Eliges el tipo de regla: Publicar / Inventario / Precio promo.
- Llenas fecha(s) y cantidades.
- Das clic en **Programar** → se guarda en KV con estado `pending`.
- El cron del Worker corre solo cada 10 minutos, ejecuta lo que ya venció, y lo marca `done` (o `failed` si algo sale mal, con el mensaje de error visible en el tablero).

Para el caso de precio con tachado, al programar se crean **dos** reglas ligadas por `group_id`: una que aplica la promo en la fecha de inicio, y otra que la revierte en la fecha de fin — ambas aparecen por separado en el tablero.

## Notas

- **Editar una regla ya creada:** por ahora no hay botón de "editar" — bórrala (×) y créala de nuevo. Es intencional para mantener esto simple; si luego se vuelve tedioso, se puede agregar un endpoint `PATCH /rules/:id`.
- **Ver qué falló:** las reglas con estado `failed` guardan el mensaje de error de Shopify en el campo `error` — puedes verlo abriendo el KV desde el dashboard de Cloudflare si necesitas más detalle que el que muestra el tablero.
- **Múltiples tiendas desde un solo panel:** si quieres manejar varias tiendas desde la misma interfaz (en vez de un Worker por tienda), se puede agregar un selector de tienda en el frontend y un campo `shop` en cada regla — dime si te interesa esa variante.
