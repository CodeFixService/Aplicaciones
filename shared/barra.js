/* CodeFix · Núcleo · Barra de abajo igual en todas las apps (mismo archivo en cada repositorio).
   No cambia lo que hace cada botón: toma los botones que la app ya tiene y los ordena así:
     [ principal 1 ] [ principal 2 ] [  +  ] [ principal 3 ] [ Más ]
   El + va grande y con color al centro; "Más" queda abajo a la derecha (el pulgar llega fácil).
   Los botones que sobran pasan a una hoja "Más" (con un toque se abren igual que antes).
   Cada página puede indicar el orden y qué hace el + con:
     window.CFX_BARRA = { orden: ['inicio', 'caja', '+', 'clientes', 'mas'], mas: 'mas',
                          nuevo: { texto: 'Nuevo', ir: 'agenda', click: '#bNueva' | foco: '#formulario' } }
   o usar como + un botón que ya existe:  plus: 'agendar'.
   Sin configuración, detecta solo el + (clase mas-grande, nav-mas o nuevo) y el botón "Más". */
(function () {
  'use strict';
  if (window.CodeFixBarra) return;
  const ICO = {
    mas: '<path d="M12 5v14M5 12h14"/>',
    menu: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>'
  };
  const svg = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[n] + '</svg>';
  const clave = (b) => b.dataset.v || b.dataset.r || b.dataset.k || b.dataset.tab || (b.getAttribute('href') || '').replace(/^#\/?/, '') || '';
  const NAVS = 'nav.nav, nav.tabs:not(.sub), nav#nav';

  function buscarNav() {
    return Array.from(document.querySelectorAll(NAVS)).find((n) => getComputedStyle(n).position === 'fixed' && n.children.length >= 3) || null;
  }
  function hoja(items) {
    const v = document.createElement('div');
    v.className = 'cfx-mv';
    v.innerHTML = '<div class="cfx-mh" role="dialog" aria-label="Más opciones"><div class="cfx-mh-asa"></div><div class="cfx-mh-grid"></div></div>';
    const g = v.querySelector('.cfx-mh-grid');
    items.forEach((b) => {
      const o = document.createElement('button');
      o.type = 'button'; o.className = 'cfx-mh-op';
      o.innerHTML = b.innerHTML;
      o.onclick = () => { cerrar(); b.click(); };
      g.appendChild(o);
    });
    const cerrar = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 180); };
    v.onclick = (e) => { if (e.target === v) cerrar(); };
    document.body.appendChild(v);
    requestAnimationFrame(() => v.classList.add('on'));
  }

  function montar(cfg) {
    cfg = Object.assign({}, window.CFX_BARRA || {}, cfg || {});
    const nav = cfg.nav ? document.querySelector(cfg.nav) : buscarNav();
    if (!nav || nav.dataset.cfx === '1') return;
    nav.dataset.cfx = '1';
    nav.classList.add('cfx-barra');
    document.body.classList.add('cfx-con-barra');
    let botones = Array.from(nav.children).filter((b) => /^(A|BUTTON)$/.test(b.tagName));
    // El + : el que la app ya marca como principal, o uno nuevo con la acción indicada.
    let mas = (cfg.plus && botones.find((b) => clave(b) === cfg.plus)) || botones.find((b) => b.matches('.mas-grande, .nav-mas, .nuevo, [data-cfx-nuevo]'));
    if (!mas && cfg.nuevo) {
      mas = document.createElement('button');
      mas.type = 'button';
      mas.dataset.k = '+';
      mas.innerHTML = '<span class="i"></span>' + (cfg.nuevo.texto || 'Nuevo');
      // addEventListener + stopImmediatePropagation: aunque la app después le asigne su propio onclick a todos los botones de la barra, manda este.
      mas.addEventListener('click', (e) => {
        e.stopImmediatePropagation(); e.preventDefault();
        const n = cfg.nuevo;
        if (typeof n.accion === 'function') return n.accion();
        const ir = n.ir ? document.querySelector('[data-v="' + n.ir + '"],[data-r="' + n.ir + '"]') : null;
        if (ir) ir.click(); else if (n.ir) location.hash = n.ir;
        if (n.click) setTimeout(() => { const c = document.querySelector(n.click); if (c) c.click(); }, 350);
        // "foco": lleva al formulario de crear (lo abre si está plegado) y deja el cursor en el primer campo.
        if (n.foco) setTimeout(() => { const c = document.querySelector(n.foco); if (!c) return; const dt = c.closest('details'); if (dt) dt.open = true; const caja = c.closest('details, .card, form') || c; caja.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = caja.querySelector('input, select, textarea'); if (i) setTimeout(() => i.focus(), 400); }, 350);
      });
      nav.appendChild(mas);
      botones.push(mas);
    }
    if (mas) {
      mas.classList.add('cfx-mas');
      const i = mas.querySelector('.ico, .i, .cfx-ico, span:not(.badge):not(.punto)');
      if (i) { i.innerHTML = svg('mas'); i.classList.add('cfx-ico'); }
      else { const sv = mas.querySelector(':scope > svg'); if (sv) sv.remove(); mas.insertAdjacentHTML('afterbegin', '<span class="cfx-ico">' + svg('mas') + '</span>'); }
      if (!mas.getAttribute('aria-label')) mas.setAttribute('aria-label', (mas.textContent || 'Nuevo').trim());
      // Solo el signo +: se quita el texto suelto y las etiquetas (el nombre queda en aria-label).
      [...mas.childNodes].forEach((n) => { if (n.nodeType === 3 && n.data.trim()) n.remove(); else if (n.nodeType === 1 && n.matches('small, .t, .txt, .label')) n.remove(); });
    }
    // Orden: el indicado, o el de la app con el + al centro y "Más" al final.
    const kMas = cfg.mas || (botones.find((b) => /^(mas|ajustes|perfil|cuenta)$/.test(clave(b)) && b !== mas) ? clave(botones.find((b) => /^(mas|ajustes|perfil|cuenta)$/.test(clave(b)) && b !== mas)) : '');
    let orden = cfg.orden;
    if (!orden) {
      const resto = botones.filter((b) => b !== mas && clave(b) !== kMas).map(clave);
      orden = [resto[0], resto[1], '+', resto[2], kMas || resto[3]].filter((x) => x !== undefined);
    }
    const usados = new Set();
    const porClave = (k) => k === '+' ? mas : botones.find((b) => clave(b) === k && !usados.has(b));
    const fila0 = orden.map(porClave).filter(Boolean);
    fila0.forEach((b) => usados.add(b));
    let L = fila0.filter((b) => b !== mas);                 // principales, en orden
    let extra = botones.filter((b) => !usados.has(b));      // los que no caben
    const bMas = L.find((b) => clave(b) === kMas);
    // Con + al centro siempre quedan 2 a cada lado: si sobran botones, el último lugar es "Más" (con los que sobran y el "Más" propio de la app).
    let menu = false;
    if (mas && (L.length > 4 || (extra.length && L.length >= 4))) {
      const quedan = L.filter((b) => b !== bMas).slice(0, 3);
      extra = L.filter((b) => !quedan.includes(b) && b !== bMas).concat(extra);
      if (bMas) extra.push(bMas);
      L = quedan; menu = true;
    } else if (extra.length) {
      menu = true;
      if (bMas) { L = L.filter((b) => b !== bMas); extra.push(bMas); }
    }
    let m = null;
    if (menu) {
      m = document.createElement('button');
      m.type = 'button'; m.className = 'cfx-menu'; m.innerHTML = '<span class="cfx-ico">' + svg('menu') + '</span>Más';
      const lista = extra;
      m.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); hoja(lista); });
      // El "Más" se ve activo cuando estás en una de sus secciones.
      const marcar = () => { const on = lista.some((b) => b.classList.contains('on') || b.classList.contains('activo')); if (m.classList.contains('on') !== on) m.classList.toggle('on', on); };
      new MutationObserver(marcar).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] }); setTimeout(marcar, 0);
      L.push(m);
    }
    // Fila final: [L0][L1][+][L2][L3]. Con 3 botones queda un espacio vacío para que el + siga al medio.
    let fila = L;
    if (mas) {
      const izq = L.slice(0, Math.min(2, Math.ceil(L.length / 2))), der = L.slice(izq.length);
      if (izq.length === 2 && der.length === 1) { const v = document.createElement('span'); v.className = 'cfx-vacio'; v.setAttribute('aria-hidden', 'true'); der.unshift(v); }
      fila = izq.concat([mas], der);
    }
    fila.forEach((b) => { b.classList.remove('cfx-oculto'); nav.appendChild(b); });
    extra.forEach((b) => { b.classList.add('cfx-oculto'); nav.appendChild(b); });
    nav.style.setProperty('--cfx-n', String(nav.querySelectorAll(':scope > :not(.cfx-oculto)').length));
    document.documentElement.classList.add('cfx-barra-lista');
    verBarra();  // al cargar se ve; se esconde al bajar
  }

  // ---------- Tiras de opciones que se deslizan de lado (pestañas, filtros, chips) ----------
  // Al volver a dibujarse (al tocar una opción) quedan donde estaban: no saltan al inicio ni se centran.
  // Solo se mueven lo justo si la opción elegida quedó fuera de la vista.
  const TIRA = '.seg, .seg2, .tabs:not(nav), .chips, .subtabs, .cfx-tira, .filtros, [class*="tira"]';
  const pos = new Map();
  const firma = (t) => t.className.replace(/\b(on|activo|cfx-\w+)\b/g, '') + '|' + [...t.children].slice(0, 5).map((x) => (x.textContent || '').replace(/[\d\s()]+/g, '')).join('|');
  const activo = (t) => t.querySelector(':scope > .on, :scope > .activo, :scope > [aria-selected="true"], :scope > [aria-current]');
  function mostrarActivo(t) {
    const a = activo(t); if (!a) return;
    const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect();
    if (ra.left < rt.left) t.scrollLeft -= rt.left - ra.left + 12;
    else if (ra.right > rt.right) t.scrollLeft += ra.right - rt.right + 12;
  }
  function tira(t) {
    if (t.dataset.cfxTira) return;
    t.dataset.cfxTira = '1';
    const k = firma(t);
    if (pos.has(k)) t.scrollLeft = pos.get(k);
    mostrarActivo(t);
    pos.set(k, t.scrollLeft);
    t.addEventListener('scroll', () => pos.set(k, t.scrollLeft), { passive: true });
    t.addEventListener('click', () => { pos.set(k, t.scrollLeft); }, true);
  }
  const revisarTiras = (raiz) => { (raiz && raiz.querySelectorAll ? [raiz, ...raiz.querySelectorAll(TIRA)] : document.querySelectorAll(TIRA)).forEach((t) => { if (t.matches && t.matches(TIRA) && t.children.length > 1) tira(t); }); };
  // Las apps que antes centraban la opción elegida usan esto (no mueve la tira si ya se ve).
  window.CodeFixTiras = { ajustar: (raiz) => (raiz || document).querySelectorAll(TIRA).forEach(mostrarActivo) };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => { if (n.nodeType === 1) revisarTiras(n); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') revisarTiras(); else document.addEventListener('DOMContentLoaded', () => revisarTiras());

  // ---------- Listas que se apilan al bajar (celular y tablet) ----------
  // Una lista con 4 o más tarjetas cortas iguales (pedidos, reservas, pagos, días…) se apila: cada tarjeta queda pegada arriba
  // y la siguiente se pone encima, así no hay que bajar tanto. Las tarjetas con formularios o muy altas no se apilan.
  const TARJ = ':scope > .card, :scope > .tarjeta';
  function cabeceraAlto() {
    const h = [...document.querySelectorAll('header')].find((x) => { const st = getComputedStyle(x); return (st.position === 'fixed' || st.position === 'sticky') && x.getBoundingClientRect().top <= 1; });
    document.documentElement.style.setProperty('--cfx-top', (h ? Math.round(h.getBoundingClientRect().bottom) : 0) + 'px');
  }
  // Pantallas que bajan dentro de su propia caja (no la página): también dejan espacio abajo para la barra y el +.
  function espacioAbajo() {
    if (innerWidth >= 900 || !document.body.classList.contains('cfx-con-barra')) return;
    document.querySelectorAll('main, .view, .vista, .pantalla, .contenido, section').forEach((e) => {
      if (e.classList.contains('cfx-pad-barra') || e.closest('dialog, .cfx-hoja-m, .modal, .sheet')) return;
      const s = getComputedStyle(e);
      if (/auto|scroll/.test(s.overflowY) && e.clientHeight > innerHeight * 0.5 && e.getBoundingClientRect().bottom > innerHeight - 90) e.classList.add('cfx-pad-barra');
    });
  }
  function apilar() {
    espacioAbajo();
    if (innerWidth >= 900) return;
    cabeceraAlto();
    const padres = new Set([...document.querySelectorAll('.card, .tarjeta')].map((c) => c.parentElement).filter(Boolean));
    padres.forEach((p) => {
      // Se revisa cada vez: si la lista se volvió a dibujar, las tarjetas nuevas también se apilan (y si ya no sirve, se deshace).
      if (p.closest('dialog, .modal, .sheet, .hoja, .cfx-mv, .cfx-hm-zona, [data-sin-pila]') || (p.parentElement && p.parentElement.closest('.cfx-apilar'))) return;
      if (!p.offsetParent && getComputedStyle(p).position !== 'fixed') return;  // escondida: se revisa cuando se muestre
      const L = [...p.querySelectorAll(TARJ)], alto = innerHeight * 0.42;
      const sirve = L.length >= 4 && getComputedStyle(p).display !== 'grid' &&
        !L.some((c) => c.offsetHeight > alto || c.offsetHeight < 40 || c.querySelector('input, textarea, select')) &&
        !L.some((c, i) => i && c.offsetTop <= L[i - 1].offsetTop);  // una debajo de otra
      if (sirve) { p.classList.add('cfx-apilar'); L.forEach((c, i) => { if (!c.classList.contains('cfx-pila')) { c.classList.add('cfx-pila'); c.style.setProperty('--cfx-i', String(Math.min(i, 4))); } }); }
      else if (p.classList.contains('cfx-apilar')) { p.classList.remove('cfx-apilar'); p.querySelectorAll(':scope > .cfx-pila').forEach((c) => c.classList.remove('cfx-pila')); }
    });
  }
  // La tarjeta que queda abajo se achica y oscurece un poco a medida que la siguiente la tapa.
  function tapar() {
    document.querySelectorAll('.cfx-apilar').forEach((p) => {
      const L = p.querySelectorAll(':scope > .cfx-pila');
      L.forEach((c, i) => {
        const sig = L[i + 1]; if (!sig) { c.style.removeProperty('--cfx-esc'); c.style.removeProperty('--cfx-luz'); return; }
        const r = c.getBoundingClientRect(), rs = sig.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (r.bottom - rs.top) / Math.max(1, r.height)));
        c.style.setProperty('--cfx-esc', String(1 - t * 0.06)); c.style.setProperty('--cfx-luz', String(1 - t * 0.18));
      });
    });
  }
  let tPila = 0, rafPila = 0;
  const pedirPila = () => { clearTimeout(tPila); tPila = setTimeout(apilar, 350); };
  new MutationObserver(pedirPila).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('scroll', () => { if (!rafPila) rafPila = requestAnimationFrame(() => { rafPila = 0; tapar(); }); }, { passive: true, capture: true });
  addEventListener('resize', pedirPila);
  // Las secciones que solo se esconden y se muestran (paneles con pestañas) no agregan nodos: se revisa al cambiar de pantalla.
  addEventListener('hashchange', pedirPila); addEventListener('popstate', pedirPila);
  addEventListener('click', (e) => { if (e.target.closest && e.target.closest('nav, .tabs, .seg, .chips, [data-v], [data-s], [data-tab], [data-r]')) { clearTimeout(tPila); tPila = setTimeout(apilar, 120); } }, { passive: true, capture: true });

  // ---------- La barra se esconde sola (celular y tablet, todos los usuarios) ----------
  // Regla igual en todas las apps (núcleo 2.34): al bajar se esconde, al subir aparece (y arriba del todo). No aparece sola al llegar al final
  // ni se esconde sola con el tiempo: solo sigue el dedo. También se ve al cargar y al cambiar de pantalla.
  // Nunca se esconde con una hoja o ventana abierta, ni mientras escribes. El asa de abajo (o deslizar hacia arriba) la vuelve a mostrar.
  let asa = null, yIni = null;
  const barraNav = () => document.querySelector('nav.cfx-barra');
  const raiz = document.documentElement;
  function ocultarBarra() {
    const n = barraNav(); if (!n || innerWidth >= 900 || window.CFX_BARRA_FIJA) return;
    const a = document.activeElement;
    if (document.querySelector('.cfx-mv, dialog[open], .cfx-hoja-m') || n.contains(a) || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || n.matches(':hover:active')) return;
    if (!asa) {
      asa = document.createElement('button'); asa.type = 'button'; asa.className = 'cfx-barra-asa'; asa.setAttribute('aria-label', 'Mostrar el menú de abajo');
      asa.addEventListener('click', (e) => { e.preventDefault(); verBarra(); });
      document.body.appendChild(asa);
    }
    n.classList.add('cfx-escondida'); raiz.classList.add('cfx-barra-oculta');
  }
  function verBarra() {
    const n = barraNav(); if (!n) return;
    if (n.classList.contains('cfx-escondida')) { n.classList.remove('cfx-escondida'); raiz.classList.remove('cfx-barra-oculta'); }
  }
  const yDe = new WeakMap();
  addEventListener('scroll', (e) => {
    const el = e.target === document || e.target === document.documentElement ? document.scrollingElement || document.documentElement : e.target;
    if (!el || el.nodeType !== 1 || !barraNav() || (el !== document.scrollingElement && el.clientHeight < innerHeight * 0.5)) return;  // solo la página o cajas grandes
    const y = el.scrollTop, antes = yDe.has(el) ? yDe.get(el) : y; yDe.set(el, y);
    const fin = y + el.clientHeight >= el.scrollHeight - 2;  // el rebote del final (iPhone/Android) no cuenta como subir
    if (y - antes > 6 && y > 60) ocultarBarra();
    else if ((antes - y > 10 && !fin) || y < 20) verBarra();
  }, { passive: true, capture: true });
  // Deslizar el dedo hacia arriba desde el borde de abajo también la muestra.
  addEventListener('touchstart', (e) => { const t = e.touches[0]; yIni = t && t.clientY > innerHeight - 60 ? t.clientY : null; }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (yIni !== null && t && yIni - t.clientY > 24) { yIni = null; verBarra(); } }, { passive: true });
  addEventListener('hashchange', () => verBarra()); addEventListener('popstate', () => verBarra());
  addEventListener('click', (e) => { if (e.target.closest && e.target.closest('nav.cfx-barra')) verBarra(); }, { capture: true, passive: true });
  addEventListener('resize', () => { if (innerWidth >= 900) verBarra(); });

  // ---------- G20/G27: deslizar el dedo a la izquierda/derecha cambia de pestaña ----------
  // G27: el gesto mueve SOLO el menú que se toca, nunca otro (antes podía terminar moviendo "Día / 7 días / 30 días" de la página).
  // · Dedo sobre un menú de pestañas (arriba o la barra de abajo): si el menú se corre de lado, se corre él solo (nativo);
  //   si cabe entero, pasa a la pestaña vecina de ESE menú.
  // · Dedo dentro de la página: solo el menú principal de la pantalla (nav.tabs.sub / [role=tablist] / [data-cfx-pestanas]);
  //   nunca filtros ni selectores de adentro (.seg, .seg2…). Sin menú principal, la barra de abajo.
  // No actúa sobre campos, hojas/ventanas abiertas, tiras que se deslizan de lado, carruseles ni avisos deslizables.
  const GRUPOS = 'nav.tabs.sub, [role=tablist], .seg, .segs, .seg2, .tabs2, [data-cfx-pestanas]';
  const PRINCIPAL = 'nav.tabs.sub, [role=tablist], [data-cfx-pestanas]';
  const esActiva = (b) => b.matches('.on, .active, .activo, [aria-selected=true], [aria-current=page], [aria-current=true]');
  const visibles = (g) => Array.from(g.children).filter((b) => /^(A|BUTTON)$/.test(b.tagName) && !b.disabled && !b.hidden && b.offsetParent && !b.classList.contains('cfx-oculto') && !b.classList.contains('cfx-oc'));
  const seCorre = (e) => e.scrollWidth > e.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(e).overflowX);
  function correLado(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (seCorre(e)) return true;
    return false;
  }
  function grupoPagina() {
    const L = Array.from(document.querySelectorAll(PRINCIPAL)).filter((g) => {
      if (g.closest('.cfx-barra, .cfx-hoja-m, dialog, [hidden]') || !g.offsetParent) return false;
      const r = g.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && visibles(g).some(esActiva);
    });
    return L[0] || null;  // el primero de la página: el menú principal
  }
  function pasar(dir, grupo) {
    const g = grupo && grupo.nodeType === 1 ? grupo : (grupoPagina() || barraNav());
    if (!g) return false;
    let L = visibles(g);
    if (g.classList.contains('cfx-barra')) L = L.filter((b) => !b.classList.contains('cfx-mas') && b.dataset.k !== '+' && (b.tagName === 'A' ? !!b.getAttribute('href') : true));
    const i = L.findIndex(esActiva), b = i < 0 ? null : L[i + dir];
    if (!b) return false;
    b.click();
    // Solo se corre el menú (nunca la página) para que la pestaña elegida se vea.
    const r = b.getBoundingClientRect(), rg = g.getBoundingClientRect();
    if (r.left < rg.left) g.scrollLeft -= rg.left - r.left + 12; else if (r.right > rg.right) g.scrollLeft += r.right - rg.right + 12;
    return true;
  }
  let dz = null;
  addEventListener('touchstart', (e) => {
    dz = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0], el = e.target;
    if (!el || !el.closest || el.closest('input, textarea, select, [contenteditable], canvas, video, iframe, dialog, .cfx-hoja-m, .cfx-pnl, .cfx-mv, .cfx-aviso-desl, .cfx-emerg, [data-cfx-sin-deslizar]')) return;
    if (document.documentElement.classList.contains('cfx-hoja-on') || document.querySelector('dialog[open]')) return;
    if (t.clientX < 18 || t.clientX > innerWidth - 18) return;  // la orilla es del gesto "atrás" del teléfono
    // El menú bajo el dedo (también si algo chico de la cabecera, como la pestañita ⌄ de la cuenta, cuelga encima de su orilla).
    const bajo = (g) => { if (!g.offsetParent && getComputedStyle(g).position !== 'fixed') return false; const r = g.getBoundingClientRect(); return t.clientX > r.left && t.clientX < r.right && t.clientY > r.top && t.clientY < r.bottom; };
    const menu = el.closest('nav.cfx-barra, ' + GRUPOS) || Array.from(document.querySelectorAll('nav.cfx-barra, ' + GRUPOS)).filter((g) => !g.closest('dialog, .cfx-hoja-m, [hidden]') && bajo(g)).pop();
    if (!menu && el.closest('header, .cfx-cab, .cfx-pest')) return;  // la cabecera no cambia de pestaña
    if (menu) {
      // Si se corre de lado, se corre solo él (el navegador lo hace; si el dedo partió sobre algo que lo tapa, lo corremos aquí).
      if (!seCorre(menu)) dz = { x: t.clientX, y: t.clientY, t: Date.now(), g: menu };
      else if (!menu.contains(el)) dz = { x: t.clientX, y: t.clientY, t: Date.now(), g: menu, correr: true };
      return;
    }
    if (correLado(el)) return;
    dz = { x: t.clientX, y: t.clientY, t: Date.now(), g: null };
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!dz) return; const t = e.changedTouches[0], dx = t.clientX - dz.x, dy = t.clientY - dz.y, dt = Date.now() - dz.t, g = dz.g, correr = dz.correr; dz = null;
    if (correr) { if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) g.scrollBy({ left: -dx, behavior: 'smooth' }); return; }
    if (dt > 700 || Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
    const sel = window.getSelection && String(window.getSelection()); if (sel) return;
    pasar(dx < 0 ? 1 : -1, g);
  }, { passive: true });
  addEventListener('touchcancel', () => { dz = null; }, { passive: true });

  // ---------- G43 · 👆 Pistas animadas: enseñan lo que se puede deslizar (máx. 2 veces cada una por equipo) ----------
  //   pantallas: desliza a los lados para cambiar de pantalla · barra: menú o filtros que siguen hacia el lado (se asoman solos)
  //   borrar: avisos que se borran deslizando · pila: tarjetas que se apilan al bajar. Una a la vez, sin tapar ventanas; no bloquea toques.
  //   Sin movimiento si el celular pide "reducir movimiento" (solo el letrero). CodeFixBarra.pista(k, el, texto) para usarla desde una app.
  const PZ_MAX = 2, PZ_BARRAS = '.tabs, .chips, .seg, .sub, .filtros, .cats, [role=tablist], .scroll-x, .cfx-chips';
  const pzVeces = (k) => { try { return Number(localStorage.getItem('cfx:pista:' + k)) || 0; } catch (e) { return PZ_MAX; } };
  const pzSuma = (k) => { try { localStorage.setItem('cfx:pista:' + k, String(pzVeces(k) + 1)); } catch (e) { /* nada */ } };
  const pzQuieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pzEnPantalla = (e) => { if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); return r.bottom > 60 && r.top < innerHeight - 90 && r.width > 40; };
  let pzOn = false, pzUlt = 0; const pzHecho = new Set();
  const pzCss = document.createElement('style');
  pzCss.textContent = '.cfx-pz{position:fixed;z-index:2147482000;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);box-sizing:border-box;' +
    'padding:9px 14px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:600 13.5px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);' +
    'pointer-events:none;animation:cfxPzIn .3s ease}.cfx-pz span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cfx-pz-m{font-size:20px;flex:none;display:inline-block}' +
    '.cfx-pz.lado .cfx-pz-m{animation:cfxPzLado 1.1s ease-in-out infinite}.cfx-pz.izq .cfx-pz-m{animation:cfxPzIzq 1.1s ease-in-out infinite}.cfx-pz.arriba .cfx-pz-m{animation:cfxPzArr 1.1s ease-in-out infinite}' +
    '@keyframes cfxPzIn{from{opacity:0;transform:translate(-50%,8px)}}@keyframes cfxPzLado{0%,100%{transform:translateX(-10px)}50%{transform:translateX(10px)}}' +
    '@keyframes cfxPzIzq{0%{transform:translateX(10px)}60%,100%{transform:translateX(-14px);opacity:.4}}@keyframes cfxPzArr{0%{transform:translateY(8px)}60%,100%{transform:translateY(-10px);opacity:.4}}' +
    '@keyframes cfxPista{0%,100%{transform:none}35%,60%{transform:translateX(-42px)}}.cfx-pista{animation:cfxPista 1.1s cubic-bezier(.2,.8,.2,1)}' +
    '@keyframes cfxPzPan{0%,100%{transform:none}30%,55%{transform:translateX(-26px)}}.cfx-pz-pan{animation:cfxPzPan 1.2s cubic-bezier(.2,.8,.2,1)}' +
    '@keyframes cfxPzSube{0%,100%{transform:none}40%{transform:translateY(-14px)}}.cfx-pz-sube{animation:cfxPzSube 1s ease-in-out 2}' +
    '@media (prefers-reduced-motion:reduce){.cfx-pz,.cfx-pz .cfx-pz-m,.cfx-pista,.cfx-pz-pan,.cfx-pz-sube{animation:none!important}}';
  (document.head || document.documentElement).appendChild(pzCss);
  // k: nombre · el: lo que se anima · t: texto · m: 'lado' | 'izq' | 'arriba' · mover(): animación propia del elemento.
  function pista(k, el, t, m, mover) {
    if (pzOn || pzHecho.has(k) || pzVeces(k) >= PZ_MAX || Date.now() - pzUlt < 6000 || !pzEnPantalla(el)) return false;
    if (document.hidden || document.querySelector('dialog[open], .cfx-hoja-m, .cfx-mv.on, .modal.on, .velo')) return false;
    pzOn = true; pzHecho.add(k); pzSuma(k);
    const r = el.getBoundingClientRect(), p = document.createElement('div');
    p.className = 'cfx-pz ' + (m || 'lado'); p.setAttribute('role', 'status');
    p.innerHTML = '<span class="cfx-pz-m" aria-hidden="true">' + (m === 'arriba' ? '👆' : '👉') + '</span><span></span>';
    p.lastChild.textContent = t;
    const arriba = r.top > 120 ? r.top - 52 : Math.min(innerHeight - 140, r.bottom + 10);
    p.style.top = Math.max(70, arriba) + 'px';
    document.body.appendChild(p);
    if (!pzQuieto() && mover) { try { mover(); } catch (e) { /* nada */ } }
    const fuera = () => { removeEventListener('pointerdown', fuera, true); p.remove(); pzOn = false; pzUlt = Date.now(); };
    addEventListener('pointerdown', fuera, true);
    setTimeout(fuera, 3600);
    return true;
  }
  function pzClase(el, c) { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); setTimeout(() => el.classList.remove(c), 2200); }
  function pistas() {
    if (window.CFX_SIN_HOLA || window.CFX_SIN_PISTAS || pzOn || innerWidth >= 900) return;
    // 1) Avisos que se borran deslizando
    const av = [...document.querySelectorAll('.cfx-aviso-desl')].find(pzEnPantalla);
    if (av && pista('borrar', av, 'Desliza el aviso para borrarlo', 'izq', () => pzClase(av, 'cfx-pista'))) return;
    // 2) Menús o filtros que siguen hacia el lado: se asoman y vuelven
    const b = [...document.querySelectorAll(PZ_BARRAS)].find((e) => !e.closest('.cfx-barra, dialog, .cfx-hoja-m') && e.scrollWidth > e.clientWidth + 24 &&
      /auto|scroll/.test(getComputedStyle(e).overflowX) && pzEnPantalla(e));
    if (b && pista('barra', b, 'Desliza a los lados: hay más', 'lado', () => {
      const x0 = b.scrollLeft; b.scrollTo({ left: x0 + 70, behavior: 'smooth' }); setTimeout(() => b.scrollTo({ left: x0, behavior: 'smooth' }), 800);
    })) return;
    // 3) Tarjetas que se apilan al bajar
    const pl = [...document.querySelectorAll('.cfx-apilar')].find(pzEnPantalla);
    if (pl && pista('pila', pl, 'Baja: las tarjetas se apilan', 'arriba', () => { const c = pl.querySelectorAll(':scope > .cfx-pila')[1]; if (c) pzClase(c, 'cfx-pz-sube'); })) return;
    // 4) Pantallas: con la barra de abajo se cambia de pantalla deslizando a los lados
    const bar = document.querySelector('.cfx-barra'), zona = document.querySelector('main') || document.body;
    if (bar && bar.getClientRects().length && visibles(bar).length >= 3) pista('pantallas', zona, 'Desliza para cambiar de pantalla', 'lado', () => pzClase(zona, 'cfx-pz-pan'));
  }
  const pzIniciar = () => { setTimeout(pistas, 2500); setInterval(pistas, 3000); addEventListener('hashchange', () => setTimeout(pistas, 900)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pzIniciar); else pzIniciar();

  window.CodeFixBarra = { montar, ver: verBarra, ocultar: ocultarBarra, pasar, pista };
  const iniciar = () => setTimeout(() => { montar(); setTimeout(() => document.documentElement.classList.add('cfx-barra-lista'), 1200); }, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  // Barras que la app dibuja después (al iniciar sesión).
  const obs = new MutationObserver(() => { const n = buscarNav(); if (n && n.dataset.cfx !== '1') montar(); });
  const mirar = () => obs.observe(document.body, { childList: true, subtree: false });
  if (document.body) mirar(); else document.addEventListener('DOMContentLoaded', mirar);
})();
