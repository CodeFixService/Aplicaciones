/* CodeFix · Núcleo · Actualización automática de la app (mismo archivo en cada repositorio).
   Cada app llama a CodeFixAuto(versión, actualizar) cuando hay una versión liberada más nueva que la suya:
   se instala sola (sin botón), apenas no estés escribiendo ni con una ventana abierta, y al volver avisa "App actualizada".
   Si falla (sin internet o aún publicándose), lo reintenta en 10 minutos. */
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
  window.CodeFixAuto = function (version, actualizar) {
    if (!version || typeof actualizar !== 'function') return;
    let t = 0;
    try { t = Number(sessionStorage.getItem(K + version)) || 0; } catch (e) { /* sin storage */ }
    if (Date.now() - t < 10 * 60 * 1000) return; // ya se intentó hace poco
    const correr = () => {
      if (ocupado()) { setTimeout(correr, 4000); return; }
      try { sessionStorage.setItem(K + version, String(Date.now())); sessionStorage.setItem(LISTA, version); } catch (e) { /* sin storage */ }
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
