/* CodeFix · Núcleo · Sensación Premium (mismo archivo en cada repositorio).
   CFX_PREMIUM.marcar({ premium, id, hasta, beneficios })  → con Premium la app se ve dorada (línea arriba, pestaña activa y botón + dorados)
   y la primera vez muestra "¡Ya eres Premium!" con lo que incluye. Sin Premium no cambia nada. */
(function () {
  'use strict';
  if (window.CFX_PREMIUM) return;
  const css = document.createElement('style');
  css.textContent =
    'html.cfx-premium body::before{content:"";position:fixed;top:0;left:0;right:0;height:3px;z-index:2147482000;background:linear-gradient(90deg,#f7d774,#d9a21b,#f7d774);pointer-events:none}' +
    'html.cfx-premium nav.cfx-barra>.on,html.cfx-premium nav.cfx-barra>.activo,html.cfx-premium nav.cfx-barra>[aria-current="page"]{color:#c58b00!important}' +
    'html.cfx-premium nav.cfx-barra .cfx-mas>:first-child,html.cfx-premium nav.cfx-barra .cfx-mas .cfx-ico,html.cfx-premium nav.cfx-barra .nuevo span:first-child{background:linear-gradient(135deg,#f7d774,#d9a21b)!important;color:#3b2a00!important}' +
    '@media(min-width:900px){html.cfx-premium nav.cfx-barra>.cfx-mas{background:linear-gradient(135deg,#f7d774,#d9a21b)!important;color:#3b2a00!important}html.cfx-premium nav.cfx-barra>.cfx-mas>:first-child,html.cfx-premium nav.cfx-barra>.cfx-mas .cfx-ico{background:none!important}}' +
    'dialog.cfx-hola{border:0;padding:0;margin:auto auto 0;width:100%;max-width:520px;background:transparent}dialog.cfx-hola::backdrop{background:rgba(15,23,42,.55)}' +
    '@media(min-width:600px){dialog.cfx-hola{margin:auto}}' +
    '.cfx-hola>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border-radius:20px 20px 0 0;padding:20px 16px calc(18px + env(safe-area-inset-bottom));font-family:var(--cfx-letra,system-ui,sans-serif);text-align:center}' +
    '@media(min-width:600px){.cfx-hola>div{border-radius:20px}}.cfx-hola h2{margin:4px 0}.cfx-hola p{color:var(--cfx-texto-2,#5b6472);margin:6px 0}' +
    '.cfx-hola ul{text-align:left;margin:10px 0;padding-left:20px}.cfx-hola button{width:100%;min-height:46px;border:0;border-radius:12px;font:inherit;font-weight:800;margin-top:8px;cursor:pointer;background:linear-gradient(135deg,#f7d774,#d9a21b);color:#3b2a00}';
  document.head.appendChild(css);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hola(o) {
    if (window.CFX_SIN_HOLA || document.querySelector('dialog.cfx-pago')) return;  // primero va la pantalla de pago/activación (CFX_SIN_HOLA: pruebas)
    const k = 'cfx-premium-hola-' + o.id + '-' + String(o.hasta || '').slice(0, 10);
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { return; }
    const d = document.createElement('dialog');
    d.className = 'cfx-hola';
    d.innerHTML = '<div><div style="font-size:52px">⭐</div><h2>¡Ya eres Premium!</h2><p>Gracias por apoyar. Esto es lo que tienes ahora:</p>' +
      ((o.beneficios || []).length ? '<ul>' + o.beneficios.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') +
      (o.hasta && !/infinity/i.test(String(o.hasta)) ? '<p>Activo hasta el <b>' + new Date(o.hasta).toLocaleDateString('es-CL') + '</b>.</p>' : '') +
      '<button type="button">¡Vamos!</button></div>';
    document.body.appendChild(d);
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    d.querySelector('button').onclick = () => { d.close(); d.remove(); };
  }
  function marcar(o) {
    o = o || {};
    document.documentElement.classList.toggle('cfx-premium', !!o.premium);
    if (o.premium && o.id) setTimeout(() => hola(o), 2500);
  }
  window.CFX_PREMIUM = { marcar };
})();
