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
| Caja: productos | 15 | Ilimitados |
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
