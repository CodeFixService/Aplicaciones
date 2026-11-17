# APP.md · 🚀 Despega Pyme

Leer esto antes que el código (G42j). Repo Aplicaciones · id `orbita` · Supabase gilsamacgappycibcqhq.
Tienda online + caja + pedidos para pymes chilenas. Free / Pro / 🧩 módulos (G39: Free compra módulos, Pro -20%).

## Quién usa qué
- **Negocio**: `/` (Inicio + Más) y las apps de `apps/`.
- **Cliente** (invitado por el negocio): `/`, Pedidos, Mensajes, Tienda.
- **Público** (sin cuenta): vitrina `/t/?s=<slug>`, ficha `&p=<producto>`, carrito `#carrito`.
- **Admin**: el panel vive en CM → Apps → 🧭 Despega (`apps/admin/` solo redirige).

## Pantallas
| URL | Qué es |
|---|---|
| `/` | Entrar · Inicio · Más (`nav.cfx-barra` "Más") |
| `/#tienda` | Más → 🏪 Mi tienda (datos, ✉️ Correo de tu tienda) |
| `/#links` `#equipo` `#despacho` `#boleta` `#redes` `#modulos` `#plan` `#ajustes` | Secciones del Más |
| `/apps/caja/` (`#productos`) | Caja / venta en local + productos (app.js) |
| `/apps/pedidos/` (`?v=stats`, `?v=cupones`) | Pedidos, estadísticas, cupones |
| `/apps/fichas/` (`#clientes`) | Diseños / fichas y clientes (app.js) |
| `/apps/mensajes/` `contactos/` `catalogo/` `suscribirse/` `legal/` | Chat, contactos, tienda del cliente, ofertas, términos |
| `/t/` · `/n/` · `/r/` | Vitrina pública · Crear tienda gratis · Seguimiento de pedido |

## Archivos clave
- `shared/core.js` (APP_VERSION l.349 / DB_VERSION l.350), `shared/cuenta.js` (sesión, plan, push, CFX_COMPROBANTE_DATOS al final), `shared/config.js` (⚠️ correo: solo Edit).
- Del núcleo (NO editar aquí, viene de SaaS/nucleo): auto, ayuda, barra, carga, comprobante, datos, despacho, fotos, humano, iconos, impresora, instalar, modulos, pagos, premium, qr, respaldo, seguro, tema.css, tienda, tour, ui, verificar, vitrina, voz.
- `worker.js`: vitrina con SEO y vista previa al compartir (Cloudflare).
- `supabase/instalar.sql` (~9.500 l, db_version() ~l.5363; boleta SII boleta_* solo aquí) · `supabase/functions/enviar` (correo y push).
- Pruebas en SaaS/pruebas: `node celular.js Aplicaciones`, g42_apl.js, g42f_apl.js, central.js.

## Tablas propias (además de las cfx_* del núcleo)
profiles, catalog_items, variantes, pedidos, cupones, links_pago, mp_cuentas, boleta_cuentas, boletas_caja, calificaciones, sellos, avisos_stock, publicaciones, publicacion_vistas, subscribers, user_invites, requests, conexiones, webhooks, webhook_envios, negocio_correo, notifications, notification_reads, push_subscriptions, planes, textos, app_settings, app_secrets, actividad_dia.

## Versiones
core.js l.349/l.350 + `version.json` (notas = SOLO categorías) + `db_version()` en instalar.sql. Ahora: 6.54 · bd 5.74 · enviar 3.6.

## ✉️ Correo (G42f, 6.19 · bd 5.50 · enviar 3.5)
- CodeFix → negocios/todos: Gmail de Josué (app_secrets gmail_*), se pone en CM → Control → ✉️ Correo.
- Tienda → SUS clientes (pedido_correo, avisos con email): Gmail del negocio en Más → 🏪 Mi tienda → ✉️ Correo (tabla negocio_correo, sin políticas; rpc mi_correo / mi_correo_guardar / mi_correo_quitar). Sin él no se manda correo (nunca cae al de CodeFix).
- La función "enviar" pregunta notif_correo(id) por cada notificación con email (solo el servidor puede).

- G95 (6.51 · bd 5.71): parte FREE (regalo_nuevo_negocio con d = 0; el trigger queda) · 🎁 Probar Pro en la hoja de pago (núcleo) · cfx_pro_prueba_app marca trial_used · trial_used de antes → cfx_pruebas_usadas. Prueba: SaaS/pruebas/g95.js.

- G96 (6.52 · bd 5.72): 🧩 módulos de tienda en `shared/extras.js` (hojas del Más, `abrir` de CFX_MENU; hash #giftcards #carritos #recurrentes #proveedores): 🎁 giftcards (tablas giftcards/giftcard_usos; Caja medio 'giftcard' → giftcard_canjear; carrito: el campo cupón acepta GC… → guardar_pedido descuenta gift_monto y giftcard_devolver lo devuelve al cancelar/rechazar/expirar) · 🛒 carrito: núcleo cfx_carritos_mios + gancho cfx_carrito_contacto_app · 🔁 suscripciones (tabla suscripciones, cron 'suscripciones' 12:05 UTC → suscripciones_correr usa guardar_pedido; el cliente pausa en Pedidos) · 📦 proveedores (tabla proveedores, catalog_items.stock_min/proveedor_id, aviso stock_minimo_aviso, pedido_proveedor → WhatsApp). 🚚 courier ya existía (pedido_seguimiento). Prueba: SaaS/pruebas/g96a.js.
- G96 b (6.53 · bd 5.73): 🏬 sucursales (módulo 'sucursales', hoja #sucursales en extras.js; tablas bodegas/stock_bodega; stock de siempre = TOTAL, principal = total − sucursales; caja_descontar acepta 'bodega'; Caja → 🏬 Vendes desde) · 📣 Promo destacada (núcleo CFX_ANUNCIOS.promos, hoja #promos; gancho cfx_promo_negocios_app). Prueba: SaaS/pruebas/g96b.js.

## 🧠 Del núcleo: falta aplicar aquí
- ✅ G37 (núcleo 2.76): shared/comprobante.js e impresora.js vienen del núcleo (no editar aquí: SaaS/nucleo). Logo y firma (boleta_estado) los da window.CFX_COMPROBANTE_DATOS al final de shared/cuenta.js. La 🧾 boleta SII (boleta_*) sigue en el SQL de Despega.
- ✅ G42e (núcleo 2.78, 6.24): utilidades Bootstrap 5.3.8 con los colores de la tienda (--bs-* → --cfx-*), claro/oscuro y Colores a tu gusto. El diseño galáctico es solo del CM.
- ✅ G48 (núcleo 2.77): ✋ secciones del Más se mueven completas desde su título (también en el celular); 🎨 Mi perfil → Color y modo → Colores a tu gusto (fondo, texto, íconos y +).
- ✅ G42 (núcleo 2.75): ⬆️ 🪟 📌 ✋ activos (Más → secciones y opciones se ordenan manteniendo presionado); 🔐 aviso de enlace tapado; links de boleta/pago con CFX_URL.
- ✅ Núcleo 2.79 (6.25): 💬 avisos propios: usar SIEMPRE `await Core.confirmar(texto)` / `await Core.pedir(texto, valor)` (nunca confirm/prompt de Chrome); pistas Desliza enteras; ▶️ SVG.
- G89: la Caja del dueño trae de catalog_items lo publicado que el teléfono no tiene (caché borrada/otro teléfono) → aparece para editar o borrar. CM → Apps → 🧹: opción 'productos' (sin nombre o de cuenta que ya no es empresa). Prueba: SaaS/pruebas/g87e.js.
