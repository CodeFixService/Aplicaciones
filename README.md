# Aplicaciones

Varias apps en un solo repositorio. Son **PWA**: páginas web que se instalan en el celular
como una app, funcionan **sin internet** y guardan los datos **solo en el teléfono**.
No necesitan servidor, base de datos, hosting de pago ni dominio.

| App | Para qué sirve |
|-----|----------------|
| **FichaPro** (`apps/fichas`) | Diseña fichas publicitarias (4 plantillas, foto, precio, logo), guarda tus clientes con etiquetas, programa campañas con recordatorio y envíalas por WhatsApp con mensaje personalizado `{nombre}`. Es la app pensada para **vender**. |
| **Caja Rápida** (`apps/caja`) | Punto de venta de bolsillo: productos, stock, cobro con un toque, aviso de stock bajo, reporte del día y CSV. |
| **Licencias** (`apps/licencias`) | Herramienta interna: genera la clave que le entregas a cada cliente que compra FichaPro y lleva el registro de lo vendido. |

## Cómo tenerlas en tu celular (sin pagar hosting ni dominio)

### Opción A — GitHub Pages (recomendada, gratis)
1. En GitHub abre **Settings → Pages**.
2. En **Build and deployment → Source** elige **Deploy from a branch**.
3. En **Branch** elige **main** y carpeta **/ (root)** → **Save**.
4. Espera 1–2 minutos y abre en el celular `https://codefixservice.github.io/Aplicaciones/`.
5. Chrome (Android): menú ⋮ → **Instalar app**. Safari (iPhone): Compartir → **Agregar a inicio**.
6. Listo: desde ahí abre sin internet. Cada cambio que subas a `main` se publica solo.

> Si el repositorio es privado, GitHub Pages requiere un plan de pago. Alternativa gratis: hacerlo público
> (los datos de tus clientes **no** están en el repositorio, viven en tu teléfono).

### Opción B — 100 % local
Copia la carpeta al teléfono o a tu PC y sírvela en tu red con `python3 -m http.server 8080`;
abre `http://<ip-de-tu-pc>:8080` desde el celular. Abrir el `index.html` directo como archivo funciona,
pero sin modo offline ni notificaciones (el navegador las bloquea en `file://`).

## Notificaciones: qué se puede y qué no sin servidor
- ✅ **A ti**: recordatorios de campañas y avisos de stock bajo como notificación del sistema.
  Se disparan con la app abierta o en segundo plano reciente; al abrirla se revisan las pendientes
  y aparece un aviso “Tienes campañas por enviar”.
- ✅ **A tus clientes**: la ficha se envía por WhatsApp (imagen + mensaje personalizado, uno por uno,
  marcando quién ya la recibió) o a tu Estado/grupos.
- ❌ Notificaciones push automáticas a celulares de terceros con la app cerrada: eso exige un servidor
  push (p. ej. Firebase). Se puede añadir después sin cambiar el resto.

## Vender FichaPro
- La versión sin licencia funciona completa con **marca de agua**, máximo 5 fichas y 30 clientes.
- Cobras, abres **Licencias**, escribes el nombre del cliente, y le envías la clave por WhatsApp.
  El cliente la pega en *FichaPro → Ajustes → Licencia* y se quitan los límites.
- **Antes de vender** cambia `LICENSE_SALT` en `shared/core.js` por una frase secreta tuya.
- Importante: la clave se valida en el propio teléfono, así que es un freno para copias casuales,
  no una protección fuerte. Y como **Licencias** se publica junto a las demás apps, para vender
  conviene publicar a tus clientes un repositorio/sitio con solo `apps/fichas` + `shared` + `icons`
  (o quitar `apps/licencias` del paso “Preparar sitio” del workflow y usarla en local).

## Respaldo
Cada app tiene **Exportar / Restaurar** (archivo `.json`). Guárdalo en Google Drive o envíatelo:
si borras los datos del navegador o cambias de teléfono, así no pierdes nada.

## Agregar otra app
1. Crea `apps/<nombre>/index.html` usando `../../shared/core.css` y `../../shared/core.js`
   (`Core.store`, `Core.notify`, `Core.backup`, etc.).
2. Agrega sus archivos a `FILES` en `sw.js` y sube `VERSION`.
3. Añade su tarjeta en `index.html`.
