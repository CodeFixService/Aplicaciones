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
    const fila = orden.map(porClave).filter(Boolean);
    fila.forEach((b) => usados.add(b));
    const sobran = botones.filter((b) => !usados.has(b));
    fila.forEach((b) => nav.appendChild(b));
    sobran.forEach((b) => { b.classList.add('cfx-oculto'); nav.appendChild(b); });
    // Si sobran botones, el último lugar pasa a ser "Más": abre una hoja con los que sobran (y el "Más" propio de la app).
    if (sobran.length) {
      const bMas = fila.find((b) => clave(b) === kMas && b !== mas);
      const lista = bMas ? sobran.concat(bMas) : sobran;
      if (bMas) bMas.classList.add('cfx-oculto');
      const m = document.createElement('button');
      m.type = 'button'; m.className = 'cfx-menu'; m.innerHTML = '<span class="cfx-ico">' + svg('menu') + '</span>Más';
      m.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); hoja(lista); });
      if (bMas) nav.insertBefore(m, bMas); else nav.appendChild(m);
      // El "Más" se ve activo cuando estás en una de sus secciones.
      const marcar = () => { const on = lista.some((b) => b.classList.contains('on') || b.classList.contains('activo')); if (m.classList.contains('on') !== on) m.classList.toggle('on', on); };
      new MutationObserver(marcar).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] }); marcar();
    }
    nav.style.setProperty('--cfx-n', String(nav.querySelectorAll(':scope > :not(.cfx-oculto)').length));
  }
  window.CodeFixBarra = { montar };
  const iniciar = () => setTimeout(() => montar(), 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  // Barras que la app dibuja después (al iniciar sesión).
  const obs = new MutationObserver(() => { const n = buscarNav(); if (n && n.dataset.cfx !== '1') montar(); });
  const mirar = () => obs.observe(document.body, { childList: true, subtree: false });
  if (document.body) mirar(); else document.addEventListener('DOMContentLoaded', mirar);
})();
