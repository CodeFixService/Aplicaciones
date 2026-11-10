// ---------- Carga unificada (igual en las 7 apps) ----------
// · Barra de luz arriba mientras la app espera al servidor (cualquier fetch de más de 250 ms).
// · El botón que se tocó muestra puntitos mientras espera y un ✓ al terminar bien.
// · Todo texto "Cargando…" se ve como cajas con brillo (esqueleto) en vez de letras.
// API: CFX_CARGA.boton(btn, promesa) · CFX_CARGA.esqueleto(el, filas) · CFX_CARGA.barra(true|false)
(function () {
  // G20 · 🧪 Probar "como en incógnito": ?cfx-limpio=… borra la caché y el service worker de esta dirección y vuelve a abrir sin el parámetro.
  // (Una página no puede abrir una ventana de incógnito; esto deja la versión de prueba sin nada guardado de antes. La sesión se mantiene.)
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('cfx-limpio')) {
      u.searchParams.delete('cfx-limpio');
      document.documentElement.style.visibility = 'hidden';
      Promise.all([
        window.caches ? caches.keys().then((k) => Promise.all(k.map((x) => caches.delete(x)))) : 0,
        navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => Promise.all(r.map((x) => x.unregister()))) : 0
      ]).catch(() => {}).then(() => location.replace(u.toString()));
      return;
    }
  } catch (e) { /* nada */ }
  if (window.CFX_CARGA) return;
  const d = document;
  // El color y el plan de la última vez se ponen al abrir (antes de pintar): el + y la barra parten con su color final, sin saltos.
  try {
    const r = d.documentElement, c = localStorage.getItem('cfx-brand');
    if (/^#[0-9a-f]{6}$/i.test(c || '') && !r.style.getPropertyValue('--brand')) { r.style.setProperty('--brand', c); r.style.setProperty('--marca', c); }
    if (localStorage.getItem('cfx-premium') === '1') r.classList.add('cfx-premium');
    new MutationObserver(() => { const v = (r.style.getPropertyValue('--brand') || r.style.getPropertyValue('--marca')).trim(); try { if (/^#[0-9a-f]{6}$/i.test(v)) localStorage.setItem('cfx-brand', v); else if (!v) localStorage.removeItem('cfx-brand'); } catch (e) { /* lleno */ } })
      .observe(r, { attributes: true, attributeFilter: ['style'] });
  } catch (e) { /* sin almacenamiento */ }
  const css = d.createElement('style');
  css.textContent =
    '.cfx-carga-b{position:fixed;left:0;right:0;top:0;height:3px;z-index:2147483600;pointer-events:none;opacity:0;transition:opacity .25s;' +
    'background:linear-gradient(90deg,transparent,var(--brand,var(--primary,#7c4dff)),#22d3ee,var(--brand,var(--primary,#7c4dff)),transparent);background-size:50% 100%;background-repeat:no-repeat;' +
    'box-shadow:0 0 10px var(--brand,var(--primary,#7c4dff));animation:cfxCbar 1.1s cubic-bezier(.4,0,.2,1) infinite}' +
    '.cfx-carga-b.on{opacity:1}@keyframes cfxCbar{0%{background-position:-60% 0}100%{background-position:160% 0}}' +
    '.cfx-ocupado{position:relative!important;color:transparent!important;pointer-events:none!important}.cfx-ocupado>*{visibility:hidden}' +
    '.cfx-ocupado::after,.cfx-listo::after{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);visibility:visible}' +
    '.cfx-ocupado::after{content:"";width:30px;height:8px;background:radial-gradient(circle,var(--cfx-c) 3px,transparent 3.6px) 0 50%/10px 8px repeat-x;animation:cfxCpt .9s ease-in-out infinite}' +
    '@keyframes cfxCpt{0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(.9)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}}' +
    '.cfx-listo{position:relative!important;color:transparent!important}.cfx-listo>*{visibility:hidden}.cfx-listo::after{content:"✓";color:var(--cfx-c);font-weight:800;font-size:1.15em;animation:cfxCok .5s cubic-bezier(.2,1.6,.4,1)}' +
    '@keyframes cfxCok{from{transform:translate(-50%,-50%) scale(.3);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}' +
    '.cfx-esq{display:grid;gap:10px;padding:6px 0;width:100%}.cfx-esq i{display:block;height:14px;border-radius:8px;' +
    'background:linear-gradient(90deg,rgba(127,127,127,.13) 25%,rgba(127,127,127,.26) 45%,rgba(127,127,127,.13) 65%);background-size:300% 100%;animation:cfxCesq 1.3s linear infinite}' +
    '.cfx-esq i:nth-child(1){height:44px;border-radius:14px}.cfx-esq i:nth-child(2){width:82%}.cfx-esq i:nth-child(3){width:58%}' +
    '@keyframes cfxCesq{0%{background-position:100% 0}100%{background-position:-100% 0}}' +
    '.cfx-ojo{background:transparent!important;box-shadow:none!important;border:0!important;outline-offset:0;width:34px!important;height:34px!important;min-width:0!important;min-height:0!important;padding:0!important;border-radius:50%!important;opacity:.55;transition:opacity .15s}.cfx-ojo:hover,.cfx-ojo:active{opacity:.9;background:transparent!important}' +
    '@media (prefers-reduced-motion:reduce){.cfx-carga-b,.cfx-ocupado::after,.cfx-listo::after,.cfx-esq i{animation:none!important}.cfx-carga-b{background-position:50% 0}}';
  d.head.appendChild(css);

  // Barra de arriba
  const barra = d.createElement('div'); barra.className = 'cfx-carga-b'; barra.setAttribute('aria-hidden', 'true');
  let pend = 0, tBarra = 0;
  const pintarBarra = (on) => { if (!barra.isConnected && d.body) d.body.appendChild(barra); barra.classList.toggle('on', !!on); };
  const sube = () => { pend++; if (pend === 1) { clearTimeout(tBarra); tBarra = setTimeout(() => pend && pintarBarra(true), 250); } };
  const baja = () => { pend = Math.max(0, pend - 1); if (!pend) { clearTimeout(tBarra); pintarBarra(false); } };

  // Botón tocado: si en 400 ms parte una consulta que dura más de 300 ms, se ve ocupado hasta que terminen sus consultas.
  let toque = null;
  d.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button,.btn');
    if (!b || b.disabled || b.closest('nav,header,.tabs,.cfx-cab,.cfx-hm-cab,.cfx-aj,dialog .cfx-hm-x') || (b.textContent || '').trim().length < 2 || b.offsetWidth < 60) { toque = null; return; }
    toque = { b, t: Date.now(), n: 0, ok: true, timer: 0, fin: 0 };
  }, true);
  const ocupar = (q) => { if (!q.b.isConnected) return; q.b.style.setProperty('--cfx-c', getComputedStyle(q.b).color); q.b.classList.add('cfx-ocupado'); q.b.setAttribute('aria-busy', 'true'); q.fin = setTimeout(() => soltar(q, false), 15000); };
  const soltar = (q, ok) => {
    clearTimeout(q.timer); clearTimeout(q.fin); const b = q.b; const estaba = b.classList.contains('cfx-ocupado');
    b.classList.remove('cfx-ocupado'); b.removeAttribute('aria-busy');
    if (estaba && ok && b.isConnected) { b.classList.add('cfx-listo'); setTimeout(() => b.classList.remove('cfx-listo'), 700); }
  };

  const f0 = window.fetch;
  if (f0) window.fetch = function () {
    const q = toque && Date.now() - toque.t < 400 ? toque : null;
    sube();
    if (q) { q.n++; if (q.n === 1) q.timer = setTimeout(() => q.n && ocupar(q), 300); }
    const fin = (ok) => { baja(); if (q) { if (!ok) q.ok = false; if (--q.n <= 0) { if (toque === q) toque = null; soltar(q, q.ok); } } };
    let p;
    try { p = f0.apply(this, arguments); } catch (e) { fin(false); throw e; }
    p.then((r) => fin(!!(r && r.ok)), () => fin(false));
    return p;
  };

  // Esqueleto en vez de "Cargando…"
  const filas = (n) => '<span class="cfx-esq" aria-hidden="true">' + '<i></i>'.repeat(Math.max(1, Math.min(6, n || 3))) + '</span>';
  function esqueleto(el, n) { if (!el) return; el.setAttribute('aria-label', 'Cargando'); el.setAttribute('aria-busy', 'true'); el.innerHTML = filas(n); }
  const SALTA = /^(SELECT|OPTION|BUTTON|INPUT|TEXTAREA|SCRIPT|STYLE|TITLE|LABEL|A|B|STRONG|SPAN|TD|TH|LI)$/;
  const revisar = (el) => {
    if (!el || el.nodeType !== 1 || SALTA.test(el.tagName) || el.children.length || el.closest('.cfx-esq')) return;
    if (/^cargando\s*(…|\.\.\.)?$/i.test((el.textContent || '').trim())) esqueleto(el, 3);
  };
  // Ojito para ver la contraseña en todos los campos de clave (login, registro, cambiar contraseña).
  const OJO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_NO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const ojo = (i) => {
    if (i.dataset.cfxOjo || i.hasAttribute('data-c1') || i.hasAttribute('data-c2') || i.closest('.cfx-pin')) return; i.dataset.cfxOjo = '1';
    const w = d.createElement('span'); w.style.cssText = 'position:relative;display:block;width:100%';
    i.parentNode.insertBefore(w, i); w.appendChild(i); i.style.paddingRight = '44px';
    const b = d.createElement('button'); b.type = 'button'; b.className = 'cfx-ojo'; b.setAttribute('aria-label', 'Ver contraseña'); b.innerHTML = OJO;
    b.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);margin:0;color:inherit;display:grid;place-items:center;cursor:pointer';
    b.onclick = () => { const v = i.type === 'password'; i.type = v ? 'text' : 'password'; b.innerHTML = v ? OJO_NO : OJO; b.setAttribute('aria-label', v ? 'Ocultar contraseña' : 'Ver contraseña'); };
    w.appendChild(b);
  };
  const barrer = (raiz) => { if (raiz && raiz.querySelectorAll) { revisar(raiz); raiz.querySelectorAll('p,div,section').forEach(revisar); (raiz.matches && raiz.matches('input[type=password]') ? [raiz] : raiz.querySelectorAll('input[type=password]')).forEach(ojo); } };
  let cola = [], rafo = 0;
  const vaciar = () => { rafo = 0; const l = cola; cola = []; l.forEach(barrer); };
  const empezar = () => {
    barrer(d.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') { cola.push(m.target.parentElement); continue; }
        m.addedNodes.forEach((n) => cola.push(n.nodeType === 3 ? n.parentElement : n));
      }
      if (cola.length && !rafo) rafo = requestAnimationFrame(vaciar);
    }).observe(d.body, { childList: true, subtree: true, characterData: true });
  };
  if (d.body) empezar(); else d.addEventListener('DOMContentLoaded', empezar);

  // Monitoreo de errores (G8): cada error de JavaScript se anota en la base de esta app (cfx_error_anotar) y se ve en
  // Centro de Mando → Control → 🩺 Salud. Hasta 5 por apertura, sin repetir; se ignora lo que no es de la app (extensiones, sin internet).
  const RUIDO = /ResizeObserver loop|^Script error\.?$|Failed to fetch|NetworkError|Load failed|AbortError|aborted|cancelad|extension:\/\/|Non-Error promise rejection|Sin internet|offline/i;
  const vistos = new Set();
  const conf = () => { for (const k of Object.keys(window)) if (/_CONFIG$/.test(k) && window[k] && window[k].SUPABASE_URL && window[k].SUPABASE_ANON_KEY) return window[k]; return null; };
  function anotarError(msg, donde) {
    try {
      msg = String(msg || '').trim(); donde = String(donde || '');
      const cfg = conf(), k = msg + '|' + donde.split('\n')[0];
      if (!cfg || !f0 || !msg || RUIDO.test(msg) || RUIDO.test(donde) || vistos.has(k) || vistos.size >= 5 || /^(localhost|127\.)/.test(location.hostname) && !window.CFX_ERRORES_LOCAL) return;
      vistos.add(k);
      f0.call(window, cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/cfx_error_anotar', { method: 'POST', keepalive: true,
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_mensaje: msg.slice(0, 300), p_donde: donde.slice(0, 600), p_pagina: (location.pathname + location.hash.split('?')[0]).slice(0, 200),
          p_navegador: (navigator.userAgent.match(/(Android|iPhone|iPad|Windows|Mac OS X|Linux)[^;)]*/) || [''])[0] + ' · ' + ((navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg|SamsungBrowser)\/[\d]+/) || [''])[0]),
          p_version: String(cfg.VERSION || '') }) }).catch(() => {});
    } catch (e) { /* el monitoreo nunca rompe la app */ }
  }
  // B13 · Tiempo de carga real: cuánto demoró en abrirse esta página (hasta "load" y la imagen o texto principal, LCP) en el teléfono de verdad.
  // 1 vez por página y sesión, sin datos de la persona; se ve en Centro de Mando → Control → 🩺 Salud ("⚡ Carga").
  let lcp = 0;
  try { new PerformanceObserver((l) => { const e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* Safari sin LCP */ }
  function anotarCarga() {
    try {
      const n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0], cfg = conf();
      if (!n || !cfg || !f0 || !n.loadEventEnd || /^(localhost|127\.)/.test(location.hostname) && !window.CFX_ERRORES_LOCAL || d.visibilityState === 'hidden' && !lcp) return;
      const pg = location.pathname.replace(/\/index\.html$/, '/').replace(/\/[0-9a-f-]{20,}/gi, '/:id') || '/', k = 'cfx-carga:' + pg;
      if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1');
      f0.call(window, cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/cfx_carga_anotar', { method: 'POST', keepalive: true,
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_pagina: pg, p_ms: Math.round(n.loadEventEnd), p_lcp: Math.round(lcp) || null, p_cache: !!(navigator.serviceWorker && navigator.serviceWorker.controller) }) }).catch(() => {});
    } catch (e) { /* medir nunca rompe la app */ }
  }
  window.addEventListener('load', () => setTimeout(anotarCarga, 3000));

  window.addEventListener('error', (e) => { if (e && e.message) anotarError(e.message, (e.filename || '').replace(location.origin, '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0) + (e.error && e.error.stack ? '\n' + e.error.stack : '')); });
  window.addEventListener('unhandledrejection', (e) => { const r = e && e.reason; anotarError(r && r.message ? r.message : (typeof r === 'string' ? r : ''), r && r.stack ? r.stack : 'promesa'); });

  window.CFX_CARGA = {
    anotarError, anotarCarga,
    esqueleto,
    barra: (on) => (on ? sube() : baja()),
    boton(b, prom) {
      if (!b) return prom; const q = { b, n: 1, ok: true, timer: 0, fin: 0 }; ocupar(q);
      return Promise.resolve(prom).then((v) => { soltar(q, true); return v; }, (e) => { soltar(q, false); throw e; });
    }
  };
})();
