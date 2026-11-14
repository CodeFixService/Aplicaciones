/* CodeFix · Núcleo · Detalles de pantalla iguales en todas las apps (mismo archivo en cada repositorio; Cerebro no lo usa).
   G42a ⬆️ Subir: al pasar el 30% de lo que se puede bajar (página o ventana) aparece un botón redondo; toca → sube suave.
   G42k 📌 Títulos fijos: en una tarjeta larga su título (h2 primero) queda pegado bajo la cabecera y solo se mueve lo de adentro;
        la tarjeta siguiente trae su título y reemplaza al anterior. También los títulos de grupo de los menús (.cfx-aj-g).
        1 línea con … y fondo opaco (el mismo de la tarjeta). Las tarjetas que se apilan (.cfx-pila) no se tocan.
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
    '.cfx-fijo{position:sticky!important;top:var(--cfx-fijo-top,0px);z-index:3;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;' +
    'margin-left:calc(-1 * var(--cfx-fijo-px,0px))!important;margin-right:calc(-1 * var(--cfx-fijo-px,0px))!important;padding-left:var(--cfx-fijo-px,0px)!important;padding-right:var(--cfx-fijo-px,0px)!important;padding-top:8px!important;padding-bottom:8px!important}' +
    '.cfx-fijo:is(h2):not(.cfx-tit-rep){display:block!important}.cfx-fijo.cfx-pegado{background:var(--cfx-fijo-bg,var(--cfx-tarjeta,#fff))!important;box-shadow:0 6px 10px -8px rgba(15,23,42,.25)}' +
    '[data-cfx-orden]>*{-webkit-touch-callout:none}.cfx-arrastra{position:relative;z-index:20!important;transition:none!important;box-shadow:0 16px 36px -10px rgba(15,23,42,.45)!important;scale:1.02;opacity:.97;' +
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
      const b = d.querySelector('nav.cfx-barra');
      const r = b && b.getClientRects().length ? b.getBoundingClientRect() : null;
      raiz.style.setProperty('--cfx-subir-b', (r && !caja && r.top < innerHeight ? Math.round(innerHeight - r.top + 12) : 20) + 'px');
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

  // ---------- 📌 Títulos fijos ----------
  const opaco = (el) => {
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) {
      const c = getComputedStyle(x).backgroundColor, m = /rgba?\(([^)]+)\)/.exec(c);
      if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean); if (p.length < 4 || parseFloat(p[3]) >= 0.95) return c; }
    }
    return '';
  };
  const cabecera = () => {
    const h = [...d.querySelectorAll('header')].find((x) => { const s = getComputedStyle(x); return (s.position === 'fixed' || s.position === 'sticky') && x.getClientRects().length && x.getBoundingClientRect().top <= 1; });
    return h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0;
  };
  const TIT = '.card > h2:first-child, .tarjeta > h2:first-child, .cfx-aj-sec > .cfx-aj-g';
  function fijar() {
    const top = cabecera();
    d.querySelectorAll(TIT).forEach((h) => {
      const c = h.parentElement;
      if (h.classList.contains('cfx-tit-rep') || c.classList.contains('cfx-pila') || c.closest('.cfx-pila, dialog, [data-sin-fijo]') || !c.getClientRects().length) return;
      const sec = c.classList.contains('cfx-aj-sec');
      // Solo vale la pena si lo de adentro es más largo que la pantalla (si no, el título ya se ve entero).
      const zona = h.closest('.cfx-hm-zona'), vista = zona ? zona.clientHeight : innerHeight;
      if (!sec && c.offsetHeight < vista * 0.8) { if (h.classList.contains('cfx-fijo') && c.offsetHeight < vista * 0.6) h.classList.remove('cfx-fijo'); return; }
      const cs = getComputedStyle(c);
      if (!/visible|clip/.test(cs.overflowY) && !sec) return;  // con overflow:hidden el título no puede quedar pegado
      h.classList.add('cfx-fijo');
      h.style.setProperty('--cfx-fijo-top', (zona ? -parseFloat(getComputedStyle(zona).paddingTop) || 0 : top) + 'px');
      h.style.setProperty('--cfx-fijo-px', sec ? '6px' : (parseFloat(cs.paddingLeft) || 0) + 'px');
      const bg = opaco(sec ? (zona || c.parentElement) : c); if (bg) h.style.setProperty('--cfx-fijo-bg', bg);
    });
    pegados();
  }
  // Fondo opaco solo mientras está pegado (sin franja cuando está en su lugar).
  function pegados() {
    d.querySelectorAll('.cfx-fijo').forEach((h) => {
      const r = h.getBoundingClientRect(), t = parseFloat(getComputedStyle(h).top) || 0, z = h.closest('.cfx-hm-zona');
      const ref = z ? z.getBoundingClientRect().top + t + (parseFloat(getComputedStyle(z).paddingTop) || 0) : t;
      h.classList.toggle('cfx-pegado', r.height > 0 && Math.abs(r.top - ref) < 1.5 && (z ? z.scrollTop > 0 : scrollY > 0));
    });
  }
  let tFijo = 0;
  const pedir = () => { clearTimeout(tFijo); tFijo = setTimeout(fijar, 300); };
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
    if (arm && Math.hypot(e.clientX - arm.x, e.clientY - arm.y) > 8) cancelarArm();
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
  d.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); else cancelarArm(); }, { passive: false, capture: true });
  d.addEventListener('contextmenu', (e) => { if (arm || drag) e.preventDefault(); }, true);
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
    borrar(clave) { try { localStorage.removeItem(llave(clave)); } catch (e) { /* nada */ } }
  };
  window.CFX_SUBIR = { revisar };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => { revisarListas(); fijar(); }); else { revisarListas(); fijar(); }
})();
