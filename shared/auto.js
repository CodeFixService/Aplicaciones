/* CodeFix · Núcleo · Actualización de la app (mismo archivo en cada repositorio).
   G36 · CodeFixAuto(versión, actualizar, { admin })
   - admin: (el administrador, o el socio que la prueba) apenas se PUBLICA una versión nueva se instala sola (sin botón),
     cuando no estás escribiendo ni con una ventana abierta, y al volver avisa "App actualizada". Si falla, reintenta en 10 minutos.
   - usuarios: cuando el admin la LIBERA les aparece una tarjeta "🔄 Hay una versión nueva" con el botón "🔄 Actualizar" (no se instala sola).
   Sin { admin } se mira CFX_AYUDA.esAdmin() (núcleo ayuda.js). */
(function () {
  'use strict';
  if (window.CodeFixAuto) return;
  const K = 'cfx:auto:', LISTA = 'cfx:actualizada';
  const ocupado = () => !!document.querySelector('dialog[open], .modal:not([hidden]), .velo, .cfx-mv') ||
    !!(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) || document.hidden;
  function aviso(t) {
    const d = document.createElement('div');
    d.className = 'cfx-auto-aviso'; d.textContent = t; d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:120;background:#111827;color:#fff;padding:11px 16px;border-radius:12px;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;pointer-events:none';
    document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
  }
  // 🔄 Tarjeta para los usuarios: la versión liberada se instala cuando ellos tocan "Actualizar".
  function tarjeta(version, actualizar) {
    if (document.getElementById('cfxAutoUpd')) return;
    try { if (sessionStorage.getItem(K + 'luego:' + version)) return; } catch (e) { /* sin storage */ }
    const d = document.createElement('div');
    d.id = 'cfxAutoUpd'; d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(92px + env(safe-area-inset-bottom));z-index:2147480000;width:min(420px,calc(100vw - 24px));box-sizing:border-box;' +
      'display:flex;gap:10px;align-items:center;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.22);padding:12px 12px 12px 14px;border-radius:14px;font:500 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    d.innerHTML = '<div style="flex:1;min-width:0"><b style="display:block">🔄 Versión nueva</b><span style="opacity:.8;font-size:13px">v' + String(version).replace(/[^0-9.]/g, '') + ' · toma segundos</span></div>' +
      '<button type="button" data-si style="flex:none;min-height:42px;padding:0 14px;border:0;border-radius:10px;background:#fff;color:#111827;font:700 14px system-ui,sans-serif;cursor:pointer">🔄 Actualizar</button>' +
      '<button type="button" data-no aria-label="Después" style="flex:none;width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#fff;font-size:18px;cursor:pointer">✕</button>';
    d.querySelector('[data-si]').onclick = (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Actualizando…';
      try { sessionStorage.setItem(LISTA, version); } catch (e) { /* sin storage */ }
      try { actualizar(); } catch (e) { ev.target.disabled = false; ev.target.textContent = '🔄 Actualizar'; }
    };
    d.querySelector('[data-no]').onclick = () => { try { sessionStorage.setItem(K + 'luego:' + version, '1'); } catch (e) { /* sin storage */ } d.remove(); };
    document.body.appendChild(d);
  }
  window.CodeFixAuto = function (version, actualizar, o) {
    if (!version || typeof actualizar !== 'function') return;
    const admin = o && 'admin' in o ? !!o.admin : !!(window.CFX_AYUDA && window.CFX_AYUDA.esAdmin && window.CFX_AYUDA.esAdmin());
    if (!admin) { const ir = () => (document.body ? tarjeta(version, actualizar) : setTimeout(ir, 300)); ir(); return; }
    let t = 0;
    try { t = Number(sessionStorage.getItem(K + version)) || 0; } catch (e) { /* sin storage */ }
    if (Date.now() - t < 10 * 60 * 1000) return; // ya se intentó hace poco
    // Sin bucle: como máximo 2 intentos por versión cada 30 minutos (si el hosting aún no la termina de publicar, se espera).
    let I = [];
    try { I = JSON.parse(localStorage.getItem(K + 'n:' + version) || '[]').filter((x) => Date.now() - x < 30 * 60 * 1000); } catch (e) { I = []; }
    if (I.length >= 2) return;
    const correr = () => {
      if (ocupado()) { setTimeout(correr, 4000); return; }
      try { sessionStorage.setItem(K + version, String(Date.now())); sessionStorage.setItem(LISTA, version); I.push(Date.now()); localStorage.setItem(K + 'n:' + version, JSON.stringify(I)); } catch (e) { /* sin storage */ }
      aviso('Actualizando a la v' + version + '…');
      try { actualizar(); } catch (e) { /* se reintenta después */ }
    };
    correr();
  };
  // Después de recargar: confirma la versión nueva.
  try {
    const v = sessionStorage.getItem(LISTA);
    if (v) { sessionStorage.removeItem(LISTA); setTimeout(() => aviso('App actualizada a la v' + v + ' ✓'), 1500); }
  } catch (e) { /* sin storage */ }
})();
