/* CodeFix · Núcleo · Cabecera, Ayuda y Ajustes (mismo archivo en cada repositorio).
   CFX_AYUDA.iniciar({ rpc, app, admin, premium, nombre, foto, cuenta, panel… })  → al entrar con sesión: cabecera común [campana][FREE/PRO][foto]; la foto abre el menú con
       · Guía para partir: lo que le falta configurar al negocio (cfx_guia). No se marca como listo hasta que lo hace de verdad,
         y se le recuerda cada vez que entra (y cada 1 hora con la app abierta) mientras falte algo.
       · Chat con soporte: escribe y le respondes desde el Centro de Mando → Mensajes (cfx_chat_*). El globo muestra lo no leído.
       · Términos y condiciones según el tipo de negocio (ley chilena: 19.496 del consumidor y 19.628 / 21.719 de datos personales).
   CFX_AYUDA.chat({ rpc }) · CFX_AYUDA.terminos(app) · CFX_AYUDA.guia()  (también se pueden abrir sueltos).
   CFX_AJUSTES.montar(el, secciones) → Ajustes en cuadrícula de tarjetas (igual en las 6 apps). */
(function () {
  'use strict';
  if (window.CFX_AYUDA) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yo = document.currentScript && document.currentScript.src;
  const RAIZ = yo ? yo.replace(/(shared|js)\/ayuda\.js.*$/, '') : location.origin + '/';
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || (document.querySelector('meta[name="theme-color"]') || {}).content || '#2563eb';
  const CADA = 60 * 60 * 1000;
  // Dirección de cada app y del Centro de Mando según dónde se abre (un solo lugar para las 7):
  //  · Cloudflare Workers (<worker>.<cuenta>.workers.dev) → <worker>.<cuenta>.workers.dev
  //  · dominio propio (mando.codefix.app)                → <sub>.codefix.app
  //  · pruebas, GitHub Pages o Pages.dev                 → los Workers de la cuenta
  const CUENTA_WORKERS = 'juanjosuecastilloloyola.workers.dev';
  function web(worker, sub) {
    const h = location.hostname, p = h.split('.');
    if (/\.workers\.dev$/.test(h) && p.length >= 4) return 'https://' + worker + '.' + p.slice(1).join('.') + '/';
    if (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)|github\.io$|pages\.dev$/.test(h) || p.length < 2) return 'https://' + worker + '.' + CUENTA_WORKERS + '/';
    return 'https://' + sub + '.' + (p.length >= 3 ? p.slice(1).join('.') : h) + '/';
  }
  const panelCM = () => web('saas', 'mando') + 'admin/';
  const css = document.createElement('style');
  css.textContent =
    // Cabecera común: [campana][FREE/PRO][foto] a la derecha del encabezado de cada app.
    '.cfx-oc{display:none!important}.cfx-cab{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none;position:relative;z-index:1}' +
    '.cfx-cab.cfx-fija{position:fixed;top:calc(8px + env(safe-area-inset-top));right:10px;z-index:2147481000}' +
    '.cfx-cab>[data-cfx-campana]{margin:0!important;flex:none}' +
    '.cfx-atajo{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 11px;border-radius:99px;text-decoration:none;flex:none;font:800 12.5px/1 var(--cfx-letra,system-ui,sans-serif);' +
    'color:var(--brand,var(--marca,#2563eb));background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 35%,transparent)}' +
    '.cfx-atajo svg{flex:none}@media(max-width:380px){.cfx-atajo span{display:none}.cfx-atajo{width:32px;padding:0;justify-content:center}}' +
    '.cfx-plan{height:24px;min-height:0;padding:0 9px;border-radius:99px;border:0;cursor:pointer;font:800 11px/24px var(--cfx-letra,system-ui,sans-serif);letter-spacing:.06em;' +
    'background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto-2,#5b6472);box-shadow:inset 0 0 0 1px var(--cfx-borde,#e2e7ec)}' +
    '.cfx-plan.pro{background:linear-gradient(135deg,#f7d774,#d9a21b);color:#3b2a00;box-shadow:none}' +
    '.cfx-plan.rol{background:linear-gradient(135deg,#334155,#0f172a);color:#fff;box-shadow:none}' +
    '.cfx-av{width:36px;height:36px;min-height:0;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;flex:none;display:grid;place-items:center;' +
    'background:var(--brand,var(--marca,#2563eb));color:#fff;font:800 14px/1 var(--cfx-letra,system-ui,sans-serif);box-shadow:0 0 0 2px var(--cfx-tarjeta,#fff),0 0 0 3px var(--cfx-borde,#e2e7ec)}' +
    '.cfx-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}html.cfx-premium .cfx-av{box-shadow:0 0 0 2px var(--cfx-tarjeta,#fff),0 0 0 4px #d9a21b}' +
    '.cfx-av i{position:absolute;top:-5px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#dc2626;color:#fff;font:700 11px/18px system-ui,sans-serif;font-style:normal;padding:0 4px;box-sizing:border-box}' +
    '@media(max-width:380px){.cfx-cab{gap:6px}.cfx-plan{padding:0 7px;font-size:10px}.cfx-av{width:34px;height:34px}}' +
    '.cfx-ayuda .ca-yo{display:flex;align-items:center;gap:12px;padding:2px 0 12px;border-bottom:1px solid var(--cfx-borde,#e2e7ec);margin-bottom:6px}.cfx-ayuda .ca-yo .cfx-av{width:46px;height:46px;font-size:17px;cursor:default}' +
    '.cfx-ayuda .ca-yo b{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cfx-ayuda .ca-yo small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:12.5px;overflow-wrap:anywhere}.cfx-ayuda .ca-yo>div{min-width:0}' +
    // Ajustes en cuadrícula
    '.cfx-aj>button{min-height:96px}.cfx-aj>button>span:first-child{font-size:26px;line-height:1}.cfx-aj small{display:block;font-weight:500;font-size:12.5px;line-height:1.3;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-reg-b{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.cfx-reg-b button{flex:1 1 180px;min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);font:700 14px var(--cfx-letra,system-ui,sans-serif);cursor:pointer}' +
    '.cfx-reg-b .cfx-reg-todo{color:#dc2626}.cfx-reg-f{padding:10px 12px;border-radius:12px;background:var(--cfx-tarjeta,#fff);border:1px solid var(--cfx-borde,#e2e7ec);margin:0 0 8px;overflow-wrap:anywhere}' +
    '.cfx-reg-f b{display:block}.cfx-reg-f span{display:block;font-size:13.5px;color:var(--cfx-texto-2,#5b6472)}.cfx-reg-f small{font-size:12px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translate(-50%,20px);opacity:0;transition:.25s;z-index:2147483200;background:#111827;color:#fff;padding:10px 16px;border-radius:12px;font:600 14px var(--cfx-letra,system-ui,sans-serif);max-width:90vw}.cfx-toast.on{opacity:1;transform:translate(-50%,0)}' +
    '.cfx-flecha{display:inline-grid!important;place-items:center;line-height:1!important}.cfx-aj-cab{display:flex;align-items:center;gap:10px;margin:0 0 12px}.cfx-aj-cab h2{margin:0;font-size:19px;line-height:1.2}' +
    '.cfx-aj-volver{flex:none;width:40px;height:40px;min-height:0;padding:0;display:grid;place-items:center;line-height:1;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);font-size:20px;cursor:pointer}' +
    'dialog.cfx-ayuda{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:2147483100;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
    'dialog.cfx-ayuda::backdrop{background:transparent}@media(min-width:600px){dialog.cfx-ayuda{align-items:center}}' +
    '.cfx-ayuda>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;border-radius:20px 20px 0 0;box-sizing:border-box;padding:16px 16px calc(14px + env(safe-area-inset-bottom))}' +
    '@media(min-width:600px){.cfx-ayuda>div{border-radius:20px}}.cfx-ayuda h2{margin:0 0 6px;font-size:19px}.cfx-ayuda h3{font-size:15px;margin:14px 0 4px}.cfx-ayuda p,.cfx-ayuda li{font-size:14px;line-height:1.45;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-ayuda .ca-cuerpo{overflow:auto;flex:1;min-height:0}.cfx-ayuda button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;padding:0 12px;background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto,#111827)}' +
    '.cfx-ayuda button.ca-si{background:var(--ca-color);color:#fff}.cfx-ayuda .ca-op{display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:6px 0;background:var(--cfx-campo,#f3f5f8)}.cfx-ayuda .ca-op b{flex:1}' +
    '.cfx-ayuda .ca-op i{font-style:normal;background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px}' +
    '.cfx-ayuda .ca-it{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--cfx-borde,#e2e7ec)}.cfx-ayuda .ca-it:first-child{border-top:0}.cfx-ayuda .ca-it span{font-size:20px;line-height:1}' +
    '.cfx-ayuda .ca-it div{flex:1}.cfx-ayuda .ca-it b{display:block;font-size:14.5px}.cfx-ayuda .ca-it p{margin:2px 0 0;font-size:13px}.cfx-ayuda .ca-it button{min-height:36px;font-size:13px;flex:none}' +
    '.cfx-ayuda .ca-it.ok b{text-decoration:line-through;opacity:.6}.cfx-ayuda .ca-barra{height:8px;border-radius:4px;background:var(--cfx-campo,#eef2f6);overflow:hidden;margin:6px 0 10px}.cfx-ayuda .ca-barra>div{height:100%;background:var(--ca-color)}' +
    '.cfx-ayuda .ca-msjs{display:flex;flex-direction:column;gap:6px;padding:6px 0}.cfx-ayuda .ca-m{max-width:82%;padding:8px 11px;border-radius:14px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-break:break-word}' +
    '.cfx-ayuda .ca-m.yo{align-self:flex-end;background:var(--ca-color);color:#fff;border-bottom-right-radius:4px}.cfx-ayuda .ca-m.el{align-self:flex-start;background:var(--cfx-campo,#eef2f6);border-bottom-left-radius:4px}' +
    '.cfx-ayuda .ca-m small{display:block;opacity:.7;font-size:11px;margin-top:2px}.cfx-ayuda .ca-escribir{display:flex;gap:8px;padding-top:8px}.cfx-ayuda textarea{flex:1;min-height:44px;max-height:120px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:10px 12px;resize:none;box-sizing:border-box}' +
    '.cfx-ayuda .ca-pie{display:flex;gap:8px;margin-top:10px}.cfx-ayuda .ca-pie button{flex:1}';
  document.head.appendChild(css);

  let R = null, APP = '', estado = { items: [], sin_leer: 0 }, boya = null, abierta = null;
  const CFG = {};
  const pend = () => estado.items.filter((x) => !x.ok);

  function dialogo(html, alCerrar) {
    cerrar();
    const d = document.createElement('dialog'); d.className = 'cfx-ayuda'; d.style.setProperty('--ca-color', color());
    d.innerHTML = '<div>' + html + '</div>';
    document.body.appendChild(d); abierta = d;
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-cerrar]')) cerrar(); });
    d.addEventListener('close', () => { if (alCerrar) alCerrar(); d.remove(); if (abierta === d) abierta = null; });
    return d.firstChild;
  }
  function cerrar() { if (abierta) { try { abierta.close(); } catch (e) { abierta.remove(); } abierta = null; } }

  // ---------- Cabecera común (arriba a la derecha, igual en las 6 apps): [🔔 campana] [FREE/PRO] [foto] ----------
  // La campana es la de la app (una sola: las repetidas se esconden). La foto abre el menú: inicio, mi cuenta, panel, ayuda, Premium y cerrar sesión.
  // Lo que ya está en el menú (casa, chat, persona, ADMIN, cerrar sesión…) se esconde con CFG.quitar (selector de cada app).
  const SVG_CAMPANA = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const SVG_CAMBIO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>';
  const CAMPANA = '#bCampana, #campana, #btnAvisos, [aria-label="Avisos"], [aria-label="Notificaciones"], a[href$="#avisos"], [data-cfx-campana]';
  function encabezado() {
    return [...document.querySelectorAll('header.top, header.cab, .cab, header, .topbar, .top')].find((h) => {
      const r = h.getBoundingClientRect(); return r.width > 200 && r.height >= 36 && r.height <= 130 && r.top <= 8 && getComputedStyle(h).display !== 'none';
    }) || null;
  }
  const iniciales = () => {
    const n = String(CFG.nombre || CFG.email || '').replace(/@.*/, '').trim().split(/[\s._-]+/).filter(Boolean);
    return esc(((n[0] || '?')[0] + (n[1] ? n[1][0] : '')).toUpperCase());
  };
  const esPro = () => !!(CFG.admin || ('pro' in CFG ? CFG.pro : CFG.premium));  // pro: la insignia (p. ej. en prueba Pro); premium: la app dorada
  function pintarBoya() {
    if (!R) return;
    if (!boya) {
      boya = document.createElement('div'); boya.className = 'cfx-cab';
      boya.innerHTML = '<a class="cfx-atajo cfx-oc"></a><button type="button" class="cfx-plan"></button><button type="button" class="cfx-av" aria-label="Mi cuenta y menú"></button>';
      boya.querySelector('.cfx-av').onclick = menu;
      boya.querySelector('.cfx-plan').onclick = () => (CFG.admin || !window.CFX_PAGOS ? menu() : window.CFX_PAGOS.abrir({ rpc: R }));
    }
    const h = encabezado();
    if (h) {
      if (boya.parentNode !== h) h.appendChild(boya);
      boya.classList.remove('cfx-fija');
      if (CFG.quitar) h.querySelectorAll(CFG.quitar).forEach((x) => x.classList.add('cfx-oc'));
      const campanas = [...h.querySelectorAll(CAMPANA)].map((x) => x.closest('button, a') || x).filter((x, i, l) => l.indexOf(x) === i && !x.classList.contains('cfx-plan'));
      const una = campanas.find((x) => x.dataset.cfxCampana) || campanas.find((x) => !x.classList.contains('cfx-oc')) || campanas[0];
      campanas.forEach((x) => { if (x !== una) x.classList.add('cfx-oc'); });
      if (una && una.parentNode !== boya) { una.dataset.cfxCampana = '1'; boya.insertBefore(una, boya.querySelector('.cfx-plan')); }
      // Mismo ícono de campana en todas las apps (las que usan el emoji 🔔 pasan al dibujo de línea).
      if (una) [...una.childNodes].forEach((x) => { if (x.nodeType === 3 && /🔔/.test(x.textContent)) { const t = document.createElement('span'); t.innerHTML = SVG_CAMPANA; x.replaceWith(t.firstChild); } });
    } else if (!boya.isConnected) { document.body.appendChild(boya); boya.classList.add('cfx-fija'); }
    const plan = boya.querySelector('.cfx-plan'), av = boya.querySelector('.cfx-av'), at = boya.querySelector('.cfx-atajo');
    // Atajo fijo { ir, t }: el Centro de Mando pasa el suyo (Panel ⇄ App); en las otras apps solo el administrador (no socios, negocios ni clientes) va al panel del Centro de Mando.
    const atajo = 'atajo' in CFG ? CFG.atajo : CFG.admin && !CFG.socio && CFG.app !== 'mando' ? { ir: panelCM(), t: 'Panel' } : null;
    at.classList.toggle('cfx-oc', !atajo);
    if (atajo) { at.href = atajo.ir; at.setAttribute('aria-label', 'Ir a ' + atajo.t); at.innerHTML = SVG_CAMBIO + '<span>' + esc(atajo.t) + '</span>'; }
    // Administrador y socios: en vez del plan se ve su rol (ADMIN / SOCIO), así se nota que es una cuenta para administrar.
    const rol = CFG.admin ? (CFG.socio ? 'SOCIO' : 'ADMIN') : '';
    plan.textContent = rol || (esPro() ? 'PRO' : 'FREE'); plan.classList.toggle('pro', !rol && esPro()); plan.classList.toggle('rol', !!rol);
    plan.setAttribute('aria-label', rol ? (rol === 'ADMIN' ? 'Administrador' : 'Socio') : esPro() ? 'Plan PRO' : 'Plan FREE: ver Premium');
    const n = (CFG.admin ? 0 : pend().length + (estado.sin_leer || 0));
    av.innerHTML = (CFG.foto ? '<img src="' + esc(CFG.foto) + '" alt="">' : iniciales()) + (n ? '<i>' + n + '</i>' : '');
  }
  // Inicio: la primera pantalla de la app en esta sesión. Cerrar sesión: la función de la app, su botón, o se borra la sesión guardada.
  function inicio() { cerrar(); let u = ''; try { u = sessionStorage.getItem('cfx-inicio') || ''; } catch (e) { /* nada */ } location.href = u || RAIZ; }
  function salir() {
    cerrar();
    if (typeof CFG.salir === 'function') return CFG.salir();
    const b = [...document.querySelectorAll('button, a')].find((x) => /^\s*(🚪\s*)?(cerrar sesión|salir)\s*$/i.test(x.textContent || '') && !boya.contains(x));
    if (b) return b.click();
    try { Object.keys(localStorage).filter((k) => /-auth$|^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* nada */ }
    location.href = RAIZ;
  }
  function confirmarSalir() {
    const caja = dialogo('<h2>¿Cerrar sesión?</h2><p>Para volver a entrar necesitarás tu correo y tu clave.</p>' +
      '<div class="ca-pie"><button type="button" data-cerrar>Cancelar</button><button type="button" class="ca-si" data-salir>Cerrar sesión</button></div>');
    caja.querySelector('[data-salir]').onclick = salir;
  }
  function irA(dest) { cerrar(); if (typeof dest === 'function') return dest(); ir(dest); }
  function menu() {
    // Sesión del administrador (no socios): solo "Cerrar sesión"; se cierra tocando afuera o con Esc.
    const p = pend().length, adm = !!CFG.admin, solo = adm && !CFG.socio, op = (a, ico, t, extra) => '<button type="button" class="ca-op" data-a="' + a + '"><span>' + ico + '</span><b>' + t + '</b>' + (extra || '') + '</button>';
    const caja = dialogo('<div class="ca-yo"><span class="cfx-av">' + (CFG.foto ? '<img src="' + esc(CFG.foto) + '" alt="">' : iniciales()) + '</span><div><b>' + esc(CFG.nombre || (CFG.admin ? 'Administrador' : CFG.email) || 'Mi cuenta') + '</b>' +
      (CFG.email && (CFG.nombre || CFG.admin) ? '<small>' + esc(CFG.email) + '</small>' : '') + '<small>' + (CFG.admin ? (CFG.socio ? 'Socio' : 'Administrador') : 'Plan ' + (esPro() ? 'PRO' : 'FREE')) + '</small></div></div><div class="ca-cuerpo">' + (solo ? op('salir', '🚪', 'Cerrar sesión') + '</div>' :
      op('inicio', '🏠', 'Ir al inicio') +
      (CFG.cuenta ? op('cuenta', '👤', 'Mi cuenta') : '') +
      (CFG.panel ? op('panel', '🛡️', 'Panel de administración') : '') +
      (pila().length > 1 ? op('atras', '⬅️', 'Volver a lo anterior') : '') +
      (!adm && estado.items.length ? op('guia', '🧭', 'Guía para partir', p ? '<i>' + p + ' pendiente' + (p > 1 ? 's' : '') + '</i>' : '✅') : '') +
      (!adm ? op('chat', '💬', 'Chat con soporte', estado.sin_leer ? '<i>' + estado.sin_leer + '</i>' : '') : '') +
      op('terminos', '📄', 'Términos y condiciones') +
      (!adm && window.CFX_PAGOS ? op('premium', '⭐', esPro() ? 'Mi plan PRO' : 'Pasar a PRO') : '') +
      op('salir', '🚪', 'Cerrar sesión') +
      '</div><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>'));
    caja.onclick = (ev) => {
      const b = ev.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'inicio') return inicio();
      if (a === 'cuenta' || a === 'panel') return irA(CFG[a]);
      if (a === 'atras') { cerrar(); return history.back(); }
      if (a === 'salir') return confirmarSalir();
      if (a === 'guia') guia(); else if (a === 'chat') chat({ rpc: R }); else if (a === 'terminos') terminos(); else { cerrar(); window.CFX_PAGOS.abrir({ rpc: R }); }
    };
  }

  // ---------- Ajustes en cuadrícula (igual en las 6 apps; cada app entrega SU lista) ----------
  // CFX_AJUSTES.montar(el, [{ k, ico, t, d, abrir(zona) | nodo }], { arriba, abajo })  → tarjetas; al tocar una se abre su sección con "←" que vuelve a la cuadrícula.
  //   abrir(zona): la sección se dibuja en zona.  nodo: una sección que ya está en la página (se muestra solo ella; abrir también se llama si viene).
  // Devuelve { abrir(k), grilla() } para entrar directo a una sección (p. ej. desde un link #ajustes/textos).
  function ajustes(el, L, o) {
    o = o || {};
    L = L.filter(Boolean);
    let w = el.querySelector(':scope > .cfx-aj-w');
    if (!w) { w = document.createElement('div'); w.className = 'cfx-aj-w'; el.prepend(w); }
    const nodos = L.map((s) => s.nodo).filter(Boolean);
    const grilla = () => {
      nodos.forEach((n) => n.classList.add('cfx-oc'));
      w.innerHTML = (o.arriba || '') + '<div class="cfx-grilla cfx-aj">' + L.map((s) => '<button type="button" data-k="' + esc(s.k) + '"><span>' + s.ico + '</span>' + esc(s.t) +
        (s.d ? '<small>' + esc(s.d) + '</small>' : '') + '</button>').join('') + '</div>' + (o.abajo || '');
      w.querySelectorAll('.cfx-aj > [data-k]').forEach((b) => { b.onclick = () => abrir(b.dataset.k); });
    };
    const abrir = (k) => {
      const s = L.find((x) => x.k === k); if (!s) return grilla();
      nodos.forEach((n) => n.classList.toggle('cfx-oc', n !== s.nodo));
      if (s.nodo) s.nodo.classList.remove('hidden');
      w.innerHTML = '<div class="cfx-aj-cab"><button type="button" class="cfx-aj-volver" data-sin-atras aria-label="Volver a Ajustes"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><h2>' + s.ico + ' ' + esc(s.t) + '</h2></div><div class="cfx-aj-zona"></div>';
      w.querySelector('.cfx-aj-volver').onclick = () => { grilla(); scrollTo(0, 0); };
      scrollTo(0, 0);
      return s.abrir ? s.abrir(w.querySelector('.cfx-aj-zona'), k) : undefined;
    };
    grilla();
    return { abrir, grilla };
  }

  // ---------- Registro de cambios: botones para borrarlo (igual en las 6 apps) ----------
  // CFX_AJUSTES.registro(el, rpc, { lista: true, recargar }) → arriba de el pone "Borrar lo de más de 30 días" y "Borrar todo" (pide confirmar).
  //   lista: además muestra el registro común (cfx_registro_lista) para las apps que no tienen uno propio.
  async function registro(el, rpc, o) {
    o = o || {};
    const caja = document.createElement('div'); caja.className = 'cfx-reg';
    caja.innerHTML = '<div class="cfx-reg-b"><button type="button" data-d="30">🧹 Borrar lo de más de 30 días</button><button type="button" data-d="0" class="cfx-reg-todo">🗑️ Borrar todo</button></div><div class="cfx-reg-l"></div>';
    el.prepend(caja);
    const pintar = async () => {
      if (!o.lista) return;
      const l = caja.querySelector('.cfx-reg-l');
      try {
        const L = await rpc('cfx_registro_lista', { p_limite: 300 });
        l.innerHTML = L.length ? L.map((x) => '<div class="cfx-reg-f"><b>' + esc(x.accion) + '</b><span>' + esc(x.detalle || '') + '</span><small>' + esc(x.quien || '') + ' · ' + new Date(x.creado).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>').join('')
          : '<p style="margin:8px 0;color:var(--cfx-texto-2,#5b6472)">Sin cambios registrados.</p>';
      } catch (x) { l.innerHTML = '<p>' + esc(x.message || x) + '</p>'; }
    };
    caja.querySelector('.cfx-reg-b').onclick = (ev) => {
      const b = ev.target.closest('[data-d]'); if (!b) return;
      const d = +b.dataset.d;
      const c = dialogo('<h2>' + (d ? '🧹 Borrar lo antiguo' : '🗑️ Borrar todo el registro') + '</h2><p>' + (d ? 'Se borran los cambios de hace más de 30 días.' : 'Se borra todo el registro de cambios. No se puede deshacer.') + '</p>' +
        '<div class="ca-pie"><button type="button" data-cerrar>Cancelar</button><button type="button" class="ca-si" data-si>Borrar</button></div>');
      c.querySelector('[data-si]').onclick = async (e) => {
        e.target.disabled = true;
        try { const n = await rpc('cfx_registro_borrar', { p_dias: d }); cerrar(); aviso('🧹 Registro borrado (' + n + ')'); pintar(); if (o.recargar) o.recargar(); }
        catch (x) { e.target.disabled = false; aviso(x.message || String(x)); }
      };
    };
    pintar();
  }
  function aviso(t) {
    const d = document.createElement('div'); d.className = 'cfx-toast'; d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.classList.add('on'), 10); setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); }, 2600);
  }

  // ---------- Guía ----------
  function ir(dest) {
    cerrar();
    if (dest === 'verificar' && window.CFX_VERIFICAR) return window.CFX_VERIFICAR.abrir({ rpc: R });
    if (dest === 'pagar' && window.CFX_PAGOS) return window.CFX_PAGOS.abrir({ rpc: R });
    const u = new URL(dest, RAIZ);
    if (u.pathname === location.pathname && u.hash) { if (location.hash === u.hash) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = u.hash; }
    else location.href = u.href;
  }
  function guia() {
    const L = estado.items, ok = L.filter((x) => x.ok).length;
    const caja = dialogo('<h2>🧭 Guía para partir</h2><p>' + (ok === L.length ? '¡Todo listo! Tu negocio está configurado.' : 'Te faltan ' + (L.length - ok) + ' de ' + L.length + ' pasos. Cada uno se marca solo cuando lo haces.') + '</p>' +
      '<div class="ca-barra"><div style="width:' + Math.round(ok * 100 / Math.max(1, L.length)) + '%"></div></div><div class="ca-cuerpo">' +
      L.map((x, i) => '<div class="ca-it' + (x.ok ? ' ok' : '') + '"><span>' + (x.ok ? '✅' : '⬜') + '</span><div><b>' + esc(x.t) + '</b>' + (x.d && !x.ok ? '<p>' + esc(x.d) + '</p>' : '') + '</div>' +
        (!x.ok && x.ir ? '<button type="button" class="ca-si" data-i="' + i + '">Hacerlo</button>' : '') + '</div>').join('') +
      '</div><div class="ca-pie"><button type="button" data-cerrar>' + (ok === L.length ? 'Cerrar' : 'Después') + '</button></div>');
    caja.onclick = (ev) => { const b = ev.target.closest('[data-i]'); if (b) ir(L[+b.dataset.i].ir); };
  }
  function recordar() {
    if (window.CFX_SIN_HOLA || !pend().length || document.hidden || document.querySelector('dialog[open], .cfx-hoja')) return;  // CFX_SIN_HOLA: pruebas
    let ult = 0; try { ult = Number(sessionStorage.getItem('cfx-guia-vista')) || 0; } catch (e) { /* nada */ }
    if (ult && Date.now() - ult < CADA) return;
    try { sessionStorage.setItem('cfx-guia-vista', String(Date.now())); } catch (e) { /* nada */ }
    guia();
  }

  // ---------- Chat ----------
  async function chat(o) {
    const rpc = (o && o.rpc) || R; if (!rpc) return;
    let vigia = null;
    const caja = dialogo('<h2>💬 Soporte</h2><p style="margin:0 0 4px">Escríbenos lo que necesites. Te avisamos cuando respondamos.</p><div class="ca-cuerpo"><div class="ca-msjs"><p>Cargando…</p></div></div>' +
      '<div class="ca-escribir"><textarea maxlength="1000" rows="1" placeholder="Escribe tu mensaje…"></textarea><button type="button" class="ca-si" data-enviar>Enviar</button></div>' +
      '<p class="ca-err" style="color:#dc2626;margin:4px 0 0;min-height:1em"></p><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>', () => clearInterval(vigia));
    const lista = caja.querySelector('.ca-msjs'), cuerpo = caja.querySelector('.ca-cuerpo'), ta = caja.querySelector('textarea'), err = caja.querySelector('.ca-err');
    async function cargar() {
      try {
        const m = await rpc('cfx_chat_mio');
        lista.innerHTML = m.length ? m.map((x) => '<div class="ca-m ' + (x.de === 'persona' ? 'yo' : 'el') + '">' + esc(x.texto) + '<small>' + new Date(x.creado).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>').join('')
          : '<p>Aún no hay mensajes. ¡Cuéntanos en qué te ayudamos!</p>';
        cuerpo.scrollTop = cuerpo.scrollHeight;
        if (estado.sin_leer) { estado.sin_leer = 0; pintarBoya(); }
      } catch (x) { lista.innerHTML = '<p>' + esc(x.message || x) + '</p>'; }
    }
    caja.querySelector('[data-enviar]').onclick = async (ev) => {
      const t = ta.value.trim(); if (!t) return;
      ev.target.disabled = true; err.textContent = '';
      try { await rpc('cfx_chat_enviar', { p_texto: t }); ta.value = ''; await cargar(); } catch (x) { err.textContent = (x && x.message) || String(x); }
      ev.target.disabled = false;
    };
    await cargar();
    vigia = setInterval(() => { if (!document.hidden) cargar(); }, 10000);
    ta.focus();
  }

  // ---------- Términos y condiciones ----------
  function detectar() {
    if (APP) return APP;
    const w = window, t = document.title || '';
    if (w.LC) return 'billetera';
    if (w.Api && w.U) return 'estaciona';
    if (/BiciTaller/i.test(t)) return 'taller';
    if (/Barber/i.test(t)) return 'barberia';
    if (/Órbita|Orbita/i.test(t)) return 'orbita';
    if (/Mando/i.test(t)) return 'mando';
    return '';
  }
  const NOMBRE = { billetera: 'Libreta de Cobros', orbita: 'Órbita', barberia: 'Barbería', taller: 'BiciTaller', estaciona: 'Estaciona', mando: 'Centro de Mando' };
  // Lo propio de cada tipo de negocio (va como sección 5).
  const PROPIO = {
    barberia: ['Reservas y abono previo',
      'Las horas se reservan en la app. Cada barbería puede pedir un abono previo para confirmar la hora; el monto y su política de cancelación se muestran antes de pagar. ' +
      'Si cancelas con la anticipación que indica la barbería, el abono se te devuelve o se abona a tu próxima hora. Si no llegas sin avisar, la barbería puede quedarse con el abono como compensación. ' +
      'El abono se descuenta del precio final del servicio. Los precios los fija cada barbería y deben incluir IVA cuando corresponda.'],
    taller: ['Reservas, abono previo y reparaciones',
      'Reservas tu hora en la app y el taller puede pedir un abono previo para confirmarla (el monto y la política de cancelación se muestran antes de pagar); el abono se descuenta del total. ' +
      'Antes de reparar, el taller te informa el presupuesto y no puede cobrar trabajos que no aprobaste. Las reparaciones tienen la garantía legal de 3 meses desde la entrega (art. 41 de la Ley 19.496). ' +
      'Si no retiras tu bicicleta dentro del plazo informado por el taller, este puede cobrar bodegaje según lo publicado.'],
    orbita: ['Compras en tiendas: pago, despacho, retracto y garantía',
      'Cada tienda publica sus productos y precios (con IVA incluido cuando corresponda). El pedido se paga completo antes del despacho; el costo de despacho depende de tu comuna y se muestra antes de pagar. ' +
      'En compras a distancia tienes derecho a retracto dentro de 10 días desde que recibes el producto, salvo que la tienda lo haya excluido de forma visible antes de la compra (art. 3 bis de la Ley 19.496). ' +
      'Los productos tienen garantía legal de 6 meses por fallas (cambio, reparación o devolución del dinero, a tu elección). La tienda entrega la boleta o factura.'],
    billetera: ['Fiado, cuotas y cobranza',
      'La Libreta registra ventas al fiado, cuotas y abonos entre un negocio y sus clientes; no es un banco ni presta dinero. Los intereses, si se pactan, no pueden superar el máximo convencional (Ley 18.010). ' +
      'Los recordatorios de cobro deben respetar la ley: sin amenazas, sin avisar a terceros (familia, trabajo), en días hábiles y horario razonable, y sin cobrar gastos de cobranza no permitidos (art. 37 de la Ley 19.496). ' +
      'El cliente puede ver su saldo y pedir corrección de cualquier error.'],
    estaciona: ['Arriendo de estacionamientos entre personas',
      'Estaciona conecta a quienes publican un estacionamiento con quienes lo arriendan. El precio, las reglas del lugar y la forma de pago las define quien publica, y se muestran antes de arrendar. ' +
      'Quien publica declara tener derecho a arrendar ese espacio (dueño o autorizado por la comunidad). Quien arrienda usa el espacio según lo acordado y responde por los daños que cause. ' +
      'Estaciona no custodia vehículos ni responde por robos o daños dentro del estacionamiento. Pedimos verificar identidad para dar más seguridad.'],
    mando: ['Uso personal',
      'El Centro de Mando organiza tus tareas, metas, ideas y descanso. Lo que anotas es privado y solo tú lo ves.']
  };
  function terminos(app) {
    const a = app || detectar(), n = NOMBRE[a] || 'esta app', p = PROPIO[a];
    const S = [
      ['1. Quiénes somos', n + ' es una aplicación de CodeFix (Chile). Puedes escribirnos desde el chat de soporte de la app. Estos términos siguen la Ley 19.496 sobre Protección de los Derechos de los Consumidores y las leyes de datos personales 19.628 y 21.719.'],
      ['2. Tu cuenta', 'Para crear una cuenta de negocio debes ser mayor de 18 años y dar datos verdaderos. Cuida tu contraseña: lo que se haga con tu cuenta es tu responsabilidad. Puedes borrar tu cuenta cuando quieras desde la app o pidiéndolo por el chat.'],
      ['3. Planes y pagos', 'Hay una versión gratis y una Premium (mensual, por varios meses o anual), con precios en pesos chilenos publicados en la app. ' +
        'Por transferencia pagas el precio exacto. Con link de pago o tarjeta se suma un cargo por pago online que se muestra en una línea aparte antes de pagar. ' +
        'El Premium se activa al validar tu comprobante (normalmente en 5 a 10 minutos en horario hábil) y dura los días comprados (30 por mes, 365 por año). No hay cobros automáticos: nada se renueva sin que pagues de nuevo. ' +
        'Si eres un negocio nuevo, el primer pago activa tu cuenta; al terminar ese período sigues en la versión gratis si no renuevas.'],
      ['4. Retracto y devoluciones', 'Puedes retractarte dentro de 10 días desde tu pago si aún no usaste las funciones Premium, y te devolvemos el monto por transferencia. ' +
        'Si el servicio falla por causa nuestra y no lo solucionamos, te devolvemos la parte proporcional de los días no usados.'],
      p ? ['5. ' + p[0], p[1]] : null,
      [(p ? '6' : '5') + '. Responsabilidad de cada negocio', 'Cada negocio que usa la app es el proveedor frente a sus propios clientes: fija sus precios, cobra con sus propios medios de pago (los abonos y pagos de sus clientes le llegan directo a él, no a CodeFix), entrega boleta y responde por sus productos y servicios según la ley. CodeFix entrega la herramienta.'],
      [(p ? '7' : '6') + '. Tus datos', 'Usamos tus datos solo para que la app funcione: cuenta, reservas o pedidos, avisos y soporte. No los vendemos. Los guardamos en servidores seguros (Supabase). ' +
        'Las fotos de comprobantes y de identidad se borran apenas se revisan. Las fotos que solo ves tú quedan en tu teléfono. Puedes pedir acceso, corrección, borrado o copia de tus datos, u oponerte a su uso, escribiendo al chat de soporte.'],
      [(p ? '8' : '7') + '. Buen uso', 'No está permitido publicar contenido falso, ilegal u ofensivo, suplantar a otras personas ni usar la app para estafas. Podemos suspender cuentas que lo hagan, avisándote el motivo.'],
      [(p ? '9' : '8') + '. Disponibilidad', 'Trabajamos para que la app esté siempre disponible y respaldamos la información, pero pueden ocurrir cortes por mantención o fallas de terceros (internet, servidores). Te recomendamos descargar tus respaldos.'],
      [(p ? '10' : '9') + '. Cambios', 'Si cambiamos estos términos o los precios, te avisamos en la app con al menos 15 días de anticipación. Los días Premium que ya pagaste se respetan.'],
      [(p ? '11' : '10') + '. Reclamos', 'Escríbenos primero por el chat: respondemos lo antes posible. Siempre puedes acudir al SERNAC (sernac.cl) o al Juzgado de Policía Local de tu comuna. Se aplica la ley chilena.']
    ].filter(Boolean);
    dialogo('<h2>📄 Términos y condiciones</h2><p style="margin:0">' + esc(n) + ' · vigentes desde octubre de 2026</p><div class="ca-cuerpo">' +
      S.map((x) => '<h3>' + esc(x[0]) + '</h3><p>' + esc(x[1]) + '</p>').join('') + '</div><div class="ca-pie"><button type="button" data-cerrar>Entendido</button></div>');
  }

  // ---------- Inicio ----------
  async function revisar() {
    if (!R) return;
    try { estado = await R('cfx_guia') || estado; } catch (e) { return; }
    estado.items = estado.items || [];
    pintarBoya();
    setTimeout(recordar, 4000);
  }
  // CFX_AYUDA.iniciar({ rpc, app, admin, premium, id, hasta, beneficios, nombre, email, foto, cuenta, panel, quitar, salir })
  //   una sola llamada al tener la cuenta (también para el admin): cabecera común, ayuda y sensación Premium (CFX_PREMIUM, nunca al admin).
  //   cuenta / panel: dirección (#… o url) o función para "Mi cuenta" y "Panel de administración". Se puede volver a llamar (p. ej. al cambiar la foto).
  function iniciar(o) {
    if (!o || !o.rpc) return;
    const primera = !R;
    R = o.rpc; APP = o.app || APP;
    Object.assign(CFG, o);
    try { if (!sessionStorage.getItem('cfx-inicio')) sessionStorage.setItem('cfx-inicio', location.pathname + location.search); } catch (e) { /* nada */ }
    if (window.CFX_PREMIUM && 'premium' in o) window.CFX_PREMIUM.marcar({ premium: !CFG.admin && !!CFG.premium, id: CFG.id, hasta: CFG.hasta, beneficios: CFG.beneficios });
    pintarBoya();
    if (CFG.admin) return;
    revisar();
    if (primera) {
      setInterval(revisar, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    }
  }

  // ---------- Flechas siempre al centro de su cuadro ----------
  // Los botones que solo tienen una flecha de texto (‹ › ← →) pasan a un dibujo: así queda centrada en todas las letras y celulares.
  const FLECHA = { '‹': 'M15 18l-6-6 6-6', '›': 'M9 18l6-6-6-6', '←': 'M19 12H5M12 19l-7-7 7-7', '→': 'M5 12h14M12 5l7 7-7 7' };
  function flechas(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('button, a') : []).forEach((b) => {
      if (b.children.length || b.dataset.cfxFlecha) return;
      const t = (b.textContent || '').trim(); if (!FLECHA[t]) return;
      b.dataset.cfxFlecha = '1';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;margin:auto"><path d="' + FLECHA[t] + '"/></svg>';
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', t === '←' ? 'Volver' : t === '‹' ? 'Anterior' : 'Siguiente');
      b.style.display = b.style.display || ''; b.classList.add('cfx-flecha');
    });
  }
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => { if (n.nodeType === 1) flechas(n.parentNode || n); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') flechas(document); else document.addEventListener('DOMContentLoaded', () => flechas(document));

  // ---------- Otras apps CodeFix (debajo del ingreso de cada app) ----------
  // Bajo el formulario de ingreso se muestran las otras apps: al tocar una se abre su registro. El CM y Cerebro (personales) no se muestran
  // ni la llevan; un formulario con data-sin-apps tampoco. La app donde estás no sale.
  const OTRAS = [['emprendedor', 'billetera', 'Billetera', 'Cobros y deudas', '#0f8a5f', '#crear'], ['aplicaciones', 'apps', 'Órbita', 'Tienda y pedidos', '#2563eb', ''],
    ['barberia', 'barberia', 'Barbería', 'Reservas de hora', '#b8860b', 'registro/'], ['taller', 'bicitaller', 'BiciTaller', 'Taller de bicis', '#16a34a', 'n/'],
    ['estacionamiento', 'estaciona', 'Estaciona', 'Arrienda o publica', '#1d4ed8', '']];
  const h0 = location.hostname.split('.')[0];
  const PROPIA = /^(saas|mando|contenido|cerebro)$/.test(h0) || /\/admin\//.test(location.pathname);
  function otrasApps() {
    if (PROPIA) return;
    document.querySelectorAll('input[type="password"][autocomplete="current-password"]').forEach((c) => {
      const f = c.closest('form'); if (!f || f.dataset.cfxApps || f.hasAttribute('data-sin-apps') || f.closest('dialog.cfx-ayuda')) return;
      f.dataset.cfxApps = '1';
      const L = OTRAS.filter((a) => a[0] !== h0 && a[1] !== h0);
      const d = document.createElement('div'); d.className = 'cfx-otras';
      d.innerHTML = '<p>¿Conoces las otras apps de CodeFix? Crea tu cuenta gratis</p><div>' + L.map((a) => '<a href="' + web(a[0], a[1]) + a[5] + '" target="_blank" rel="noopener" style="--c:' + a[4] + '">' +
        '<i aria-hidden="true">' + a[2][0] + '</i><b>' + a[2] + '</b><small>' + a[3] + '</small></a>').join('') + '</div>';
      f.after(d);
    });
  }
  const cssO = document.createElement('style');
  cssO.textContent = '.cfx-otras{margin:18px 0 4px}.cfx-otras>p{margin:0 0 8px;font-size:13px;opacity:.75;text-align:center}' +
    '.cfx-otras>div{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}.cfx-otras>div::-webkit-scrollbar{display:none}' +
    '.cfx-otras a{flex:1 0 96px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:14px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.06);color:inherit;text-decoration:none;text-align:center}' +
    '.cfx-otras i{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-style:normal;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 60%,#000));box-shadow:0 4px 12px color-mix(in srgb,var(--c) 35%,transparent);margin-bottom:2px}' +
    '.cfx-otras b{font-size:13px}.cfx-otras small{font-size:11px;opacity:.7;line-height:1.2}';
  document.head.appendChild(cssO);
  new MutationObserver(() => { clearTimeout(otrasApps.t); otrasApps.t = setTimeout(otrasApps, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') otrasApps(); else document.addEventListener('DOMContentLoaded', otrasApps);

  // ---------- "Volver" vuelve a la pantalla anterior (no al inicio) ----------
  // Se guarda el recorrido de la sesión; los botones "Volver"/"‹" de cualquier app hacen history.back() si hay una pantalla anterior.
  function pila() { try { return JSON.parse(sessionStorage.getItem('cfx-pila') || '[]'); } catch (e) { return []; } }
  function anotar() {
    const l = pila(), u = location.pathname + location.search + location.hash;
    if (l[l.length - 1] === u) return;
    if (l[l.length - 2] === u) l.pop(); else l.push(u);
    try { sessionStorage.setItem('cfx-pila', JSON.stringify(l.slice(-40))); } catch (e) { /* nada */ }
  }
  anotar(); addEventListener('hashchange', anotar); addEventListener('popstate', anotar);
  const VOLVER = /^\s*(‹|←|⬅️?|<)?\s*(volver|atrás|atras)?\s*$/i;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, a'); if (!b || b.closest('dialog, .modal, .sheet, .cfx-mv')) return;
    const t = (b.textContent || '').trim(), al = b.getAttribute('aria-label') || '';
    if (!(/volver|atrás/i.test(al) || (t && t.length <= 12 && VOLVER.test(t) && /[‹←⬅<]|volver|atr/i.test(t)))) return;
    const l = pila();
    // Solo en pantallas con dirección propia (#…): las vistas internas sin dirección usan su propio Volver.
    if (location.hash.length > 1 && l.length > 1 && !b.hasAttribute('data-sin-atras')) { e.preventDefault(); e.stopImmediatePropagation(); history.back(); }
  }, true);

  // La cabecera se vuelve a poner si la app redibuja su encabezado.
  setInterval(() => { if (R && (!boya || !boya.isConnected || (boya.classList.contains('cfx-fija') && encabezado()))) { if (boya && boya.classList.contains('cfx-fija')) boya.remove(); pintarBoya(); } }, 1500);

  window.CFX_AYUDA = { iniciar, chat, terminos, guia, revisar, menu, web, panelCM };
  window.CFX_AJUSTES = { montar: ajustes, registro };
  // La app pudo pedirlo antes de que este archivo cargara (CFX_AYUDA_PEND = { rpc, app }).
  if (window.CFX_AYUDA_PEND) iniciar(window.CFX_AYUDA_PEND);
})();
