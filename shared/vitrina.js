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
    .pf-red:empty{display:none}
    .pf-pol{border-top:1px solid var(--line);padding-top:10px;font-size:14px}
    .pf-pol summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:8px}
    .pf-pol summary::-webkit-details-marker{display:none}
    .pf-pol summary::after{content:'›';transition:transform .2s}
    .pf-pol[open] summary::after{transform:rotate(90deg)}
    .pf-pol h4{margin:12px 0 4px;font-size:14px}
    .pf-pol p{margin:0;white-space:pre-line;overflow-wrap:anywhere;color:var(--muted)}`;
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
    // G141 a: redes con ícono (t.redes = las nuevas de 🔗 Mis redes; si no hay, las de antes del perfil). data-pf-redes: la página las refresca con CodeFixVitrina.redes.publico.
    partes.push('<div class="pf-red" data-pf-redes>' + redes.botones(Array.isArray(t.redes) && t.redes.length ? t.redes : redes.deViejas(p), { titulo: 'Síguenos' }) + '</div>');
    if (t.politicas) partes.push(politicas(t, p, dir));
    const tel = String(t.telefono || '').replace(/\D/g, '');
    const wa = 'https://wa.me/' + tel + (t.wa_texto ? '?text=' + encodeURIComponent(t.wa_texto) : '');
    partes.push('<div class="pf-acc">' + (tel ? '<a class="btn ok" href="' + esc(wa) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') +
      '<button type="button" class="alt" data-pf="compartir">🔗 Compartir tienda</button></div>');
    nodo.innerHTML = '<section class="pf"><div class="pf-ban"></div><div class="pf-cab"><div class="pf-logo"' + logo + '>' + (logo ? '' : esc((t.empresa || '?').charAt(0).toUpperCase())) +
      '</div><div class="pf-nom"><h2>' + esc(t.empresa || 'Tienda') + '</h2>' + (t.rubro ? '<div class="muted">' + esc(t.rubro) + '</div>' : '') + '</div></div>' +
      '<div class="pf-cuerpo">' + partes.join('') + '</div></section>';
    // G141 a: la página pasa t.rpc + t.redes_llave (slug/código) → se cambian por las de 🔗 Mis redes si las hay.
    const waViejo = nodo.querySelector('.pf-acc a.btn.ok');  // G144 d: se oculta si las redes ya traen WhatsApp
    unWa(nodo.querySelector('[data-pf-redes]'), waViejo);
    if (t.rpc && t.redes_llave) redes.publico(nodo.querySelector('[data-pf-redes]'), { rpc: t.rpc, llave: t.redes_llave, viejo: waViejo, respaldo: Array.isArray(t.redes) && t.redes.length ? t.redes : redes.deViejas(p) });
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
    // G141 a: con o.rpc las redes van en la caja 🔗 (pega el link → ícono). Los 4 campos de antes quedan escondidos con su valor (nada se pierde).
    const conRedes = !!(o && o.rpc), RED4 = ['instagram', 'facebook', 'tiktok', 'web'];
    const campoV = (c) => conRedes && RED4.includes(c[0]) ? '<input type="hidden" data-pf="' + c[0] + '" value="' + esc(p[c[0]]) + '">' : campo(c);
    nodo.innerHTML = CAMPOS.map(campoV).join('') + (conRedes ? '<h3 style="margin:18px 0 6px">🔗 Tus redes</h3><div data-pf-redes-ed></div>' : '') + (o && o.politicas ? '<h3 style="margin:18px 0 0">📄 Políticas de la tienda</h3>' +
      '<p class="muted" style="margin:4px 0 0;font-size:13px">La ley pide mostrarlas en la venta por internet. El retracto y la garantía legal ya salen solos.</p>' +
      POL.map(campo).join('') + '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-pf="sin_retracto" style="width:auto"' + (p.sin_retracto ? ' checked' : '') +
      '> No acepto retracto en compras por internet</label>' : '');
    // G117 c: la comuna sugiere la lista (si la app carga despacho.js); el texto sigue libre (regiones).
    const cm = nodo.querySelector('[data-pf="comuna"]'), L = window.Despacho && Despacho.COMUNAS_RM;
    if (cm && L && !document.getElementById('pfComunas')) { const dl = document.createElement('datalist'); dl.id = 'pfComunas'; dl.innerHTML = L.map((x) => '<option value="' + esc(x) + '">').join(''); document.body.appendChild(dl); }
    if (cm && L) cm.setAttribute('list', 'pfComunas');
    if (conRedes) redes.editor(nodo.querySelector('[data-pf-redes-ed]'), { rpc: o.rpc, viejas: redes.deViejas(p) });
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
  // ===== G141 a 🔗 Mis redes con ícono =====
  // CodeFixVitrina.redes.detectar(texto)              → { red, url, nombre, aviso } (pega link, @usuario o un +56 9…)
  // CodeFixVitrina.redes.botones(lista, { titulo })   → HTML de botones con ícono (SVG en línea: 0 descargas, rápido)
  // CodeFixVitrina.redes.editor(nodo, { rpc, viejas }) → pantalla 🔗 Mis redes (pega el link → la reconoce sola → 💾)
  // CodeFixVitrina.redes.publico(nodo, { rpc, llave, respaldo }) → pinta las redes públicas del negocio (cfx_redes_publicas)
  //   viejas/respaldo = [{red, url}] que la app ya tenía (Despega: perfil.instagram…): se muestran hasta que guarde las nuevas.
  const S = (d, f) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"' + (f ? ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : ' fill="currentColor"') + '>' + d + '</svg>';
  const RED = {
    instagram: ['Instagram', '#d62976', S('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>', 1), /(^|\.)instagram\.com$/],
    tiktok: ['TikTok', '#111', S('<path d="M16.6 3c.3 2.3 1.7 3.8 3.9 4v3.1c-1.4 0-2.7-.4-3.9-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7l.9.1v3.2a2.6 2.6 0 1 0 1.8 2.4V3h3z"/>'), /(^|\.)tiktok\.com$/],
    facebook: ['Facebook', '#1877f2', S('<path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z"/>'), /(^|\.)(facebook\.com|fb\.com|fb\.me)$/],
    youtube: ['YouTube', '#e00', S('<path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9c.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15.1V8.9l5.2 3.1-5.2 3.1z"/>'), /(^|\.)(youtube\.com|youtu\.be)$/],
    whatsapp: ['WhatsApp', '#1fa855', S('<path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm5.5 13.3c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/>'), /^(wa\.me|([a-z0-9-]+\.)?whatsapp\.com)$/],
    x: ['X', '#111', S('<path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.2 4.7H5.4l11.3 14.5z"/>'), /(^|\.)(x\.com|twitter\.com)$/],
    threads: ['Threads', '#111', S('<path d="M16.4 11.2c-.3-2.2-1.8-3.4-4.1-3.4-1.6 0-2.9.7-3.6 1.9M7.6 15.6c1 1.9 2.6 2.9 4.7 2.9 3.4 0 5.7-2.3 5.7-6.4S15.6 5.5 12.2 5.5 6.3 7.9 6.3 12" /><path d="M16.4 11.6c-2.4-.6-6.3-.4-6.3 2 0 2.4 5.6 2.4 6-1.5"/>', 1), /(^|\.)threads\.(net|com)$/],
    linkedin: ['LinkedIn', '#0a66c2', S('<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.8h4V21H3V9.8zm6.5 0h3.8v1.6c.6-1 1.9-1.9 3.8-1.9 4 0 4.7 2.5 4.7 5.8V21h-4v-5c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21h-4V9.8z"/>'), /(^|\.)linkedin\.com$/],
    pinterest: ['Pinterest', '#e60023', S('<path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.3-5.4s-.3-.7-.3-1.6c0-1.5.9-2.7 2-2.7.9 0 1.4.7 1.4 1.6 0 1-.6 2.4-.9 3.7-.3 1.1.6 2 1.6 2 2 0 3.5-2.1 3.5-5.1 0-2.7-1.9-4.5-4.7-4.5-3.2 0-5 2.4-5 4.9 0 1 .4 2 .9 2.6l.1.4-.3 1.3c0 .2-.2.3-.4.2-1.4-.7-2.3-2.7-2.3-4.4 0-3.6 2.6-6.9 7.5-6.9 3.9 0 7 2.8 7 6.6 0 3.9-2.5 7.1-5.9 7.1-1.2 0-2.2-.6-2.6-1.3l-.7 2.7c-.3 1-1 2.2-1.4 3A10 10 0 1 0 12 2z"/>'), /(^|\.)(pinterest\.[a-z.]{2,6}|pin\.it)$/],
    spotify: ['Spotify', '#1aa34a', S('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-9-1-.4.1-.7-.2-.8-.5 0-.4.2-.7.5-.8 3.9-.9 7.2-.5 9.9 1.1.3.2.4.6.3 1zm1.2-2.7c-.2.4-.7.5-1.1.3-2.7-1.7-6.9-2.2-10.2-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.7-1.1 8.4-.6 11.5 1.4.4.2.5.7.3 1zm.1-2.8c-3.3-1.9-8.7-2.1-11.8-1.2-.5.2-1-.1-1.2-.6-.2-.5.1-1 .6-1.2 3.6-1.1 9.6-.9 13.4 1.4.5.3.6.9.3 1.3-.3.4-.9.6-1.3.3z"/>'), /^open\.spotify\.com$/],
    web: ['Sitio web', B, S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>', 1), null]
  };
  const ORDEN_R = Object.keys(RED);
  const URLDE = { instagram: 'https://instagram.com/', tiktok: 'https://www.tiktok.com/@', x: 'https://x.com/', threads: 'https://www.threads.net/@', youtube: 'https://www.youtube.com/@', facebook: 'https://facebook.com/', pinterest: 'https://pinterest.com/', linkedin: 'https://www.linkedin.com/in/' };
  function detectar(txt) {
    let s = String(txt || '').trim().replace(/^<|>$/g, '');
    if (!s) return null;
    const digitos = s.replace(/[\s().-]/g, '');
    if (/^\+?\d{8,15}$/.test(digitos)) { let n = digitos.replace(/^\+/, ''); if (/^9\d{8}$/.test(n)) n = '56' + n; return { red: 'whatsapp', url: 'https://wa.me/' + n, nombre: '+' + n }; }
    if (/^@[\w.]{2,40}$/.test(s)) return { red: null, usuario: s.slice(1), nombre: s, aviso: '¿De qué red es? Elige abajo.' };
    if (!/^https?:\/\//i.test(s)) { if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return { red: null, aviso: 'Pega el link completo (ej: instagram.com/tutienda) o tu @usuario.' }; s = 'https://' + s; }
    let u; try { u = new URL(s.replace(/^http:/i, 'https:')); } catch (e) { return { red: null, aviso: 'Ese link no se entiende.' }; }
    if (u.protocol !== 'https:' || u.username || u.password) return { red: null, aviso: 'Ese link no se entiende.' };
    const h = u.hostname.toLowerCase().replace(/^www\.|^m\.|^web\./, ''), seg = u.pathname.split('/').filter(Boolean);
    let red = ORDEN_R.find((k) => RED[k][3] && RED[k][3].test(h)) || 'web';
    u.hash = ''; ['igsh', 'igshid', 'utm_source', 'utm_medium', 'utm_campaign', 'si', 'fbclid', 'mibextid', 'ref', '_t', '_r', 'is_from_webapp', 'sender_device'].forEach((k) => u.searchParams.delete(k));
    let url = u.toString().replace(/\/$/, ''), nombre = h, aviso = '';
    const p0 = seg[0] || '';
    if (red === 'instagram') { if (/^(p|reel|reels|tv|stories)$/.test(p0)) aviso = 'Es una publicación: pega el link de tu PERFIL (instagram.com/tutienda).'; else if (p0) nombre = '@' + p0; }
    else if (red === 'tiktok') { if (/^@/.test(p0)) { nombre = p0; if (seg[1] === 'video') aviso = 'Es un video: para tu perfil basta tiktok.com/' + p0; } }
    else if (red === 'youtube') { if (/^@/.test(p0)) nombre = p0; else if (/^(watch|shorts)$/.test(p0) || h === 'youtu.be') aviso = 'Es un video: pega el link de tu canal (youtube.com/@tucanal).'; }
    else if (red === 'x' || red === 'threads') { if (p0 && !/^(i|home|search)$/.test(p0)) nombre = '@' + p0.replace(/^@/, ''); if (seg[1] === 'status' || seg[1] === 'post') aviso = 'Es una publicación: pega el link de tu perfil.'; }
    else if (red === 'whatsapp') { if (/^\d+$/.test(p0)) nombre = '+' + p0; }
    else if (red === 'facebook' || red === 'pinterest' || red === 'linkedin') { if (p0 && !/^(profile\.php|share|pages)$/.test(p0)) nombre = (red === 'linkedin' && seg[1] ? seg[1] : p0); }
    if (url.length > 200) return { red: null, aviso: 'El link es muy largo: copia solo el de tu perfil.' };
    return { red, url, nombre: nombre.slice(0, 40), aviso };
  }
  const deUsuario = (red, usuario) => URLDE[red] ? { red, url: URLDE[red] + String(usuario).replace(/^@/, ''), nombre: '@' + String(usuario).replace(/^@/, '') } : null;
  const nombreDe = (x) => { const d = detectar(x.url) || {}; return d.nombre || RED[x.red][0]; };
  let cssR = false;
  function estilosR() {
    if (cssR) return; cssR = true;
    const st = document.createElement('style');
    st.textContent = `
    .cfx-redes{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0}
    .cfx-redes.centro,[data-cfx-redes-centro] .cfx-redes{justify-content:center}
    .cfx-redes-t{font-weight:800;font-size:14px;margin:0 0 6px;width:100%}
    .cfx-red{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:6px 14px 6px 6px;border-radius:99px;text-decoration:none;font-weight:700;font-size:14px;
      background:var(--card,#fff);color:var(--text,inherit);border:1px solid var(--line,#ddd);box-shadow:0 2px 8px -4px rgba(0,0,0,.25);transition:transform .12s}
    .cfx-red:active{transform:scale(.96)}.cfx-red:hover{border-color:var(--cfx-red-c)}
    .cfx-red i{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--cfx-red-c);color:#fff;flex:none;font-style:normal}
    .cfx-red.solo{padding:6px}.cfx-red.solo i{width:36px;height:36px}
    .cfx-re-in{display:flex;gap:6px}.cfx-re-in input{flex:1;min-width:0}
    .cfx-re-det{font-size:13px;margin:6px 0 0;min-height:1.3em}
    .cfx-re-fila{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line,#ddd)}
    .cfx-re-fila:first-child{border-top:0}.cfx-re-fila b{flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px}
    .cfx-re-fila i{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--cfx-red-c);color:#fff;flex:none}
    .cfx-re-fila button{min-height:36px;min-width:36px;padding:4px 8px}
    .cfx-re-ch{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.cfx-re-ch button{min-height:36px;font-size:13px;border-radius:99px}`;
    document.head.appendChild(st);
  }
  function limpiar(lista) {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : []).filter((x) => x && RED[x.red] && /^https:\/\//i.test(x.url || '') && !vistos.has(x.url) && vistos.add(x.url)).slice(0, 12);
  }
  // Las de antes (perfil.instagram/facebook/tiktok/web): nunca se pierden, se muestran igual.
  function deViejas(p) {
    p = p || {}; const L = [];
    if (p.instagram) L.push({ red: 'instagram', url: red(p.instagram, 'https://instagram.com/') });
    if (p.tiktok) L.push({ red: 'tiktok', url: red(p.tiktok, 'https://www.tiktok.com/@') });
    if (p.facebook) L.push({ red: 'facebook', url: red(p.facebook, 'https://facebook.com/') });
    if (p.web) L.push({ red: 'web', url: /^https?:\/\//i.test(p.web) ? p.web.replace(/^http:/i, 'https:') : 'https://' + p.web });
    return limpiar(L);
  }
  function botones(lista, o) {
    o = o || {}; estilosR();
    const L = limpiar(lista); if (!L.length) return '';
    return '<div class="cfx-redes" data-cfx-redes>' + (o.titulo ? '<p class="cfx-redes-t">' + esc(o.titulo) + '</p>' : '') + L.map((x) => {
      const r = RED[x.red], n = x.red === 'web' ? 'Sitio web' : r[0];
      return '<a class="cfx-red' + (o.solo ? ' solo' : '') + '" data-red="' + esc(x.red) + '" style="--cfx-red-c:' + r[1] + '" href="' + esc(window.CFX_URL(x.url)) + '" target="_blank" rel="noopener nofollow" aria-label="' + esc(n + ' ' + nombreDe(x)) + '" title="' + esc(nombreDe(x)) + '"><i>' + r[2] + '</i>' + (o.solo ? '' : esc(n)) + '</a>';
    }).join('') + '</div>';
  }
  // G144 d 💬 Un solo WhatsApp: si las redes traen WhatsApp, se oculta el botón antiguo (viejo) y el de las redes usa su link
  // (con el mensaje listo) cuando es el mismo número. Sin WhatsApp en las redes, el antiguo se ve como siempre.
  function unWa(nodo, viejo) {
    viejo = typeof viejo === 'string' ? document.querySelector(viejo) : viejo; if (!nodo || !viejo) return;
    const a = nodo.querySelector('a.cfx-red[data-red="whatsapp"]'), dig = (u) => (String(u || '').match(/wa\.me\/(\d+)/) || [])[1];
    const v = viejo.getAttribute('href') || viejo.dataset.wa || '';  // botón sin href: data-wa con su link
    if (a && dig(v) && dig(v) === dig(a.getAttribute('href'))) a.setAttribute('href', v);
    viejo.hidden = !!a; viejo.style.display = a ? 'none' : '';
  }
  async function publico(nodo, o) {
    if (!nodo) return; o = o || {};
    const pinta = (L) => { nodo.innerHTML = botones(L, { titulo: o.titulo === undefined ? 'Síguenos' : o.titulo, solo: o.solo }); nodo.hidden = !limpiar(L).length; unWa(nodo, o.viejo); };
    pinta(o.respaldo || []);
    if (!o.rpc || !o.llave) return;
    try { const L = await o.rpc('cfx_redes_publicas', { p_llave: String(o.llave) }); if (limpiar(L).length) pinta(L); } catch (e) { /* sin red: quedan las de antes */ }
  }
  async function editorRedes(nodo, o) {
    if (!nodo) return; o = o || {}; estilosR();
    let D = { lista: [], dueno: true };
    nodo.innerHTML = '<p class="muted">⏳ Cargando…</p>';
    const P = !!o.persona;  // G142 c: las MÍAS (barbero, mecánico), no las del negocio
    try { D = await o.rpc(P ? 'cfx_redes_persona_mias' : 'cfx_redes_mias') || D; } catch (e) { nodo.innerHTML = '<p class="muted">⚠️ ' + esc(e.message || e) + '</p>'; return; }
    let L = limpiar(D.lista); const viejas = limpiar(o.viejas);
    if (!L.length && viejas.length) L = viejas.slice();
    let pend = null, cambio = !limpiar(D.lista).length && viejas.length > 0;
    const toast = (t) => (window.CFX_AVISO ? CFX_AVISO(t) : window.Core && Core.toast ? Core.toast(t) : null);
    const pintar = () => {
      const fila = (x, i) => '<div class="cfx-re-fila" style="--cfx-red-c:' + RED[x.red][1] + '"><i>' + RED[x.red][2] + '</i><b>' + esc(RED[x.red][0]) + '<br><span class="muted" style="font-weight:600">' + esc(nombreDe(x)) + '</span></b>' +
        (D.dueno ? (i ? '<button type="button" class="alt small" data-re="sube" data-i="' + i + '" aria-label="Subir">↑</button>' : '') + '<button type="button" class="alt small" data-re="quita" data-i="' + i + '" aria-label="Quitar ' + esc(RED[x.red][0]) + '">✕</button>' : '') + '</div>';
      nodo.innerHTML = '<div class="cfx-re">' + (D.dueno ? '<label for="cfxReIn"><b>Pega el link de tu perfil</b></label><p class="muted" style="margin:2px 0 6px;font-size:13px">Instagram, TikTok, Facebook, YouTube, WhatsApp, X, Threads, LinkedIn… La reconocemos sola.</p>' +
        '<div class="cfx-re-in"><input id="cfxReIn" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="300" placeholder="instagram.com/tutienda o @tutienda"><button type="button" class="ok" data-re="suma">➕ Agregar</button></div>' +
        '<p class="cfx-re-det" id="cfxReDet" aria-live="polite"></p><div class="cfx-re-ch" id="cfxReCh" hidden></div>' : '<p class="muted">Solo el dueño cambia las redes. Así se ven en la página del negocio:</p>') +
        '<div style="margin-top:10px">' + (L.length ? L.map(fila).join('') : '<p class="muted">Aún no agregas redes.</p>') + '</div>' +
        (L.length ? '<p style="margin:14px 0 6px;font-weight:800">' + (P ? '👀 Así se ven junto a tu nombre' : '👀 Así se ve en tu página') + '</p>' + botones(L) : '') +
        (D.dueno ? '<button type="button" class="ok" data-re="guarda" style="width:100%;margin-top:12px;min-height:46px"' + (cambio ? '' : ' disabled') + '>💾 Guardar mis redes</button>' : '') + '</div>';
      const inp = nodo.querySelector('#cfxReIn'); if (!inp) return;
      inp.oninput = () => {
        const d = detectar(inp.value), det = nodo.querySelector('#cfxReDet'), ch = nodo.querySelector('#cfxReCh'); pend = d;
        ch.hidden = !(d && !d.red && d.usuario);
        ch.innerHTML = ch.hidden ? '' : Object.keys(URLDE).map((k) => '<button type="button" class="alt" data-re="usu" data-r="' + k + '" style="--cfx-red-c:' + RED[k][1] + '">' + esc(RED[k][0]) + '</button>').join('');
        det.innerHTML = !d ? '' : d.red ? '<span style="color:' + RED[d.red][1] + '">' + RED[d.red][2].replace('width="22" height="22"', 'width="16" height="16" style="vertical-align:-3px"') + '</span> <b>' + esc(RED[d.red][0]) + '</b> · ' + esc(d.nombre) + (d.aviso ? '<br>⚠️ ' + esc(d.aviso) : ' ✓') : '⚠️ ' + esc(d.aviso || '');
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sumar(); } };
    };
    const sumar = (d) => {
      d = d || pend; if (!d || !d.red) return toast(d && d.aviso ? d.aviso : 'Pega un link primero');
      if (L.some((x) => x.url === d.url)) return toast('Ya estaba');
      if (d.red === 'whatsapp' && L.some((x) => x.red === 'whatsapp')) return toast('Ya tienes WhatsApp en tus redes: deja uno solo');  // G144 d
      if (L.length >= 12) return toast('Máximo 12 redes');
      L.push({ red: d.red, url: d.url }); pend = null; cambio = true; pintar();
      const i = nodo.querySelector('#cfxReIn'); if (i) i.focus();
    };
    nodo.onclick = async (e) => {
      const b = e.target.closest('[data-re]'); if (!b || b.disabled) return;
      const a = b.dataset.re, i = +b.dataset.i;
      if (a === 'suma') return sumar();
      if (a === 'usu') return sumar(deUsuario(b.dataset.r, pend && pend.usuario));
      if (a === 'quita') { L.splice(i, 1); cambio = true; return pintar(); }
      if (a === 'sube') { L.splice(i - 1, 0, L.splice(i, 1)[0]); cambio = true; return pintar(); }
      if (a === 'guarda') {
        b.disabled = true;
        try { const r = await o.rpc(P ? 'cfx_redes_persona_guardar' : 'cfx_redes_guardar', { p_lista: L }); L = limpiar((r || {}).lista || L); cambio = false; toast(P ? '✅ Tus redes quedaron junto a tu nombre' : '✅ Redes guardadas: ya salen en tu página'); pintar(); if (o.alGuardar) o.alGuardar(L); }
        catch (er) { b.disabled = false; toast('⚠️ ' + (er.message || er)); }
      }
    };
    pintar();
  }
  // G142 c: redes de cada persona del equipo en la página pública. Cada nodo [data-redes-p="<id>"] recibe sus íconos (solo, sin título).
  async function equipo(raiz, o) {
    o = o || {}; if (!raiz || !o.rpc || !o.llave) return;
    let M = {}; try { M = (await o.rpc('cfx_redes_equipo', { p_llave: String(o.llave) })) || {}; } catch (e) { return; }
    raiz.querySelectorAll('[data-redes-p]').forEach((n) => { const L = limpiar(M[n.dataset.redesP]); n.innerHTML = L.length ? botones(L, { solo: true }) : ''; n.hidden = !L.length; });
  }
  const redes = { RED, detectar, botones, editor: editorRedes, publico, deViejas, limpiar, equipo, unWa };

  window.CodeFixVitrina = { redes, montar, editor, leer, horario, transferencia, horarioTexto, horarioLeer, transfTexto, transfLeer, rutOk, BANCOS };
})();
