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
core.js l.351/l.352 + `version.json` (notas = SOLO categorías) + `db_version()` en instalar.sql (~l.5453). Ahora: 7.01 · bd 6.02 · enviar 3.9.
- G145 a 🌐 Mi dominio: la tienda lo conecta SOLA (Guardar/🔄 Revisar → función enviar acción 'dominio' → `enviar/dominio_tienda.ts` crea/borra el Custom Hostname www.<dominio> en la zona de CodeFix con el token 'cf_token' que el CM copia aquí; datos SIEMPRE de la base: `dominio_cf_datos(uid, antes)` solo servidor). Prueba: SaaS/pruebas/g145a.js.

## 🐞 G159 (7.04 · núcleo 3.54)
🔁 Compras recurrentes (G162): hoja del NÚCLEO (recurrente.js / sql/recurrente.sql, tabla cfx_recurrentes). Despega pone ganchos: cfx_recurrente_armar_app (armar_pedido + tipo), _cliente_app, _crear_app (guardar_pedido el día que toca), _puede_app (pro_o_modulo), cfx_mp_neg_token_app (mp_cuentas → ⚡ cobro automático). Tabla vieja `suscripciones` = respaldo (copiada con el mismo id por suscripciones_a_nucleo). Pruebas g162.js / g96a.js.
🧩 G163: cfx_modulo_listo_app(k) (gancho del núcleo cfx_modulo_nota): 🌐 dominio sin cname+cf_token y 🛒 mercadolibre sin ml_client_id → 🔜 deshabilitados con nota (no se venden ni prueban). Prueba g163.js.

## 🐞 G156 (7.01 · bd 6.02)
- 🎨 Diseños: publicar_ficha + `ficha_datos_guardar(key, datos)` (publicaciones.datos jsonb) · al abrir, `mis_fichas()` repone en la Galería lo que el celular no tiene (recuperarFichas) · Caja vacía → baja sola `respaldos/<id>/caja.json` (1 vez por sesión).
- Avisos SOLO en la 🔔 (#cInbox oculta; #avisos abre CFX_AYUDA.ventanaAvisos) · sin número en Más · cliente: miPerfilCli primero + "Tu tienda: X" y Mi Caja en el menú (grupo Tu tienda).
- Pedido: categoría /servic/i → sin retiro/despacho (esServ) · Caja: esa categoría pasa a 🛠️ Servicio · datos de transferencia con CodeFixVitrina.transfCopiable · nav.tabs.sub ≤4 sin scroll (core.css). Prueba: SaaS/pruebas/g156.js.

## ✓ Tienda verificada (G154, 6.99 · bd 6.00)
- tienda_publica / tienda_info traen `verificado` = existe cfx_verificaciones aprobada de la tienda (CM → Control → 🪪). Núcleo vitrina.js pinta ✓ azul junto al nombre + "Identidad verificada" (t/ y apps/catalogo/). cfx_marcar_verificado sigue vacío (no hace falta columna).

## 🛒 Cobro de pedidos (G128)
- G160: tipo AUTOMÁTICO en el servidor si `tipo_manual` es false (núcleo `cfx_tipo_adivinar`); Caja = 3 botones (CFX_TIPO.montar). 🔑 Digital pagado → `pedidos.accesos` = [{nombre, clave}] (núcleo `cfx_claves`); el acceso se ve al canjear (CFX_TIPO.acceso). Pedidos → 🔑 Claves (lista + 🔄 Reponer).
- Ítem: `catalog_items.tipo` (producto/servicio/digital) · `cobro` (ahora/abono/retiro) · `abono_pct` · `acceso` (solo al pagar). Caja → producto → 🛒 Venta online (`catalogo_venta`).
- Pedido: `cobro`, `a_pagar` (lo que se paga ahora; null = total), `abonado_at`, `accesos`. Sin medio (ni 🏦 datos_pago, ni MP/Flow, ni link) = 💰 paga al retirar. Trigger `pedido_g128`.
- G146 (6.91): 🛒 la barra "Ver pedido" (#barra) ya no se muestra: catálogo y t/ llaman carroFlotante(n, total) → núcleo ui.js CFX_CARRITO (redondo sobre el menú; ✕ → 🛒 chico en la cabecera; abrir = click de #bVerCarro / #bVer).
- G139 (6.84 · bd 5.93): el botón del carrito = CFX_COBRO.boton ("⚡ Pagar $X"; nota #cobroNota) · con UN medio en línea va directo a mp_pagar · tienda_info/tienda_publica.cobra_mp · aviso a la tienda SOLO al pagar (guardar_pedido / pedido_pagado_auto / revisar_comprobante → equipo) · Pedidos: 📲 Avisar estado (CFX_COBRO.waEstado, data-wa-estado). Prueba: SaaS/pruebas/g139.js.
- 💬 Chat del pedido: núcleo `cfx_hilo_*` (ref `pedido:<id>`, solo con cuenta) · ganchos `cfx_hilo_app` / `cfx_hilo_aviso_app`.

## ✉️ Correo (G42f, 6.19 · bd 5.50 · enviar 3.5)
- CodeFix → negocios/todos: Gmail de Josué (app_secrets gmail_*), se pone en CM → Control → ✉️ Correo.
- Tienda → SUS clientes (pedido_correo, avisos con email): Gmail del negocio en Más → 🏪 Mi tienda → ✉️ Correo (tabla negocio_correo, sin políticas; rpc mi_correo / mi_correo_guardar / mi_correo_quitar). Sin él no se manda correo (nunca cae al de CodeFix).
- La función "enviar" pregunta notif_correo(id) por cada notificación con email (solo el servidor puede).

- G95 (6.51 · bd 5.71): parte FREE (regalo_nuevo_negocio con d = 0; el trigger queda) · 🎁 Probar Pro en la hoja de pago (núcleo) · cfx_pro_prueba_app marca trial_used · trial_used de antes → cfx_pruebas_usadas. Prueba: SaaS/pruebas/g95.js.

- G96 (6.52 · bd 5.72): 🧩 módulos de tienda en `shared/extras.js` (hojas del Más, `abrir` de CFX_MENU; hash #giftcards #carritos #recurrentes #proveedores): 🎁 giftcards (tablas giftcards/giftcard_usos; Caja medio 'giftcard' → giftcard_canjear; carrito: el campo cupón acepta GC… → guardar_pedido descuenta gift_monto y giftcard_devolver lo devuelve al cancelar/rechazar/expirar) · 🛒 carrito: núcleo cfx_carritos_mios + gancho cfx_carrito_contacto_app · 🔁 suscripciones (tabla suscripciones, cron 'suscripciones' 12:05 UTC → suscripciones_correr usa guardar_pedido; el cliente pausa en Pedidos) · 📦 proveedores (tabla proveedores, catalog_items.stock_min/proveedor_id, aviso stock_minimo_aviso, pedido_proveedor → WhatsApp). 🚚 courier ya existía (pedido_seguimiento). Prueba: SaaS/pruebas/g96a.js.
- G32 e (6.65): 📲 Caja → "Tarjeta (celular)" (#mTap, data-m="tap") → núcleo CFX_TAP (shared/tap.js) → aprobado = venta medio 'tarjeta' + tap: proveedor. Prueba: SaaS/pruebas/g32e.js.
- G96 b (6.53 · bd 5.73): 🏬 sucursales (módulo 'sucursales', hoja #sucursales en extras.js; tablas bodegas/stock_bodega; stock de siempre = TOTAL, principal = total − sucursales; caja_descontar acepta 'bodega'; Caja → 🏬 Vendes desde) · 📣 Promo destacada (núcleo CFX_ANUNCIOS.promos, hoja #promos; gancho cfx_promo_negocios_app). Prueba: SaaS/pruebas/g96b.js.
- G99 a (6.55 · bd 5.75 · enviar 3.7): ⚡ aviso instantáneo de Mercado Pago (núcleo): mp_pagar manda notification_url (d:<pedido>) · cfx_mp_aviso_app(d:) → mp_confirmar · cfx_mp_aviso_url_app · enviar atiende ?cfx_mp=. Prueba: SaaS/pruebas/g99.js.

- G101 (6.56 · bd 5.76): 🛒 Mercado Libre (módulo 'mercadolibre', hoja #mercadolibre en extras.js; tablas ml_cuentas/ml_estados/ml_vinculos/ml_ventas; ml_conectar → ML → /?code&state (index.html, arriba del script) → ml_volver; cron ml-sync 5 min: órdenes pagadas descuentan stock 1 vez, stock distinto → PUT a ML). Credenciales: CM → Control → 🛒. Prueba: SaaS/pruebas/g101.js.
- G102 a (6.57 · bd 5.77): 🚚 Courier Chilexpress (módulo 'courier', hoja #courier en extras.js + 🏷️ en apps/pedidos (carga extras.js); tablas courier_cuentas/chx_comunas/courier_envios; llaves y TCC de CADA tienda; courier_etiqueta → OT + imagen + pedido_seguimiento). Prueba: SaaS/pruebas/g102.js.
- G103 (6.58 · bd 5.78 · enviar 3.8): 🧾 FACTURA 33 (G38): pedidos.factura (datos del receptor) + boleta_tipo · factura_datos/pedido_factura_guardar(ref, p) (comprador con token o tienda con permiso Pedidos; hasta emitir) · factura_disponible(negocio) · boleta_dte saca TipoDTE 33 (MntBruto 1, Receptor, Emisor RznSoc/GiroEmis/Acteco) · boleta_cuentas.acteco (Ajustes → Boleta SII) · Core.facturaHtml/facturaLeer/facturaHoja/rutOk (shared/core.js) en t/, apps/catalogo y apps/pedidos (🧾 Dar factura / Datos de factura). 💳 Flow = núcleo. Prueba: SaaS/pruebas/g103b.js.
- G102 b (6.62 · bd 5.81): 💲 tarifa Chilexpress en el carrito: Ajustes → Despacho → Resto de Chile = 'courier' (núcleo despacho.js/carrito.sql; precio = respaldo, 0 = por pagar) → costo_despacho (reemplazado tras el bloque courier) llama courier_tarifa (caché chx_tarifas 12 h, tope 120/h en courier_cuentas.cot_*; servicio más barato; peso/tamaño de la tienda) · despacho_cotizar(negocio, comuna, monto) para el carrito (anon) · guardar_despacho exige Courier conectado para elegirlo y borra la caché · pedido_por_pagar usa costo_despacho. Prueba: SaaS/pruebas/g102b.js.

## 🧠 Del núcleo: falta aplicar aquí
- ✅ G37 (núcleo 2.76): shared/comprobante.js e impresora.js vienen del núcleo (no editar aquí: SaaS/nucleo). Logo y firma (boleta_estado) los da window.CFX_COMPROBANTE_DATOS al final de shared/cuenta.js. La 🧾 boleta SII (boleta_*) sigue en el SQL de Despega.
- ✅ G42e (núcleo 2.78, 6.24): utilidades Bootstrap 5.3.8 con los colores de la tienda (--bs-* → --cfx-*), claro/oscuro y Colores a tu gusto. El diseño galáctico es solo del CM.
- ✅ G48 (núcleo 2.77): ✋ secciones del Más se mueven completas desde su título (también en el celular); 🎨 Mi perfil → Color y modo → Colores a tu gusto (fondo, texto, íconos y +).
- ✅ G42 (núcleo 2.75): ⬆️ 🪟 📌 ✋ activos (Más → secciones y opciones se ordenan manteniendo presionado); 🔐 aviso de enlace tapado; links de boleta/pago con CFX_URL.
- ✅ Núcleo 2.79 (6.25): 💬 avisos propios: usar SIEMPRE `await Core.confirmar(texto)` / `await Core.pedir(texto, valor)` (nunca confirm/prompt de Chrome); pistas Desliza enteras; ▶️ SVG.
- G89: la Caja del dueño trae de catalog_items lo publicado que el teléfono no tiene (caché borrada/otro teléfono) → aparece para editar o borrar. CM → Apps → 🧹: opción 'productos' (sin nombre o de cuenta que ya no es empresa). Prueba: SaaS/pruebas/g87e.js.

- G107 (6.63 · bd 5.82): 💳 WEBPAY CON EL FLOW DE LA TIENDA (núcleo cfx_flow_neg_*): Ajustes → 💳 Links de pago → #flowBody (CFX_PAGOS.flowNegocio) · link_activo (pedido) → mp = hay pago automático + medios {mp, flow} · mp_pagar(ref, volver, p_medio): sin MP o p_medio flow → cfx_flow_neg_cobro ref 'pedido:<id>' · gancho cfx_mp_neg_pagado_app → pedido_pagado_auto (preparando + stock + avisos) · mp_revisar también pregunta a Flow · r/ #bMp/#bFlow · catálogo data-medio. Prueba: SaaS/pruebas/g107.js.

- 🧩 G112 b · Packs 🌱 Básico · ⭐ Normal (clave `crecer`, destacado) · 💎 Completo, iguales en las 6; precios y módulos: SaaS/LANZAMIENTO.md (Módulos, paso 3). Solo cambian si siguen de fábrica.
- 🎬 G112 d · Estudio de contenido = 🧩 módulo 'estudio' (núcleo estudio.sql/estudio.js; ayuda.js lo carga al abrir: CFX_ESTUDIO.montar(zona, { rpc, probar, nombre })). Datos en cfx_estudio (solo el dueño por funciones). Entra en ⭐ Normal (si sigue de fábrica) y 💎 Completo. Dónde: Más → 🎬 Estudio (/#estudio, shared/extras.js estudio).
- G113 (núcleo 3.21): ☰ Más en páginas que se deslizan de lado (pestañas + ⇅ ordenar/renombrar por persona), ≥ 900 px opciones en grilla pareja, 🗂️ CFX_CAJA y CFX_DIALOGO { lista } disponibles para elegir entre muchas opciones / mostrar listas.
- 🗂️ G117 (6.74 · bd 5.87): Mi tienda → horario por días y datos de pago por campos (núcleo CodeFixVitrina.horario / .transferencia sobre #tHorario y #tPago; se sigue guardando el TEXTO en profiles.horario (hasta 300) y datos_pago). r/ = 📋 Copiar todo (data-cfx-copiar).
- 📊 G118 (6.75): Caja → Productos → 📊 Planilla única (núcleo CFX_RESPALDO.planilla): ⬇️ Excel con ejemplos del rubro (Core.plantilla), ⬆️ subir/🤖 Claude → vista previa → crea o actualiza por nombre (catalog_upsert/set_stock/catalog_delete).
- 🖼️ G122 (6.76 · bd 5.88): foto de producto → Storage (bucket vitrina, núcleo CFX_NUBE.subir en caja y carga masiva; set_foto_producto acepta base64 o URL de SU carpeta). Fotos viejas pasan solas al entrar el dueño (cfx_fotos_viejas/cfx_foto_pasar). worker.js deNube: vista previa al compartir trae la foto de la nube.
- G140 (núcleo 3.36): Mi perfil → 🎨 Personalizar (ex Color y modo): temas listos, barra de abajo (tipo/tamaño/nombres), ↩️ de fábrica; se guarda en public.cfx_personal (nucleo/sql/personal.sql). Prueba: SaaS/pruebas/g140.js.
- 📱 G141 (núcleo 3.37): 🔗 Mis redes (CodeFixVitrina.redes + nucleo/sql/redes.sql, gancho cfx_redes_llave_app en instalar/schema) y 🎬 Estudio por link + 📸 pantallazo + 📊 gráficos + 💡 ideas sin base (nucleo/est-links.js). Pruebas: SaaS/pruebas/g141.js, g141b.js.
- 🛡️ G144 (núcleo 3.40): sin fila "Panel de administración" ni limpieza/respaldo dentro de la app (todo en CM → Apps) · .cfx-num/.cfx-redondo (círculo perfecto) · 🎤/⬜ = íconos de línea · 💬 WhatsApp del registro → Mis redes (cfx_redes_con_wa; gancho cfx_whatsapp_app donde aplica; uno solo, el botón antiguo se oculta con redes.unWa) · .assetsignore: notas, SQL y pruebas NO se publican.
- 🙂 G148 (6.93, núcleo 3.43): perfiles sin ícono → foto o la letra del nombre (el ícono guardado se conserva, no se muestra).
