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
    borrar(clave) { try { localStorage.removeItem(llave(clave)); } catch (e) { /* nada */ } }
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
    return abrir(texto, { si: o.si || (pel && verbo(texto)) || undefined, no: o.no || (pel ? 'No' : undefined), peligro: pel, vacio: false, lleno: true }); };
  const pedir = (texto, valor, o = {}) => abrir(texto, { input: true, valor, tipo: o.tipo, si: o.si || 'Listo', vacio: null });
  const avisar = (texto, o = {}) => abrir(texto, { si: o.si || 'Entendido', no: false, vacio: undefined, lleno: undefined });
  window.CFX_DIALOGO = { confirmar, pedir, avisar };
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
      if (ido) return; ido = true; clearTimeout(fin); v.classList.add('sale');
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
