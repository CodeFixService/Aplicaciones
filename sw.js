/* Service worker: guarda la app en el teléfono para usarla sin internet.
   La app NO se actualiza sola: sigue usando su versión guardada hasta que la persona
   toca "Actualizar" (el aviso aparece cuando el administrador libera la versión).
   Cada versión vive en su propio caché "app-<versión>"; "meta" guarda cuál se usa. */
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'shared/core.css',
  'shared/core.js', 'shared/vendor/bootstrap-utilities.min.css', 'shared/seguro.js', 'shared/vitrina.js', 'shared/datos.js', 'shared/tienda.js', 'shared/carga.js', 'shared/ayuda.js', 'shared/despacho.js', 'shared/premium.js', 'shared/humano.js', 'shared/verificar.js', 'shared/pagos.js', 'shared/modulos.js', 'shared/respaldo.js', 'shared/voz.js', 'shared/fotos.js', 'shared/auto.js', 'shared/barra.js', 'shared/tema.css',
  'shared/iconos.js', 'shared/tour.js', 'shared/comprobante.js', 'shared/impresora.js', 'shared/qr.js',
  'shared/instalar.js',
  'shared/config.js',
  'shared/cuenta.js',
  'shared/vendor/supabase.js',
  'shared/vendor/qrcode.js',
  'apps/fichas/',
  'apps/fichas/index.html',
  'apps/fichas/app.js',
  'apps/caja/',
  'apps/caja/index.html',
  'apps/caja/app.js',
  'apps/admin/',
  'apps/admin/index.html',
  'apps/admin/app.js',
  'apps/suscribirse/',
  'apps/suscribirse/index.html',
  'apps/mensajes/',
  'apps/mensajes/index.html',
  'apps/pedidos/',
  'apps/pedidos/index.html',
  'apps/contactos/',
  'apps/contactos/index.html',
  'shared/fonts/bebas-neue-latin-400-normal.woff2',
  'shared/fonts/dancing-script-latin-700-normal.woff2',
  'shared/fonts/playfair-display-latin-400-italic.woff2',
  'shared/fonts/playfair-display-latin-400-normal.woff2',
  'shared/fonts/playfair-display-latin-800-normal.woff2',
  'shared/fonts/poppins-latin-400-italic.woff2',
  'shared/fonts/poppins-latin-400-normal.woff2',
  'shared/fonts/poppins-latin-800-italic.woff2',
  'shared/fonts/poppins-latin-800-normal.woff2',
  'apps/catalogo/',
  'apps/catalogo/index.html',
  'apps/legal/',
  'apps/legal/index.html',
  't/',
  't/index.html',
  'r/',
  'r/index.html',
  'n/',
  'n/index.html'
];

const META = 'meta';
const pedirVersion = () => fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => String(j.version));

async function versionActual() {
  const r = await (await caches.open(META)).match('actual');
  return r ? r.text() : null;
}

// B12 · Fotos guardadas ("cfx-imagenes", las guarda la tienda con ?v=<cuándo cambió>): queda solo la última de cada producto
// y como máximo 400 (se van las más antiguas). Así el teléfono no se llena con fotos viejas.
async function ordenarFotos() {
  try {
    const c = await caches.open('cfx-imagenes'), keys = await c.keys(), ultima = {};
    const v = (r) => Number(new URL(r.url).searchParams.get('v')) || 0, base = (r) => r.url.split('?')[0];
    keys.forEach((r) => { const b = base(r); if (!ultima[b] || v(r) > v(ultima[b])) ultima[b] = r; });
    const viejas = keys.filter((r) => ultima[base(r)] !== r), quedan = keys.filter((r) => ultima[base(r)] === r);
    await Promise.all(viejas.concat(quedan.slice(0, Math.max(0, quedan.length - 400))).map((r) => c.delete(r)));
    await (await caches.open(META)).put('fotos', new Response(String(Date.now())));
  } catch (e) { /* sin espacio o sin caché: no pasa nada */ }
}
async function ordenarFotosDiario() {
  const r = await (await caches.open(META)).match('fotos');
  if (!r || Date.now() - Number(await r.text()) > 864e5) await ordenarFotos();
}

// Descarga una versión y la deja como la actual. "no-cache" pregunta al servidor si cada archivo cambió:
// lo que no cambió no se vuelve a bajar entero (responde 304), así actualizar gasta menos datos.
async function instalarVersion(v) {
  const c = await caches.open('app-' + v);
  await c.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })));
  await (await caches.open(META)).put('actual', new Response(v));
  const keys = await caches.keys();
  // Borra versiones anteriores (y cachés viejos); conserva las imágenes ya vistas ("cfx-imagenes").
  await Promise.all(keys.filter((k) => k !== META && k !== 'app-' + v && k !== 'cfx-imagenes').map((k) => caches.delete(k)));
  await ordenarFotos();
  return v;
}

self.addEventListener('install', (e) => {
  // Primera vez en este celular: guarda la versión publicada hoy.
  e.waitUntil(versionActual().then((v) => v || pedirVersion().then(instalarVersion)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim().then(ordenarFotosDiario)));

// Botón "Actualizar": baja la versión nueva y responde cuando está lista.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.tipo !== 'actualizar') return;
  const port = e.ports && e.ports[0];
  e.waitUntil(pedirVersion().then(instalarVersion)
    .then((v) => port && port.postMessage({ ok: true, version: v }))
    .catch((err) => port && port.postMessage({ ok: false, error: String(err) })));
});

// Primero la versión guardada (la que el usuario aceptó); si falta un archivo, se pide a internet.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(version\.json|sw\.js)$/.test(url.pathname)) return; // siempre desde internet
  if (e.request.mode === 'navigate') e.waitUntil(ordenarFotosDiario()); // 1 vez al día, sin frenar la apertura
  e.respondWith((async () => {
    const v = await versionActual();
    const c = v ? await caches.open('app-' + v) : null;
    const hit = c && await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && c) c.put(e.request, res.clone());
      return res;
    } catch (err) { return Response.error(); }
  })());
});

// Notificación push enviada por el servidor (llega aunque la app esté cerrada).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data && e.data.text() }; }
  const opts = {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge.png',
    tag: d.tag,
    data: { url: d.url || './' },
    vibrate: [200, 100, 200]
  };
  if (d.tag) opts.renotify = true; // un aviso nuevo con el mismo tag vuelve a sonar
  // 📦 Pedido nuevo o comprobante para el negocio: queda a la vista hasta que lo toque y vibra más.
  if (/apps\/pedidos\//.test(d.url || '')) { opts.requireInteraction = true; opts.vibrate = [300, 120, 300, 120, 300]; }
  if (d.image) opts.image = d.image;
  e.waitUntil(self.registration.showNotification(d.title || 'Nuevo aviso', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
