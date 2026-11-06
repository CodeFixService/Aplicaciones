// CodeFix · Núcleo · Vitrina (perfil del negocio): tarjeta de portada para la página pública (logo, nombre, rubro, estado, estrellas,
// descripción, dirección con mapa, horario, WhatsApp, redes y compartir) y los campos para editarlo en Ajustes.
//   CodeFixVitrina.montar(nodo, t)          t = { empresa, logo, color, rubro, horario, abierto, vacaciones_hasta, vacaciones_msg,
//                                               estrellas: {promedio,total}, telefono, desde, perfil: {descripcion, direccion, comuna,
//                                               instagram, facebook, tiktok, web, correo} }
//   CodeFixVitrina.editor(nodo, perfil)     dibuja los campos; CodeFixVitrina.leer(nodo) devuelve el objeto para guardar.
(function () {
  if (window.CodeFixVitrina) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    .pf-red a{font-size:13px;font-weight:600;padding:6px 10px;border-radius:99px;background:color-mix(in srgb,${B} 10%,var(--card));color:${B};text-decoration:none}`;
    document.head.appendChild(st);
  }
  const red = (v, base) => /^https?:\/\//i.test(v) ? v : base + String(v).replace(/^@/, '');
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
    if (redes.length) partes.push('<div class="pf-red">' + redes.map(([n, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + '</a>').join('') + '</div>');
    const tel = String(t.telefono || '').replace(/\D/g, '');
    partes.push('<div class="pf-acc">' + (tel ? '<a class="btn ok" href="https://wa.me/' + tel + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') +
      '<button type="button" class="alt" data-pf="compartir">🔗 Compartir tienda</button></div>');
    nodo.innerHTML = '<section class="pf"><div class="pf-ban"></div><div class="pf-cab"><div class="pf-logo"' + logo + '>' + (logo ? '' : esc((t.empresa || '?').charAt(0).toUpperCase())) +
      '</div><div class="pf-nom"><h2>' + esc(t.empresa || 'Tienda') + '</h2>' + (t.rubro ? '<div class="muted">' + esc(t.rubro) + '</div>' : '') + '</div></div>' +
      '<div class="pf-cuerpo">' + partes.join('') + '</div></section>';
    nodo.querySelector('[data-pf="compartir"]').onclick = async () => {
      const url = location.href.split('#')[0];
      try { if (navigator.share) return await navigator.share({ title: t.empresa, url }); } catch (e) { return; }
      try { await navigator.clipboard.writeText(url); (window.Core && Core.toast) ? Core.toast('🔗 Link copiado') : alert('Link copiado'); } catch (e) { prompt('Copia el link', url); }
    };
  }

  const CAMPOS = [['descripcion', 'Sobre tu negocio', 'Qué vendes, qué te hace distinto…', 400], ['direccion', 'Dirección', 'Calle y número (opcional)', 150],
    ['comuna', 'Comuna', 'Ej: Ñuñoa', 60], ['instagram', 'Instagram', '@tutienda', 100], ['facebook', 'Facebook', 'tutienda o link', 100],
    ['tiktok', 'TikTok', '@tutienda', 100], ['web', 'Sitio web', 'tutienda.cl', 150], ['correo', 'Correo de contacto', 'hola@tutienda.cl', 120]];
  function editor(nodo, perfil) {
    if (!nodo) return;
    const p = perfil || {};
    nodo.innerHTML = CAMPOS.map(([k, l, ph, m]) => '<label for="pf-' + k + '">' + l + '</label>' + (k === 'descripcion'
      ? '<textarea id="pf-' + k + '" data-pf="' + k + '" maxlength="' + m + '" placeholder="' + ph + '">' + esc(p[k]) + '</textarea>'
      : '<input id="pf-' + k + '" data-pf="' + k + '" maxlength="' + m + '" placeholder="' + ph + '" value="' + esc(p[k]) + '"' + (k === 'correo' ? ' type="email"' : '') + '>')).join('');
  }
  function leer(nodo) {
    const r = {};
    nodo.querySelectorAll('[data-pf]').forEach((x) => { const v = x.value.trim(); if (v) r[x.dataset.pf] = v; });
    return r;
  }
  window.CodeFixVitrina = { montar, editor, leer };
})();
