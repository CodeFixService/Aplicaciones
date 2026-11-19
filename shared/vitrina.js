// CodeFix · Núcleo · Vitrina (perfil del negocio): tarjeta de portada para la página pública (logo, nombre, rubro, estado, estrellas,
// descripción, dirección con mapa, horario, WhatsApp, redes y compartir) y los campos para editarlo en Ajustes.
// G117: CodeFixVitrina.horario(input) y .transferencia(campo) ordenan esos campos (ver abajo).
//   CodeFixVitrina.montar(nodo, t)          t = { empresa, logo, color, rubro, horario, abierto, vacaciones_hasta, vacaciones_msg,
//                                               estrellas: {promedio,total}, telefono, wa_texto (mensaje listo, opcional), desde, perfil: {descripcion, direccion, comuna,
//                                               instagram, facebook, tiktok, web, correo} }
//                                               t.politicas = true → tienda online: muestra 📄 Cambios, devoluciones y garantía (Ley 19.496) con
//                                               perfil.razon, rut, cambios, envios, sin_retracto (2.58; las apps que no lo pasan quedan igual).
//   CodeFixVitrina.editor(nodo, perfil, { politicas })  dibuja los campos; CodeFixVitrina.leer(nodo) devuelve el objeto para guardar.
(function () {
  if (window.CodeFixVitrina) return;
  const esc = (s) => window.CFX_ESC(s);  // seguro.js (núcleo)
  const B = 'var(--brand, #2563eb)';
  let css = false;
  function estilos() {
    if (css) return; css = true;
    const st = document.createElement('style');
    st.textContent = `
    .pf{position:relative;border-radius:22px;overflow:hidden;margin:0 0 16px;background:var(--card);border:1px solid color-mix(in srgb,${B} 22%,var(--line));
      box-shadow:0 10px 30px -18px color-mix(in srgb,${B} 70%,transparent)}
    .pf-ban{height:86px;background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,${B} 85%,#fff) 0,${B} 45%,color-mix(in srgb,${B} 70%,#000) 100%)}
    .pf-cab{display:flex;gap:12px;align-items:flex-start;padding:0 16px;margin-top:-38px}
    .pf-logo{width:76px;height:76px;flex:none;border-radius:20px;border:4px solid var(--card);background:${B} center/cover no-repeat;display:grid;place-items:center;
      font-size:30px;font-weight:800;line-height:1;color:var(--brand-ink,#fff);box-shadow:0 4px 14px rgba(0,0,0,.15)}
    .pf-nom{min-width:0;padding-top:44px}
    .pf-nom h2{margin:0;font-size:22px;line-height:1.15;overflow-wrap:anywhere}
    .pf-nom .muted{font-size:13px}
    .pf-cuerpo{padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px}
    .pf-pills{display:flex;flex-wrap:wrap;gap:6px}
    .pf-pill{font-size:13px;font-weight:700;padding:5px 10px;border-radius:99px;background:var(--field);border:1px solid var(--line)}
    .pf-pill.ok{background:color-mix(in srgb,#16a34a 14%,var(--card));color:#15803d;border-color:color-mix(in srgb,#16a34a 35%,var(--line))}
    .pf-pill.no{background:color-mix(in srgb,#dc2626 12%,var(--card));color:#b91c1c;border-color:color-mix(in srgb,#dc2626 30%,var(--line))}
    .pf-desc{margin:0;white-space:pre-line;overflow-wrap:anywhere}
    .pf-info{display:flex;flex-direction:column;gap:6px;font-size:14px}
    .pf-info a,.pf-info span{color:inherit;text-decoration:none;display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere}
    .pf-info a:hover{color:${B}}
    .pf-acc{display:flex;flex-wrap:wrap;gap:8px}
    .pf-acc .btn,.pf-acc button{flex:1 1 140px;min-height:42px;border-radius:12px}
    .pf-red{display:flex;flex-wrap:wrap;gap:6px}
    .pf-pol{border-top:1px solid var(--line);padding-top:10px;font-size:14px}
    .pf-pol summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:8px}
    .pf-pol summary::-webkit-details-marker{display:none}
    .pf-pol summary::after{content:'›';transition:transform .2s}
    .pf-pol[open] summary::after{transform:rotate(90deg)}
    .pf-pol h4{margin:12px 0 4px;font-size:14px}
    .pf-pol p{margin:0;white-space:pre-line;overflow-wrap:anywhere;color:var(--muted)}
    .pf-red a{font-size:13px;font-weight:600;padding:6px 10px;border-radius:99px;background:color-mix(in srgb,${B} 10%,var(--card));color:${B};text-decoration:none}`;
    document.head.appendChild(st);
  }
  const red = (v, base) => /^https?:\/\//i.test(v) ? v : base + String(v).replace(/^@/, '').replace(/[^\w.\-]/g, '');
  const fecha = (d, o) => new Date(d + 'T12:00').toLocaleDateString('es', o);

  function montar(nodo, t) {
    if (!nodo || !t) return;
    estilos();
    const p = t.perfil || {}, partes = [];
    const logo = /^data:image\/|^https:/.test(t.logo || '') ? ' style="background-image:url(&quot;' + esc(t.logo) + '&quot;)"' : '';
    const pills = [];
    if (t.vacaciones_hasta) pills.push('<span class="pf-pill no">🌴 De vacaciones hasta el ' + esc(fecha(t.vacaciones_hasta, { day: 'numeric', month: 'long' })) + '</span>');
    else if (t.abierto === false) pills.push('<span class="pf-pill no">🔴 Cerrado ahora · puedes pedir igual</span>');
    else if (t.abierto) pills.push('<span class="pf-pill ok">🟢 Abierto</span>');
    if (t.estrellas && t.estrellas.total) pills.push('<span class="pf-pill">⭐ ' + Number(t.estrellas.promedio).toLocaleString('es-CL') + ' · ' + t.estrellas.total + ' calificaciones</span>');
    partes.push('<div class="pf-pills">' + pills.join('') + '</div>');
    if (t.vacaciones_hasta && t.vacaciones_msg) partes.push('<p class="pf-desc muted">' + esc(t.vacaciones_msg) + '</p>');
    if (p.descripcion) partes.push('<p class="pf-desc">' + esc(p.descripcion) + '</p>');
    const info = [];
    const dir = [p.direccion, p.comuna].filter(Boolean).join(', ');
    if (dir) info.push('<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dir) + '" target="_blank" rel="noopener">📍 <span>' + esc(dir) + '</span></a>');
    if (t.horario) info.push('<span>🕒 <span>' + esc(t.horario) + '</span></span>');
    if (p.correo) info.push('<a href="mailto:' + esc(p.correo) + '">✉️ <span>' + esc(p.correo) + '</span></a>');
    if (t.desde) info.push('<span class="muted">📅 <span>Tienda desde ' + esc(fecha(t.desde, { month: 'long', year: 'numeric' })) + '</span></span>');
    if (info.length) partes.push('<div class="pf-info">' + info.join('') + '</div>');
    const redes = [];
    if (p.instagram) redes.push(['Instagram', red(p.instagram, 'https://instagram.com/')]);
    if (p.facebook) redes.push(['Facebook', red(p.facebook, 'https://facebook.com/')]);
    if (p.tiktok) redes.push(['TikTok', red(p.tiktok, 'https://www.tiktok.com/@')]);
    if (p.web) redes.push(['🌐 Sitio web', p.web]);
    if (redes.length) partes.push('<div class="pf-red">' + redes.map(([n, u]) => '<a href="' + esc(window.CFX_URL(u)) + '" target="_blank" rel="noopener">' + esc(n) + '</a>').join('') + '</div>');
    if (t.politicas) partes.push(politicas(t, p, dir));
    const tel = String(t.telefono || '').replace(/\D/g, '');
    const wa = 'https://wa.me/' + tel + (t.wa_texto ? '?text=' + encodeURIComponent(t.wa_texto) : '');
    partes.push('<div class="pf-acc">' + (tel ? '<a class="btn ok" href="' + esc(wa) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') +
      '<button type="button" class="alt" data-pf="compartir">🔗 Compartir tienda</button></div>');
    nodo.innerHTML = '<section class="pf"><div class="pf-ban"></div><div class="pf-cab"><div class="pf-logo"' + logo + '>' + (logo ? '' : esc((t.empresa || '?').charAt(0).toUpperCase())) +
      '</div><div class="pf-nom"><h2>' + esc(t.empresa || 'Tienda') + '</h2>' + (t.rubro ? '<div class="muted">' + esc(t.rubro) + '</div>' : '') + '</div></div>' +
      '<div class="pf-cuerpo">' + partes.join('') + '</div></section>';
    nodo.querySelector('[data-pf="compartir"]').onclick = async () => {
      // G33: abierta en workers.dev y con dominio de CodeFix ✅ → se comparte el link del dominio.
      const sd = window.CFX_AYUDA && CFX_AYUDA.sitio ? CFX_AYUDA.sitio() : '';
      const url = /\.workers\.dev$/.test(location.hostname) && /^https:\/\//.test(sd) && sd.indexOf(location.origin) !== 0 ? sd.replace(/\/$/, '') + location.pathname + location.search : location.href.split('#')[0];
      try { if (navigator.share) return await navigator.share({ title: t.empresa, url }); } catch (e) { return; }
      try { await navigator.clipboard.writeText(url); (window.Core && Core.toast) ? Core.toast('🔗 Link copiado') : alert('Link copiado'); } catch (e) { if (window.CFX_DIALOGO) CFX_DIALOGO.pedir('Copia el link', url, { si: 'Cerrar' }); else prompt('Copia el link', url); }
    };
  }

  // Ley 19.496 (consumidor): identidad del vendedor, retracto de 10 días en compras a distancia (art. 3 bis, salvo que la tienda
  // lo excluya antes de la compra) y garantía legal de 6 meses (art. 21). La tienda puede sumar su propia política de cambios y envíos.
  function politicas(t, p, dir) {
    const sec = (h, x) => '<h4>' + h + '</h4><p>' + x + '</p>';
    const quien = [p.razon || t.empresa, p.rut ? 'RUT ' + p.rut : '', dir].filter(Boolean).map(esc).join(' · ');
    return '<details class="pf-pol" id="politicas"><summary>📄 Cambios, devoluciones y garantía</summary>' +
      sec('🏪 Quién vende', quien + (p.correo ? '<br>' + esc(p.correo) : '')) +
      (p.cambios ? sec('🔁 Cambios y devoluciones', esc(p.cambios)) : '') +
      (p.envios ? sec('🚚 Envíos', esc(p.envios)) : '') +
      sec('↩️ Derecho a retracto', p.sin_retracto ? 'En compras por internet esta tienda no acepta el retracto (Ley 19.496, art. 3 bis).'
        : 'Si compras por internet tienes 10 días desde que recibes el producto para arrepentirte: lo devuelves sin uso y con su embalaje, y te devuelven el dinero (Ley 19.496, art. 3 bis).') +
      sec('🛡️ Garantía legal', 'Si el producto viene con falla tienes 6 meses desde que lo recibes para elegir cambio, reparación o devolución del dinero (Ley 19.496, art. 21).') +
      '</details>';
  }

  const POL = [['razon', 'Razón social o nombre del vendedor', 'Como aparece en el SII', 120], ['rut', 'RUT', '12.345.678-9', 12],
    ['cambios', 'Tu política de cambios y devoluciones', 'Ej: Cambios hasta 30 días con boleta y etiqueta. Escríbenos por WhatsApp.', 800],
    ['envios', 'Envíos (opcional)', 'Ej: Despachamos en 24 a 48 h hábiles. A regiones por Starken.', 400]];
  const CAMPOS = [['descripcion', 'Sobre tu negocio', 'Qué vendes, qué te hace distinto…', 400], ['direccion', 'Dirección', 'Calle y número (opcional)', 150],
    ['comuna', 'Comuna', 'Ej: Ñuñoa', 60], ['instagram', 'Instagram', '@tutienda', 100], ['facebook', 'Facebook', 'tutienda o link', 100],
    ['tiktok', 'TikTok', '@tutienda', 100], ['web', 'Sitio web', 'tutienda.cl', 150], ['correo', 'Correo de contacto', 'hola@tutienda.cl', 120]];
  function editor(nodo, perfil, o) {
    if (!nodo) return;
    const p = perfil || {};
    const campo = ([k, l, ph, m]) => '<label for="pf-' + k + '">' + l + '</label>' + (k === 'descripcion' || k === 'cambios' || k === 'envios'
      ? '<textarea id="pf-' + k + '" data-pf="' + k + '" maxlength="' + m + '" placeholder="' + ph + '">' + esc(p[k]) + '</textarea>'
      : '<input id="pf-' + k + '" data-pf="' + k + '" maxlength="' + m + '" placeholder="' + ph + '" value="' + esc(p[k]) + '"' + (k === 'correo' ? ' type="email"' : '') + '>');
    nodo.innerHTML = CAMPOS.map(campo).join('') + (o && o.politicas ? '<h3 style="margin:18px 0 0">📄 Políticas de la tienda</h3>' +
      '<p class="muted" style="margin:4px 0 0;font-size:13px">La ley pide mostrarlas en la venta por internet. El retracto y la garantía legal ya salen solos.</p>' +
      POL.map(campo).join('') + '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-pf="sin_retracto" style="width:auto"' + (p.sin_retracto ? ' checked' : '') +
      '> No acepto retracto en compras por internet</label>' : '');
    // G117 c: la comuna sugiere la lista (si la app carga despacho.js); el texto sigue libre (regiones).
    const cm = nodo.querySelector('[data-pf="comuna"]'), L = window.Despacho && Despacho.COMUNAS_RM;
    if (cm && L && !document.getElementById('pfComunas')) { const dl = document.createElement('datalist'); dl.id = 'pfComunas'; dl.innerHTML = L.map((x) => '<option value="' + esc(x) + '">').join(''); document.body.appendChild(dl); }
    if (cm && L) cm.setAttribute('list', 'pfComunas');
  }
  function leer(nodo) {
    const r = {};
    nodo.querySelectorAll('[data-pf]').forEach((x) => { const v = x.type === 'checkbox' ? (x.checked ? '1' : '') : x.value.trim(); if (v) r[x.dataset.pf] = v; });
    return r;
  }

  // ===== G117 🗂️ Ajustes ordenados (no texto plano) =====
  // Mejoran un campo de texto que la app YA guarda: lo esconden, dibujan la forma y escriben ahí el texto generado
  // (la app guarda igual que antes y lo viejo sigue funcionando). Si el texto viejo no se entiende, se muestra tal cual
  // y se ofrece "Pasar a campos": nada se pierde hasta que la persona cambia algo.
  //   CodeFixVitrina.horario(input)        → días con abre/cierra o Cerrado, atajos Lun a Vie · Sáb · Dom, 2 tramos (colación).
  //   CodeFixVitrina.transferencia(campo, { opcional }) → banco (lista Chile), tipo, N°, RUT validado, nombre y correo.
  //   CodeFixVitrina.horarioTexto(h) · horarioLeer(texto) · transfTexto(t) · transfLeer(texto) · rutOk(rut)
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const hm = (s) => { const m = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(String(s).trim()); if (!m || +m[1] > 24 || +(m[2] || 0) > 59) return null; return String(+m[1] % 24).padStart(2, '0') + ':' + (m[2] || '00'); };
  const hBonita = (s) => String(+s.slice(0, 2)) + ':' + s.slice(3, 5);
  const tramoTxt = (t) => t.map(([a, b]) => hBonita(a) + '–' + hBonita(b)).join(' y ');
  function horarioTexto(h) {
    if (!h || !h.some(Boolean)) return '';
    const g = [];
    h.forEach((d, i) => { const k = d ? tramoTxt(d) : 'cerrado'; const u = g[g.length - 1]; if (u && u.k === k) u.b = i; else g.push({ a: i, b: i, k }); });
    const nom = (x) => x.a === 0 && x.b === 6 ? 'Todos los días' : x.a === x.b ? DIAS[x.a] : DIAS[x.a] + (x.b - x.a === 1 ? ' y ' : ' a ') + DIAS[x.b];
    return g.map((x) => nom(x) + ' ' + x.k).join(' · ');
  }
  // Entiende el texto que genera horarioTexto y lo típico escrito a mano ("Lun a Vie 9:00 a 19:00 · Sáb 10:00 a 14:00").
  function horarioLeer(txt) {
    let s = String(txt || '').trim(); if (!s) return null;
    s = s.replace(/^todos\s+los\s+d[ií]as\b/i, 'Lun a Dom');
    const ix = (d) => DIAS.findIndex((x) => x.toLowerCase().replace('é', 'e').replace('á', 'a') === d.toLowerCase().slice(0, 3).replace('é', 'e').replace('á', 'a'));
    const h = [null, null, null, null, null, null, null];
    const T = '(\\d{1,2}(?:[:.]\\d{2})?)\\s*(?:–|-|a|hasta)\\s*(\\d{1,2}(?:[:.]\\d{2})?)\\s*(?:h|hrs?\\.?|horas)?';
    const re = new RegExp('^([a-záé]{3})[a-záé]*\\.?(?:\\s*(a|y|–|-)\\s*([a-záé]{3})[a-záé]*\\.?)?\\s*:?\\s*(?:de\\s+)?(cerrado|' + T + '(?:\\s*(?:y|,|/)\\s*(?:de\\s+)?' + T + ')?)$', 'i');
    for (const p of s.split(/\s*[·;|\n]\s*/).filter(Boolean)) {
      const m = re.exec(p); if (!m) return null;
      const a = ix(m[1]), b = m[3] ? ix(m[3]) : a; if (a < 0 || b < 0) return null;
      const dias = m[2] && /y/i.test(m[2]) ? [a, b] : Array.from({ length: (b - a + 7) % 7 + 1 }, (_, k) => (a + k) % 7);
      let v = null;
      if (!/^cerrado$/i.test(m[4])) {
        v = [[hm(m[5]), hm(m[6])]]; if (m[7]) v.push([hm(m[7]), hm(m[8])]);
        if (v.some(([x, y]) => !x || !y || x === y)) return null;
      }
      dias.forEach((d) => { h[d] = v; });
    }
    return h;
  }
  const BASE_H = () => [0, 1, 2, 3, 4].map(() => [['09:00', '19:00']]).concat([[['10:00', '14:00']], null]);
  let cssF = false;
  function estilosF() {
    if (cssF) return; cssF = true;
    const st = document.createElement('style');
    st.textContent = `
    .fo{border:1px solid var(--line);border-radius:14px;padding:10px;margin:6px 0 10px;background:var(--card)}
    .fo-tabs{display:flex;gap:6px;margin-bottom:8px}.fo-tabs button{flex:1;min-height:36px;border-radius:10px;font-size:13px}
    .fo-dia{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 0;border-top:1px solid var(--line)}
    .fo-dia:first-of-type{border-top:0}.fo-dia b{flex:0 0 78px;font-size:14px}
    .fo-dia label{display:flex;align-items:center;gap:4px;margin:0;font-size:13px;font-weight:600}
    .fo-dia input[type=checkbox]{width:auto;margin:0}.fo-dia input[type=time]{width:0;min-width:0;flex:1 1 0;max-width:140px;padding:6px 4px}
    .fo-t{display:flex;align-items:center;gap:4px;flex:1 1 100%}.fo-t span{font-size:12px;opacity:.75}
    .fo-x{font-size:12px;padding:4px 8px;min-height:0;border-radius:8px}
    .fo-ver{font-size:13px;margin:8px 0 0;padding:8px;border-radius:10px;background:var(--field);overflow-wrap:anywhere}
    .fo-err{color:var(--cfx-rojo,#dc2626);font-size:13px;margin:6px 0 0;font-weight:600}.fo-err:empty{display:none}
    .fo-viejo{font-size:13px;padding:8px;border-radius:10px;background:var(--field);white-space:pre-line;overflow-wrap:anywhere;margin:0 0 8px}
    .fo-g{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}@media (max-width:420px){.fo-g{grid-template-columns:1fr}}
    .fo-g label{margin-top:6px}.fo-ok{font-size:12px;font-weight:700}`;
    document.head.appendChild(st);
  }
  const emitir = (campo) => { campo.dispatchEvent(new Event('input', { bubbles: true })); campo.dispatchEvent(new Event('change', { bubbles: true })); };
  // Caja de la forma justo después del campo (que queda escondido, con su id: la app lo sigue leyendo).
  function caja(campo, clase) {
    estilosF();
    if (campo._fo) campo._fo.remove();
    const c = document.createElement('div'); c.className = 'fo ' + clase; campo.after(c); campo._fo = c; campo.hidden = true; campo.style.display = 'none';
    return c;
  }
  function horario(campo) {
    if (!campo) return;
    const c = caja(campo, 'fo-hor');
    const viejo = campo.value.trim(), leido = horarioLeer(viejo);
    let h = leido || BASE_H(), modo = h.slice(0, 5).every((d) => JSON.stringify(d) === JSON.stringify(h[0])) ? 'rapido' : 'dias', tocado = false;
    const tiempos = (k, d) => (d || [['09:00', '19:00']]).map(([a, b], j) => '<div class="fo-t"><span>' + (j ? 'y de' : 'de') + '</span><input type="time" data-k="' + k + '" data-j="' + j + '" data-x="a" value="' + a + '" aria-label="Abre ' + k + '">' +
      '<span>a</span><input type="time" data-k="' + k + '" data-j="' + j + '" data-x="b" value="' + b + '" aria-label="Cierra ' + k + '">' +
      (j ? '<button type="button" class="alt fo-x" data-quita="' + k + '" aria-label="Quitar segundo tramo">✕</button>' : '') + '</div>').join('') +
      ((d || []).length < 2 ? '<button type="button" class="alt fo-x" data-suma="' + k + '">＋ colación (2.º tramo)</button>' : '');
    const fila = (k, nombre, d) => '<div class="fo-dia" data-fila="' + k + '"><b>' + nombre + '</b><label><input type="checkbox" data-ab="' + k + '"' + (d ? ' checked' : '') + '> Abierto</label>' +
      (d ? tiempos(k, d) : '<span class="muted" style="font-size:13px">Cerrado</span>') + '</div>';
    // Grupos del modo rápido: k = "0-4" (Lun a Vie), "5" (Sáb), "6" (Dom).
    const grupos = () => modo === 'rapido' ? [['0-4', 'Lun a Vie', h[0]], ['5', 'Sáb', h[5]], ['6', 'Dom', h[6]]] : DIAS.map((n, i) => [String(i), n, h[i]]);
    const dias = (k) => k === '0-4' ? [0, 1, 2, 3, 4] : [+k];
    const fijar = (k, v) => dias(k).forEach((i) => { h[i] = v && v.map((t) => t.slice()); });
    function escribir() {
      const malo = h.findIndex((d) => d && d.some(([a, b]) => !a || !b || a === b));
      c.querySelector('.fo-err').textContent = malo >= 0 ? '⚠️ Revisa ' + DIAS[malo] + ': la hora de abrir y cerrar no pueden ser iguales. Hasta corregir queda el horario anterior.' : '';
      const txt = horarioTexto(h);
      c.querySelector('.fo-ver').innerHTML = '👀 Así lo ven tus clientes: <b>' + esc(txt || 'Sin horario') + '</b>';
      if (malo < 0 && tocado) { campo.value = txt; emitir(campo); }
    }
    function pintar() {
      c.innerHTML = '<div class="fo-tabs"><button type="button" class="' + (modo === 'rapido' ? '' : 'alt') + '" data-modo="rapido">⚡ Rápido</button><button type="button" class="' + (modo === 'dias' ? '' : 'alt') + '" data-modo="dias">📅 Día por día</button></div>' +
        grupos().map(([k, n, d]) => fila(k, n, d)).join('') + '<p class="fo-ver"></p><p class="fo-err"></p>' +
        (campo.value.trim() ? '<button type="button" class="alt fo-x" data-borra style="margin-top:8px">🗑️ Quitar horario</button>' : '');
      escribir();
    }
    c.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.modo) { modo = b.dataset.modo; if (modo === 'rapido') [1, 2, 3, 4].forEach((i) => { h[i] = h[0] && h[0].map((t) => t.slice()); }); tocado = tocado || modo === 'rapido'; }
      else if (b.dataset.suma) { const k = b.dataset.suma, d = h[dias(k)[0]] || [['09:00', '14:00']]; fijar(k, [[d[0][0], d[0][1] > '14:00' ? '14:00' : d[0][1]], ['15:00', d[0][1] > '15:00' ? d[0][1] : '19:00']]); tocado = true; }
      else if (b.dataset.quita) { const k = b.dataset.quita; fijar(k, [h[dias(k)[0]][0]]); tocado = true; }
      else if ('borra' in b.dataset) { campo.value = ''; emitir(campo); tocado = false; h = BASE_H(); }
      else return;
      pintar();
    });
    c.addEventListener('change', (e) => {
      const x = e.target, k = x.dataset.ab || x.dataset.k; if (k == null) return;
      tocado = true;
      if (x.dataset.ab != null) { fijar(k, x.checked ? (h[dias(k)[0]] || [['09:00', '19:00']]) : null); return pintar(); }
      const d = (h[dias(k)[0]] || []).map((t) => t.slice()); if (!d[+x.dataset.j]) return;
      d[+x.dataset.j][x.dataset.x === 'a' ? 0 : 1] = x.value || ''; fijar(k, d); escribir();
    });
    if (viejo && !leido) {
      // Texto escrito a mano que no se entiende: se muestra tal cual y se ofrece pasarlo (no se toca hasta que la persona cambie algo).
      c.innerHTML = '<p class="muted" style="margin:0 0 6px;font-size:13px">Tu horario está escrito como texto:</p><p class="fo-viejo">' + esc(viejo) + '</p>' +
        '<button type="button" data-pasar>📅 Pasar a días y horas</button>';
      c.querySelector('[data-pasar]').onclick = (e) => { e.stopPropagation(); pintar(); };
    } else pintar();
  }

  // ---- Transferencia ----
  const BANCOS = ['BancoEstado', 'Banco de Chile', 'Santander', 'BCI', 'Scotiabank', 'Itaú', 'Banco Falabella', 'Banco Ripley', 'Security', 'BICE', 'Consorcio', 'Internacional',
    'Coopeuch', 'Mercado Pago', 'Tenpo', 'MACH', 'Prepago Los Héroes', 'Copec Pay', 'Banco Edwards'];
  const TIPOS = ['Cuenta Corriente', 'Cuenta Vista', 'CuentaRUT', 'Cuenta de Ahorro', 'Chequera Electrónica'];
  const TC = [['banco', 'Banco'], ['tipo', 'Tipo de cuenta'], ['numero', 'N° de cuenta'], ['rut', 'RUT'], ['titular', 'Nombre'], ['correo', 'Correo']];
  function rutOk(v) {
    const c = String(v || '').replace(/[^0-9kK]/g, '').toUpperCase(); if (c.length < 8 || c.length > 9 || /K./.test(c)) return null;
    const cu = c.slice(0, -1); let s = 0, m = 2; for (let i = cu.length - 1; i >= 0; i--) { s += +cu[i] * m; m = m === 7 ? 2 : m + 1; }
    const r = 11 - (s % 11), dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    return dv === c.slice(-1) ? cu.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv : null;
  }
  const correoOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function transfTexto(t) { return TC.filter(([k]) => t && String(t[k] || '').trim()).map(([k, l]) => l + ': ' + String(t[k]).trim()).join('\n'); }
  // exacto = el formato de transfTexto ("Banco: …" por línea); si no, se adivina lo que se pueda (para "Pasar a campos").
  function transfLeer(txt, adivinar) {
    const s = String(txt || '').trim(); if (!s) return null;
    const r = {}, L = s.split('\n');
    if (L.every((x) => TC.some(([k, l]) => { if (x.indexOf(l + ': ') !== 0) return false; r[k] = x.slice(l.length + 2).trim(); return true; })) && (L.length > 1 || !/[,;]/.test(s))) return r;
    if (!adivinar) return null;
    const g = {}, low = s.toLowerCase();
    const rm = /\b(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])\b/.exec(s); if (rm) g.rut = rutOk(rm[1]) || rm[1];
    const em = /[^\s@,;:]+@[^\s@,;:]+\.[a-z]{2,}/i.exec(s); if (em) g.correo = em[0];
    const bn = BANCOS.slice().sort((a, b) => b.length - a.length).find((b) => low.replace(/\s/g, '').includes(b.toLowerCase().replace(/\s/g, '')) || (b === 'BancoEstado' && /banco\s*estado/.test(low)));
    if (bn) g.banco = bn;
    g.tipo = /corriente/.test(low) ? 'Cuenta Corriente' : /cuenta\s*rut|cuentarut/.test(low) ? 'CuentaRUT' : /vista/.test(low) ? 'Cuenta Vista' : /ahorro/.test(low) ? 'Cuenta de Ahorro' : /chequera/.test(low) ? 'Chequera Electrónica' : '';
    const sinRut = s.replace(rm ? rm[0] : '\u0000', ' ').replace(em ? em[0] : '\u0000', ' ');
    const nm = (sinRut.match(/\d[\d\s-]{5,22}\d/g) || []).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 6 && x.length <= 20).sort((a, b) => b.length - a.length)[0]; if (nm) g.numero = nm;
    if (!g.numero && g.tipo === 'CuentaRUT' && g.rut) g.numero = String(g.rut).replace(/\D/g, '').slice(0, -1);
    const tm = /(?:nombre|titular)\s*:?\s*([a-záéíóúñ' ]{4,60})/i.exec(s); if (tm) g.titular = tm[1].trim();
    return g;
  }
  function transferencia(campo, o) {
    if (!campo) return;
    o = o || {};
    const viejo = campo.value.trim(), exacto = transfLeer(viejo);
    if (o.opcional && !exacto) return botonOpcional(campo, o);
    const c = caja(campo, 'fo-tr');
    let t = exacto || (viejo ? transfLeer(viejo, true) : {}) || {}, pasar = !!(viejo && !exacto);
    const opc = (lista, v, ph) => '<option value="">' + ph + '</option>' + (v && !lista.includes(v) ? '<option selected>' + esc(v) + '</option>' : '') + lista.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const id = 'fo' + Math.random().toString(36).slice(2, 7);
    c.innerHTML = (pasar ? '<p class="muted" style="margin:0 0 6px;font-size:13px">Tus datos estaban escritos así (revisa que los campos queden bien):</p><p class="fo-viejo">' + esc(viejo) + '</p>' : '') +
      '<div class="fo-g"><div><label for="' + id + 'b">Banco</label><select id="' + id + 'b" data-t="banco">' + opc(BANCOS, t.banco, 'Elige tu banco') + '</select></div>' +
      '<div><label for="' + id + 'p">Tipo de cuenta</label><select id="' + id + 'p" data-t="tipo">' + opc(TIPOS, t.tipo, 'Elige el tipo') + '</select></div>' +
      '<div><label for="' + id + 'n">N° de cuenta</label><input id="' + id + 'n" data-t="numero" inputmode="numeric" maxlength="20" value="' + esc(t.numero || '') + '" placeholder="Solo números"></div>' +
      '<div><label for="' + id + 'r">RUT del titular <span class="fo-ok" data-rutok></span></label><input id="' + id + 'r" data-t="rut" maxlength="12" value="' + esc(t.rut || '') + '" placeholder="12.345.678-5"></div>' +
      '<div><label for="' + id + 'm">Nombre del titular</label><input id="' + id + 'm" data-t="titular" maxlength="60" value="' + esc(t.titular || '') + '" placeholder="Como sale en el banco"></div>' +
      '<div><label for="' + id + 'c">Correo (para avisar)</label><input id="' + id + 'c" data-t="correo" type="email" inputmode="email" maxlength="80" value="' + esc(t.correo || '') + '" placeholder="pagos@tunegocio.cl"></div></div>' +
      '<p class="fo-ver" style="white-space:pre-line"></p><p class="fo-err"></p>' + (o.opcional ? '<button type="button" class="alt fo-x" data-texto style="margin-top:8px">✏️ Volver a texto libre</button>' : '');
    const leerT = () => { const r = {}; c.querySelectorAll('[data-t]').forEach((x) => { r[x.dataset.t] = x.value.trim(); }); return r; };
    function escribir(tocado) {
      const r = leerT(), e = [];
      r.numero = r.numero.replace(/\D/g, '');
      if (r.rut) { const ok = rutOk(r.rut); c.querySelector('[data-rutok]').textContent = ok ? '✅' : '⚠️'; if (ok) r.rut = ok; else e.push('el RUT no es válido (revisa el dígito verificador)'); } else c.querySelector('[data-rutok]').textContent = '';
      if (r.correo && !correoOk(r.correo)) e.push('el correo no es válido');
      if ((r.banco || r.tipo || r.rut || r.titular) && !r.numero && r.tipo !== 'CuentaRUT') e.push('falta el N° de cuenta');
      if (r.tipo === 'CuentaRUT' && !r.numero && r.rut && rutOk(r.rut)) r.numero = r.rut.replace(/\D/g, '').slice(0, -1);
      const txt = transfTexto(r);
      c.querySelector('.fo-err').textContent = e.length ? '⚠️ Revisa: ' + e.join(', ') + '. Hasta corregir quedan los datos anteriores.' : '';
      c.querySelector('.fo-ver').innerHTML = '👀 Tu cliente verá:<br><b>' + esc(txt || '(sin datos)') + '</b>';
      if (tocado && !e.length) { campo.value = txt; emitir(campo); }
    }
    c.addEventListener('input', () => escribir(true));
    c.addEventListener('change', (e) => { const x = e.target; if (x.dataset && x.dataset.t === 'rut' && rutOk(x.value)) x.value = rutOk(x.value); escribir(true); });
    const bt = c.querySelector('[data-texto]');
    if (bt) bt.onclick = () => { c.remove(); campo._fo = null; campo.hidden = false; campo.style.display = ''; botonOpcional(campo, o); };
    escribir(false);
  }
  // Campo que también sirve para otra cosa (ej: texto de un link de pago): queda el texto y un botón para pasar a campos.
  function botonOpcional(campo, o) {
    if (campo._foB) campo._foB.remove();
    const b = document.createElement('button'); b.type = 'button'; b.className = 'alt fo-x'; b.style.margin = '4px 0 8px'; b.textContent = '🏦 Escribir datos de banco por campos';
    campo.after(b); campo._foB = b;
    b.onclick = () => { b.remove(); campo._foB = null; transferencia(campo, Object.assign({}, o, { opcional: false })); };
  }

  // G117 b: botón 📋 Copiar todo para el cliente: <button data-cfx-copiar="texto"> (copia y muestra ✅ Copiado).
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-cfx-copiar]'); if (!b) return;
    const v = b.getAttribute('data-cfx-copiar'), antes = b.textContent;
    try { await navigator.clipboard.writeText(v); b.textContent = '✅ Copiado'; setTimeout(() => { b.textContent = antes; }, 1800); }
    catch (er) { if (window.CFX_DIALOGO) CFX_DIALOGO.pedir('Copia los datos', v, { si: 'Cerrar' }); }
  });
  window.CodeFixVitrina = { montar, editor, leer, horario, transferencia, horarioTexto, horarioLeer, transfTexto, transfLeer, rutOk, BANCOS };
})();
