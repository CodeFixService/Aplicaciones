# CodeFix Apps

Apps web instalables en el celular (PWA), con cuentas de usuario, versión **Free** y **Pro**,
y notificaciones push y por correo. © CodeFix · Josué Castillo — ver [LICENSE](LICENSE).

| App | Para qué sirve |
|-----|----------------|
| **Inicio** (`index.html`) | Iniciar sesión / crear cuenta / recuperar contraseña, activar Pro con una key, bandeja de avisos. |
| **FichaPro** (`apps/fichas`) | Fichas publicitarias, clientes, campañas por WhatsApp y, en Pro, envío automático por push y correo a suscriptores. |
| **Caja Rápida** (`apps/caja`) | Ventas, productos, stock y reportes. |
| **Administración** (`apps/admin`) | Solo el administrador general: usuarios, keys Pro, avisos a todos, ajustes de push y Gmail. |
| **Suscribirse** (`apps/suscribirse`) | Página pública (sin cuenta) donde los clientes de un negocio Pro se suscriben a sus ofertas. |

## Roles
| Rol | Qué ve |
|---|---|
| **Administrador** (solo Josué) | Todo: empresas, clientes de cada empresa (con filtros), keys, solicitudes de prueba/pago, reportes, avisos a todos, link de pago y precios. Mensajes sin límite. |
| **Empresa** | FichaPro, Caja Rápida, Mensajes con sus clientes y con soporte, enlace/QR para invitar clientes. Free o Pro. |
| **Cliente** | Su cuenta la crea su empresa (o el admin). Ve los productos publicados, las ofertas y avisos, y chatea con su empresa. Normal o Premium (precios especiales). |

## Cuentas (registro cerrado)
- La app solo muestra **Iniciar sesión**. Nadie puede registrarse solo: el servidor rechaza cualquier alta sin invitación.
- **Administración → Usuarios → Crear usuario**: el admin crea empresas y clientes de cualquier empresa.
- **Inicio → Mis clientes**: cada empresa crea sus propios clientes (Free: 30, Pro: 2000).
- Al crear la cuenta se arma el mensaje con el enlace, el correo y la contraseña para enviarlo por WhatsApp.
- En el primer ingreso cada persona acepta los términos; luego puede cambiar su contraseña en **Mi cuenta**.

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
