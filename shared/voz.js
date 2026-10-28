/* CodeFix · Núcleo · Dictado por voz en cualquier campo de texto (mismo archivo en cada repositorio).
   Al tocar un campo para escribir (textos, notas, mensajes, búsquedas) aparece un micrófono al lado:
   lo tocas, hablas y se escribe solo. No cambia el diseño de ninguna pantalla.
   No aparece en correos, contraseñas, números, fechas ni teléfonos. Para apagarlo en un campo: data-sin-voz. */
(function () {
  'use strict';
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R || window.CodeFixVoz) return;
  const SIRVE = 'textarea, input:not([type]), input[type=text], input[type=search]';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cfx-voz'; b.setAttribute('aria-label', 'Dictar con la voz'); b.hidden = true;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
  let campo = null, rec = null;
  const sirve = (e) => e && e.matches && e.matches(SIRVE) && !e.readOnly && !e.disabled && !e.closest('[data-sin-voz]') && !/correo|email|clave|pass|rut|codigo|código/i.test((e.name || '') + (e.id || '') + (e.autocomplete || ''));
  function ubicar() {
    if (!campo || !campo.isConnected) return ocultar();
    const r = campo.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return ocultar();
    const alto = campo.tagName === 'TEXTAREA' ? 34 : Math.min(36, r.height - 8);
    b.style.cssText = 'position:fixed;z-index:130;width:' + alto + 'px;height:' + alto + 'px;left:' + Math.round(r.right - alto - 6) + 'px;top:' + Math.round(campo.tagName === 'TEXTAREA' ? r.bottom - alto - 6 : r.top + (r.height - alto) / 2) + 'px';
    b.hidden = false;
  }
  function ocultar() { if (!rec) b.hidden = true; }
  // Dentro de una ventana (dialog) el botón va en la ventana: si no, quedaría detrás de ella.
  document.addEventListener('focusin', (e) => { if (sirve(e.target)) { campo = e.target; const cont = campo.closest('dialog[open]') || document.body; if (b.parentNode !== cont) cont.appendChild(b); ubicar(); } });
  document.addEventListener('focusout', () => setTimeout(() => { if (!rec && !(document.activeElement && sirve(document.activeElement))) ocultar(); }, 150));
  addEventListener('scroll', () => { if (!b.hidden) ubicar(); }, true);
  addEventListener('resize', () => { if (!b.hidden) ubicar(); });
  b.addEventListener('mousedown', (e) => e.preventDefault()); // que el campo no pierda el foco
  b.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    if (!campo) return;
    const c = campo, base = c.value && !/\s$/.test(c.value) ? c.value + ' ' : c.value || '';
    rec = new R(); rec.lang = 'es-CL'; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (ev) => {
      c.value = base + Array.from(ev.results).map((x) => x[0].transcript).join('');
      c.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onend = () => { rec = null; b.classList.remove('on'); c.focus(); };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed') alert('Permite el micrófono en el navegador para dictar.'); };
    b.classList.add('on'); rec.start();
  });
  window.CodeFixVoz = { ubicar };
})();
