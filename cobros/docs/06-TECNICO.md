# 6. Técnico

## Principios
- **Sin frameworks y sin compilar**: HTML, CSS y JavaScript moderno (módulos ES). Lo único externo es el cliente de Supabase,
  copiado dentro de `cobros/vendor/`, sin depender de CDN.
- **Liviana**: la meta es que la app del negocio pese menos de 150 KB sin contar Supabase, y la página del cliente menos de 60 KB.
- Funciona en Chrome, Edge, Safari y Firefox de los últimos 2 años, Android 8+ e iOS 16.4+ (push).

## Separación total de CodeFix Apps (mismo repo, nada compartido)
| Cosa | CodeFix Apps | Libreta de Cobros |
|---|---|---|
| Carpeta | raíz, `apps/`, `shared/` | **`cobros/`** (todo adentro) |
| URL | `…github.io/Aplicaciones/` | `…github.io/Aplicaciones/cobros/` |
| Supabase | proyecto actual | **proyecto nuevo** (el 2º gratis de tu cuenta) |
| Service worker | `sw.js` (raíz) | `cobros/sw.js`, con alcance solo `cobros/` |
| Manifest e ícono | `manifest.webmanifest` | `cobros/manifest.webmanifest`, con su propio `id`, nombre e ícono |
| Versión | `version.json` | `cobros/version.json` |
| Datos guardados en el celular | claves `cfx-…` | claves `lc-…` (no se pisan) |

Hay **un solo cambio necesario fuera de `cobros/`**: una línea en el `sw.js` de la raíz para que **ignore** las rutas `/cobros/`.
Sin esa línea, el service worker de CodeFix intenta guardar archivos de la Libreta en su caché.
Si usas GitHub Actions para publicar (`pages.yml`), también hay que agregar `cobros` a la lista de carpetas que copia.

Las dos apps se instalan **por separado** en el celular o el computador, con dos íconos distintos.
Mudarse después a otro repo o dominio = copiar `cobros/` y cambiar las URLs en Supabase.

## Archivos
```
cobros/
  index.html            portada, crear cuenta e ingresar
  app/index.html        app del negocio (con rutas por #)
  c/index.html          link del cliente (página aparte y muy liviana)
  admin/index.html      superadmin
  legal/index.html      términos y privacidad
  js/
    config.js           URL y clave pública del Supabase nuevo, correo admin y marca
    api.js              llamadas a Supabase y a las funciones del servidor
    offline.js          cola de movimientos sin internet (IndexedDB) y sincronización
    ui.js               componentes: teclado numérico, avisos, diálogos, chips y formato de pesos
    validar.js          RUT, teléfono, montos, textos y palabras prohibidas (mismas reglas que el servidor)
    negocio.js · clientes.js · anotar.js · cuotas.js · cobrar.js · comprobantes.js · reportes.js · ajustes.js · plan.js
    portal.js           lógica del link del cliente
    admin.js
    imagen.js           achicar fotos a webp en el celular
    pdf.js              estado de cuenta (Premium), generado en el navegador
    push.js             activar notificaciones
  css/app.css           estilos con variables (colores, modo oscuro)
  vendor/supabase.js
  icons/                icon-192.png, icon-512.png, maskable
  manifest.webmanifest
  sw.js
  version.json
  supabase/
    instalar.sql        tablas, reglas, funciones, tareas y feriados (todo en uno, se puede correr de nuevo)
    instalar-corto.sql  versión corta para pegar (descarga e instala la larga)
    functions/enviar/index.ts   envío de push
  docs/                 esta documentación
```

## Sin internet (clave en ferias y almacenes con mala señal)
- La app abre sin internet: el service worker guarda los archivos.
- Los últimos datos (clientes, saldos y los 100 movimientos recientes por cliente) quedan guardados en el celular (IndexedDB) y se ven sin conexión.
- **Anotar sin internet**: el movimiento queda en una **cola** con su id único y el saldo se muestra "estimado".
  Al volver la conexión se envía en orden. Si el servidor lo rechaza (por ejemplo, porque el plan llegó al tope o el cliente quedó en solo cobro),
  queda marcado en rojo para que la persona decida.
- Lo que **necesita** internet: crear clientes, aprobar comprobantes, cuotas, cobrar (para revisar las reglas legales) y todo lo del admin.
  El botón lo dice: "Necesitas internet para esto".
- El link del cliente necesita internet (los datos siempre vienen del servidor).

## Tiempo real
- Supabase Realtime en `comprobantes`, `movimientos` y `notificaciones` del negocio: si el ayudante anota algo, el dueño lo ve al instante.
- Cuando la app vuelve a primer plano, se refresca sola.

## Actualizaciones
Mismo sistema que CodeFix: `version.json`, aviso de "Hay una versión nueva" y botón **Actualizar**. Si el admin sube la
"versión mínima" en Ajustes, la app obliga a actualizar (por ejemplo, después de un cambio en la base de datos).

## Mantener vivo el Supabase gratis
El plan gratis **se pausa después de 7 días sin uso**. Un GitHub Action (`.github/workflows/cobros-ping.yml`) llama a `ping()`
cada 3 días. Ojo: GitHub apaga las tareas programadas si el repo pasa 60 días sin cambios. El inicio del admin lo avisa.

## Calidad antes de entregar
- Revisar todos los archivos JavaScript con `node --check`.
- Pruebas de las reglas del servidor con un script SQL que intenta cada abuso y debe fallar
  (ver lo de otro negocio, pasar el límite, anular como ayudante pasados los 10 minutos, entrar al portal sin PIN, PIN con fuerza bruta, etc.).
- Revisar las pantallas en Chrome con 360, 768 y 1280 px de ancho.
- Lighthouse: PWA instalable y accesibilidad de 90 o más.
