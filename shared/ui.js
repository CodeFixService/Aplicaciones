/* CodeFix · Núcleo · Detalles de pantalla iguales en todas las apps (mismo archivo en cada repositorio; Cerebro no lo usa).
   G42a ⬆️ Subir: al pasar el 30% de lo que se puede bajar (página o ventana) aparece un botón redondo; toca → sube suave.
   G42k 📌 Títulos fijos: en una tarjeta larga su título (h2 primero) queda pegado bajo la cabecera y solo se mueve lo de adentro;
        la tarjeta siguiente trae su título y reemplaza al anterior. También los títulos de grupo de los menús (.cfx-aj-g).
        1 línea con … y fondo opaco (el mismo de la tarjeta). Las tarjetas que se apilan (.cfx-pila) no se tocan.
        G149: TODOS los títulos (h1/h2/h3, grupos, fila título+botón, pestañas del ☰ Más) se quedan fijos al llegar a la barra, sin correr nada.
        Fuera: fichas en grilla, títulos tras una foto, ventanas, [data-sin-fijo]. window.CFX_FIJO.arriba() = dónde termina la barra de arriba.
   G42c ✋ Ordenar a gusto: mantener presionado un elemento de una lista marcada y arrastrarlo arriba o abajo. Se guarda por usuario.
        Marcar:  <div data-cfx-orden="clave"> con hijos directos data-cfx-oi="id" (sin data-cfx-oi usa data-k o el título).
        API: CFX_ORDEN.lista(el, 'clave') marca una lista ya dibujada (ej. las tarjetas de una pantalla). */
(function () {
  'use strict';
  if (window.CFX_ORDEN) return;
  const d = document, raiz = d.documentElement;
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = d.createElement('style');
  css.textContent =
    '.cfx-subir{position:fixed;right:16px;bottom:calc(var(--cfx-subir-b,20px) + env(safe-area-inset-bottom));z-index:46;width:46px;height:46px;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;' +
    'display:grid!important;place-items:center;border-radius:50%!important;border:1.5px solid var(--cfx-borde,#dce3ea)!important;background:var(--cfx-tarjeta,#fff)!important;color:var(--brand,var(--marca,#2563eb))!important;' +
    'box-shadow:0 8px 22px -6px rgba(15,23,42,.35)!important;cursor:pointer;opacity:0;transform:translateY(12px) scale(.9);pointer-events:none;transition:opacity .2s,transform .2s}' +
    '.cfx-subir.on{opacity:1;transform:none;pointer-events:auto}.cfx-subir svg{width:22px;height:22px}' +
    // G149: sin tocar alto ni márgenes (no se corre nada). Pegado queda 8 px bajo la barra y una sombra del mismo fondo tapa ese espacio; la línea va por dentro.
    '.cfx-fijo{position:sticky!important;top:var(--cfx-fijo-top,0px);z-index:3;' +
    'margin-left:calc(-1 * var(--cfx-fijo-px,0px))!important;margin-right:calc(-1 * var(--cfx-fijo-px,0px))!important;padding-left:var(--cfx-fijo-px,0px)!important;padding-right:var(--cfx-fijo-px,0px)!important}' +
    '.cfx-fijo:not(.cfx-fijo-fila){white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}' +
    '.cfx-fijo:is(h1,h2,h3):not(.cfx-tit-rep):not(.cfx-fijo-fila){display:block!important}.cfx-fijo.cfx-pegado{background:var(--cfx-fijo-bg,var(--cfx-tarjeta,#fff))!important;box-shadow:inset 0 -2px 0 var(--brand,var(--marca,#2563eb)),0 -8px 0 var(--cfx-fijo-bg,var(--cfx-tarjeta,#fff)),0 8px 14px -8px rgba(0,0,0,.45)!important;color:var(--brand,var(--marca,inherit))}' +
    '[data-cfx-orden]>*{-webkit-touch-callout:none}[data-cfx-orden]>.cfx-fila,[data-cfx-orden]>*>:is(h2,h3,.cfx-aj-g){-webkit-user-select:none;user-select:none}' +
    '[data-cfx-orden]>.cfx-aj-sec>.cfx-aj-g{display:flex;align-items:center;gap:8px;cursor:grab}[data-cfx-orden]>.cfx-aj-sec>.cfx-aj-g::after{content:"";margin-left:auto;flex:none;width:14px;height:14px;opacity:.55;background:currentColor;' +
    '-webkit-mask:radial-gradient(circle,#000 1.6px,transparent 1.9px) 0 0/7px 4.7px;mask:radial-gradient(circle,#000 1.6px,transparent 1.9px) 0 0/7px 4.7px}' +
    '.cfx-arrastra{position:relative;z-index:20!important;transition:none!important;box-shadow:0 16px 36px -10px rgba(15,23,42,.45)!important;scale:1.02;opacity:.97;' +
    'outline:2px solid var(--brand,var(--marca,#2563eb));outline-offset:-2px;border-radius:14px;background:var(--cfx-tarjeta,#fff)}html.cfx-ordenando,html.cfx-ordenando *{user-select:none!important;-webkit-user-select:none!important;cursor:grabbing!important}' +
    '.cfx-orden-ok{animation:cfxOrdOk .5s ease}@keyframes cfxOrdOk{50%{scale:1.015}}' +
    '@media (prefers-reduced-motion:reduce){.cfx-subir{transition:none}.cfx-orden-ok{animation:none}}';
  (d.head || raiz).appendChild(css);

  // ---------- ⬆️ Subir ----------
  // Lo que baja: la página o la caja que la persona está bajando (ventana del núcleo, pantalla con su propio scroll).
  let caja = null;
  const btn = d.createElement('button');
  btn.type = 'button'; btn.className = 'cfx-subir no-ico'; btn.setAttribute('aria-label', 'Subir al inicio'); btn.title = 'Subir';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const pagina = () => d.scrollingElement || raiz;
  const vale = (e) => e && e !== pagina() && e.isConnected && e.getClientRects().length && e.scrollHeight > e.clientHeight + 40;
  function revisar() {
    if (caja && !vale(caja)) caja = null;
    const e = caja || pagina(), alto = caja ? caja.clientHeight : innerHeight;
    const max = e.scrollHeight - alto, y = e.scrollTop;
    const on = max > alto * 0.5 && y > max * 0.3 && !d.querySelector('dialog[open]');
    if (on) {
      if (!btn.isConnected) d.body.appendChild(btn);
      raiz.style.setProperty('--cfx-subir-b', (caja ? 20 : sobreCarro()) + 'px');  // G146: sobre el menú y sobre el 🛒 (nunca debajo)
    }
    btn.classList.toggle('on', on);
  }
  let raf = 0;
  addEventListener('scroll', (ev) => {
    const t = ev.target;
    if (t && t.nodeType === 1 && t !== pagina() && !t.closest('.cfx-barra, nav, .tabs, .chips') && t.scrollHeight > t.clientHeight + 40 && t.clientHeight > innerHeight * 0.35) caja = t;
    else if (t === d || t === pagina()) caja = null;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; revisar(); pegados(); });
  }, { passive: true, capture: true });
  addEventListener('resize', revisar); addEventListener('hashchange', () => { caja = null; setTimeout(revisar, 300); });
  btn.addEventListener('click', () => { (caja || pagina()).scrollTo({ top: 0, behavior: quieto() ? 'auto' : 'smooth' }); btn.classList.remove('on'); });
  // Si la ventana que se bajaba se cierra, el botón vuelve a mirar la página.
  new MutationObserver(() => { if (caja && !caja.isConnected) { caja = null; revisar(); } }).observe(raiz, { childList: true, subtree: true });

  // ---------- 🛒 G146 Carrito flotante (CFX_CARRITO) ----------
  // Antes cada app tenía una barra "Ver pedido" a lo ancho abajo: el menú (que se esconde y vuelve) la tapaba y ↑ tapaba el total.
  // Ahora: 🛒 redondo y chico abajo a la derecha, SIEMPRE sobre el menú (sube y baja con él), con contador y total; ↑ va encima.
  // ✕ lo quita de la vista → 🛒 chico con contador en la cabecera (al lado de 🔔). El pedido NO se borra. Tocar cualquiera abre el pedido.
  //   CFX_CARRITO.montar({ abrir: () => …, barra: elemento viejo (se deja de mostrar), cabecera: elemento (opcional) })
  //   CFX_CARRITO.poner(cantidad, 'total en texto')   → 0 = sin carrito (no se ve ninguno de los dos)
  // Barra propia de una app que debe quedar sobre el menú: data-cfx-sobre-menu + bottom:calc(var(--cfx-carro-b,16px) + env(safe-area-inset-bottom)).
  // (Antes de que ui.js cargue, la barra no tiene la variable: por eso en tema/CSS de la app el valor por defecto alto, ej. 76px.)
  const SVG_CARRO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.1"/></svg>';
  const SVG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  css.textContent +=
    '.cfx-carro-f{position:fixed;right:16px;bottom:calc(var(--cfx-carro-b,16px) + env(safe-area-inset-bottom));z-index:44;display:flex;align-items:center;gap:6px;transition:bottom .3s cubic-bezier(.2,.8,.2,1),opacity .2s;pointer-events:none}' +
    '.cfx-carro-f[hidden]{display:none!important}.cfx-carro-f>*{pointer-events:auto}' +
    '.cfx-carro-f .cfx-carro-t{font:700 13px/1 inherit;padding:8px 10px;border-radius:999px;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#0f172a);border:1px solid var(--cfx-borde,#dce3ea);box-shadow:0 6px 16px -6px rgba(15,23,42,.35);white-space:nowrap;cursor:pointer;min-height:0!important;margin:0!important}' +
    '.cfx-carro-b{position:relative;width:56px!important;height:56px!important;aspect-ratio:1;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;border-radius:50%!important;display:grid!important;place-items:center;' +
    'background:var(--ok,var(--cfx-ok,#16a34a))!important;color:#fff!important;border:0!important;box-shadow:0 10px 24px -8px rgba(15,23,42,.5)!important;cursor:pointer}.cfx-carro-b svg{width:26px;height:26px}' +
    '.cfx-carro-b .cfx-num,.cfx-carro-mini .cfx-num{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;display:grid;place-items:center;font:800 11px/1 inherit;background:#dc2626;color:#fff;box-shadow:0 0 0 2px var(--cfx-tarjeta,#fff)}' +
    '.cfx-carro-x{position:absolute;top:-8px;left:-8px;width:24px!important;height:24px!important;aspect-ratio:1;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;border-radius:50%!important;display:grid!important;place-items:center;' +
    'background:var(--cfx-tarjeta,#fff)!important;color:var(--cfx-texto,#0f172a)!important;border:1px solid var(--cfx-borde,#dce3ea)!important;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer}.cfx-carro-x svg{width:12px;height:12px}' +
    '.cfx-carro-x::after{content:"";position:absolute;inset:-8px}' +  /* zona de toque más grande sin agrandar el círculo */
    '.cfx-carro-mini{position:relative;flex:none;width:32px!important;height:32px!important;aspect-ratio:1;min-width:0!important;min-height:0!important;padding:0!important;margin:0 4px!important;border-radius:50%!important;display:grid!important;place-items:center;' +
    'background:var(--cfx-tarjeta,#fff)!important;color:var(--ok,var(--cfx-ok,#16a34a))!important;border:1px solid var(--cfx-borde,#dce3ea)!important;cursor:pointer}.cfx-carro-mini[hidden]{display:none!important}.cfx-carro-mini svg{width:18px;height:18px}' +
    'html.cfx-teclado .cfx-carro-f{display:none!important}' +
    '@media (prefers-reduced-motion:reduce){.cfx-carro-f{transition:none}}';
  // Altura que ocupa el menú de abajo, SIN su animación (así ↑ y 🛒 se acomodan al tiro, no a medio camino).
  function altoMenu() {
    const n = d.querySelector('nav.cfx-barra');
    if (!n || innerWidth >= 900 || n.classList.contains('cfx-escondida') || raiz.classList.contains('cfx-teclado') || !n.getClientRects().length) return 0;
    const st = getComputedStyle(n); if (st.display === 'none' || st.visibility === 'hidden') return 0;
    let ty = 0; try { if (st.transform && st.transform !== 'none') ty = new DOMMatrix(st.transform).m42; } catch (e) { ty = 0; }
    const top = n.getBoundingClientRect().top - ty;
    return top < innerHeight && top > innerHeight * 0.4 ? Math.round(innerHeight - top) : 0;
  }
  const K = { n: 0, total: '', abrir: null, min: false, f: null, mini: null, cab: null };
  try { K.min = sessionStorage.getItem('cfx-carro-min') === '1'; } catch (e) { /* sin almacenamiento */ }
  const tapado = () => !!d.querySelector('dialog[open], .cfx-mv, .cfx-hoja-m');
  const carroB = () => { const a = altoMenu(); return a ? a + 12 : 16; };
  function sobreCarro() {
    const a = altoMenu(), base = a ? a + 12 : 20;
    let b = K.f && !K.f.hidden ? carroB() + 56 + 12 : base;
    // Barras propias de una app que también van sobre el menú (Barbería: servicios elegidos + "Vaciar"): ↑ queda encima de ellas.
    d.querySelectorAll('[data-cfx-sobre-menu]').forEach((x) => { if (!x.getClientRects().length) return; const r = x.getBoundingClientRect(); if (r.height && r.top < innerHeight && r.bottom > innerHeight * 0.6) b = Math.max(b, Math.round(innerHeight - r.top + 12)); });
    return b;
  }
  function lugar() {
    raiz.style.setProperty('--cfx-carro-b', carroB() + 'px');
    if (K.f) K.f.hidden = !(K.n > 0 && !K.min) || tapado();
    if (K.mini) K.mini.hidden = !(K.n > 0 && K.min);
    if (btn.classList.contains('on') && !caja) raiz.style.setProperty('--cfx-subir-b', sobreCarro() + 'px');
  }
  function cabCarro() {
    if (K.cab && K.cab.isConnected) return K.cab;
    return d.querySelector('.cfx-cab') || [...d.querySelectorAll('header')].find((x) => { const s = getComputedStyle(x); return /fixed|sticky/.test(s.position) && x.getClientRects().length; }) || d.querySelector('header');
  }
  function armar() {
    if (!K.f) {
      K.f = d.createElement('div'); K.f.className = 'cfx-carro-f'; K.f.hidden = true;
      K.f.innerHTML = '<button type="button" class="cfx-carro-t no-ico" data-cfx-queda></button><button type="button" class="cfx-carro-b no-ico" data-cfx-queda>' + SVG_CARRO + '<span class="cfx-num">0</span>' +
        '<span class="cfx-carro-x" role="button" tabindex="0" aria-label="Quitar el carrito de la vista (el pedido no se borra)">' + SVG_X + '</span></button>';
      const x = K.f.querySelector('.cfx-carro-x');
      const quitar = (e) => { e.preventDefault(); e.stopPropagation(); K.min = true; try { sessionStorage.setItem('cfx-carro-min', '1'); } catch (er) { /* nada */ } pintar(); };
      x.addEventListener('click', quitar); x.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') quitar(e); });
      K.f.querySelector('.cfx-carro-b').addEventListener('click', (e) => { if (!e.target.closest('.cfx-carro-x')) abrirPedido(); });
      K.f.querySelector('.cfx-carro-t').addEventListener('click', abrirPedido);
    }
    if (!K.f.isConnected && d.body) d.body.appendChild(K.f);
    const cab = cabCarro();
    if (!K.mini) {
      K.mini = d.createElement('button'); K.mini.type = 'button'; K.mini.className = 'cfx-carro-mini no-ico'; K.mini.hidden = true; K.mini.dataset.cfxQueda = '';
      K.mini.innerHTML = SVG_CARRO + '<span class="cfx-num">0</span>';
      K.mini.addEventListener('click', abrirPedido);
    }
    if (cab && K.mini.parentNode !== cab) {
      const camp = cab.querySelector('[data-cfx-campana]');
      if (camp && camp.parentNode === cab) cab.insertBefore(K.mini, camp); else cab.appendChild(K.mini);
    }
  }
  function abrirPedido() { if (typeof K.abrir === 'function') try { K.abrir(); } catch (e) { /* la app sigue */ } }
  function pintar() {
    if (!K.n && !K.f) return;
    armar();
    const n = K.n > 99 ? '99+' : String(K.n), etq = 'Ver pedido: ' + K.n + (K.n === 1 ? ' producto' : ' productos') + (K.total ? ' · ' + K.total : '');
    K.f.querySelector('.cfx-carro-b .cfx-num').textContent = n; K.mini.querySelector('.cfx-num').textContent = n;
    K.f.querySelector('.cfx-carro-b').setAttribute('aria-label', etq); K.mini.setAttribute('aria-label', etq); K.mini.title = etq;
    const t = K.f.querySelector('.cfx-carro-t'); t.textContent = K.total; t.hidden = !K.total; t.setAttribute('aria-label', etq);
    lugar(); revisar();
  }
  window.CFX_CARRITO = {
    montar(o) {
      o = o || {};
      K.abrir = o.abrir || K.abrir;
      if (o.cabecera) K.cab = typeof o.cabecera === 'string' ? d.querySelector(o.cabecera) : o.cabecera;
      const v = typeof o.barra === 'string' ? d.querySelector(o.barra) : o.barra;
      if (v) v.dataset.cfxCarroViejo = '';  // la barra antigua deja de mostrarse: su botón es ahora el 🛒 (misma acción)
      return this;
    },
    poner(n, total) {
      K.n = Math.max(0, parseInt(n, 10) || 0); K.total = total == null ? '' : String(total);
      if (!K.n && K.min) { K.min = false; try { sessionStorage.removeItem('cfx-carro-min'); } catch (e) { /* nada */ } }  // carrito vacío: la próxima vez vuelve el flotante
      pintar();
    },
    mostrar() { K.min = false; try { sessionStorage.removeItem('cfx-carro-min'); } catch (e) { /* nada */ } pintar(); },
    estado: () => ({ n: K.n, total: K.total, min: K.min })
  };
  css.textContent += '[data-cfx-carro-viejo]{display:none!important}';
  let rafC = 0;
  const pronto = () => { if (!rafC) rafC = requestAnimationFrame(() => { rafC = 0; lugar(); }); };  // --cfx-carro-b siempre al día (lo usan las barras propias)
  addEventListener('scroll', pronto, { passive: true, capture: true }); addEventListener('resize', pronto);
  // El menú se esconde/aparece cambiando su clase (y el teclado o las hojas cambian la página): el 🛒 y ↑ lo siguen al tiro.
  new MutationObserver(pronto).observe(raiz, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });

  // ---------- 📌 Títulos fijos ----------
  const opaco = (el) => {
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) {
      const c = getComputedStyle(x).backgroundColor, m = /rgba?\(([^)]+)\)/.exec(c);
      if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean); if (p.length < 4 || parseFloat(p[3]) >= 0.95) return c; }
    }
    return '';
  };
  // Dónde queda pegada (sticky: su "top", aunque todavía no haya llegado; fija: donde está).
  const arriba = (x, st, r) => st.position === 'sticky' && /px$/.test(st.top) ? parseFloat(st.top) : r.top;
  const cabecera = () => {
    const h = [...d.querySelectorAll('header')].find((x) => { const s = getComputedStyle(x); return (s.position === 'fixed' || s.position === 'sticky') && x.getClientRects().length && x.getBoundingClientRect().top <= 1; });
    let b = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0;
    // G138: también las pestañas fijas que van bajo la cabecera (Mi Caja, tienda): el título queda DEBAJO de ellas, no escondido detrás.
    if (b) for (let i = 0; i < 3; i++) {
      const n = [...d.querySelectorAll('nav:not(.cfx-barra), .tabs, [data-cfx-pestanas]')].find((x) => { const st = getComputedStyle(x); if (!/fixed|sticky/.test(st.position) || x.closest('dialog, .cfx-hoja-m')) return false;
        const r = x.getBoundingClientRect(), t = arriba(x, st, r); return r.height > 0 && r.height < 160 && r.width > innerWidth * 0.5 && t <= b + 8 && t + r.height > b + 1; });
      if (!n) break; b = Math.round(arriba(n, getComputedStyle(n), n.getBoundingClientRect()) + n.getBoundingClientRect().height);
    }
    return b;
  };
  // G149 📌 TODOS los títulos se quedan fijos al llegar a la barra de arriba (antes solo el h2 de tarjetas más altas que la pantalla):
  // h1/h2/h3 y títulos de grupo; si el título va en una fila corta con botones (título + "Ver todo"), se pega la fila entera.
  // Se pega dentro de su caja: al terminar la caja se va con ella y el título siguiente toma su lugar. También la fila de pestañas del ☰ Más.
  const TIT = 'h1, h2, h3, .cfx-aj-sec > .cfx-aj-g, .cfx-mm-cab';
  const FUERA = 'dialog, header, nav, footer, table, button, a, label, summary, .cfx-pila, [data-sin-fijo], .cfx-emerg, .cfx-carro-f, .cfx-pnl, .cfx-mv, [popover]';
  const px = (v) => parseFloat(v) || 0;
  // La fila corta que lleva el título (título + botón): se pega la fila. Si no, el título solo.
  const quePega = (h) => {
    const f = h.parentElement;
    if (!f || h.classList.contains('cfx-mm-cab') || f.children.length > 4 || f.matches('.card, .tarjeta, main, section, article, .cfx-aj-sec, .vista, .view, body') || f.querySelector('img, picture, video, canvas')) return h;
    const cs = getComputedStyle(f);  // título + botón, o ‹ Noviembre › (el título puede ir al medio)
    return /flex|grid/.test(cs.display) && f.offsetHeight < 90 && f.offsetHeight < h.offsetHeight + 50 ? f : h;
  };
  // Hasta dónde sube: el primer antepasado que corta lo de adentro. Página → bajo la cabecera; caja que se baja → su borde; caja que no se baja → no se puede.
  const tope = (el, top) => {
    for (let x = el.parentElement; x && x !== d.body && x !== raiz; x = x.parentElement) {
      const o = getComputedStyle(x).overflowY;
      if (o === 'visible' || o === 'clip') continue;
      if (x.classList.contains('cfx-hm-zona')) return { t: -px(getComputedStyle(x).paddingTop), caja: x };
      if (x.scrollHeight > x.clientHeight + 1) return { t: Math.max(0, top - Math.round(x.getBoundingClientRect().top)) - px(getComputedStyle(x).paddingTop), caja: x };
      return null;
    }
    return { t: top, caja: null };
  };
  // Cajas de lado a lado (fichas en grilla, columnas del tablero): sus títulos no se pegan (taparían las fotos de al lado).
  const enGrilla = (c) => {
    const p = c.parentElement; if (!p) return false;
    const cs = getComputedStyle(p);
    if (/grid/.test(cs.display)) return cs.gridTemplateColumns.trim().split(/\s+/).length > 1;
    return /flex/.test(cs.display) && !/column/.test(cs.flexDirection) && c.offsetWidth < p.clientWidth * 0.7;
  };
  const PAGINA = 'main, section, article, .vista, .view, .card, .tarjeta, .cfx-aj-sec';
  const soltarFijo = (s) => { s.classList.remove('cfx-fijo', 'cfx-pegado', 'cfx-fijo-fila'); ['top', 'px', 'bg'].forEach((k) => s.style.removeProperty('--cfx-fijo-' + k)); };
  function fijar() {
    const top = cabecera(), vistos = new Set();
    d.querySelectorAll(TIT).forEach((h) => {
      if (h.classList.contains('cfx-tit-rep') || h.closest(FUERA) || !h.getClientRects().length || !h.textContent.trim()) return;
      const s = quePega(h), c = s.parentElement;
      if (!c || vistos.has(s) || s.closest('.cfx-pila')) return;
      vistos.add(s);
      const sec = h.classList.contains('cfx-aj-g') && s === h;
      // Título al medio de su caja: solo en cajas de página (no en fichas con foto ni en grillas).
      if (!s.classList.contains('cfx-mm-cab') && (c.firstElementChild !== s && (!c.matches(PAGINA) || s.matches('h3') || [...c.children].slice(0, [...c.children].indexOf(s)).some((x) => x.matches('img, picture, figure, video, canvas'))) || enGrilla(c))) { if (s.classList.contains('cfx-fijo')) soltarFijo(s); return; }
      // Solo si debajo del título hay algo más (una caja de un solo renglón no lo necesita).
      const yaFijo = s.classList.contains('cfx-fijo'), alto = s.offsetHeight;
      if (c.offsetHeight < alto + 40) { if (yaFijo) soltarFijo(s); return; }
      const tp = tope(s, top);
      if (tp == null) { if (yaFijo) soltarFijo(s); return; }
      const t = tp.t; s._cfxCaja = tp.caja;
      const ccs = getComputedStyle(c);
      if (!yaFijo) {
        s.classList.toggle('cfx-fijo-fila', s !== h || h.classList.contains('cfx-mm-cab') || /flex|grid/.test(getComputedStyle(s).display));
        s.classList.add('cfx-fijo');
      }
      s.style.setProperty('--cfx-fijo-top', (t + 8) + 'px');
      // A lo ancho de su caja (relleno de la caja), para que el fondo tape todo lo que pasa por debajo.
      s.style.setProperty('--cfx-fijo-px', sec ? '6px' : Math.min(px(ccs.paddingLeft), 24) + 'px');
      const zona = s.closest('.cfx-hm-zona');
      const bg = opaco(sec ? (zona || c.parentElement) : c); if (bg) s.style.setProperty('--cfx-fijo-bg', bg);
      if (s._cfxOff == null || !s.classList.contains('cfx-pegado')) s._cfxOff = s.getBoundingClientRect().top - c.getBoundingClientRect().top;
    });
    // Los que ya no están (o cambiaron de forma) vuelven a la normalidad.
    d.querySelectorAll('.cfx-fijo').forEach((s) => { if (!vistos.has(s) && s.isConnected) soltarFijo(s); });
    pegados();
  }
  // Fondo opaco solo mientras está pegado (sin franja cuando está en su lugar).
  function pegados() {
    d.querySelectorAll('.cfx-fijo').forEach((h) => {
      const r = h.getBoundingClientRect(), t = parseFloat(getComputedStyle(h).top) || 0, z = h._cfxCaja && h._cfxCaja.isConnected ? h._cfxCaja : h.closest('.cfx-hm-zona');
      const ref = z ? z.getBoundingClientRect().top + t + (parseFloat(getComputedStyle(z).paddingTop) || 0) : t;
      // G138: pegado = su tarjeta ya empezó más arriba (sirve aunque lo que se baje sea una caja y no la página; antes quedaba sin fondo, encima del texto).
      const c = h.parentElement, ct = c ? c.getBoundingClientRect().top : r.top;
      // G149: pegado = está más abajo de su lugar dentro de la caja (su caja ya subió).
      const corrido = h._cfxOff != null ? r.top - ct > h._cfxOff + 2 : ct < r.top - 2;
      h.classList.toggle('cfx-pegado', r.height > 0 && Math.abs(r.top - ref) < 1.5 && (z ? z.scrollTop > 0 && corrido : corrido));
    });
  }
  let tFijo = 0;
  const pedir = () => { clearTimeout(tFijo); tFijo = setTimeout(fijar, 300); };
  window.CFX_FIJO = { arriba: cabecera, fijar };  // G149: el aviso emergente (ayuda.js) baja justo debajo de la barra de arriba
  new MutationObserver(pedir).observe(raiz, { childList: true, subtree: true });
  addEventListener('resize', pedir); addEventListener('hashchange', pedir);
  addEventListener('click', () => setTimeout(pedir, 50), { passive: true, capture: true });

  // ---------- ✋ Ordenar ----------
  const quien = () => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { const u = (JSON.parse(localStorage.getItem(k)) || {}).user; if (u && u.id) return u.id; }
      }
    } catch (e) { /* sin almacenamiento */ }
    return 'yo';
  };
  const llave = (c) => 'cfx-orden:' + location.pathname.replace(/index\.html$/, '') + ':' + quien() + ':' + c;
  const norm = (t) => String(t || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
  const idDe = (e) => e.dataset.cfxOi || e.dataset.k || norm((e.querySelector('h2, h3, b') || e).textContent);
  const items = (l) => [...l.children].filter((e) => e.nodeType === 1 && (e.dataset.cfxOi || e.dataset.k || l.dataset.cfxOrdenTodo) && !e.classList.contains('cfx-oc'));
  function aplicar(l) {
    let g; try { g = JSON.parse(localStorage.getItem(llave(l.dataset.cfxOrden)) || 'null'); } catch (e) { g = null; }
    if (!Array.isArray(g) || !g.length) return;
    const L = items(l); if (L.length < 2) return;
    const pos = (e) => { const i = g.indexOf(idDe(e)); return i < 0 ? 1e6 + L.indexOf(e) : i; };
    const orden = L.slice().sort((a, b) => pos(a) - pos(b));
    if (orden.every((e, i) => e === L[i])) return;
    const marcas = L.map((e) => { const m = d.createComment(''); e.before(m); return m; });
    orden.forEach((e, i) => marcas[i].replaceWith(e));
  }
  const guardar = (l) => { try { localStorage.setItem(llave(l.dataset.cfxOrden), JSON.stringify(items(l).map(idDe))); } catch (e) { /* lleno */ } };
  function preparar(l) {
    if (l._cfxOrd === l.children.length + ':' + l.dataset.cfxOrden) return;
    l._cfxOrd = l.children.length + ':' + l.dataset.cfxOrden;
    aplicar(l);
  }
  const revisarListas = () => d.querySelectorAll('[data-cfx-orden]').forEach(preparar);
  let tOrd = 0;
  new MutationObserver(() => { clearTimeout(tOrd); tOrd = setTimeout(revisarListas, 60); }).observe(raiz, { childList: true, subtree: true });

  let arm = null, drag = null;
  const lista = (e) => { const l = e.parentElement; return l && l.dataset && l.dataset.cfxOrden ? l : null; };
  const deEvento = (t) => {
    // El más cercano al dedo: una opción dentro de una sección gana sobre la sección completa.
    for (let x = t; x && x.nodeType === 1 && x !== d.body; x = x.parentElement) { const l = lista(x); if (l && items(l).includes(x) && items(l).length > 1) return x; }
    return null;
  };
  d.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || drag) return;
    if (e.target.closest('input, textarea, select, [contenteditable], .cfx-hm-cab, .cfx-hm-pie')) return;
    const it = deEvento(e.target); if (!it) return;
    arm = { it, x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => empezar(e.clientY), 480) };
  }, true);
  function empezar(y) {
    if (!arm) return;
    const it = arm.it, l = lista(it); arm = null;
    drag = { it, l, y0: y, top0: it.getBoundingClientRect().top, cambio: false };
    raiz.classList.add('cfx-ordenando'); it.classList.add('cfx-arrastra');
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) { /* nada */ }
  }
  const cancelarArm = () => { if (arm) { clearTimeout(arm.t); arm = null; } };
  d.addEventListener('pointermove', (e) => {
    if (arm && Math.hypot(e.clientX - arm.x, e.clientY - arm.y) > 10) cancelarArm();
    if (!drag) return;
    e.preventDefault();
    const { it, l } = drag;
    const L = items(l).filter((x) => x !== it);
    // Se mueve en la lista donde va quedando y la tarjeta sigue al dedo.
    let antes = null;
    for (const x of L) { const r = x.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { antes = x; break; } }
    const actualSig = items(l)[items(l).indexOf(it) + 1] || null;
    if (antes !== actualSig) {
      if (antes) antes.before(it); else { const u = L[L.length - 1]; if (u) u.after(it); }
      drag.cambio = true;
    }
    const cur = parseFloat(String(it.style.translate || '0 0').split(' ')[1]) || 0, nat = it.getBoundingClientRect().top - cur;
    it.style.translate = '0 ' + Math.round(drag.top0 + e.clientY - drag.y0 - nat) + 'px';
    // Cerca del borde: baja o sube solo.
    const sc = it.closest('.cfx-hm-zona') || pagina(), r = sc === pagina() ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect();
    if (e.clientY < r.top + 70) sc.scrollTop -= 12; else if (e.clientY > r.bottom - 90) sc.scrollTop += 12;
  }, { passive: false, capture: true });
  // Mientras se arrastra con el dedo, la pantalla no se mueve.
  // G48: el dedo siempre tiembla un poco; solo se cancela si se movió de verdad (más de 10 px = quiere bajar la pantalla).
  d.addEventListener('touchmove', (e) => {
    if (drag) return e.preventDefault();
    const t = e.touches && e.touches[0]; if (arm && (!t || Math.hypot(t.clientX - arm.x, t.clientY - arm.y) > 10)) cancelarArm();
  }, { passive: false, capture: true });
  d.addEventListener('contextmenu', (e) => { if (arm || drag) e.preventDefault(); }, true);
  d.addEventListener('selectstart', (e) => { if (arm || drag) e.preventDefault(); }, true);  // mantener presionado un título no selecciona el texto
  const soltar = () => {
    cancelarArm();
    if (!drag) return;
    const { it, l, cambio } = drag; drag = null;
    it.classList.remove('cfx-arrastra'); it.style.translate = '';
    raiz.classList.remove('cfx-ordenando');
    // El toque que terminó el arrastre no debe abrir la opción.
    const tragar = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    d.addEventListener('click', tragar, { capture: true, once: true }); setTimeout(() => d.removeEventListener('click', tragar, true), 350);
    if (cambio) { guardar(l); it.classList.add('cfx-orden-ok'); setTimeout(() => it.classList.remove('cfx-orden-ok'), 600); }
  };
  d.addEventListener('pointerup', soltar, true); d.addEventListener('pointercancel', soltar, true);
  // Pista una vez: cómo se ordena (usa las pistas de la barra si están).
  setInterval(() => {
    if (!window.CodeFixBarra || !CodeFixBarra.pista || window.CFX_SIN_PISTAS || window.CFX_SIN_HOLA) return;
    const l = [...d.querySelectorAll('[data-cfx-orden]')].find((x) => items(x).length > 2 && x.getClientRects().length && x.getBoundingClientRect().top < innerHeight - 120 && x.getBoundingClientRect().bottom > 80);
    if (l) CodeFixBarra.pista('ordenar', l, 'Mantén presionado para ordenar', 'arriba');
  }, 4000);

  window.CFX_ORDEN = {
    lista(el, clave, todo) { if (!el) return; el.dataset.cfxOrden = clave; if (todo) el.dataset.cfxOrdenTodo = '1'; el._cfxOrd = ''; preparar(el); },
    borrar(clave) { try { localStorage.removeItem(llave(clave)); } catch (e) { /* nada */ } },
    // G113 d: leer/guardar un dato propio de la persona con la misma llave (orden de las páginas del Más, nombres editados).
    leer(clave) { try { return JSON.parse(localStorage.getItem(llave(clave)) || 'null'); } catch (e) { return null; } },
    guardar(clave, v) { try { localStorage.setItem(llave(clave), JSON.stringify(v)); } catch (e) { /* lleno */ } }
  };
  window.CFX_SUBIR = { revisar };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => { revisarListas(); fijar(); }); else { revisarListas(); fijar(); }
})();

/* G52b 💬 Avisos propios en vez de los de Chrome (confirm / prompt / alert): misma tarjeta, colores y letra de la app; solo cambia el texto.
   API (todas devuelven una promesa):  CFX_DIALOGO.confirmar(texto, { si, no, peligro }) → true/false
        CFX_DIALOGO.pedir(texto, valor, { tipo, si }) → texto escrito o null       CFX_DIALOGO.avisar(texto) → al cerrar
   window.alert queda reemplazado (no bloquea). confirm/prompt de Chrome NO se reemplazan solos (son síncronos): usar estas funciones con await. */
(function () {
  'use strict';
  if (window.CFX_DIALOGO) return;
  const d = document;
  const PELIGRO = /eliminar|borrar|quitar|anular|bloquear|vaciar|reemplazar|desconectar|cancelar (este|tu|el) |limpiar/i;
  let css = null;
  function estilo() {
    if (css) return; css = d.createElement('style');
    css.textContent = '.cfx-dlg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:0 0 env(safe-area-inset-bottom);background:rgba(8,12,24,.55);' +
      'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);font-family:var(--cfx-letra,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);animation:cfxDlgF .16s ease both}' +
      '.cfx-dlg-c{box-sizing:border-box;width:100%;max-width:520px;margin:0 auto;padding:18px 16px 16px;border-radius:20px 20px 0 0;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);' +
      'border:1px solid var(--cfx-borde,#dce3ea);border-bottom:0;box-shadow:0 -12px 40px -12px rgba(0,0,0,.45);animation:cfxDlgS .2s cubic-bezier(.2,.8,.2,1) both}' +
      '.cfx-dlg-t{margin:0 0 14px;font-size:16px;line-height:1.4;font-weight:600;white-space:pre-line;overflow-wrap:anywhere}' +
      '.cfx-dlg-i{box-sizing:border-box;width:100%;margin:0 0 14px;padding:12px;border-radius:12px;border:1.5px solid var(--cfx-borde,#dce3ea);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;font-size:16px}' +
      '.cfx-dlg-l{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:6px;max-height:45vh;overflow:auto}' +
      '.cfx-dlg-l li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:14px;background:var(--cfx-campo,#f1f4f7);border:1px solid var(--cfx-borde,#dce3ea);font-size:15px;font-weight:600;overflow-wrap:anywhere}' +
      '.cfx-dlg-l li span{flex:none;font-weight:500;font-size:13px;opacity:.75}' +
      '.cfx-dlg-i:focus{outline:2px solid var(--brand,#2563eb);outline-offset:0}.cfx-dlg-b{display:flex;gap:10px}' +
      '.cfx-dlg-b button{flex:1;min-height:46px;border-radius:14px;border:0;font:inherit;font-weight:700;font-size:15px;cursor:pointer}' +
      '.cfx-dlg-no{background:var(--cfx-campo,#f1f4f7);color:var(--cfx-texto,#111827);border:1px solid var(--cfx-borde,#dce3ea)!important}' +
      '.cfx-dlg-si{background:var(--brand,#2563eb);color:var(--brand-ink,#fff)}.cfx-dlg-si.peligro{background:var(--cfx-rojo,#dc2626);color:#fff}' +
      'dialog.cfx-dlg{border:0;margin:0;width:auto;height:auto;max-width:none;max-height:none;color:inherit;overflow:visible}dialog.cfx-dlg::backdrop{background:transparent}' +
      '@keyframes cfxDlgF{from{opacity:0}}@keyframes cfxDlgS{from{transform:translateY(24px);opacity:.6}}' +
      '@media (min-width:700px){.cfx-dlg{align-items:center}.cfx-dlg-c{border-radius:20px;border-bottom:1px solid var(--cfx-borde,#dce3ea)}}' +
      '@media (prefers-reduced-motion:reduce){.cfx-dlg,.cfx-dlg-c{animation:none}}';
    (d.head || d.documentElement).appendChild(css);
  }
  function abrir(texto, o) {
    estilo();
    return new Promise((fin) => {
      const antes = d.activeElement, v = d.createElement('dialog');  // G55: <dialog> modal → queda ENCIMA de otra ventana abierta (antes quedaba detrás y no se podía tocar)
      v.className = 'cfx-dlg'; v.setAttribute('role', 'presentation');
      const c = d.createElement('div'); c.className = 'cfx-dlg-c'; c.setAttribute('role', o.input ? 'dialog' : 'alertdialog'); c.setAttribute('aria-modal', 'true');
      const t = d.createElement('p'); t.className = 'cfx-dlg-t'; t.id = 'cfxDlgT' + Date.now(); t.textContent = String(texto == null ? '' : texto); c.setAttribute('aria-labelledby', t.id); c.appendChild(t);
      // G113 a: opción lista → cada elemento en su fila con fondo redondeado (texto o { t, d }: nombre + detalle a la derecha)
      if (Array.isArray(o.lista) && o.lista.length) { const ul = d.createElement('ul'); ul.className = 'cfx-dlg-l';
        o.lista.forEach((x) => { const li = d.createElement('li'), n = d.createElement('b'); n.textContent = String(x && typeof x === 'object' ? x.t : x); li.appendChild(n);
          if (x && typeof x === 'object' && x.d != null && x.d !== '') { const s = d.createElement('span'); s.textContent = String(x.d); li.appendChild(s); } ul.appendChild(li); });
        c.appendChild(ul); }
      let inp = null;
      if (o.input) { inp = d.createElement('input'); inp.className = 'cfx-dlg-i'; inp.type = o.tipo || 'text'; inp.value = o.valor == null ? '' : String(o.valor); if (o.tipo === 'number') inp.inputMode = 'decimal'; c.appendChild(inp); }
      const b = d.createElement('div'); b.className = 'cfx-dlg-b';
      const si = d.createElement('button'); si.type = 'button'; si.className = 'cfx-dlg-si' + (o.peligro ? ' peligro' : ''); si.textContent = o.si || 'Aceptar';
      if (o.no !== false) { const no = d.createElement('button'); no.type = 'button'; no.className = 'cfx-dlg-no'; no.textContent = o.no || 'Cancelar'; no.onclick = () => cerrar(o.vacio); b.appendChild(no); }
      b.appendChild(si); c.appendChild(b); v.appendChild(c);
      function cerrar(r) { d.removeEventListener('keydown', tecla, true); try { v.close(); } catch (e) { /* nada */ } v.remove(); try { if (antes && antes.focus) antes.focus({ preventScroll: true }); } catch (e) { /* nada */ } fin(r); }
      function tecla(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(o.vacio); } else if (e.key === 'Enter' && (inp ? d.activeElement === inp : true)) { e.preventDefault(); si.click(); } }
      si.onclick = () => cerrar(inp ? inp.value : o.lleno);
      v.addEventListener('click', (e) => { if (e.target === v) cerrar(o.vacio); });
      d.addEventListener('keydown', tecla, true);
      v.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(o.vacio); });
      d.body.appendChild(v);
      try { v.showModal(); } catch (e) { v.setAttribute('open', ''); }
      setTimeout(() => { if (inp) { inp.focus(); inp.select(); } else si.focus(); }, 30);
    });
  }
  // El botón rojo dice la acción ("Eliminar", "Quitar"…), no "Aceptar".
  const verbo = (t) => { const m = String(t).match(PELIGRO); if (!m) return null; const v = m[0].trim().split(' ')[0].toLowerCase(); return v === 'cancelar' ? 'Sí, cancelar' : v[0].toUpperCase() + v.slice(1); };
  const confirmar = (texto, o = {}) => { const pel = o.peligro != null ? o.peligro : PELIGRO.test(String(texto));
    return abrir(texto, { si: o.si || (pel && verbo(texto)) || undefined, no: o.no || (pel ? 'No' : undefined), peligro: pel, vacio: false, lleno: true, lista: o.lista }); };
  const pedir = (texto, valor, o = {}) => abrir(texto, { input: true, valor, tipo: o.tipo, si: o.si || 'Listo', vacio: null });
  const avisar = (texto, o = {}) => abrir(texto, { si: o.si || 'Entendido', no: false, vacio: undefined, lleno: undefined, lista: o.lista });
  window.CFX_DIALOGO = { confirmar, pedir, avisar };

  // ---------- G113 b · 🗂️ CFX_CAJA: elegir entre muchas opciones (CSS .ca en tema.css) ----------
  // CFX_CAJA.montar(cont, { opciones: [{ id, t, sub?, img?, ico?, color? }], actual, alElegir(id), aviso?, titulo?, extra?(op, editando), pie?(editando), dato? })
  //  img = URL (si no carga → cuadro neutro) · ico = emoji/HTML ya seguro · color = punto de color. Devuelve { pintar, actual() }.
  const escH = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function caja(cont, o) {
    o = o || {}; let abierta = false; const st = { editando: false };
    const ops = () => (typeof o.opciones === 'function' ? o.opciones() : o.opciones) || [];
    const dato = o.dato || 'ca-op';
    const fig = (x) => x.img ? '<img class="ca-img" alt="" src="' + escH(x.img) + '">' : x.color ? '<i class="ca-img ca-punto" style="background:' + escH(x.color) + '"></i>' : x.ico ? '<span class="ca-img" aria-hidden="true">' + x.ico + '</span>' : '';
    function pintar() {
      const L = ops(); const a = L.find((x) => String(x.id) === String(o.actual)) || L[0]; if (!a) { cont.innerHTML = ''; return; }
      o.actual = a.id;
      cont.innerHTML = '<div class="ca' + (abierta ? ' abierta' : '') + '">' +
        '<button type="button" class="ca-btn" data-ca="abrir" aria-expanded="' + abierta + '"' + (o.titulo ? ' aria-label="' + escH(o.titulo + ': ' + a.t) + '"' : '') + '>' + fig(a) +
          '<span class="ca-txt"><b>' + escH(a.t) + '</b><small>' + escH(abierta ? (o.titulo || 'Elige una opción') : (o.aviso || 'Toca para cambiar')) + '</small></span><span class="ca-flecha" aria-hidden="true"></span></button>' +
        (abierta ? '<div class="ca-lista" role="listbox">' + L.map((x) => { const on = String(x.id) === String(a.id); return '<div class="ca-fila' + (on ? ' on' : '') + '">' +
            '<button type="button" class="ca-op" role="option" aria-selected="' + on + '" data-' + dato + '="' + escH(x.id) + '">' + fig(x) +
              '<span class="ca-txt"><b>' + escH(x.t) + '</b>' + (x.sub ? '<small>' + escH(x.sub) + '</small>' : '') + '</span>' + (on ? '<span class="ca-ok" aria-hidden="true">✓</span>' : '') + '</button>' +
            (o.extra ? (o.extra(x, st.editando) || '') : '') + '</div>'; }).join('') + (o.pie ? (o.pie(st.editando) || '') : '') + '</div>' : '') + '</div>';
      const sin = (i) => { const s2 = d.createElement('span'); s2.className = 'ca-img sin'; i.replaceWith(s2); };
      cont.querySelectorAll('img.ca-img').forEach((i) => { if (i.complete && !i.naturalWidth) sin(i); else i.onerror = () => sin(i); });
    }
    const clave = dato.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    cont.onclick = (ev) => {
      const b = ev.target.closest('[data-ca],[data-' + dato + ']');
      if (b && b.dataset.ca === 'abrir') { abierta = !abierta; st.editando = false; return pintar(); }
      if (b && b.dataset[clave] != null) { abierta = false; const id = b.dataset[clave]; if (String(id) === String(o.actual)) return pintar();
        const op = ops().find((x) => String(x.id) === id); o.actual = op ? op.id : id; pintar(); return o.alElegir && o.alElegir(o.actual); }
      if (o.alTocar) o.alTocar(ev, st, pintar);
    };
    pintar();
    return { pintar, actual: () => o.actual, estado: st };
  }
  window.CFX_CAJA = { montar: caja };
  window.alert = (t) => { window.CFX_DIALOGO.avisar(t); };
})();

/* G58 🔔 Avisos modernos (toast) iguales en todas las apps: tarjeta que sobresale (sombra 3D), ícono según el tipo,
   barrita de carga que se va vaciando, al final se difumina y desaparece. Se borra deslizándola hacia el lado o con la ✕
   (la ✕ no se puede tocar mientras el aviso está apareciendo). Mantener el dedo encima pausa la barrita.
   API: CFX_AVISO(texto, { tipo: 'ok'|'error'|'info', ms, accion: { texto, fn } }) → el aviso. Cada app llama a su toast() de siempre
   y este lo dibuja (si el núcleo no cargó, la app usa su aviso viejo). Máximo 3 a la vez. */
(function () {
  'use strict';
  if (window.CFX_AVISO) return;
  const d = document, quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pila = null;
  const ICO = {
    ok: '<path d="M20 6 9 17l-5-5"/>',
    error: '<path d="M12 8v5M12 16.5v.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'
  };
  function estilo() {
    if (pila) return;
    const s = d.createElement('style');
    s.textContent =
      '.cfx-tsts{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483100;width:min(94vw,440px);display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
      '.cfx-tst{--c:var(--brand,var(--marca,#2563eb));position:relative;display:flex;align-items:center;gap:10px;padding:12px 12px 15px 12px;border-radius:16px;overflow:hidden;pointer-events:auto;touch-action:pan-y;' +
      'background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border:1px solid var(--cfx-borde,#dce3ea);' +
      'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 2px 4px rgba(15,23,42,.08),0 14px 34px -10px rgba(15,23,42,.42);' +
      'animation:cfxAvEntra .38s cubic-bezier(.2,.9,.25,1.15) both;transition:transform .25s ease,opacity .25s ease,filter .25s ease}' +
      '.cfx-tst.ok{--c:var(--cfx-ok,#16a34a)}.cfx-tst.error{--c:var(--cfx-mal,#dc2626)}' +
      '.cfx-tst-i{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:11px;color:#fff;background:var(--c);box-shadow:0 6px 14px -6px var(--c)}' +
      '.cfx-tst-i svg{width:19px;height:19px}.cfx-tst-t{flex:1;min-width:0;font-size:14.5px;line-height:1.35;font-weight:600;overflow-wrap:anywhere;white-space:pre-line}' +
      '.cfx-tst-a{flex:none;min-height:34px;padding:0 12px;border-radius:10px;border:0;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c);font:inherit;font-weight:700;font-size:13.5px;cursor:pointer}' +
      '.cfx-tst-x{flex:none;display:grid;place-items:center;width:30px;height:30px;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;border-radius:50%!important;border:0!important;background:transparent!important;color:var(--cfx-texto-2,#5b6472)!important;cursor:pointer;transition:opacity .2s}' +
      '.cfx-tst-x svg{width:16px;height:16px}.cfx-tst.entrando .cfx-tst-x{opacity:.3;pointer-events:none}' +
      '.cfx-tst-b{position:absolute;left:0;right:0;bottom:0;height:4px;background:color-mix(in srgb,var(--c) 14%,transparent)}' +
      '.cfx-tst-b i{display:block;height:100%;width:100%;background:var(--c);border-radius:0 4px 4px 0;transform-origin:left;animation:cfxAvBarra var(--ms,3000ms) linear forwards}' +
      '.cfx-tst.pausa .cfx-tst-b i{animation-play-state:paused}' +
      '.cfx-tst.sale{opacity:0;filter:blur(6px);transform:scale(.96) translateY(-6px);pointer-events:none}' +
      '.cfx-tst.arrastra{transition:none;animation:none}' +
      '@keyframes cfxAvEntra{from{opacity:0;transform:translateY(-18px) scale(.94)}}@keyframes cfxAvBarra{to{transform:scaleX(0)}}' +
      '@media (prefers-reduced-motion:reduce){.cfx-tst{animation:none;transition:opacity .2s}.cfx-tst.sale{filter:none;transform:none}}' +
      '@media print{.cfx-tsts{display:none}}';
    (d.head || d.documentElement).appendChild(s);
    pila = d.createElement('div'); pila.className = 'cfx-tsts'; pila.setAttribute('role', 'status'); pila.setAttribute('aria-live', 'polite');
    d.body.appendChild(pila);
  }
  const tipoDe = (t) => /^\s*(⚠️|❌|⛔|🚫)|\b(error|no se pudo|falló|fall[oó]|inválid|incorrect|sin conexión)/i.test(t) ? 'error' : /^\s*(✅|✔️|🎉|👍)|\b(listo|guardad|enviad|copiad|creado|agregad|actualizad)/i.test(t) ? 'ok' : 'info';
  function aviso(texto, o) {
    o = o || {}; texto = String(texto == null ? '' : texto);
    if (!d.body) return null;
    estilo();
    if (!pila.isConnected) d.body.appendChild(pila);
    const tipo = o.tipo || (o.error ? 'error' : tipoDe(texto));
    const ms = Math.max(1500, +o.ms || (o.accion ? 8000 : tipo === 'error' ? 5000 : 3200));
    // el mismo texto otra vez → no se apila: se reinicia el que ya está
    for (const v of pila.children) if (v._t === texto && !v.classList.contains('sale')) { v._reiniciar(); return v; }
    while (pila.children.length >= 3) pila.firstElementChild._cerrar(true);
    const v = d.createElement('div'); v.className = 'cfx-tst entrando ' + tipo; v._t = texto; v.style.setProperty('--ms', ms + 'ms');
    if (tipo === 'error') v.setAttribute('role', 'alert');
    v.innerHTML = '<span class="cfx-tst-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[tipo] + '</svg></span>' +
      '<span class="cfx-tst-t"></span><button type="button" class="cfx-tst-x no-ico" aria-label="Cerrar aviso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<span class="cfx-tst-b" aria-hidden="true"><i></i></span>';
    v.querySelector('.cfx-tst-t').textContent = texto.replace(/^\s*(✅|✔️|❌|⚠️|⛔|🚫|ℹ️)\uFE0F?\s*/u, '');  // el ícono de la izquierda ya lo dice
    if (o.accion && o.accion.texto) {
      const a = d.createElement('button'); a.type = 'button'; a.className = 'cfx-tst-a no-ico'; a.textContent = o.accion.texto;
      a.onclick = () => { try { o.accion.fn && o.accion.fn(); } finally { cerrar(); } };
      v.insertBefore(a, v.querySelector('.cfx-tst-x'));
    }
    let fin = null, resta = ms, desde = 0, ido = false;
    const correr = () => { clearTimeout(fin); desde = Date.now(); fin = setTimeout(cerrar, resta); };
    const pausar = () => { if (ido || v.classList.contains('pausa')) return; clearTimeout(fin); resta = Math.max(400, resta - (Date.now() - desde)); v.classList.add('pausa'); };
    const seguir = () => { if (ido || !v.classList.contains('pausa')) return; v.classList.remove('pausa'); correr(); };
    function cerrar(ya) {
      if (ido) { if (ya) v.remove(); return; }  // 🐞 barrido: el 4.º aviso con el más viejo ya saliendo colgaba la página (while sin fin)
      ido = true; clearTimeout(fin); v.classList.add('sale');
      if (ya || quieto()) v.remove(); else setTimeout(() => v.remove(), 260);
    }
    v._cerrar = cerrar;
    v._reiniciar = () => { resta = ms; const b = v.querySelector('.cfx-tst-b i'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; v.classList.remove('pausa'); correr(); };
    v.querySelector('.cfx-tst-x').onclick = () => cerrar();
    setTimeout(() => v.classList.remove('entrando'), quieto() ? 0 : 420);
    // deslizar hacia el lado para borrar
    let x0 = null, y0 = 0, dx = 0, lado = false;
    v.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; lado = false; pausar(); });
    v.addEventListener('pointermove', (e) => {
      if (x0 == null) return; dx = e.clientX - x0;
      if (!lado && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - y0)) { lado = true; v.classList.add('arrastra'); try { v.setPointerCapture(e.pointerId); } catch (er) { /* nada */ } }
      if (lado) { v.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 40) + 'deg)'; v.style.opacity = String(Math.max(.15, 1 - Math.abs(dx) / 260)); }
    });
    const soltar = () => {
      if (x0 == null) return; x0 = null; v.classList.remove('arrastra');
      if (lado && Math.abs(dx) > 90) { ido = true; clearTimeout(fin); v.style.transition = 'transform .2s ease,opacity .2s ease'; v.style.transform = 'translateX(' + (dx > 0 ? 120 : -120) + '%)'; v.style.opacity = '0'; setTimeout(() => v.remove(), 210); return; }
      v.style.transform = ''; v.style.opacity = ''; seguir();
    };
    v.addEventListener('pointerup', soltar); v.addEventListener('pointercancel', soltar); v.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') soltar(); });
    pila.appendChild(v); correr();
    return v;
  }
  window.CFX_AVISO = aviso;
})();

/* G81 c 📅📋 Calendario, hora y listas PROPIOS (no los de Android/Chrome): mismo tema claro/oscuro y colores de la app.
   Reemplaza al tocar: <input type=date|time|datetime-local> y <select> (de una opción). Se abre una hoja desde abajo (al centro en PC).
   Elegir → pone el valor y avisa input/change como el nativo (el código de cada app no cambia). Respeta min, max, required y disabled.
   Teclado: sigue el nativo (Tab + flechas o escribir). Para dejar el nativo: class="cfx-nativo" o data-nativo. API: CFX_ELEGIR.abrir(el). */
(function () {
  'use strict';
  if (window.CFX_ELEGIR) return;
  const d = document;
  const TIPOS = { date: 1, time: 1, 'datetime-local': 1 };
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = d.createElement('style');
  css.textContent =
    'dialog.cfx-el{border:0;padding:0;margin:auto auto 0;width:100%;max-width:440px;max-height:88vh;background:transparent;color:inherit;overflow:visible}dialog.cfx-el::backdrop{background:rgba(15,23,42,.5)}' +
    '@media(min-width:600px){dialog.cfx-el{margin:auto}}.cfx-el *{box-sizing:border-box}' +
    '.cfx-el>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border-radius:22px 22px 0 0;padding:10px 14px calc(14px + env(safe-area-inset-bottom));font-family:var(--cfx-letra,system-ui,sans-serif);' +
    'max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -10px 40px -10px rgba(15,23,42,.35);animation:cfxElSube .22s cubic-bezier(.2,.9,.3,1)}@media(min-width:600px){.cfx-el>div{border-radius:22px}}' +
    '@keyframes cfxElSube{from{transform:translateY(30px);opacity:.4}}@media(prefers-reduced-motion:reduce){.cfx-el>div{animation:none}}' +
    '.cfx-el-asa{width:42px;height:5px;border-radius:9px;background:var(--cfx-borde,#d0d5dd);margin:0 auto 8px}' +
    '.cfx-el-cab{display:flex;align-items:center;gap:8px;margin:0 0 8px}.cfx-el-cab b{flex:1;min-width:0;font-size:17px;overflow-wrap:anywhere}' +
    '.cfx-el button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.cfx-el-x,.cfx-el-nav{flex:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--cfx-borde,#d0d5dd);background:transparent;display:grid;place-items:center;font-size:18px;line-height:1;padding:0}' +
    '.cfx-el-x:focus-visible,.cfx-el-nav:focus-visible,.cfx-el-d:focus-visible,.cfx-el-op:focus-visible,.cfx-el-ch:focus-visible{outline:2px solid var(--brand,var(--marca,#2563eb));outline-offset:2px}' +
    '.cfx-el-sem{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center;font-size:12px;font-weight:700;opacity:.6;margin:4px 0}' +
    '.cfx-el-dias{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}' +
    '.cfx-el-d{aspect-ratio:1;min-height:38px;border-radius:50%;border:0;background:transparent;font-size:15px;font-weight:600;padding:0}' +
    '.cfx-el-d:hover:not(:disabled){background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 12%,transparent)}' +
    '.cfx-el-d.hoy{box-shadow:inset 0 0 0 2px var(--brand,var(--marca,#2563eb))}.cfx-el-d.on{background:var(--brand,var(--marca,#2563eb))!important;color:var(--cfx-mas-ink,#fff)}' +
    '.cfx-el-d:disabled{opacity:.28;cursor:default}.cfx-el-d.fuera{visibility:hidden}' +
    '.cfx-el-pie{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.cfx-el-pie button{min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#d0d5dd);background:transparent;font-weight:700}' +
    '.cfx-el-pie button.si{background:var(--brand,var(--marca,#2563eb));border-color:transparent;color:var(--cfx-mas-ink,#fff)}.cfx-el-pie button:only-child{grid-column:1/-1}' +
    '.cfx-el-lista{overflow:auto;margin:0 -14px;padding:0 14px;overscroll-behavior:contain}' +
    '.cfx-el-op{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:10px 12px;border:0;border-radius:12px;background:transparent;text-align:left;font-size:16px}' +
    '.cfx-el-op span{flex:1;min-width:0;overflow-wrap:anywhere}.cfx-el-op:hover:not(:disabled){background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 10%,transparent)}' +
    '.cfx-el-op.on{color:var(--brand,var(--marca,#2563eb));font-weight:700;background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 10%,transparent)}.cfx-el-op:disabled{opacity:.4}' +
    '.cfx-el-op svg{flex:none;width:20px;height:20px}.cfx-el-g{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.6;margin:10px 12px 2px}' +
    '.cfx-el-bus{width:100%;min-height:44px;margin:0 0 8px;padding:8px 12px;border-radius:12px;border:1px solid var(--cfx-borde,#d0d5dd);background:var(--cfx-campo,transparent);color:inherit;font:inherit}' +
    '.cfx-el-hr{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.cfx-el-mi{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}' +
    '.cfx-el-ch{min-height:40px;border-radius:10px;border:1px solid var(--cfx-borde,#d0d5dd);background:transparent;font-weight:700;font-variant-numeric:tabular-nums;padding:0}' +
    '.cfx-el-ch.on{background:var(--brand,var(--marca,#2563eb));border-color:transparent;color:var(--cfx-mas-ink,#fff)}.cfx-el-ch:disabled{opacity:.3}' +
    '.cfx-el-sub{font-size:13px;font-weight:700;opacity:.7;margin:8px 0 6px}.cfx-el-vacio{opacity:.6;padding:12px;text-align:center}';
  (d.head || d.documentElement).appendChild(css);

  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (y, m, dd) => y + '-' + p2(m + 1) + '-' + p2(dd);
  const hoyIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
  const OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ojo = (el) => !el.disabled && !el.readOnly && !el.matches('.cfx-nativo, [data-nativo], .cfx-nativo *, [data-nativo] *');
  const sirve = (el) => el && el.isConnected && ojo(el) && ((el.tagName === 'SELECT' && !el.multiple && !(el.size > 1)) || (el.tagName === 'INPUT' && TIPOS[el.type]));
  // Título de la hoja: la etiqueta del campo (sin el texto del propio campo).
  function titulo(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const l = el.labels && el.labels[0];
    if (l) { const c = l.cloneNode(true); c.querySelectorAll('select, input, textarea, .ic-e, small, .sub').forEach((x) => x.remove()); const t = c.textContent.replace(/\s+/g, ' ').trim(); if (t) return t; }
    return el.title || el.placeholder || (el.tagName === 'SELECT' ? 'Elige una opción' : el.type === 'time' ? 'Elige la hora' : 'Elige la fecha');
  }
  function poner(el, v) {
    if (el.value === v) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  let abierta = null;
  function hoja(tit, html) {
    if (abierta) abierta.close();
    const g = d.createElement('dialog'); g.className = 'cfx-el';
    g.innerHTML = '<div role="document"><div class="cfx-el-asa"></div><div class="cfx-el-cab"><b>' + esc(tit) + '</b><button type="button" class="cfx-el-x" data-x aria-label="Cerrar">✕</button></div>' + html + '</div>';
    (d.body || d.documentElement).appendChild(g);
    g.addEventListener('click', (ev) => { if (ev.target === g || ev.target.closest('[data-x]')) g.close(); });
    g.addEventListener('close', () => { g.remove(); if (abierta === g) abierta = null; });
    g.showModal(); abierta = g;
    return g;
  }
  // ---------- 📋 Lista ----------
  function lista(el) {
    const ops = []; let n = 0;
    for (const h of el.children) {
      if (h.tagName === 'OPTGROUP') { ops.push({ g: h.label }); for (const o of h.children) if (!o.hidden) { ops.push({ o }); n++; } }
      else if (h.tagName === 'OPTION' && !h.hidden) { ops.push({ o: h }); n++; }
    }
    const fila = (x, i) => x.g != null ? '<p class="cfx-el-g">' + esc(x.g) + '</p>'
      : '<button type="button" class="cfx-el-op' + (x.o.selected ? ' on' : '') + '" data-i="' + i + '"' + (x.o.disabled ? ' disabled' : '') + '><span>' + esc(x.o.textContent.trim() || '—') + '</span>' + (x.o.selected ? OK : '') + '</button>';
    const g = hoja(titulo(el), (n > 12 ? '<input class="cfx-el-bus cfx-nativo" type="search" placeholder="Buscar…" aria-label="Buscar" autocomplete="off">' : '') +
      '<div class="cfx-el-lista" role="listbox">' + ops.map(fila).join('') + '</div>');
    const caja = g.querySelector('.cfx-el-lista');
    caja.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; const o = ops[+b.dataset.i].o; g.close(); poner(el, o.value); });
    const bus = g.querySelector('.cfx-el-bus');
    if (bus) bus.addEventListener('input', () => {
      const q = bus.value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
      caja.querySelectorAll('[data-i]').forEach((b) => { b.hidden = !!q && !b.textContent.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(q); });
      caja.querySelectorAll('.cfx-el-g').forEach((t) => { let s = t.nextElementSibling, v = false; while (s && !s.matches('.cfx-el-g')) { if (!s.hidden) v = true; s = s.nextElementSibling; } t.hidden = !v; });
    });
    const on = caja.querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' });
    (on || caja.querySelector('[data-i]:not(:disabled)') || g.querySelector('[data-x]')).focus({ preventScroll: true });
  }
  // ---------- 📅 Calendario (y 🕐 hora) ----------
  function fecha(el) {
    const tipo = el.type, conHora = tipo === 'datetime-local';
    const val = el.value || '', fv = conHora ? val.slice(0, 10) : val, hv = conHora ? val.slice(11, 16) : '';
    const mn = (el.min || '').slice(0, 10), mx = (el.max || '').slice(0, 10), hoy = hoyIso();
    let y, m; { const b = fv || (mn && hoy < mn ? mn : mx && hoy > mx ? mx : hoy); y = +b.slice(0, 4); m = +b.slice(5, 7) - 1; }
    const g = hoja(titulo(el), '<div class="cfx-el-cab"><button type="button" class="cfx-el-nav" data-nav="-1" aria-label="Mes anterior">‹</button><b data-mes style="text-align:center"></b>' +
      '<button type="button" class="cfx-el-nav" data-nav="1" aria-label="Mes siguiente">›</button></div><div class="cfx-el-sem">' + ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((x) => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="cfx-el-dias" role="grid"></div><div class="cfx-el-pie">' + (!el.required && val ? '<button type="button" data-borrar>Borrar</button>' : '') +
      ((!mn || hoy >= mn) && (!mx || hoy <= mx) ? '<button type="button" class="si" data-hoy>Hoy</button>' : '') + '</div>');
    const dias = g.querySelector('.cfx-el-dias');
    const pintar = () => {
      g.querySelector('[data-mes]').textContent = MES[m] + ' ' + y;
      const ini = (new Date(y, m, 1).getDay() + 6) % 7, tot = new Date(y, m + 1, 0).getDate();
      let h = ''; for (let i = 0; i < ini; i++) h += '<button type="button" class="cfx-el-d fuera" tabindex="-1" disabled></button>';
      for (let k = 1; k <= tot; k++) { const f = iso(y, m, k), off = (mn && f < mn) || (mx && f > mx);
        h += '<button type="button" class="cfx-el-d' + (f === hoy ? ' hoy' : '') + (f === fv ? ' on' : '') + '" data-f="' + f + '"' + (off ? ' disabled' : '') + ' aria-label="' + k + ' de ' + MES[m] + '">' + k + '</button>'; }
      dias.innerHTML = h;
      const p = g.querySelector('[data-nav="-1"]'), s = g.querySelector('[data-nav="1"]');
      p.disabled = !!mn && iso(y, m, 1) <= mn; s.disabled = !!mx && iso(y, m, tot) >= mx;
    };
    const elegir = (f) => { g.close(); if (conHora) hora(el, f, hv); else poner(el, f); };
    g.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-nav],[data-f],[data-hoy],[data-borrar]'); if (!b || b.disabled) return;
      if (b.dataset.nav) { m += +b.dataset.nav; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } pintar(); }
      else if (b.dataset.f) elegir(b.dataset.f);
      else if (b.hasAttribute('data-hoy')) elegir(hoy);
      else { g.close(); poner(el, ''); }
    });
    // Deslizar a los lados cambia de mes.
    let x0 = null; dias.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    dias.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) { const b = g.querySelector('[data-nav="' + (dx < 0 ? 1 : -1) + '"]'); if (!b.disabled) b.click(); } });
    pintar();
    (dias.querySelector('.on') || dias.querySelector('.hoy:not(:disabled)') || g.querySelector('[data-x]')).focus({ preventScroll: true });
  }
  function hora(el, dia, hv) {
    const conDia = el.type === 'datetime-local', v = hv || (conDia ? '' : el.value.slice(0, 5));
    let hh = v ? +v.slice(0, 2) : null, mi = v ? +v.slice(3, 5) : null;
    const mn = conDia ? (el.min && el.min.slice(0, 10) === dia ? el.min.slice(11, 16) : '') : (el.min || '').slice(0, 5);
    const mx = conDia ? (el.max && el.max.slice(0, 10) === dia ? el.max.slice(11, 16) : '') : (el.max || '').slice(0, 5);
    const paso = Math.max(1, Math.round((+el.step || 300) / 60)), mins = [];
    for (let k = 0; k < 60; k += (paso >= 5 && 60 % paso === 0 ? paso : 5)) mins.push(k);
    if (mi != null && !mins.includes(mi)) { mins.push(mi); mins.sort((a, b) => a - b); }
    const t = conDia ? dia.split('-').reverse().join('/') + ' · ' + titulo(el) : titulo(el);
    const g = hoja(t, '<div class="cfx-el-lista"><p class="cfx-el-sub">Hora</p><div class="cfx-el-hr"></div><p class="cfx-el-sub">Minutos</p><div class="cfx-el-mi"></div></div>' +
      '<div class="cfx-el-pie">' + (!el.required && el.value ? '<button type="button" data-borrar>Borrar</button>' : '') + '<button type="button" class="si" data-listo>Listo</button></div>');
    const fuera = (h, m2) => { const s = p2(h) + ':' + p2(m2); return (mn && s < mn) || (mx && s > mx); };
    const pintar = () => {
      let a = ''; for (let k = 0; k < 24; k++) { const off = fuera(k, 59) && fuera(k, 0); a += '<button type="button" class="cfx-el-ch' + (k === hh ? ' on' : '') + '" data-h="' + k + '"' + (off ? ' disabled' : '') + '>' + p2(k) + '</button>'; }
      g.querySelector('.cfx-el-hr').innerHTML = a;
      g.querySelector('.cfx-el-mi').innerHTML = mins.map((k) => '<button type="button" class="cfx-el-ch' + (k === mi ? ' on' : '') + '" data-m="' + k + '"' + (hh != null && fuera(hh, k) ? ' disabled' : '') + '>' + p2(k) + '</button>').join('');
      g.querySelector('[data-listo]').disabled = hh == null;
    };
    const listo = () => { if (hh == null) return; if (mi == null || fuera(hh, mi)) mi = mins.find((k) => !fuera(hh, k)) ?? 0; g.close(); poner(el, (conDia ? dia + 'T' : '') + p2(hh) + ':' + p2(mi)); };
    g.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-h],[data-m],[data-listo],[data-borrar]'); if (!b || b.disabled) return;
      if (b.dataset.h) { hh = +b.dataset.h; if (mi != null && fuera(hh, mi)) mi = null; pintar(); }
      else if (b.dataset.m) { mi = +b.dataset.m; if (hh != null) listo(); else pintar(); }
      else if (b.hasAttribute('data-listo')) listo();
      else { g.close(); poner(el, ''); }
    });
    pintar();
    const on = g.querySelector('.cfx-el-hr .on') || g.querySelector('[data-h="' + (new Date().getHours()) + '"]');
    if (on) on.scrollIntoView({ block: 'center' });
  }
  function abrir(el) {
    if (!sirve(el)) return false;
    if (el.tagName === 'SELECT') lista(el); else if (el.type === 'time') hora(el, '', ''); else fecha(el);
    return true;
  }
  // Tocar (dedo o mouse) abre la hoja propia y frena la del sistema. El teclado sigue con el nativo.
  const objetivo = (ev) => { const el = ev.target && ev.target.closest && ev.target.closest('select, input'); return sirve(el) ? el : null; };
  let porToque = 0;
  d.addEventListener('mousedown', (ev) => { if (ev.button === 0 && objetivo(ev)) ev.preventDefault(); }, true);
  // Solo un TOQUE abre: si el dedo se movió (deslizar la pantalla), no se abre nada.
  let t0 = null;
  d.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; t0 = ev.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  d.addEventListener('touchmove', (ev) => { const t = ev.touches[0]; if (t0 && t && Math.hypot(t.clientX - t0.x, t.clientY - t0.y) > 10) t0 = null; }, { capture: true, passive: true });
  d.addEventListener('touchcancel', () => { t0 = null; }, { capture: true, passive: true });
  d.addEventListener('touchend', (ev) => {
    const el = objetivo(ev); if (!el) return;
    const t = ev.changedTouches[0], toque = t0 && t && Math.hypot(t.clientX - t0.x, t.clientY - t0.y) <= 10; t0 = null;
    porToque = Date.now(); if (!toque) return;  // deslizó: el click que pudiera venir tampoco abre
    ev.preventDefault(); abrir(el);
  }, { capture: true, passive: false });
  d.addEventListener('click', (ev) => {
    const el = objetivo(ev); if (!el) return;
    ev.preventDefault(); if (Date.now() - porToque < 600) return;
    if (ev.detail === 0 && el.tagName === 'SELECT') return;  // click "falso" del teclado
    abrir(el);
  }, true);
  // Si la app pide el selector por código (input.showPicker()), también sale el propio.
  try {
    const orig = HTMLInputElement.prototype.showPicker;
    if (orig) HTMLInputElement.prototype.showPicker = function () { if (!abrir(this)) return orig.call(this); };
    const os = HTMLSelectElement.prototype.showPicker;
    if (os) HTMLSelectElement.prototype.showPicker = function () { if (!abrir(this)) return os.call(this); };
  } catch (e) { /* navegador antiguo */ }
  window.CFX_ELEGIR = { abrir };
})();
