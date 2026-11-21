/* CodeFix · Núcleo · 🎬 Estudio · G141 b — publicaciones por LINK, pantallazo leído en el teléfono, análisis con gráficos e ideas sin base.
   SIN API de IA y gratis. Lo cargan estudio.js (5 apps) y app/m-estudio.js (CM) la primera vez que se abre algo de esto.
   · EstLinks.leerLink(url)        → { red, tipo, id, fecha, hora, exacta } desde el link (TikTok: fecha exacta por el id; Instagram: por el código).
                                     Un link NO trae métricas (Meta/TikTok solo las dan con su API oficial): los números salen del pantallazo o a mano.
   · EstLinks.leerPantallazo(file) → { m: {vistas, alcance, me_gusta, comentarios, compartidos, guardados, seguidores, perfil}, texto }
                                     OCR con Tesseract.js (cdn.jsdelivr.net, ~4 MB la 1.ª vez, después en caché). La foto NO sale del teléfono.
   · EstLinks.leerTexto(texto, red) → lo mismo desde un texto (lo usa el OCR; probado en pruebas/g141.js).
   · EstLinks.analisis(P, obj)     → HTML: aviso con < 5, cifras, 📈 tendencia semanal, barras vs SU promedio (formato, día, hora, red, tema)
                                     y "haz más de X / deja Y" según el objetivo. P = [{ fecha, titulo, datos: { red, formato, hora, tema, link, m } }].
   · EstLinks.semilla(app, que)    → filas de base de fábrica por rubro (💡 "No tengo idea": ideas al tiro sin preparar nada).
   · EstLinks.ventana(zona, o)     → caja 🔗 Anotar por link (link → red/fecha, 📸 pantallazo → números, se corrigen y 💾). */
(function () {
  'use strict';
  if (window.EstLinks) return;
  const esc = window.CFX_ESC || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const sin = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

  /* ---------- 🔗 el link ---------- */
  const IG_EPOCA = 1314220021721n;  // los id de Instagram llevan los ms desde esta época en sus primeros 41 bits
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function leerLink(txt) {
    let s = String(txt || '').trim(); if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch (e) { return null; }
    const h = u.hostname.toLowerCase().replace(/^(www|m|vm|vt|web)\./, ''), seg = u.pathname.split('/').filter(Boolean);
    const r = { red: null, tipo: '', id: '', fecha: '', hora: '', exacta: false, link: (u.origin + u.pathname).replace(/\/$/, '').slice(0, 200) };
    const deMs = (ms) => { const d = new Date(Number(ms)); if (isNaN(d) || d.getFullYear() < 2010 || d > new Date(Date.now() + 864e5)) return; r.fecha = ymd(d); r.hora = p2(d.getHours()) + ':00'; };
    if (/(^|\.)tiktok\.com$/.test(h)) {
      r.red = 'tiktok'; const i = seg.indexOf('video') >= 0 ? seg.indexOf('video') : seg.indexOf('photo');
      if (i >= 0 && /^\d{15,22}$/.test(seg[i + 1] || '')) { r.id = seg[i + 1]; r.tipo = seg[i] === 'photo' ? 'carrusel' : 'video'; deMs((BigInt(r.id) >> 32n) * 1000n); r.exacta = !!r.fecha; }
      else if (h === 'tiktok.com' && seg.length === 1 && !/^@/.test(seg[0])) r.tipo = 'video';  // vm.tiktok.com/XXXX (link corto: sin fecha)
    } else if (/(^|\.)instagram\.com$/.test(h)) {
      r.red = 'instagram'; const k = seg.findIndex((x) => /^(p|reel|reels|tv)$/.test(x));
      if (seg[0] === 'stories') { r.red = 'historias'; r.tipo = 'historia'; }
      if (k >= 0 && /^[\w-]{5,40}$/.test(seg[k + 1] || '')) {
        r.tipo = seg[k] === 'p' ? 'post' : 'reel'; r.id = seg[k + 1];
        try { let n = 0n; for (const c of r.id.slice(0, 11)) { const v = B64.indexOf(c); if (v < 0) throw 0; n = n * 64n + BigInt(v); } deMs((n >> 23n) + IG_EPOCA); } catch (e) { /* código raro: sin fecha */ }
      }
    } else if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(h)) {
      r.red = 'facebook'; r.tipo = /reel|watch|videos/.test(u.pathname) || h === 'fb.watch' ? 'reel' : 'post';
    } else if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) { r.red = 'youtube'; r.tipo = seg[0] === 'shorts' ? 'short' : 'video'; }
    return r.red ? r : null;
  }

  /* ---------- 📸 el pantallazo ---------- */
  // Número como lo muestran las apps: 1.234 · 1,2 mil · 12,5 K · 1.2M · 3 mill.
  function numero(t) {
    const m = /(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|mill[oó]n|mill\.?|mil\b|mm\b|m\b|k\b)?/i.exec(t); if (!m) return null;
    let s = m[1].replace(/\s/g, ''), suf = sin(m[2] || '');
    let v;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s) && !suf) v = +s.replace(/[.,]/g, '');
    else v = +s.replace(',', '.');
    if (!isFinite(v)) return null;
    if (suf === 'k' || suf === 'mil') v *= 1e3; else if (suf === 'm' || suf === 'mm' || /^mill/.test(suf)) v *= 1e6;
    return Math.round(v);
  }
  const ETQ = [  // [campo, expresión] · el orden importa: lo más específico primero
    ['perfil', /visitas? al perfil|profile (visits|views)/],
    ['seguidores', /nuevos seguidores|seguidores nuevos|seguimientos|follows|seguidores ganados|^seguidores\b/],
    ['alcance', /cuentas alcanzadas|accounts reached|alcance|reach\b/],
    ['vistas', /visualizaciones|reproducciones|vistas\b|views\b|plays\b|impresiones/],
    ['me_gusta', /me gusta|likes?\b|me encanta|reacciones/],
    ['comentarios', /comentarios?|comments?\b/],
    ['compartidos', /compartid|veces que se compart|shares?\b|reenvi/],
    ['guardados', /guardad|saves?\b|favoritos/]
  ];
  function leerTexto(texto, red) {
    const L = String(texto || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean), m = {};
    // El OCR a veces corta la columna: "Visualizaciones del 12,5" / "video mil" → el "mil" vuelve a su número.
    for (let i = 0; i + 1 < L.length; i++) {
      const suf = /(?:^|\s)(mil|k|m|mill(?:ones|\.)?)\s*$/i.exec(L[i + 1]);
      if (suf && /\d\s*$/.test(L[i]) && !/\d/.test(L[i + 1])) { L[i] += ' ' + suf[1]; L[i + 1] = L[i + 1].slice(0, suf.index).trim() || '·'; }
    }
    const quitarPct = (x) => x.replace(/[-+]?\d+(?:[.,]\d+)?\s*%/g, ' ').replace(/\b\d{1,2}[:/]\d{2}\b/g, ' ');
    for (let i = 0; i < L.length; i++) {
      const l = sin(L[i]);
      const e = ETQ.find(([k, re]) => m[k] == null && re.test(l)); if (!e) continue;
      const pos = l.search(e[1]), resto = quitarPct(L[i]);
      // número en la misma línea (después o antes de la etiqueta) o en la línea siguiente / anterior
      let v = numero(quitarPct(L[i].slice(pos))) ?? numero(resto);
      if (v == null && L[i + 1] && !ETQ.some(([, re]) => re.test(sin(L[i + 1])))) v = numero(quitarPct(L[i + 1]));
      if (v == null && L[i - 1] && !ETQ.some(([, re]) => re.test(sin(L[i - 1])))) v = numero(quitarPct(L[i - 1]));
      if (v != null) m[e[0]] = v;
    }
    // Instagram muestra arriba 4 números sin nombre: ♡ me gusta · 💬 comentarios · ➤ compartidos · 🔖 guardados.
    if (red !== 'tiktok' && m.me_gusta == null && m.comentarios == null) {
      const f = L.map((x) => quitarPct(x).match(/\d{1,3}(?:[.,]\d{3})+(?:\s*mil)?|\d+(?:[.,]\d+)?\s*(?:mil|k|m)?\b/gi) || []).find((x, j) => x.length === 4 && !ETQ.some(([, re]) => re.test(sin(L[j]))));
      if (f) ['me_gusta', 'comentarios', 'compartidos', 'guardados'].forEach((k, j) => { if (m[k] == null) m[k] = numero(f[j]); });
    }
    if (m.vistas == null && m.alcance != null) m.vistas = m.alcance;
    return m;
  }
  let tess;
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const cargarTess = () => tess || (tess = new Promise((ok, no) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const s = document.createElement('script'); s.src = TESS; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.Tesseract); s.onerror = () => { tess = null; no(new Error('No se pudo cargar el lector de pantallazos. Revisa tu conexión o escribe los números.')); };
    document.head.appendChild(s);
  }));
  // La foto se achica en el teléfono (más rápido y mejor lectura) y nunca se sube a ningún lado.
  async function achicar(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Esa imagen no se pudo abrir')); i.src = url; });
      const k = Math.min(1, 1500 / Math.max(img.width, 1)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.25)'; g.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  async function leerPantallazo(file, red, alAvance) {
    const T = await cargarTess(), lienzo = await achicar(file);
    const w = await T.createWorker('spa', 1, { logger: (x) => { if (alAvance && x && x.status === 'recognizing text') alAvance(Math.round((x.progress || 0) * 100)); } });
    try { const { data } = await w.recognize(lienzo); EstLinks.ultimoTexto = data.text; return { m: leerTexto(data.text, red), texto: data.text }; } finally { w.terminate(); }
  }

  /* ---------- 📊 análisis ---------- */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const RN = { tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', historias: 'Historias', youtube: 'YouTube' };
  const n0 = (x) => +x || 0;
  // Lo que se mide según el objetivo (por 1.000 vistas: así un video chico y uno grande se comparan parejo).
  const OBJM = {
    vender: { n: 'clientes y consultas', f: (m) => n0(m.clientes) * 1000 + n0(m.comentarios) * 2 + n0(m.compartidos), por: true },
    seguidores: { n: 'seguidores nuevos', f: (m) => n0(m.seguidores), por: true },
    comentarios: { n: 'comentarios', f: (m) => n0(m.comentarios), por: true },
    compartidos: { n: 'guardados y compartidos', f: (m) => n0(m.guardados) + n0(m.compartidos), por: true }
  };
  function valor(i, obj) {
    const m = (i.datos || {}).m || {}, o = OBJM[obj] || OBJM.vender, v = n0(m.vistas);
    const x = o.f(m);
    return v > 0 ? x * 1000 / v : x;  // sin vistas: el número tal cual
  }
  const fechaDe = (i) => i.fecha || (i.datos || {}).fecha_plan || '';
  function grupos(P, clave, obj, media) {
    const g = {};
    P.forEach((i) => { const k = clave(i); if (k) (g[k] = g[k] || []).push(Math.min(5, valor(i, obj) / media)); });
    return Object.keys(g).map((k) => ({ k, v: g[k].reduce((a, b) => a + b, 0) / g[k].length, n: g[k].length })).sort((a, b) => b.v - a.v);
  }
  // Barras horizontales: 100 % = lo normal suyo (mediana, línea). ▲ arriba · ▼ abajo. Tocar una barra = su detalle.
  function barras(tit, G, nombre) {
    if (G.length < 2) return '';  // con 1 solo grupo no hay con qué comparar
    const max = Math.max(1.5, ...G.map((x) => x.v));
    return '<div class="e-card el-graf"><b>' + tit + '</b><div class="el-bars" role="list">' + G.slice(0, 7).map((x, q) => {
      const pc = Math.round(x.v * 100), arriba = x.v >= 1, poca = x.n < 2;
      const det = nombre(x.k) + ': ' + pc + ' % de lo normal tuyo · ' + x.n + ' publicación' + (x.n > 1 ? 'es' : '') + (poca ? ' (pocas para concluir)' : '');
      return '<button type="button" class="el-bar" role="listitem" data-det="' + esc(det) + '" title="' + esc(det) + '" aria-label="' + esc(det) + '"><span class="el-bl">' + (q === 0 && !poca && arriba ? '🏆 ' : '') + esc(nombre(x.k)) + '</span>' +
        '<span class="el-bt"><span class="el-bf' + (arriba ? '' : ' bajo') + (poca ? ' poca' : '') + '" style="width:' + Math.max(3, Math.round(x.v / max * 100)) + '%"></span><span class="el-b100" style="left:' + Math.round(100 / max) + '%"></span></span>' +
        '<span class="el-bv">' + (arriba ? '▲' : '▼') + ' ' + pc + '%</span></button>';
    }).join('') + '</div><p class="e-sub el-det" aria-live="polite">La rayita = lo normal en tus publicaciones. Toca una barra para ver el detalle.</p></div>';
  }
  // Línea semanal (últimas 12 semanas con datos): vistas promedio por publicación.
  function lunes(f) { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
  function tendencia(P) {
    const g = {}; P.forEach((i) => { const f = fechaDe(i); if (f) (g[lunes(f)] = g[lunes(f)] || []).push(n0(i.datos.m.vistas)); });
    const S = Object.keys(g).sort().slice(-12).map((k) => ({ k, v: g[k].reduce((a, b) => a + b, 0) / g[k].length, n: g[k].length }));
    if (S.length < 2) return '';
    const W = 320, H = 120, pl = 6, pr = 6, pt = 14, pb = 18, mx = Math.max(...S.map((s) => s.v)) || 1;
    const X = (j) => pl + j * (W - pl - pr) / (S.length - 1), Y = (v) => pt + (H - pt - pb) * (1 - v / mx);
    const pts = S.map((s, j) => X(j).toFixed(1) + ',' + Y(s.v).toFixed(1)).join(' ');
    const ult = S.slice(-4), ant = S.slice(-8, -4), pm = (A) => A.reduce((a, s) => a + s.v, 0) / A.length;
    const cambio = ant.length ? Math.round((pm(ult) / (pm(ant) || 1) - 1) * 100) : null;
    const fmt = (v) => Math.round(v).toLocaleString('es-CL'), dm = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
    return '<div class="e-card el-graf"><b>📈 Vistas por semana</b><p class="e-sub">Promedio por publicación' + (cambio != null ? ' · últimas 4 semanas ' + (cambio >= 0 ? '▲ ' : '▼ ') + Math.abs(cambio) + ' % vs las 4 anteriores' : '') + '</p>' +
      '<svg class="el-linea" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Vistas promedio por semana">' +
      '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '" class="el-eje"/>' +
      '<polyline points="' + pts + '" class="el-pl"/>' +
      S.map((s, j) => '<g class="el-pt" tabindex="0" data-det="' + esc('Semana del ' + dm(s.k) + ': ' + fmt(s.v) + ' vistas promedio · ' + s.n + ' publicación' + (s.n > 1 ? 'es' : '')) + '"><circle cx="' + X(j).toFixed(1) + '" cy="' + Y(s.v).toFixed(1) + '" r="12" class="el-hit"/><circle cx="' + X(j).toFixed(1) + '" cy="' + Y(s.v).toFixed(1) + '" r="4" class="el-dot"/><title>Semana del ' + dm(s.k) + ': ' + fmt(s.v) + '</title></g>').join('') +
      '<text x="' + pl + '" y="' + (H - 4) + '" class="el-tx">' + dm(S[0].k) + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" class="el-tx" text-anchor="end">' + dm(S[S.length - 1].k) + '</text>' +
      '<text x="' + X(S.length - 1).toFixed(1) + '" y="' + Math.max(10, Y(S[S.length - 1].v) - 8).toFixed(1) + '" class="el-tx" text-anchor="end">' + fmt(S[S.length - 1].v) + '</text></svg>' +
      '<p class="e-sub el-det" aria-live="polite">Toca un punto para ver la semana.</p></div>';
  }
  const banda = (h) => { const x = parseInt(h, 10); if (isNaN(x)) return ''; return x < 6 ? 'madrugada (0–6)' : x < 12 ? 'mañana (6–12)' : x < 15 ? 'mediodía (12–15)' : x < 19 ? 'tarde (15–19)' : 'noche (19–24)'; };
  function analisis(P0, obj, o) {
    o = o || {}; obj = OBJM[obj] ? obj : 'vender'; css();
    const P = (P0 || []).filter((i) => i && i.datos && i.datos.m);
    if (!P.length) return '';
    // 100 % = lo NORMAL en sus publicaciones (mediana: un viral o un número mal anotado no tuerce todo); cada una cuenta hasta 5 veces.
    const vals = P.map((i) => valor(i, obj)).sort((a, b) => a - b), mitad = vals[Math.floor(vals.length / 2)];
    const media = mitad > 0 ? mitad : (vals.reduce((a, b) => a + b, 0) / vals.length || 1);
    const vist = P.map((i) => n0(i.datos.m.vistas)).sort((a, b) => a - b), med = vist[Math.floor(vist.length / 2)];
    const tot = (k) => P.reduce((a, i) => a + n0(i.datos.m[k]), 0);
    const sumV = tot('vistas') || 0, tasa = (k) => sumV ? (tot(k) * 1000 / sumV) : 0;
    const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-CL');
    let x = '';
    if (P.length < 5) x += '<div class="e-card el-aviso">⚠️ <b>Con ' + P.length + ' publicación' + (P.length > 1 ? 'es' : '') + ' aún es poco</b><p class="e-sub">Desde 5 las conclusiones empiezan a valer; desde 15 son firmes. Anota cada una (🔗 por link es lo más rápido).</p></div>';
    x += '<div class="el-kpis">' +
      '<div class="el-kpi"><span>' + P.length + '</span>publicaciones</div>' +
      '<div class="el-kpi"><span>' + med.toLocaleString('es-CL') + '</span>vistas (mediana)</div>' +
      '<div class="el-kpi"><span>' + f1(tasa('guardados') + tasa('compartidos')) + '</span>guardados + compartidos x 1.000 vistas</div>' +
      '<div class="el-kpi"><span>' + (tot('clientes') ? tot('clientes') : f1(tasa('seguidores'))) + '</span>' + (tot('clientes') ? 'clientes que llegaron' : 'seguidores x 1.000 vistas') + '</div></div>';
    x += '<p class="e-sub">Las barras comparan <b>' + esc(OBJM[obj].n) + ' por cada 1.000 vistas</b> (tu objetivo) contra lo normal TUYO (100 %): así un video chico y uno viral se miden parejo.</p>';
    x += tendencia(P);
    const nF = (k) => k, G = {
      formato: grupos(P, (i) => i.datos.formato, obj, media), dia: grupos(P, (i) => fechaDe(i) ? DIAS[new Date(fechaDe(i) + 'T12:00:00').getDay()] : '', obj, media),
      hora: grupos(P, (i) => banda(i.datos.hora), obj, media), red: grupos(P, (i) => i.datos.red, obj, media), tema: grupos(P, (i) => i.datos.tema && !/^(Importado|Sin tema)$/.test(i.datos.tema) ? i.datos.tema : '', obj, media)
    };
    // 🧭 Qué hacer (solo con grupos de 2 o más publicaciones: con 1 no se concluye)
    const firmes = (A) => A.filter((g) => g.n >= 2), rec = [];
    const top = (A, n, verbo) => { const F = firmes(A); if (F.length >= 2 && F[0].v >= 1.15) rec.push('✅ ' + verbo + ' <b>' + esc(n(F[0].k)) + '</b>: rinde ' + Math.round(F[0].v * 100) + ' % de lo normal (' + F[0].n + ').'); };
    const malo = (A, n, verbo) => { const F = firmes(A); const b = F[F.length - 1]; if (F.length >= 2 && b.v <= 0.75) rec.push('🛑 ' + verbo + ' <b>' + esc(n(b.k)) + '</b>: queda en ' + Math.round(b.v * 100) + ' % (' + b.n + ').'); };
    top(G.formato, nF, 'Haz más de'); malo(G.formato, nF, 'Deja o cambia');
    top(G.dia, nF, 'Publica el'); top(G.hora, nF, 'Mejor horario: en la');
    top(G.red, (k) => RN[k] || k, 'Tu red más fuerte es'); top(G.tema, nF, 'Tu tema estrella:'); malo(G.tema, nF, 'Descansa el tema');
    const ord = P.slice().sort((a, b) => valor(b, obj) - valor(a, obj)), mej = ord[0];
    if (mej && P.length >= 3) rec.push('🏆 Tu mejor: «' + esc(String(mej.titulo || mej.datos.gancho || '').slice(0, 70)) + '»' + (mej.datos.formato ? ' (' + esc(mej.datos.formato) + ')' : '') + '. Repite su gancho con otro tema.');
    const sinCli = !tot('clientes') && obj === 'vender';
    if (sinCli) rec.push('💡 Anota cuántos <b>clientes</b> llegaron por cada publicación (pregúntales "¿cómo nos conociste?"): es el dato que más ayuda a vender.');
    if (!tot('guardados') && !tot('compartidos')) rec.push('💡 Suma <b>guardados y compartidos</b> (salen en las estadísticas de cada publicación): dicen qué contenido vale de verdad.');
    x += '<div class="e-card"><b>🧭 Qué hacer ahora</b>' + (rec.length ? rec.map((r) => '<p class="e-sub">' + r + '</p>').join('') : '<p class="e-sub">Aún no hay diferencias claras: sigue probando formatos distintos (2 o más de cada uno) y anota sus números.</p>') + '</div>';
    x += barras('🎞️ Formatos', G.formato, nF) + barras('📅 Días', G.dia, nF) + barras('⏰ Horario', G.hora, nF) + (G.red.length > 1 ? barras('📱 Redes', G.red, (k) => RN[k] || k) : '') + barras('🏷️ Temas', G.tema, nF);
    return '<div class="el">' + x + '</div>';
  }

  /* ---------- 💡 ideas sin base ---------- */
  // Base de fábrica por rubro: {x} = lo que la persona vende (lo escribe en 1 palabra o sale del rubro de la app).
  const COMUN = {
    error: ['comprar {x} solo por el precio', 'no preguntar antes de elegir {x}', 'esperar al último momento para comprar'],
    sintoma: ['no sabes cuál {x} te conviene', 'lo barato te salió caro', 'nadie te explicó bien'],
    dato: ['el 80 % de nuestros clientes vuelve', 'lo que más nos piden es {x}', 'lo bueno dura el doble'],
    mito: ['lo caro siempre es mejor', 'da lo mismo dónde compres {x}', 'eso solo se consigue en el mall'],
    parte: ['{x}', 'el detalle que nadie mira', 'lo nuevo que llegó'],
    costo: ['lo barato que sale caro', 'cuánto cuesta de verdad lo barato', 'lo que ahorras si eliges bien'],
    idea_video: ['cómo preparamos un pedido', 'un día normal en el negocio', 'el antes y después de un cliente', 'respondiendo la pregunta que más nos hacen'],
    cta: ['Escríbenos por WhatsApp', 'Pide el tuyo hoy', 'Link en la bio']
  };
  const RUBRO = {
    barberia: { x: 'corte', error: ['lavarse el pelo con agua muy caliente', 'cortarse en casa antes de un evento', 'no decirle al barbero cómo te peinas'], sintoma: ['el degradado se ve disparejo al tercer día', 'el pelo se esponja y no se deja peinar', 'la barba pica y crece chueca'], dato: ['un degradado dura 2 a 3 semanas', 'la forma de tu cara define tu corte', 'el pelo crece 1 cm al mes'], mito: ['cortarse seguido hace crecer más el pelo', 'la cera daña el pelo', 'la barba crece más si te afeitas'], parte: ['la navaja', 'la máquina de terminación', 'el aceite para barba'], idea_video: ['transformación antes y después', 'el corte que más nos piden', 'cómo pedir tu corte sin fallar'] },
    taller: { x: 'mantención', error: ['inflar las ruedas a ojo', 'no lubricar la cadena', 'esperar a que el freno chille'], sintoma: ['el freno chilla', 'los cambios saltan solos', 'la cadena suena al pedalear'], dato: ['una cadena gastada se come los piñones', 'la presión correcta evita pinchazos', 'una mantención al año alarga la vida de la bici'], mito: ['si anda, está bien', 'más aceite es mejor', 'las bicis no necesitan mantención'], parte: ['la cadena', 'las pastillas de freno', 'el cambio trasero'], costo: ['cambiar la cadena a tiempo cuesta 4 veces menos que los piñones'], idea_video: ['así llegó y así se fue', 'diagnóstico por el sonido', 'mantención express en 60 segundos'] },
    estaciona: { x: 'estacionamiento', error: ['dar vueltas buscando dónde estacionar', 'dejar el auto en la calle de noche', 'pagar por hora cuando conviene el mes'], sintoma: ['llegas tarde por buscar estacionamiento', 'te llenaron de partes', 'te rayaron el auto en la calle'], dato: ['arrendar por mes sale más barato que por hora', 'un lugar techado cuida la pintura', 'cerca del metro se arrienda más rápido'], mito: ['arrendar un estacionamiento es caro', 'es difícil arrendar tu estacionamiento vacío', 'nadie arrienda por días'], parte: ['el portón', 'el lugar techado', 'la cámara'], idea_video: ['tour por el estacionamiento', 'cuánto ganas arrendando tu lugar vacío', 'cómo reservar en 30 segundos'] },
    billetera: { x: 'negocio', error: ['mezclar la plata de la casa con la del negocio', 'fiar sin anotar', 'no cobrar a tiempo'], sintoma: ['vendes harto pero no te queda plata', 'no sabes cuánto te deben', 'llega fin de mes y no cuadra'], dato: ['anotar cada venta muestra dónde se va la plata', 'cobrar el mismo día baja la morosidad', 'tu mejor cliente compra cada semana'], mito: ['las cuentas son solo para empresas grandes', 'fiar ayuda a vender más', 'si hay ventas, hay ganancia'] },
    orbita: { x: 'producto' }, mando: { x: 'producto' }
  };
  function semilla(app, que) {
    const R = RUBRO[app] || {}, x = String(que || R.x || 'producto').trim().slice(0, 40) || 'producto', tema = x.charAt(0).toUpperCase() + x.slice(1);
    const out = [];
    Object.keys(COMUN).forEach((cat) => { (R[cat] || []).concat(COMUN[cat]).slice(0, 5).forEach((t) => out.push({ tipo: 'base', titulo: t.replace(/\{x\}/g, x).slice(0, 200), datos: { tema, cat } })); });
    return out;
  }

  /* ---------- 🔗 caja para anotar por link ---------- */
  function css() {
    if (document.getElementById('cfx-el-css')) return;
    const st = document.createElement('style'); st.id = 'cfx-el-css';
    st.textContent = '.el-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}' +
      '.el-kpi{background:var(--cfx-tarjeta,var(--card,#fff));border:1px solid var(--cfx-borde,#8883);border-radius:12px;padding:10px;font-size:.8rem;color:var(--cfx-texto-2,#5b6472)}' +
      '.el-kpi span{display:block;font-size:1.35rem;font-weight:800;color:var(--cfx-texto,inherit);line-height:1.15}' +
      '.el-bars{display:flex;flex-direction:column;gap:2px;margin-top:6px}' +
      '.el .el-bar,.el-bar{display:grid;grid-template-columns:minmax(70px,34%) 1fr auto;align-items:center;gap:8px;background:none;border:0;padding:6px 2px;min-height:36px;color:inherit;font:inherit;font-size:.88rem;text-align:left;cursor:pointer;border-radius:8px}' +
      '.el-bar:hover,.el-bar:focus-visible{background:color-mix(in srgb,var(--cfx-texto,#000) 6%,transparent)}' +
      '.el-bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.el-bv{font-variant-numeric:tabular-nums;font-weight:700;font-size:.82rem;min-width:56px;text-align:right}' +
      '.el-bt{position:relative;height:12px;border-radius:6px;background:color-mix(in srgb,var(--cfx-texto,#000) 7%,transparent)}' +
      '.el-bf{position:absolute;left:0;top:0;bottom:0;border-radius:0 6px 6px 0;background:var(--brand,var(--cfx-primario,#2563eb))}' +
      '.el-bf.bajo{background:color-mix(in srgb,var(--brand,var(--cfx-primario,#2563eb)) 38%,var(--cfx-tarjeta,#fff))}.el-bf.poca{background-image:repeating-linear-gradient(135deg,transparent 0 3px,rgba(255,255,255,.45) 3px 5px)}' +
      '.el-b100{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--cfx-texto,#111);opacity:.55;border-radius:1px}' +
      '.el-linea{width:100%;height:auto;display:block;margin-top:6px;overflow:visible}.el-eje{stroke:var(--cfx-borde,#8886);stroke-width:1}' +
      '.el-pl{fill:none;stroke:var(--brand,var(--cfx-primario,#2563eb));stroke-width:2;stroke-linejoin:round;stroke-linecap:round}' +
      '.el-dot{fill:var(--brand,var(--cfx-primario,#2563eb));stroke:var(--cfx-tarjeta,#fff);stroke-width:2}.el-hit{fill:transparent;cursor:pointer}.el-pt:focus{outline:none}.el-pt:focus .el-dot{r:6}' +
      '.el-tx{font-size:10px;fill:var(--cfx-texto-2,#5b6472)}.el-aviso{border-color:var(--cfx-amarillo,#d97706)}' +
      '.el-m{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 8px}.el-m label{margin:0;font-size:.85rem}.el-m input.lleno{box-shadow:0 0 0 2px var(--cfx-verde,#16a34a)}' +
      '.el-link-det{font-size:.88rem;margin:6px 0;min-height:1.2em}' +
      // lo mínimo de las cajas del Estudio (el CM no carga estudio.js)
      '.el .e-card,.el-ven{background:var(--cfx-tarjeta,var(--card,#fff));border:1px solid var(--cfx-borde,#8883);border-radius:12px;padding:10px 12px;margin:8px 0}' +
      '.el .e-sub,.el-ven .e-sub{color:var(--cfx-texto-2,#5b6472);font-size:.88rem;margin:4px 0}.el-ven label{display:block;margin-top:8px}.el-ven input{width:100%;box-sizing:border-box}' +
      '.el-ven .e-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.el-ven .e-big{width:100%;margin:8px 0;min-height:44px}.el-ven .e-b{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.el-ven .e-b button{min-height:40px}';
    document.head.appendChild(st);
  }
  // Toque en barra o punto → su detalle abajo del gráfico (sirve en el teléfono, sin hover).
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.el-graf [data-det]'); if (!b) return;
    const p = b.closest('.el-graf').querySelector('.el-det'); if (p) p.textContent = b.getAttribute('data-det');
  });
  const FORMATO_TIPO = { reel: 'Reel', video: 'Video', short: 'Short', post: 'Post / foto', carrusel: 'Carrusel', historia: 'Historia' };
  const CAMPOS = [['vistas', '👁️ Vistas'], ['alcance', '📡 Alcance'], ['me_gusta', '❤️ Me gusta'], ['comentarios', '💬 Comentarios'], ['compartidos', '🔁 Compartidos'], ['guardados', '🔖 Guardados'], ['seguidores', '👥 Seguidores nuevos'], ['clientes', '💰 Clientes que llegaron']];
  // o = { puede, temas: [..], m (métricas ya anotadas), link, alGuardar({ link, red, formato, fecha, hora, tema, titulo, m }), alCancelar, conTexto }
  function ventana(z, o) {
    css(); o = o || {};
    const m0 = o.m || {};
    z.innerHTML = '<div class="e-card el-ven"><b>🔗 Anotar una publicación</b>' +
      '<p class="e-sub">1) Pega el link · 2) 📸 sube el pantallazo de sus estadísticas y leemos los números (en tu teléfono, la foto no se sube) · 3) corrige si hace falta y guarda.</p>' +
      '<label>Link de la publicación<input data-el="link" inputmode="url" autocomplete="off" autocapitalize="off" maxlength="300" placeholder="Pega el link del reel, TikTok o post" value="' + esc(o.link || '') + '"></label><p class="el-link-det" data-el="det" aria-live="polite"></p>' +
      (o.conTexto !== false ? '<label>¿De qué trataba? (opcional)<input data-el="titulo" maxlength="200" placeholder="ej. el error de esperar a que falle" value="' + esc(o.titulo || '') + '"></label>' +
        '<label>Tema (opcional)<input data-el="tema" maxlength="60" list="cfxElTemas" placeholder="ej. Mantención" value="' + esc(o.tema || '') + '"><datalist id="cfxElTemas">' + (o.temas || []).map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist></label>' : '') +
      '<div class="e-grid"><label>Fecha<input type="date" data-el="fecha" value="' + esc(o.fecha || '') + '"></label><label>Hora<input type="time" data-el="hora" step="3600" value="' + esc(o.hora || '') + '"></label></div>' +
      '<button type="button" class="alt e-big" data-el="foto">📸 Leer pantallazo de estadísticas</button><p class="e-sub" data-el="estado" aria-live="polite"></p>' +
      '<div class="el-m">' + CAMPOS.map(([k, n]) => '<label>' + n + '<input type="number" min="0" inputmode="numeric" data-elm="' + k + '" value="' + (m0[k] != null ? +m0[k] : '') + '"></label>').join('') + '</div>' +
      '<details><summary class="e-sub">¿Dónde veo las estadísticas?</summary><p class="e-sub">Instagram: abre el reel → <b>Ver estadísticas</b>. TikTok: abre el video → ⋯ → <b>Estadísticas</b>. Facebook: debajo de la publicación → <b>Ver estadísticas</b>. Saca pantallazo (si son 2 pantallas, sube las 2: se suman sin repetir). Míralas a los 7 días.</p></details>' +
      '<div class="e-b"><button type="button" class="ok" data-el="guardar"' + (o.puede === false ? ' disabled' : '') + '>💾 Guardar</button><button type="button" class="alt" data-el="cancelar">Cancelar</button></div></div>';
    const q = (s) => z.querySelector('[data-el="' + s + '"]');
    let info = null;
    const verLink = () => {
      info = leerLink(q('link').value);
      q('det').innerHTML = !q('link').value.trim() ? '' : !info ? '⚠️ No reconozco ese link (sirve de Instagram, TikTok, Facebook o YouTube).' :
        '✓ ' + esc(RN[info.red] || info.red) + (info.tipo ? ' · ' + esc(FORMATO_TIPO[info.tipo] || info.tipo) : '') + (info.fecha ? ' · 📅 ' + esc(info.fecha.slice(8, 10) + '/' + info.fecha.slice(5, 7) + '/' + info.fecha.slice(0, 4)) + (info.exacta ? '' : ' (aprox.)') : ' · escribe la fecha');
      if (info && info.fecha && !q('fecha').dataset.mano) q('fecha').value = info.fecha;
      if (info && info.hora && !q('hora').dataset.mano) q('hora').value = info.hora;
    };
    q('link').oninput = verLink; q('fecha').oninput = () => { q('fecha').dataset.mano = 1; }; q('hora').oninput = () => { q('hora').dataset.mano = 1; };
    if (o.link) verLink();
    z.onclick = async (e) => {
      const b = e.target.closest('[data-el]'); if (!b || b.tagName === 'INPUT') return;
      const a = b.dataset.el;
      if (a === 'cancelar') return o.alCancelar && o.alCancelar();
      if (a === 'foto') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = async () => {
          const F = Array.from(inp.files || []).slice(0, 3); if (!F.length) return;
          b.disabled = true; const est = q('estado');
          try {
            est.textContent = '⏳ Preparando el lector (la 1.ª vez demora un poco)…';
            let n = 0;
            for (const f of F) {
              const r = await leerPantallazo(f, info && info.red, (p) => { est.textContent = '🔎 Leyendo ' + (F.length > 1 ? 'pantallazo ' + (F.indexOf(f) + 1) + ': ' : '') + p + ' %'; });
              Object.keys(r.m).forEach((k) => { const i = z.querySelector('[data-elm="' + k + '"]'); if (i && i.value === '') { i.value = r.m[k]; i.classList.add('lleno'); n++; } });
            }
            est.textContent = n ? '✅ Leí ' + n + ' número' + (n > 1 ? 's' : '') + ' (en verde). Revísalos y corrige si alguno no calza.' : '⚠️ No encontré números con nombre. Prueba con el pantallazo de "Estadísticas" o escríbelos.';
          } catch (er) { est.textContent = '⚠️ ' + (er.message || er); } finally { b.disabled = false; }
        };
        inp.click(); return;
      }
      if (a === 'guardar') {
        const m = {}; z.querySelectorAll('[data-elm]').forEach((i) => { if (i.value !== '') m[i.dataset.elm] = Math.max(0, Math.round(+i.value) || 0); });
        if (!Object.keys(m).length) return (window.CFX_AVISO || (() => 0))('Escribe o lee al menos las vistas');
        const tipo = info && info.tipo, red = (info && info.red) || o.red || 'instagram';
        const hora = q('hora').value ? q('hora').value.slice(0, 2) + ':00' : '';
        b.disabled = true;
        try {
          await o.alGuardar({ link: info ? info.link : (q('link').value.trim().slice(0, 200) || ''), red, formato: FORMATO_TIPO[tipo] || o.formato || '', fecha: q('fecha').value || null, hora,
            tema: q('tema') ? q('tema').value.trim().slice(0, 60) : '', titulo: q('titulo') ? q('titulo').value.trim().slice(0, 200) : '', m });
        } catch (er) { b.disabled = false; (window.CFX_AVISO || (() => 0))('⚠️ ' + (er.message || er)); }
      }
    };
  }

  window.EstLinks = { leerLink, leerTexto, numero, leerPantallazo, analisis, semilla, ventana, valor, RUBRO };
})();
