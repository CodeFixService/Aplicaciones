# CodeFix Apps

Apps web instalables en el celular (PWA), con cuentas de usuario, versión **Free** y **Pro**,
y notificaciones push y por correo. © CodeFix · Josué Castillo — ver [LICENSE](LICENSE).

| App | Para qué sirve |
|-----|----------------|
| **Inicio** (`index.html`) | Iniciar sesión / crear cuenta / recuperar contraseña, activar Pro con una key, bandeja de avisos. |
| **Órbita** (`apps/fichas`) | Fichas publicitarias, clientes, campañas por WhatsApp y, en Pro, envío automático por push y correo a suscriptores. |
| **Caja Rápida** (`apps/caja`) | Ventas, productos, stock y reportes. |
| **Administración** (`apps/admin`) | Solo el administrador general: usuarios, keys Pro, avisos a todos, ajustes de push y Gmail. |
| **Suscribirse** (`apps/suscribirse`) | Página pública (sin cuenta) donde los clientes de un negocio Pro se suscriben a sus ofertas. |

## Roles
| Rol | Qué ve |
|---|---|
| **Administrador** (solo Josué) | Todo: empresas, clientes de cada empresa (con filtros), keys, solicitudes de prueba/pago, reportes, avisos a todos, link de pago y precios. Mensajes sin límite. |
| **Empresa** | Órbita, Caja Rápida, Mensajes con sus clientes y con soporte, enlace/QR para invitar clientes. Free o Pro. |
| **Cliente** | Su cuenta la crea su empresa (o el admin). Ve **Ofertas** (las campañas de su tienda, con la ficha) y **Productos**, y escribe a la tienda con un toque (💬 Escribir a la tienda). Normal o Premium (precios especiales). |

## Cuentas (registro cerrado)
- La app solo muestra **Iniciar sesión**. Nadie puede registrarse solo: el servidor rechaza cualquier alta sin invitación.
- **Administración → Usuarios → Crear usuario**: el admin crea empresas y clientes de cualquier empresa.
- **Órbita → Clientes**: cada empresa crea sus propios clientes (Free: 30, Pro: 2000), con WhatsApp opcional.
  Esa misma lista se usa para las campañas por WhatsApp (también admite contactos solo de WhatsApp).
- Al crear la cuenta se arma el mensaje con el enlace, el correo y la contraseña para enviarlo por WhatsApp.
- En el primer ingreso cada persona acepta los términos; luego puede cambiar su contraseña en **Mi cuenta**.

## Ofertas y productos para clientes
- Todo producto nuevo de **Caja** se publica en el catálogo (casilla marcada); **Publicar todos** sube los que faltaban.
- Toda campaña de **Órbita** se publica en **Ofertas** de los clientes a su hora (Free: dentro de la app; Pro: además push y correo).
- Cada celular recibe solo los avisos de la cuenta con sesión abierta: al cerrar sesión deja de recibirlos.
- El cliente tiene **Ofertas**, **Productos** y **Pedidos**: marca ❤️ favoritos (gratis: 5; Premium: ilimitados), ve los ✨ nuevos,
  arma un 🛒 pedido que llega a la tienda por el chat y puede repetir pedidos anteriores.
- **Ofertas exclusivas Premium**: la empresa marca la campaña como ⭐ exclusiva; los clientes normales la ven bloqueada con "Hazte Premium".
- El pedido se envía por el chat de la app o por WhatsApp (el de la tienda, que la empresa guarda en **Mi empresa**).
- Cliente Premium: además elige el color de su app y su ícono.
- El cliente solo chatea con su tienda; el administrador chatea solo con las empresas.
- **Cadena de publicaciones**: cada ficha que se guarda en Órbita se publica sola. Las del admin las ven todas las
  empresas en **📣 Novedades CodeFix**; las de cada empresa, sus clientes en **🏷️ Ofertas**. La empresa revisa lo que
  ven sus clientes en **👁️ Mi tienda**. Borrar la ficha la quita.
- Las campañas que el admin hace en Órbita llegan a los **Avisos** de todas las empresas.
- Si la base de datos quedó en una versión anterior, el inicio del admin lo avisa.
- La versión de la app se ve al pie de cada pantalla. Con internet siempre se carga lo último; sin internet, la copia guardada.

## Reglas del chat
- Hasta **3 mensajes seguidos**; luego hay que esperar la respuesta. El administrador no tiene límite.
- Máximo 100 mensajes por día. Estado ✓ Enviado / ✓✓ Visto. Bloquear y reportar.
- Todo validado en el servidor (`supabase/schema.sql`).

## Vender Pro / Premium
- **Administración → Ajustes → Venta**: pega tu link de Mercado Pago y los precios. Se actualiza al instante para todos.
- Empresas y clientes ven **Comprar ahora**, **Ya pagué** (te avisa) y **Probar 7 días** (una vez por cuenta).
- Las solicitudes llegan a **Administración → Resumen**: apruebas con un toque y se corta solo al vencer.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Plantillas de fichas | 2 (Oferta, Producto) | 5 (+ Evento, Foto completa, Menú/Precios) |
| Fichas guardadas / clientes | 5 / 30 | Ilimitados |
| Marca de agua | Sí | No |
| QR de WhatsApp en la ficha | — | ✅ |
| Envío por WhatsApp uno a uno + recordatorio | ✅ | ✅ |
| Enlace/QR para que los clientes se suscriban | — | ✅ |
| Campañas automáticas por **push** y **correo** con la imagen de la ficha | — | ✅ |
| Estado de envío (notificaciones y correos enviados) | — | ✅ |
| Respaldo en la nube (recuperar en otro celular) | — | ✅ |
| Caja: productos (y catálogo publicado) | 15 | Ilimitados |
| Caja: categorías, "Otro" sin registrar, medios de pago, vuelto | ✅ | ✅ |
| Caja: reportes 7 días / 30 días / mes, más vendidos, margen | — | ✅ |

## Cómo funciona la seguridad
- El servidor es **Supabase** (plan gratis). Todas las reglas están en [`supabase/schema.sql`](supabase/schema.sql):
  cada usuario solo puede leer sus datos; el plan y el rol solo los cambia el administrador.
- **Solo el administrador** (`juanjosuecastilloloyola@gmail.com`, con el correo confirmado) puede crear keys,
  ver usuarios y avisar a todos. Las keys son aleatorias, de un solo uso y se bloquean 10 intentos fallidos por hora.
- Las claves de push y la contraseña de Gmail se guardan en el servidor y ninguna pantalla puede leerlas.
- Las notificaciones las envía la Edge Function [`enviar`](supabase/functions/enviar/index.ts), cada minuto.

## Puesta en marcha
Sigue [`docs/CONFIGURAR.md`](docs/CONFIGURAR.md) (una sola vez). Después, cada cambio en `main` se publica solo en
`https://codefixservice.github.io/Aplicaciones/`.

Al cambiar archivos de la app, sube `VERSION` en `sw.js` para que los celulares descarguen la versión nueva.

## Versión 3.7
- **Inicio limpio** y todo lo de configuración en **⚙️ Ajustes**: Mi perfil, Mi tienda (WhatsApp, datos de transferencia,
  horario, abierto/cerrado, tarjeta de sellos), Notificaciones, Mi plan, Legal y Zona peligrosa (cerrar sesión / eliminar cuenta).
- **❓ Ayuda** abajo: la empresa abre el chat con CodeFix; el cliente, con su tienda.
- **Un acceso por rol**: cliente → 🛍️ Tienda (Ofertas · Productos · Pedido) y 💵 Mi Caja (Premium);
  empresa → Órbita, Caja, 📦 Pedidos, Mensajes, 👁️ Mi tienda y 📣 Novedades CodeFix.
- **Plantillas**: todas se publican al guardar (Oferta, Evento, Foto completa, Menú); se quitó "Producto". Free: Oferta + Evento.
  El Menú puede traer los precios desde la Caja.
- **VIP**: fichas y productos "Solo Premium" con marco y cinta roja. Quien no es Premium/Pro los ve en gris con ⭐ Hazte Premium.
  Las fichas VIP del admin son para empresas Pro.
- **Avisos en cadena**: al publicar, el admin avisa a las empresas y cada empresa a sus clientes (push, máx. 1 cada 10 min).
- **Pedidos reales**: carrito con fichas y productos, 🚚 despacho (costo según distancia) o 🏪 retiro, cupón, datos de transferencia.
  La empresa los gestiona en 📦 Pedidos: Recibido → Preparando → Listo / En camino → Entregado, y el cliente recibe aviso en cada paso.
- **Pro (empresas)**: cupones, tarjeta de sellos, estadísticas (vistas, más pedidos, mejores clientes), finanzas y respaldo diario.
- **Premium (clientes)**: ofertas VIP, precios especiales, su propia Caja con 📈 Finanzas, colores e ícono.
- **Admin**: sus clientes son sus empresas; panel de ingresos, planes por vencer (aviso automático 3 días antes) y 👁️ Ver empresa.
- **Actualizaciones con botón**: la app ya no cambia sola. Una versión nueva primero la ve solo el admin; al tocar
  **Administración → Ajustes → Liberar** les aparece "Actualizar" a todos.
- Los pagos son por transferencia; la pasarela de pago queda para una versión futura.

## Versión 3.8
- **Logo arriba**, al lado del nombre: la empresa (y el admin) lo sube en Órbita → Ajustes o en ⚙️ Ajustes → Mi tienda;
  el cliente ve el de su tienda. Se guarda liviano (~6 KB).
- **🚀 Emprende** (solo clientes): botón chico arriba del ❓ que abre el WhatsApp del administrador
  (Administración → Ajustes → WhatsApp de contacto) con "Soy cliente de [tienda] y quiero emprender".
- **Productos con descripción y opciones** (colores, tallas…): cuentan como 1 producto. El cliente elige la opción al
  agregar al carrito y el pedido llega como "2 × Vaso (Azul)".
- **Límites para partir (~10 empresas):**

| | Free | Pro / Premium |
|---|---|---|
| Productos por empresa | 50 | 200 |
| Clientes por empresa | 50 | 300 |
| Fichas publicadas | 10 | 60 |
| Pedidos por cliente al día | 20 | 20 |

- **Imágenes livianas** (~35 KB por ficha) y guardadas en el celular: solo se descargan las nuevas.
- **🖥️ Uso del servidor** en Administración → Resumen (🟢 / 🟡 70% / 🔴 90%) para saber cuándo pasar a Supabase Pro.

## Versión 3.9
- **Editor de fichas**: toca un texto de la ficha (título, subtítulo, precio o botón) y cambia **negrita**, *cursiva*,
  color, tamaño y tipografía (Clásica, Moderna, Elegante, Impacto o Manuscrita). Las tipografías van dentro de la app
  (licencia OFL, ver `shared/fonts/LICENCIAS.txt`). "↺" vuelve al estilo de la plantilla.
- **Íconos modernos** (SVG de línea) en las barras y accesos de toda la app.
- **Cliente**: logo y nombre de su tienda en la bienvenida y arriba.
- **👥 Contactos entre clientes** (de cualquier tienda) con código personal: solicitud → aceptar/rechazar.
  Las conexiones no se cruzan; solo se ve nombre y tienda. Free: 3 contactos y 1 mensaje a la vez;
  Premium: 20 contactos y hasta 5 mensajes seguidos. Anti-spam: 3 solicitudes al día, 30 días tras un rechazo,
  100 mensajes al día, bloquear y reportar. Las empresas no ven las conexiones.

## Versión 5.1
- **Comprobantes livianos**: la app los achica a ~120 KB (antes hasta 400 KB), así caben ~3 veces más en el plan gratis de Supabase.
- **Comprobante rechazado con reintento**: la tienda elige el motivo con un toque y el pedido vuelve a "Esperando pago" (con tiempo nuevo)
  para que el cliente suba otro. Al 3.er rechazo se cierra (editable en Administración → Ajustes → Reglas).
- **Pagar un pedido**: el cliente ve el total en grande con **📋 Copiar monto**. Los links de pedidos ya no guardan precio.
- **Un solo link público**: la página vieja de "suscribirse" lleva a la tienda; ahí está **🔔 Recibir ofertas** (sin cuenta, tiendas Pro).
- **Negocio Pro**: 🛒 recordatorio de carrito al día siguiente, 📣 vender por WhatsApp en 1 toque (Hoy), 📊 reporte semanal cada lunes
  y ⚠️ aviso de stock bajo (quedan 2 o menos).
- **Cliente Premium**: ⭐ descuento que define cada tienda (Ajustes → Mi tienda), ⭐ sus pedidos primero en la fila y
  🔔 "avísame cuando llegue" en productos agotados.
- **Admin**: 🎁 cada negocio nuevo parte con 7 días de Pro gratis (Reglas → "Días de Pro gratis") y 📅 plan anual
  (Ajustes → Precios y links → plan anual; el pago se aprueba por 365 días).
- **Limpieza**: sin solicitudes de "probar 7 días", sin "Novedades CodeFix" y sin textos "CodeFix Apps".
- **🏪 Registro abierto de negocios** (`n/`): cualquier pyme o emprendimiento crea su cuenta Gratis sola, elige su rubro
  (14 opciones, productos o servicios) y parte con los días de Pro de regalo. El link y el QR para publicar están en
  Administración → Negocios; te llega un aviso por cada negocio nuevo. Se cierra con la regla "Registro abierto de negocios" = 0.
  Los clientes siguen entrando solo con invitación o desde la tienda.

## Versión 5.2
- **🎨 Mi marca** (Administración → Ajustes → Mi cuenta): tu logo, nombre y color. Tu logo reemplaza al escudo 🛡️ de arriba.
- **Logo arriba**: cada negocio (y su equipo) ve el suyo; el cliente, el de su tienda. Si aún no lo suben, o sin sesión
  (ingreso, registro de negocios, tienda pública sin logo), sale el tuyo.
- **🧹 Solo el administrador** puede borrar el registro de cambios (todo o lo de más de 30 días) y las cuentas de negocio que no se usan
  (sin Pro, productos, pedidos, clientes ni fichas, y sin entrar en N días). Primero se ve la lista y se confirma.
