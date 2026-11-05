/* CodeFix · Núcleo · Dictado por voz en cualquier campo de texto (mismo archivo en cada repositorio).
   Al tocar un campo para escribir (textos, notas, mensajes, búsquedas) aparece un micrófono al lado:
   lo tocas, hablas y se escribe solo. No cambia el diseño de ninguna pantalla.
   Se apaga solo: al dejar de hablar (2,5 s de silencio) termina el dictado, y si no lo usas (3 s sin escribir) el botón
   se esconde; vuelve al tocar el campo otra vez. Nunca en contraseñas (tampoco con el ojito), correos, números, fechas,
   teléfonos, RUT ni códigos. Para apagarlo en un campo: data-sin-voz. */
(function () {
  'use strict';
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R || window.CodeFixVoz) return;
  const SIRVE = 'textarea, input:not([type]), input[type=text], input[type=search]';
  const NO = /correo|e-?mail|clave|contrase|pass|\bpin\b|\brut\b|c[oó]digo|\botp\b|tel[eé]f|fono|celular|whats|monto|precio|\bvalor\b|cantidad|n[uú]mero|stock|\bedad\b|porcentaje|descuento|cuenta\s*banc/i;
  const SILENCIO = 2500, SIN_VOZ = 7000, MAX = 60000, QUIETO = 3000;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cfx-voz'; b.setAttribute('aria-label', 'Dictar con la voz'); b.hidden = true;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
  let campo = null, rec = null, tCallado = 0, tMax = 0, tQuieto = 0, tForzar = 0;
  const sirve = (e) => !!(e && e.matches && e.matches(SIRVE) && !e.readOnly && !e.disabled && !e.closest('[data-sin-voz], .cfx-pin') &&
    !e.dataset.cfxOjo && !e.hasAttribute('data-pin') && !/numeric|decimal|tel|email|none/i.test(e.inputMode || e.getAttribute('inputmode') || '') &&
    !/email|tel|password|one-time-code|cc-|bday|postal/i.test(e.autocomplete || '') && !/^\[?\\?d|^\[0-9/.test(e.getAttribute('pattern') || '') &&
    !NO.test([e.name, e.id, e.getAttribute('placeholder'), e.getAttribute('aria-label')].join(' ')));
  function ubicar() {
    if (!campo || !campo.isConnected || (!rec && document.activeElement !== campo)) return ocultar(true);
    const r = campo.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return ocultar(true);
    // Tamaño según el campo (en campos chicos el botón se achica) y el texto no queda debajo del micrófono.
    const alto = Math.round(Math.max(18, Math.min(campo.tagName === 'TEXTAREA' ? 30 : 28, r.height * 0.62, r.width / 6)));
    if (!campo.dataset.cfxPad) { campo.dataset.cfxPad = campo.style.paddingRight || '-'; campo.style.paddingRight = (alto + 12) + 'px'; }
    b.style.cssText = 'position:fixed;z-index:2147483000;width:' + alto + 'px;height:' + alto + 'px;left:' + Math.round(r.right - alto - Math.max(4, (r.height - alto) / 2.4)) + 'px;top:' + Math.round(campo.tagName === 'TEXTAREA' ? r.bottom - alto - 7 : r.top + (r.height - alto) / 2) + 'px';
    b.hidden = false;
  }
  // forzar: también si estaba dictando (el campo desapareció, otra pantalla, la app pasó a segundo plano).
  function ocultar(forzar) {
    if (rec) { if (!forzar) return; parar(); }
    clearTimeout(tQuieto);
    b.hidden = true; b.classList.remove('on');
    document.querySelectorAll('[data-cfx-pad]').forEach((c) => { c.style.paddingRight = c.dataset.cfxPad === '-' ? '' : c.dataset.cfxPad; delete c.dataset.cfxPad; });
  }
  // Sin usarlo un rato (no habla ni escribe), el micrófono se esconde; tocar el campo lo vuelve a mostrar.
  const esperar = () => { clearTimeout(tQuieto); tQuieto = setTimeout(() => { if (!rec) ocultar(); }, QUIETO); };
  function mostrar(c) {
    campo = c; const cont = c.closest('dialog[open]') || document.body;  // dentro de una ventana va en la ventana: si no, quedaría detrás
    if (b.parentNode !== cont) cont.appendChild(b);
    ubicar(); esperar();
  }
  function terminar() {
    clearTimeout(tCallado); clearTimeout(tMax); clearTimeout(tForzar);
    rec = null; b.classList.remove('on'); b.setAttribute('aria-label', 'Dictar con la voz');
    if (campo && document.activeElement === campo) { ubicar(); esperar(); } else ocultar();
  }
  // Parar: si el navegador no avisa que terminó (pasa en algunos Android), se corta igual al segundo y medio.
  function parar() {
    const r = rec; if (!r) return;
    try { r.stop(); } catch (e) { /* ya estaba parado */ }
    clearTimeout(tForzar);
    tForzar = setTimeout(() => { if (rec === r) { try { r.abort(); } catch (e) { /* nada */ } terminar(); } }, 1500);
  }
  const callado = (ms) => { clearTimeout(tCallado); tCallado = setTimeout(parar, ms); };
  document.addEventListener('focusin', (e) => { if (sirve(e.target)) { if (rec && e.target !== campo) parar(); mostrar(e.target); } else if (rec) parar(); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (a === campo) return; if (rec) parar(); if (!(a && sirve(a))) ocultar(); }, 150));
  // Tocar el campo de nuevo (ya con el foco) vuelve a mostrar el micrófono.
  document.addEventListener('pointerdown', (e) => { if (!rec && e.target === campo && b.hidden && sirve(campo)) setTimeout(() => mostrar(campo), 0); }, true);
  document.addEventListener('input', (e) => { if (e.target === campo && !rec && !b.hidden) esperar(); }, true);
  document.addEventListener('keydown', (e) => { if (rec && e.target === campo && e.key !== 'Shift') parar(); }, true);  // empezó a escribir: se apaga el dictado
  document.addEventListener('visibilitychange', () => { if (document.hidden) ocultar(true); });
  addEventListener('pagehide', () => ocultar(true));
  addEventListener('hashchange', () => ocultar(true));
  addEventListener('scroll', () => { if (!b.hidden) ubicar(); }, true);
  addEventListener('resize', () => { if (!b.hidden) ubicar(); });
  setInterval(() => { if (!b.hidden) ubicar(); }, 600); // si la pantalla cambia sin mover nada (otra vista, ventana cerrada), el micrófono no queda suelto
  b.addEventListener('mousedown', (e) => e.preventDefault()); // que el campo no pierda el foco
  b.addEventListener('click', () => {
    if (rec) { parar(); return; }
    if (!campo || !sirve(campo)) return ocultar();
    clearTimeout(tQuieto);
    const c = campo, base = c.value && !/\s$/.test(c.value) ? c.value + ' ' : c.value || '';
    let r;
    try { r = new R(); } catch (e) { return ocultar(); }
    rec = r; r.lang = 'es-CL'; r.interimResults = true; r.continuous = false;
    r.onresult = (ev) => {
      if (rec !== r) return;
      c.value = base + Array.from(ev.results).map((x) => x[0].transcript).join('');
      c.dispatchEvent(new Event('input', { bubbles: true }));
      callado(SILENCIO);  // dejó de hablar → se apaga solo
    };
    r.onspeechend = () => { if (rec === r) callado(600); };
    r.onend = () => { if (rec === r) terminar(); };
    r.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') alert('Permite el micrófono en el navegador para dictar.'); if (rec === r) terminar(); };
    b.classList.add('on'); b.setAttribute('aria-label', 'Detener el dictado');
    callado(SIN_VOZ); tMax = setTimeout(parar, MAX);
    try { r.start(); } catch (e) { terminar(); }
  });
  window.CodeFixVoz = { ubicar, parar, ocultar: () => ocultar(true), sirve };
})();
