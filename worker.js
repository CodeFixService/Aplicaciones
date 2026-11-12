// F32 · Vitrina pública con buen SEO y vista previa al compartir (WhatsApp, Instagram, Facebook, Google).
// Cloudflare corre este Worker SOLO para /t/* (wrangler.jsonc → run_worker_first). Todo lo demás son archivos estáticos.
// · /t/?s=tienda[&p=producto] → la misma página, con título, descripción, og:* y datos estructurados (schema.org) de esa tienda o producto.
// · /t/og?s=tienda[&p=producto] → la imagen de la vista previa (logo o foto del producto; si no hay, el ícono de Órbita).
// · /t/feed?s=tienda → G36 catálogo para Google Merchant Center y Meta (Facebook/Instagram): RSS 2.0 con g:* (se actualiza cada hora).
//   &f=json → el mismo catálogo en JSON (API pública de solo lectura, para conectar otros sistemas).
// /t/og y /t/feed quedan en la caché de Cloudflare (caches.default): miles de lecturas no llegan a Supabase.
// WhatsApp y los buscadores no corren JavaScript: por eso las etiquetas se ponen aquí, antes de mandar la página.
// Si Supabase no responde en 1,5 s, se manda la página tal cual (nunca queda más lenta ni rota).
// · 📊 Medir anuncios (módulo): si la tienda tiene Meta Pixel / Google Analytics, se agregan aquí y la CSP de ESA página permite solo esos 2 dominios.
// · 🌐 Dominio propio (módulo): mitienda.cl/ → /t/?s=tienda (Cloudflare for SaaS: Custom Hostnames + Workers Routes */* → aplicaciones; /cfx-dominio dice si ya está conectado).
let CFG = null; // { url, key } leídos de shared/config.js (una vez por isolate)
const MEM = new Map(); // caché corta en memoria: clave → { t, v }
const MS = 120000;

async function config(env, base) {
  if (CFG) return CFG;
  const r = await env.ASSETS.fetch(new Request(new URL('/shared/config.js', base)));
  const js = await r.text();
  const url = (js.match(/SUPABASE_URL:\s*'([^']+)'/) || [])[1], key = (js.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('sin config');
  CFG = { url, key };
  return CFG;
}

async function rpc(env, base, fn, args) {
  const k = fn + JSON.stringify(args), m = MEM.get(k);
  if (m && Date.now() - m.t < MS) return m.v;
  const c = await config(env, base);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(c.url + '/rest/v1/rpc/' + fn, { method: 'POST', signal: ctl.signal,
      headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error('rpc ' + r.status);
    const v = await r.json();
    if (MEM.size > 200) MEM.clear();
    MEM.set(k, { t: Date.now(), v });
    return v;
  } finally { clearTimeout(timer); }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const corto = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const pesos = (n) => '$' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const limpio = (s) => String(s || '').toLowerCase().trim().slice(0, 80);
const xml = (s) => esc(String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, ''));
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// Etiquetas de la tienda (o del producto) para el <head>.
export function etiquetas(origen, t, items, p) {
  const pf = t.perfil || {}, it = p ? (items || []).find((i) => i.clave === p) : null;
  const url = origen + '/t/?s=' + encodeURIComponent(t.slug) + (it ? '&p=' + encodeURIComponent(it.clave) : '');
  const lugar = [pf.comuna, t.rubro].filter(Boolean).join(' · ');
  const titulo = it ? it.nombre + ' · ' + pesos(it.precio) + ' · ' + t.empresa : t.empresa + (t.rubro ? ' · ' + t.rubro : '') + ' · Tienda en línea';
  const desc = corto(it ? (it.descripcion || it.nombre + ' en ' + t.empresa + '. Pídelo en línea y coordina por WhatsApp.')
    : (pf.descripcion || 'Mira los productos de ' + t.empresa + (lugar ? ' (' + lugar + ')' : '') + ' y haz tu pedido en línea.'), 160);
  const v = it ? (it.foto_v || 0) : hash(String(t.logo || '').slice(-64));
  const img = origen + '/t/og?s=' + encodeURIComponent(t.slug) + (it && it.foto_v ? '&p=' + encodeURIComponent(it.clave) : '') + '&v=' + v;
  const tienda = { '@type': 'Store', name: t.empresa, url: origen + '/t/?s=' + encodeURIComponent(t.slug), image: img };
  if (pf.descripcion) tienda.description = corto(pf.descripcion, 300);
  if (t.telefono) tienda.telephone = '+' + String(t.telefono).replace(/\D/g, '');
  if (pf.comuna || pf.direccion) tienda.address = Object.assign({ '@type': 'PostalAddress', addressCountry: 'CL' }, pf.direccion ? { streetAddress: pf.direccion } : {}, pf.comuna ? { addressLocality: pf.comuna } : {});
  const redes = [pf.instagram && 'https://instagram.com/' + String(pf.instagram).replace(/^@/, ''), pf.facebook, pf.web].filter((x) => x && /^https?:\/\/|^[\w.-]+\.\w+/.test(x));
  if (redes.length) tienda.sameAs = redes.map((x) => /^https?:/.test(x) ? x : 'https://' + x);
  if (t.estrellas && t.estrellas.total > 0) tienda.aggregateRating = { '@type': 'AggregateRating', ratingValue: t.estrellas.promedio, reviewCount: t.estrellas.total };
  const oferta = (i) => ({ '@type': 'Offer', price: Math.round(Number(i.precio) || 0), priceCurrency: 'CLP', url: origen + '/t/?s=' + encodeURIComponent(t.slug) + '&p=' + encodeURIComponent(i.clave),
    availability: 'https://schema.org/' + (i.disponible === 0 ? 'OutOfStock' : 'InStock') });
  let ld;
  if (it) {
    ld = { '@context': 'https://schema.org', '@type': 'Product', name: it.nombre, description: desc, image: img, offers: Object.assign(oferta(it), { seller: { '@type': 'Organization', name: t.empresa } }) };
    if (it.categoria) ld.category = it.categoria;
  } else {
    ld = Object.assign({ '@context': 'https://schema.org' }, tienda);
    const l = (items || []).slice(0, 30);
    if (l.length) ld.hasOfferCatalog = { '@type': 'OfferCatalog', name: 'Productos', itemListElement: l.map((i) => Object.assign(oferta(i), { itemOffered: { '@type': 'Product', name: i.nombre } })) };
  }
  const m = (k, c) => '<meta property="' + k + '" content="' + esc(c) + '">';
  return {
    titulo,
    head: '<meta name="description" content="' + esc(desc) + '">' + '<link rel="canonical" href="' + esc(url) + '">' +
      m('og:type', it ? 'product' : 'website') + m('og:site_name', t.empresa) + m('og:locale', 'es_CL') + m('og:title', titulo) + m('og:description', desc) +
      m('og:url', url) + m('og:image', img) + m('og:image:alt', it ? it.nombre : t.empresa) +
      (it ? m('product:price:amount', Math.round(Number(it.precio) || 0)) + m('product:price:currency', 'CLP') : '') +
      '<meta name="twitter:card" content="summary">' + '<meta name="twitter:title" content="' + esc(titulo) + '">' + '<meta name="twitter:description" content="' + esc(desc) + '">' +
      '<meta name="twitter:image" content="' + esc(img) + '">' +
      '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>',
    color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : ''
  };
}

export function armar(html, e) {
  let h = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(e.titulo) + '</title>' + e.head);
  if (e.color) h = h.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="' + e.color + '">');
  return h;
}

// G36: feed de productos. Solo los que tienen precio; sin foto usa el logo. id = clave del producto (estable).
export function feed(origen, t, items, f) {
  const link = (i) => origen + '/t/?s=' + encodeURIComponent(t.slug) + '&p=' + encodeURIComponent(i.clave);
  const foto = (i) => origen + '/t/og?s=' + encodeURIComponent(t.slug) + (i.foto_v ? '&p=' + encodeURIComponent(i.clave) + '&v=' + i.foto_v : '&v=' + hash(String(t.logo || '').slice(-64)));
  const l = (items || []).filter((i) => i && i.clave && Number(i.precio) > 0).slice(0, 5000).map((i) => ({
    id: String(i.clave).slice(0, 50), titulo: corto(i.nombre, 150), descripcion: corto(i.descripcion || i.nombre + ' de ' + t.empresa, 5000),
    precio: Math.round(Number(i.precio)), moneda: 'CLP', disponible: i.disponible !== 0, stock: i.disponible == null ? null : i.disponible,
    categoria: i.categoria || null, link: link(i), imagen: foto(i) }));
  if (f === 'json') return JSON.stringify({ tienda: { slug: t.slug, nombre: t.empresa, link: origen + '/t/?s=' + encodeURIComponent(t.slug) }, actualizado: new Date().toISOString(), productos: l });
  const g = (k, v) => v == null || v === '' ? '' : '<g:' + k + '>' + xml(v) + '</g:' + k + '>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    '<title>' + xml(t.empresa) + '</title><link>' + xml(origen + '/t/?s=' + encodeURIComponent(t.slug)) + '</link><description>' + xml('Productos de ' + t.empresa) + '</description>' +
    l.map((i) => '\n<item>' + g('id', i.id) + g('title', i.titulo) + g('description', i.descripcion) + g('link', i.link) + g('image_link', i.imagen) +
      g('availability', i.disponible ? 'in_stock' : 'out_of_stock') + g('price', i.precio + ' CLP') + g('condition', 'new') + g('brand', corto(t.empresa, 70)) +
      g('identifier_exists', 'no') + g('product_type', i.categoria) + '</item>').join('') + '\n</channel></rss>';
}

async function catalogo(url, env) {
  const s = limpio(url.searchParams.get('s')), f = url.searchParams.get('f') === 'json' ? 'json' : 'xml';
  const err = (n, m) => [new Response(m, { status: n, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...(n === 503 ? { 'Retry-After': '300' } : {}) } }), false];
  if (!s) return err(400, 'Falta ?s=tienda');
  let t, items;
  try { [t, items] = await Promise.all([rpc(env, url, 'tienda_publica', { p_slug: s }), rpc(env, url, 'catalogo_publico', { p_slug: s })]); } catch (e) { return err(503, 'Intenta de nuevo en unos minutos'); }
  if (!t || !t.slug) return err(404, 'Tienda no encontrada');
  return [new Response(feed(url.origin, t, items, f), { headers: { 'Content-Type': f === 'json' ? 'application/json; charset=utf-8' : 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } }), true];
}

// Caché de Cloudflare por URL: solo se guarda lo que salió bien (un corte de Supabase no queda pegado).
async function conCache(req, ctx, hacer) {
  const c = typeof caches !== 'undefined' && caches.default, k = new Request(req.url, { method: 'GET' });
  if (c && req.method === 'GET') { try { const r = await c.match(k); if (r) return r; } catch (e) { /* sin caché */ } }
  const [r, guardar] = await hacer();
  if (c && guardar && req.method === 'GET' && r.status === 200) { const p = c.put(k, r.clone()).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(p); }
  return r;
}

// 📊 Meta Pixel y Google Analytics 4. Los ID se revisan otra vez aquí (solo números / G-XXXX): nada del usuario entra al script sin validar.
const CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://challenges.cloudflare.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdn.jsdelivr.net";
export function medicion(m, producto) {
  const meta = m && /^[0-9]{8,20}$/.test(m.meta || '') ? m.meta : null, ga = m && /^G-[A-Z0-9]{4,15}$/.test(m.ga || '') ? m.ga : null;
  if (!meta && !ga) return null;
  const p = producto ? JSON.stringify(String(producto).slice(0, 120)).replace(/</g, '\\u003c') : null;
  let h = '', dom = [];
  if (meta) {
    dom.push('https://connect.facebook.net');
    h += "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;" +
      "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}" +
      "(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','" + meta + "');fbq('track','PageView');" +
      (p ? "fbq('track','ViewContent',{content_ids:[" + p + "],content_type:'product'});" : '') + '</script>';
  }
  if (ga) {
    dom.push('https://www.googletagmanager.com');
    h += '<script async src="https://www.googletagmanager.com/gtag/js?id=' + ga + '"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}' +
      "gtag('js',new Date());gtag('config','" + ga + "');" + (p ? "gtag('event','view_item',{items:[{item_id:" + p + '}]});' : '') + '</script>';
  }
  return { head: h, csp: CSP.replace("script-src 'self'", "script-src 'self' " + dom.join(' ')) };
}

async function pagina(req, url, env) {
  const base = await env.ASSETS.fetch(req);
  const s = limpio(url.searchParams.get('s')), p = String(url.searchParams.get('p') || '').slice(0, 120);
  if (!s || req.method !== 'GET' || !base.ok || !/text\/html/.test(base.headers.get('content-type') || '')) return base;
  try {
    const [t, items] = await Promise.all([rpc(env, url, 'tienda_publica', { p_slug: s }), rpc(env, url, 'catalogo_publico', { p_slug: s }).catch(() => [])]);
    if (!t || !t.slug) return base;
    let html = armar(await base.clone().text(), etiquetas(url.origin, t, items, p));
    const h = new Headers(base.headers); h.delete('content-length'); h.delete('etag');
    const m = medicion(t.medicion, p);
    if (m) { html = html.replace('</head>', m.head + '</head>'); h.set('Content-Security-Policy', m.csp); h.set('Cache-Control', 'no-cache'); }
    return new Response(html, { status: 200, headers: h });
  } catch (e) { return base; }
}

function deDataUrl(d) {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(d || '');
  if (!m) return null;
  const b = atob(m[2]), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return { tipo: m[1], bytes: u };
}

async function imagen(url, env) {
  const s = limpio(url.searchParams.get('s')), p = String(url.searchParams.get('p') || '').slice(0, 120);
  let img = null;
  try {
    if (s && p) { const f = await rpc(env, url, 'fotos_publicas', { p_slug: s, p_claves: [p] }); img = deDataUrl(f && f[0] && f[0].foto); }
    if (s && !img) { const t = await rpc(env, url, 'tienda_publica', { p_slug: s }); img = deDataUrl(t && t.logo); }
  } catch (e) { img = null; }
  if (!img) return [await env.ASSETS.fetch(new Request(new URL('/icons/icon-512.png', url))), false];
  return [new Response(img.bytes, { headers: { 'Content-Type': img.tipo, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } }), true];
}

// 🌐 Dominio propio: la raíz del dominio de la tienda lleva a su vitrina. Cualquier otro host (workers.dev, pruebas) sigue igual.
async function dominio(req, url, env) {
  const host = url.hostname.toLowerCase();
  if (req.method !== 'GET' || /(^|\.)workers\.dev$|^localhost$|^127\.|^\[/.test(host)) return null;
  try {
    const slug = await rpc(env, url, 'tienda_por_dominio', { p_host: host });
    if (typeof slug !== 'string' || !/^[a-z0-9-]{2,60}$/.test(slug)) return null;
    return Response.redirect(url.origin + '/t/?s=' + encodeURIComponent(slug), 302);
  } catch (e) { return null; }
}

// 🌐 ¿Ya está conectado? La app del negocio pregunta https://www.sutienda.cl/cfx-dominio: si responde con su tienda, el dominio está ✅ activo.
async function dominioEstado(url, env) {
  let slug = null;
  try { const s = await rpc(env, url, 'tienda_por_dominio', { p_host: url.hostname.toLowerCase() }); if (typeof s === 'string' && /^[a-z0-9-]{2,60}$/.test(s)) slug = s; } catch (e) { slug = null; }
  return new Response(JSON.stringify({ slug }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/cfx-dominio') return dominioEstado(url, env);
    if (url.pathname === '/') { const r = await dominio(req, url, env); if (r) return r; }
    if (url.pathname === '/t/og') return conCache(req, ctx, () => imagen(url, env));
    if (url.pathname === '/t/feed') return conCache(req, ctx, () => catalogo(url, env));
    if (url.pathname === '/t/' || url.pathname === '/t/index.html') return pagina(req, url, env);
    return env.ASSETS.fetch(req);
  }
};
