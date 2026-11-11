/* CodeFix · Núcleo · Dictado por voz en cualquier campo de texto (mismo archivo en cada repositorio).
   Al tocar un campo para escribir (textos, notas, mensajes, búsquedas) aparece un micrófono al lado:
   lo tocas, hablas y se escribe solo. No cambia el diseño de ninguna pantalla.
   Se apaga solo: al dejar de hablar (2,5 s de silencio) termina el dictado, y si no lo usas (3 s sin escribir) el botón
   se esconde; vuelve al tocar el campo otra vez. Nunca en contraseñas (tampoco con el ojito), correos, números, fechas,
   teléfonos, RUT ni códigos. Para apagarlo en un campo: data-sin-voz.
   G20: CodeFixVoz.escuchar() (una frase sin campo) y CFX_PEDIDO.leer() (interpreta un pedido dicho o escrito). */
(function () {
  'use strict';
  // ---------- G20: interpretar un pedido dicho o escrito ("2 cortinas rojas, 50 globos rojos de 9 pulgadas") ----------
  // CFX_PEDIDO.leer(texto, catalogo, frecuentes) → { lineas: [{ texto, cant, dicha, prod, opcion, puntos, otros }], sin: [texto] }
  //   catalogo: [{ id, nombre, ops: ['Rojo', 'Azul'], alias? }] · frecuentes: { [id]: { u: unidades vendidas, cant: cantidad típica } }
  // Busca aproximado (singular/plural, femenino/masculino, tildes, una letra de diferencia). Sirve sin micrófono (texto escrito).
  if (!window.CFX_PEDIDO) {
    const NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
      dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
      doscientos: 200, doscientas: 200, trescientos: 300, quinientos: 500, mil: 1000, par: 2, docena: 12, decena: 10 };
    const VEINTI = { veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
    const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'en', 'y', 'color', 'colores', 'porfa', 'favor', 'quiero', 'dame', 'deme', 'me', 'da', 'unidades', 'unidad', 'tamano', 'talla']);
    const sinTilde = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const raiz = (w) => (/^\d+$/.test(w) || w.length <= 3 ? w : w.replace(/(es|as|os|a|o|s|e)$/, ''));
    const fichas = (t) => sinTilde(t).replace(/(\d)([a-z])/g, '$1 $2').replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter((w) => w && !VACIAS.has(w)).map(raiz);
    const lev1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; };
    const igual = (a, b) => a === b || (!/^\d/.test(a) && !/^\d/.test(b) && ((a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && lev1(a, b))));
    const cuantos = (A, B) => A.filter((a) => B.some((b) => igual(a, b))).length;
    function cantidad(c) {
      let w = sinTilde(c).trim().split(/\s+/), n = null, i = 0;
      if (w[0] === 'media' && w[1] === 'docena') return [6, w.slice(2).join(' ')];
      if (/^\d+([.,]\d+)?$/.test(w[0])) { n = +w[0].replace(',', '.'); i = 1; }
      else if (VEINTI[w[0]]) { n = VEINTI[w[0]]; i = 1; }
      else if (NUM[w[0]] != null) {
        n = NUM[w[0]]; i = 1;
        if (w[1] === 'y' && NUM[w[2]] != null && NUM[w[2]] < 10 && n >= 30) { n += NUM[w[2]]; i = 3; }
        else if (n >= 100 && NUM[w[1]] != null && NUM[w[1]] < 100) { n += NUM[w[1]]; i = 2; }
        if ((w[0] === 'un' || w[0] === 'una') && (w[1] === 'par' || w[1] === 'docena')) { n = NUM[w[1]]; i = 2; }
      }
      if (w[i] === 'de' && n && n >= 2) i++;  // "una docena de globos"
      return [n, w.slice(i).join(' ')];
    }
    function partir(t) {
      const q = Object.keys(NUM).concat(Object.keys(VEINTI)).join('|');
      return sinTilde(t).replace(/\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (m, a, b) => String(NUM[a] + NUM[b]))
        .split(new RegExp('[,;\\n]+|\\.(?!\\d)|\\s+(?:y|mas|tambien|ademas)\\s+(?=(?:\\d+|' + q + ')\\b)', 'g')).map((x) => x.trim()).filter(Boolean);
    }
    function leer(texto, catalogo, frec) {
      frec = frec || {};
      const max = Math.max(1, ...Object.values(frec).map((f) => f.u || 0));
      const cat = (catalogo || []).map((p) => ({ p, f: fichas(p.nombre + ' ' + (p.alias || '')), ops: (p.ops || []).map((o) => ({ o, f: fichas(o) })) }));
      const out = { lineas: [], sin: [] };
      partir(texto).forEach((c) => {
        const [n, resto] = cantidad(c), F = fichas(resto);
        if (!F.length) return;
        const notas = cat.map((x) => {
          const op = x.ops.map((o) => ({ o: o.o, m: cuantos(o.f, F) })).sort((a, b) => b.m - a.m)[0];
          const mN = cuantos(F, x.f), mO = op ? op.m : 0;
          if (!mN) return null;
          const fr = frec[x.p.id] ? 0.12 * Math.log(1 + frec[x.p.id].u) / Math.log(1 + max) : 0;
          return { x, op: mO ? op.o : null, puntos: (mN + mO) / F.length * 0.7 + mN / x.f.length * 0.3 + fr };
        }).filter(Boolean).sort((a, b) => b.puntos - a.puntos);
        if (!notas.length) { out.sin.push(c); return; }
        const b = notas[0], f = frec[b.x.p.id];
        out.lineas.push({ texto: c, cant: n || (f && f.cant) || 1, dicha: !!n, prod: b.x.p, opcion: b.op, puntos: Math.round(b.puntos * 100) / 100,
          otros: notas.slice(1, 4).map((o) => ({ prod: o.x.p, opcion: o.op })) });
      });
      return out;
    }
    window.CFX_PEDIDO = { leer, fichas, partir };
  }
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
  // G27: el micrófono va DENTRO de la página, junto a su campo (no fijo en la pantalla): al bajar se va con el campo
  // y queda debajo de la cabecera y de la barra de abajo, nunca flotando encima. Al esconderse sale de la página.
  function caja(c) {
    const op = c.offsetParent;
    return op && op !== document.body && op !== document.documentElement && getComputedStyle(op).position !== 'static' ? op : document.body;
  }
  function ubicar() {
    if (!campo || !campo.isConnected || (!rec && document.activeElement !== campo)) return ocultar(true);
    const r = campo.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return ocultar(true);
    // Tamaño según el campo (en campos chicos el botón se achica) y el texto no queda debajo del micrófono.
    const alto = Math.round(Math.max(18, Math.min(campo.tagName === 'TEXTAREA' ? 30 : 28, r.height * 0.62, r.width / 6)));
    if (!campo.dataset.cfxPad) { campo.dataset.cfxPad = campo.style.paddingRight || '-'; campo.style.paddingRight = (alto + 12) + 'px'; }
    const k = caja(campo); if (b.parentNode !== k) k.appendChild(b);
    const fijo = 'position:absolute!important;z-index:2!important;margin:0!important;min-width:0!important;max-width:none!important;width:' + alto + 'px!important;height:' + alto + 'px!important;';
    b.style.cssText = fijo + 'left:0;top:0'; b.hidden = false;
    const o = b.getBoundingClientRect();  // dónde queda el (0,0) de su caja, con lo que se haya bajado
    const x = r.right - alto - Math.max(4, (r.height - alto) / 2.4), y = campo.tagName === 'TEXTAREA' ? r.bottom - alto - 7 : r.top + (r.height - alto) / 2;
    b.style.cssText = fijo + 'left:' + Math.round(x - o.left) + 'px;top:' + Math.round(y - o.top) + 'px';
  }
  // forzar: también si estaba dictando (el campo desapareció, otra pantalla, la app pasó a segundo plano).
  function ocultar(forzar) {
    if (rec) { if (!forzar) return; parar(); }
    clearTimeout(tQuieto);
    b.hidden = true; b.classList.remove('on'); b.remove();
    document.querySelectorAll('[data-cfx-pad]').forEach((c) => { c.style.paddingRight = c.dataset.cfxPad === '-' ? '' : c.dataset.cfxPad; delete c.dataset.cfxPad; });
  }
  // Sin usarlo un rato (no habla ni escribe), el micrófono se esconde; tocar el campo lo vuelve a mostrar.
  const esperar = () => { clearTimeout(tQuieto); tQuieto = setTimeout(() => { if (!rec) ocultar(); }, QUIETO); };
  function mostrar(c) {
    campo = c; ubicar(); esperar();  // G27: va dentro de la caja del campo (también en ventanas), ver ubicar()
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
  // ---------- G20: escuchar una frase (sin campo) ----------
  // CodeFixVoz.escuchar({ parcial(txt) }) → Promise<texto>. Se corta sola tras 2 s de silencio (máx. 20 s).
  function escuchar(o) {
    o = o || {};
    return new Promise((ok, mal) => {
      let r, txt = '', t = 0, fin = false;
      try { r = new R(); } catch (e) { return mal(new Error('Este navegador no permite dictar.')); }
      r.lang = 'es-CL'; r.interimResults = true; r.continuous = true;
      const cortar = () => { try { r.stop(); } catch (e) { /* nada */ } };
      const listo = () => { if (fin) return; fin = true; clearTimeout(t); clearTimeout(tm); ok(txt.trim()); };
      const tm = setTimeout(cortar, 20000);
      r.onresult = (ev) => { txt = Array.from(ev.results).map((x) => x[0].transcript).join(' '); if (o.parcial) o.parcial(txt); clearTimeout(t); t = setTimeout(cortar, 2000); };
      r.onend = listo;
      r.onerror = (ev) => { if (fin) return; if (ev.error === 'no-speech' || ev.error === 'aborted') return listo(); fin = true; clearTimeout(tm);
        mal(new Error(/not-allowed|service-not-allowed/.test(ev.error) ? 'Permite el micrófono en el navegador.' : 'No se pudo escuchar (' + ev.error + ').')); };
      o.parar = cortar;
      try { r.start(); } catch (e) { fin = true; mal(e); }
    });
  }
  window.CodeFixVoz = { ubicar, parar, ocultar: () => ocultar(true), sirve, escuchar };
})();
