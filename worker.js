// F32 · Vitrina pública con buen SEO y vista previa al compartir (WhatsApp, Instagram, Facebook, Google).
// Cloudflare corre este Worker SOLO para /t/* (wrangler.jsonc → run_worker_first). Todo lo demás son archivos estáticos.
// · /t/?s=tienda[&p=producto] → la misma página, con título, descripción, og:* y datos estructurados (schema.org) de esa tienda o producto.
// · /t/og?s=tienda[&p=producto] → la imagen de la vista previa (logo o foto del producto; si no hay, el ícono de Órbita).
// WhatsApp y los buscadores no corren JavaScript: por eso las etiquetas se ponen aquí, antes de mandar la página.
// Si Supabase no responde en 1,5 s, se manda la página tal cual (nunca queda más lenta ni rota).
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

async function pagina(req, url, env) {
  const base = await env.ASSETS.fetch(req);
  const s = limpio(url.searchParams.get('s')), p = String(url.searchParams.get('p') || '').slice(0, 120);
  if (!s || req.method !== 'GET' || !base.ok || !/text\/html/.test(base.headers.get('content-type') || '')) return base;
  try {
    const [t, items] = await Promise.all([rpc(env, url, 'tienda_publica', { p_slug: s }), rpc(env, url, 'catalogo_publico', { p_slug: s }).catch(() => [])]);
    if (!t || !t.slug) return base;
    const html = armar(await base.clone().text(), etiquetas(url.origin, t, items, p));
    const h = new Headers(base.headers); h.delete('content-length'); h.delete('etag');
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
  if (!img) return env.ASSETS.fetch(new Request(new URL('/icons/icon-512.png', url)));
  return new Response(img.bytes, { headers: { 'Content-Type': img.tipo, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/t/og') return imagen(url, env);
    if (url.pathname === '/t/' || url.pathname === '/t/index.html') return pagina(req, url, env);
    return env.ASSETS.fetch(req);
  }
};
