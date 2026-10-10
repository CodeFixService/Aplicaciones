/* Service worker: guarda todas las apps en el teléfono para usarlas sin internet.
   Sube VERSION cada vez que cambies archivos para que los celulares se actualicen. */
const VERSION = 'v9';
const CACHE = 'misapps-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'shared/core.css',
  'shared/core.js',
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
  'apps/catalogo/',
  'apps/catalogo/index.html',
  'apps/legal/',
  'apps/legal/index.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la copia local (rápido y offline); en segundo plano se refresca.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request, { ignoreSearch: true }).then((hit) => {
        const net = fetch(e.request)
          .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});

// Notificación push enviada por el servidor (llega aunque la app esté cerrada).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data && e.data.text() }; }
  const opts = {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag,
    data: { url: d.url || './' }
  };
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
