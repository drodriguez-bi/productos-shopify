# Panel de programación para Shopify

Programa 3 cosas desde un solo panel, sin SQL, editando varios productos a la vez:

1. **Publicar productos en fecha** — quedan en borrador y se activan solos.
2. **Agregar inventario en fecha** — sumas piezas al stock el día que definas.
3. **Precio con tachado por rango de fechas** — precio promo + `compareAtPrice`, y al terminar el rango vuelve solo al precio normal. Soporta % de descuento aplicado a varios productos con precios distintos a la vez.

Todo se guarda como JSON en **Cloudflare KV** (nada de bases de datos SQL). Un **Cron Trigger** revisa cada 10 minutos qué reglas ya vencieron y las ejecuta contra la Admin API de Shopify.

## Estructura del repo (así tal cual, sin subcarpetas extra al subirlo)

```
index.html            → el panel visual — Cloudflare Pages lo detecta solo, sin configurar nada
worker-single-file.js → todo el Worker en un solo archivo, para pegar en el editor del dashboard
worker/               → el mismo Worker en módulos, por si prefieres desplegarlo por Git
README.md
```

## Paso 1 — Conseguir el token de Shopify

En el admin de la tienda: **Settings → Apps → Develop apps → tu Custom App**, o el token que ya te da tu app instalada desde el Partner Dashboard. Necesita permisos:
`write_products`, `read_products`, `write_inventory`, `read_inventory`, `read_locations`.

## Paso 2 — Subir este repo a GitHub (desde la web, sin terminal)

En GitHub.com → tu repo → **Add file → Upload files** → arrastras todo el contenido de esta carpeta (el `index.html` debe quedar en la raíz del repo, no dentro de otra carpeta).

## Paso 3 — Cloudflare Pages (el panel visual)

**Workers & Pages → Create → Pages → Connect to Git** → eliges el repo. Como `index.html` está en la raíz, no hay que tocar ningún campo de "output directory" — Cloudflare lo encuentra solo. Deploy.

Te da una URL tipo `https://tu-proyecto.pages.dev` — esa es la que abres para trabajar.

## Paso 4 — El Worker (API + cron), sin terminal

Tienes dos formas, elige una:

**A) Pegar el código directo (la más simple):**
1. **Workers & Pages → Create → Workers** → elige la opción de editor en el navegador.
2. Borra el contenido de ejemplo y pega completo el archivo `worker-single-file.js`.
3. Guarda / Deploy.

**B) Conectar por Git (se actualiza solo con cada push):**
1. **Workers & Pages → Create → Workers → Connect to Git** (si tu cuenta ya tiene esta opción disponible).
2. Selecciona el repo, **Root directory:** `worker`.

## Paso 5 — Configurar el Worker (todo dentro de Settings, sin terminal)

Dentro del Worker que acabas de crear:

- **Settings → Bindings → Add → KV Namespace** → nombre `RULES`, se crea ahí mismo.
- **Settings → Variables and Secrets → Add variable:**
  - `SHOPIFY_SHOP_DOMAIN` = `stanley-1913-mx.myshopify.com` (texto normal)
  - `SHOPIFY_ADMIN_TOKEN` = tu token (márcalo como **Secret**)
- **Settings → Triggers → Cron Triggers → Add** → `*/10 * * * *` (cada 10 minutos).

Guarda / Deploy de nuevo para que tome los cambios.

## Paso 6 — Conectar el panel con el Worker

Copia la URL de tu Worker (algo como `https://tu-worker.tu-usuario.workers.dev`). Abre tu panel en Pages, pégala en el campo de arriba a la derecha, clic en **Conectar**. Ya puedes ver el listado de productos, marcar varios con checkbox, y programar.

## Cómo se ve el flujo del día a día

- Abres tu URL de Pages.
- Ves el listado de productos (o escribes para filtrar).
- Marcas uno o varios con checkbox.
- Eliges el tipo de regla: Publicar / Inventario / Precio promo.
- Llenas fecha(s) y cantidades → **Programar**.
- El cron del Worker corre solo cada 10 minutos y ejecuta lo que ya venció. Lo ves reflejado en el tablero como "Pendiente", "Hecho" o "Falló" (con el motivo si algo salió mal).

## Notas

- **Editar una regla ya creada:** por ahora se borra (×) y se crea de nuevo — no hay botón de editar todavía.
- **Precio con tachado en varios productos a la vez:** usa el campo de "% de descuento" en vez de precios fijos, así cada producto conserva su propio precio original y solo se le aplica el porcentaje.
- **Inventario y precio en modo masivo:** se usa la primera variante de cada producto seleccionado. Si necesitas apuntar a una variante específica de un producto con muchas variantes, prográmalo de uno en uno.
