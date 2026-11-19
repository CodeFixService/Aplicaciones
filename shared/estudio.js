/* CodeFix · Núcleo · 🎬 Estudio de contenido (G112 d · módulo 'estudio' de las 5 apps con negocios).
   El mismo motor del 🎬 Estudio del Centro de Mando (est-motor.js + est-importador.js, SIN API de IA) con los datos del NEGOCIO
   (núcleo sql/estudio.sql: cfx_estudio_mio / cfx_estudio_guardar / cfx_estudio_borrar; validado en la base, solo el dueño).
   Uso (lo carga solo ayuda.js la primera vez): CFX_ESTUDIO.montar(zona, { rpc: (f, args) => Promise, probar: (k) => …, nombre: 'Mi negocio' })
   Sin el módulo: qué hace + ▶️ Probar; sus ideas y su base siguen a la vista (🛡️) y se pueden borrar. */
(function () {
  'use strict';
  const esc = window.CFX_ESC || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (t) => (window.CFX_AVISO ? window.CFX_AVISO(t) : null);
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const BASE = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, '') : ''; })();
  const OBJ = [['vender', '💰 Vender'], ['seguidores', '📈 Ganar seguidores'], ['comentarios', '💬 Comentarios'], ['compartidos', '🔁 Compartidos y guardados']];
  const REDES = [['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['historias', 'Historias']];
  const CATS = ['error', 'sintoma', 'dato', 'mito', 'parte', 'costo', 'idea_video', 'cta'];
  const CATN = { error: 'Errores', sintoma: 'Síntomas', dato: 'Datos', mito: 'Mitos', parte: 'Partes / productos', costo: 'Costos', idea_video: 'Ideas de video', cta: 'Llamados (CTA)', estructura_gancho: 'Estructuras de gancho', toma: 'Tomas', formato: 'Formatos' };
  const CTA_OBJ = {
    vender: ['Escríbenos por DM y te cotizamos', 'Agenda hoy: link en la bio', 'Pide el tuyo por WhatsApp', 'Quedan pocos cupos esta semana'],
    seguidores: ['Síguenos para la parte 2', 'Síguenos: cada semana un dato así', 'Activa la campanita para no perderte el próximo'],
    comentarios: ['Comenta "SÍ" si te pasó', '¿Tú qué harías? Te leo en comentarios', 'Etiqueta a quien le pasa esto'],
    compartidos: ['Guárdalo para cuando lo necesites', 'Compártelo con quien lo necesita', 'Mándaselo a tu amigo que siempre hace esto']
  };
  // Formatos que mejor sirven a cada objetivo (se prefieren 2 de cada 3 veces).
  const FMT_OBJ = { vender: /Antes y después|Testimonio|caso real|agenda|Proceso/i, seguidores: /Serie|Tendencia|POV|Top/i, comentarios: /Respuesta|interactiva|Pregunta|Mito|Reto|Diagnóstico/i, compartidos: /Carrusel|Tip|Top|educativo/i };
  // 🧠 Biblioteca de ganchos con su técnica psicológica. {t} = tema · {e} = elemento (el error, síntoma, dato…).
  const PSICO = [
    ['curiosidad', 'Bucle abierto', 'Nadie habla de esto sobre {t}… y te está costando', 1.15, 'seguidores'],
    ['interrupcion', 'Interrupción de patrón', 'DETENTE si {e}', 1.1, 'comentarios'],
    ['perdida', 'Aversión a la pérdida', 'Estás perdiendo plata por esto: {e}', 1.2, 'vender'],
    ['social', 'Prueba social', '9 de cada 10 clientes llegan por esto: {e}', 1.1, 'vender'],
    ['numero', 'Especificidad con número', '3 señales de que {e}', 1.15, 'compartidos'],
    ['mito', 'Contraintuitivo', 'Todos creen esto de {t}. Es al revés', 1.1, 'comentarios'],
    ['identidad', 'Identidad', 'Si te importa tu {t}, mira esto', 1.05, 'seguidores'],
    ['urgencia', 'Urgencia', 'Antes de que sea tarde: {e}', 1.05, 'vender'],
    ['autoridad', 'Autoridad', 'Después de cientos de casos de {t}, esto es lo que más vemos', 1.1, 'seguidores'],
    ['antes', 'Antes / después', 'Así llegó y así se fue: {e}', 1.15, 'vender'],
    ['pregunta', 'Pregunta directa', '¿Te pasa que {e}?', 1.05, 'comentarios'],
    ['error', 'Error común', 'El error de {e} que casi todos cometen', 1.15, 'compartidos'],
    ['promesa', 'Promesa con tiempo', 'En 15 segundos vas a saber si {e}', 1.1, 'compartidos']
  ];
  const REGANCHO = ['Pero ojo…', 'Y aquí viene lo importante:', 'Lo peor es que…', 'Espera, que hay más:', 'Y nadie te lo dice:'];
  const may = (s) => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
  const min = (s) => { s = String(s || '').trim(); return s ? s[0].toLowerCase() + s.slice(1) : s; };
  const tagDe = (s) => '#' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9ñÑ]+/g, '').toLowerCase().slice(0, 28);
  const dia = (f) => f ? String(f).slice(8, 10) + '/' + String(f).slice(5, 7) : '';

  let libs;
  const cargarLibs = () => libs || (libs = Promise.all(['est-motor.js', 'est-importador.js'].map((f) => new Promise((ok, no) => {
    if ((f === 'est-motor.js' && window.Motor) || (f === 'est-importador.js' && window.Importador)) return ok();
    const s = document.createElement('script'); s.src = BASE + f; s.onload = ok; s.onerror = () => { libs = null; no(new Error('No se pudo cargar el Estudio. Revisa tu conexión.')); }; document.head.appendChild(s);
  }))));

  function css() {
    if (document.getElementById('cfx-est-css')) return;
    const st = document.createElement('style'); st.id = 'cfx-est-css';
    st.textContent = '.cfx-est{overflow-wrap:anywhere}.cfx-est p{margin:4px 0}.cfx-est h3{margin:14px 0 6px;font-size:1rem}' +
      '.cfx-est .e-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.cfx-est .e-chips::-webkit-scrollbar{display:none}' +
      '.cfx-est .e-chip{flex:none;border:1px solid var(--cfx-borde,#8884);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111);border-radius:999px;padding:6px 12px;font:inherit;font-size:.9rem;cursor:pointer;min-height:36px}' +
      '.cfx-est .e-chip.on{border-color:currentColor;font-weight:700;box-shadow:inset 0 0 0 1px currentColor}' +
      '.cfx-est .e-card{background:var(--cfx-tarjeta,#fff);border:1px solid var(--cfx-borde,#8883);border-radius:var(--cfx-radio-chico,12px);padding:10px 12px;margin:8px 0}' +
      '.cfx-est .e-fila{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.cfx-est .e-sub{color:var(--cfx-texto-2,#5b6472);font-size:.88rem}.cfx-est .e-txt{white-space:pre-wrap;margin:6px 0}' +
      '.cfx-est .e-pill{font-size:.78rem;border:1px solid var(--cfx-borde,#8884);border-radius:999px;padding:1px 8px;color:var(--cfx-texto-2,#5b6472)}' +
      '.cfx-est .e-b{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.cfx-est .e-b button{min-height:36px}' +
      '.cfx-est .e-big{width:100%;margin:8px 0;min-height:44px}.cfx-est .e-tit{background:none;border:0;padding:0;color:inherit;font:inherit;font-weight:700;text-align:left;cursor:pointer;width:100%}' +
      '.cfx-est label{display:block;margin-top:8px}.cfx-est input,.cfx-est select{width:100%;box-sizing:border-box}' +
      '.cfx-est .e-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cfx-est details summary{cursor:pointer;margin:6px 0}' +
      '.cfx-est .e-alt{border-top:1px dashed var(--cfx-borde,#8884);padding-top:6px;margin-top:6px}.cfx-est .e-msg{min-height:1.2em;color:var(--cfx-texto-2,#5b6472)}';
    document.head.appendChild(st);
  }

  async function montar(z, o) {
    o = o || {}; css();
    const rpc = o.rpc, ui = { v: 'idea', red: 'instagram', idea: null, semana: null, det: null };
    let D = { puede: false, lista: [] };
    z.innerHTML = '<p class="e-sub">⏳ Cargando…</p>';
    try { [D] = await Promise.all([rpc('cfx_estudio_mio'), cargarLibs()]); } catch (e) { z.innerHTML = '<p class="muted">⚠️ ' + esc(e.message || e) + '</p>'; return; }
    if (!D || !Array.isArray(D.lista)) D = { puede: false, lista: [] };
    const L = D.lista;
    const conf = () => L.find((i) => i.tipo === 'conf');
    const cf = () => Object.assign({ obj: 'vender', publico: '', tono: '', tags: '', ritmo: { tiktok: 5, instagram: 5, facebook: 3, historias: 4 } }, (conf() || {}).datos || {});
    const base = () => L.filter((i) => i.tipo === 'base');
    const ideas = () => L.filter((i) => i.tipo === 'idea');
    const get = (id) => L.find((i) => i.id === id);
    const guardar = async (rows) => { const out = []; for (let k = 0; k < rows.length; k += 500) out.push.apply(out, await rpc('cfx_estudio_guardar', { p: rows.slice(k, k + 500) }) || []);
      out.forEach((r) => { const k = L.findIndex((x) => x.id === r.id); if (k >= 0) L[k] = r; else L.push(r); }); return out; };
    const borrar = async (ids) => { await rpc('cfx_estudio_borrar', { p_ids: ids }); ids.forEach((id) => { const k = L.findIndex((x) => x.id === id); if (k >= 0) L.splice(k, 1); }); };
    const nombre = o.nombre || '';

    const baseMotor = () => base().map((b) => ({ id: b.id, tema: (b.datos || {}).tema || 'General', categoria: (b.datos || {}).cat || 'dato', texto: b.titulo }));
    const ideasMotor = () => ideas().map((i) => Object.assign({ id: i.id, created_at: i.created_at }, i.datos || {}));
    const publicadas = () => ideas().filter((i) => i.estado === 'publicada' && i.datos && i.datos.m);
    const puntos = (m) => (+m.vistas || 0) / 1000 + 2 * (+m.compartidos || 0) / 10 + (+m.guardados || 0) / 10 + (+m.comentarios || 0) / 10 + (+m.seguidores || 0) / 5 + 3 * (+m.clientes || 0);
    function rendimiento() {
      const P = publicadas(); if (!P.length) return { estructura: {}, tema: {}, n: 0 };
      const media = P.reduce((a, i) => a + puntos(i.datos.m), 0) / P.length || 1;
      const agr = (k) => { const r = {}; P.forEach((i) => { const c = i.datos[k]; if (c) (r[c] = r[c] || []).push(puntos(i.datos.m) / media); }); Object.keys(r).forEach((x) => { r[x] = r[x].reduce((a, b) => a + b, 0) / r[x].length; }); return r; };
      return { estructura: agr('estructura'), tema: agr('tema'), formato: agr('formato'), red: agr('red'), hora: agr('hora'), n: P.length };
    }
    function horas() {
      const r = {}, P = publicadas();
      REDES.forEach(([rd]) => { const g = {}; P.filter((i) => i.datos.red === rd && i.datos.hora).forEach((i) => { (g[i.datos.hora] = g[i.datos.hora] || []).push(puntos(i.datos.m)); });
        const prom = (h) => g[h].reduce((x, y) => x + y, 0) / g[h].length;
        const mejor = Object.keys(g).filter((h) => g[h].length >= 2).sort((a, b) => prom(b) - prom(a))[0];
        if (mejor) r[rd] = mejor; });
      return r;
    }
    const ctx = () => window.Motor.contexto(baseMotor(), ideasMotor(), { rendimiento: rendimiento(), horas: horas() });

    /* ---------- las 8 cajas ---------- */
    function puntaje(txt, tecnica) {
      const t = String(txt || ''), c = cf(), P = PSICO.find((p) => p[0] === tecnica);
      let s = 50;
      if (/\d/.test(t)) s += 10;
      if (/\?|¿/.test(t)) s += 6;
      if (/\b(tu|tú|te|ti)\b/i.test(t)) s += 8;
      if (/nadie|error|nunca|sale caro|pierde|perdiendo|tarde|falso|al revés|detente/i.test(t)) s += 8;
      if (t.length <= 60) s += 8; else if (t.length > 90) s -= 10;
      if (P) { s += Math.round((P[3] - 1) * 60); if (P[4] === c.obj) s += 8; }
      const r = (rendimiento().estructura || {})[tecnica]; if (r) s += Math.round((r - 1) * 15);
      return Math.max(10, Math.min(99, s));
    }
    function alternativas(idea) {
      const c = cf(), e = min(idea.elemento || idea.tema), t = min(idea.tema);
      const orden = PSICO.slice().sort((a, b) => (b[4] === c.obj) - (a[4] === c.obj) || b[3] - a[3]);
      const sem = (idea.combo || '').length + (idea.gancho || '').length;
      return [orden[sem % 4], orden[4 + (sem % (orden.length - 4))]].map((p) => { const txt = may(p[2].replace('{t}', t).replace('{e}', e)); return { txt, tec: p[1], k: p[0], pts: puntaje(txt, p[0]) }; });
    }
    function guion(idea) {
      const d = +idea.duracion_seg || 15, pant = idea.texto_pantalla || '', el = may(idea.elemento || idea.tema);
      if (/Carrusel/.test(idea.formato)) return ['Lámina 1 (portada): ' + idea.gancho, 'Lámina 2: el problema — ' + el, 'Lámina 3: por qué pasa', 'Lámina 4: qué hacer (paso a paso)', 'Lámina 5: error a evitar', 'Lámina 6 (cierre): ' + idea.cta].join('\n');
      if (idea.red === 'historias') return ['Historia 1: ' + idea.gancho + ' (texto grande)', 'Historia 2: ' + el + ' (foto o video corto)', 'Historia 3: sticker de encuesta "¿Te ha pasado?" Sí / No', 'Historia 4: ' + idea.cta + ' (sticker de link o DM)'].join('\n');
      const R = ['0-3 s · GANCHO: ' + idea.gancho + (pant ? ' · en pantalla: ' + pant : '')];
      let s = 3; const fin = Math.max(6, d - 4); let k = 0;
      while (s < fin) { const h = Math.min(fin, s + 5); R.push(s + '-' + h + ' s · ' + (k ? REGANCHO[k % REGANCHO.length] + ' ' : 'Desarrollo: ') + (k === 0 ? el : k === 1 ? 'muestra el detalle (' + min(idea.toma || 'primer plano') + ')' : 'la solución o el resultado')); s = h; k++; }
      R.push(fin + '-' + d + ' s · CIERRE: ' + idea.cta);
      return R.join('\n');
    }
    function copy(idea) {
      const c = cf(), el = may(idea.elemento || idea.tema);
      const cuerpo = c.obj === 'vender' ? el + '. Lo vemos todos los días y tiene solución.' : c.obj === 'comentarios' ? el + '. ¿A ti te ha pasado?' : c.obj === 'compartidos' ? el + '. Guárdalo: te va a servir.' : el + '. Cada semana te traigo uno así.';
      return idea.gancho + '\n\n' + cuerpo + (c.publico ? '\nPara ' + c.publico + '.' : '') + '\n\n👉 ' + idea.cta;
    }
    function hashtags(idea) {
      const c = cf(), s = new Set();
      String(c.tags || '').split(/[\s,]+/).filter(Boolean).forEach((x) => s.add(x[0] === '#' ? x.toLowerCase() : tagDe(x)));
      s.add(tagDe(idea.tema)); if (nombre) s.add(tagDe(nombre));
      if (idea.red === 'tiktok') s.add('#tiktokchile'); else if (idea.red !== 'historias') s.add('#chile');
      return Array.from(s).filter((x) => x.length > 2).slice(0, 8).join(' ');
    }
    const redN = (r) => (REDES.find((x) => x[0] === r) || [0, r || ''])[1];
    function cajas(idea) {
      return [
        ['gancho', '🎣 Gancho principal', idea.gancho, '⭐ ' + puntaje(idea.gancho, idea.estructura) + ' · ' + (idea.estructura_nombre || 'Gancho'), alternativas(idea)],
        ['guion', '🎬 Guión por segundos', guion(idea), (idea.duracion_seg || 15) + ' s'],
        ['texto_pantalla', '🔤 Texto en pantalla', idea.texto_pantalla],
        ['copy', '✍️ Copy / descripción', copy(idea)],
        ['tags', '#️⃣ Hashtags', hashtags(idea)],
        ['cta', '📣 CTA', idea.cta],
        ['red', '📅 Red, formato y hora', redN(idea.red) + ' · ' + idea.formato + ' · ' + (idea.hora || '19:00') + (idea.fecha_plan ? ' · ' + dia(idea.fecha_plan) : '')],
        ['toma', '🎥 Tomas a grabar', may(idea.toma)]
      ];
    }
    const REFRESCA = { gancho: 'gancho', texto_pantalla: 'texto_pantalla', cta: 'cta', red: 'red', toma: 'toma', guion: 'formato' };
    function htmlCajas(idea, guardada) {
      return cajas(idea).map((c) => '<div class="e-card" data-caja="' + c[0] + '"><div class="e-fila"><b>' + c[1] + '</b>' + (c[3] ? '<span class="e-pill">' + esc(c[3]) + '</span>' : '') + '</div>' +
        '<p class="e-txt">' + esc(c[2] || '—') + '</p>' +
        (c[4] ? '<details><summary>2 ganchos más</summary>' + c[4].map((a, k) => '<div class="e-alt"><p>' + esc(a.txt) + '</p><span class="e-sub">⭐ ' + a.pts + ' · ' + esc(a.tec) + '</span><div class="e-b"><button type="button" class="small alt" data-e="copiaAlt" data-k="' + k + '">📋 Copiar</button>' + (guardada ? '' : '<button type="button" class="small alt" data-e="usarAlt" data-k="' + k + '">Usar este</button>') + '</div></div>').join('') + '</details>' : '') +
        '<div class="e-b"><button type="button" class="small" data-e="copiar" data-c="' + c[0] + '">📋 Copiar</button>' + (REFRESCA[c[0]] && !guardada ? '<button type="button" class="small alt" data-e="refrescar" data-c="' + c[0] + '" aria-label="Otra opción">🔄 Otra</button>' : '') + '</div></div>').join('') +
        '<div class="e-b"><button type="button" class="alt" data-e="prompt">📋 Copiar prompt para Claude</button>' + (guardada || !D.puede ? '' : '<button type="button" class="ok" data-e="guardar">💾 Guardar idea</button>') + '</div>';
    }
    function promptClaude(idea) {
      const c = cf(), ob = (OBJ.find((x) => x[0] === c.obj) || [0, c.obj])[1];
      return 'Eres experto en contenido para redes. Mejora esta idea para ' + redN(idea.red) + ' (' + idea.formato + ', ' + (idea.duracion_seg || 15) + ' s).\n' +
        'Marca: ' + nombre + ' · Objetivo: ' + ob + (c.publico ? ' · Público: ' + c.publico : '') + (c.tono ? ' · Tono: ' + c.tono : '') + '\n' +
        'Tema: ' + idea.tema + ' — ' + (idea.elemento || '') + '\nGancho actual: ' + idea.gancho + '\n\n' +
        'Dame: 5 ganchos que paren el scroll (usa curiosidad, número específico o aversión a la pérdida; máx. 10 palabras), un guión por segundos con re-ganchos cada 3-5 s, texto en pantalla, copy corto, 5 hashtags y un CTA para ' + String(ob).replace(/^\S+ /, '').toLowerCase() + '.';
    }
    async function copiar(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (er) { /* nada */ } a.remove(); } toast('📋 Copiado'); }
    function ajustarObjetivo(idea) {
      const c = cf(), op = CTA_OBJ[c.obj] || [];
      if (op.length && !(idea.bloqueados || []).includes('cta')) idea.cta = op[(idea.gancho || '').length % op.length];
      const re = FMT_OBJ[c.obj];
      if (re && !re.test(idea.formato) && ((idea.combo || '').length % 3) !== 0) { const f = window.Motor.formatosDe(idea.red).find((x) => re.test(x.t)); if (f) { idea.formato = f.t; idea.duracion_seg = f.dur || idea.duracion_seg; } }
      return idea;
    }
    function datosIdea(i) { const r = {}; ['combo', 'tema', 'red', 'estructura', 'estructura_nombre', 'elemento_id', 'elemento', 'gancho', 'formato', 'duracion_seg', 'toma', 'texto_pantalla', 'cta', 'hora', 'fecha_plan', 'm'].forEach((k) => { if (i[k] != null) r[k] = typeof i[k] === 'string' ? i[k].slice(0, 300) : i[k]; }); return r; }
    const filaIdea = (i) => ({ tipo: 'idea', titulo: String(i.gancho || '').slice(0, 200), fecha: i.fecha_plan || null, estado: 'pendiente', datos: datosIdea(i) });

    /* ---------- CSV ---------- */
    const celda = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    function bajarCsv(n, filas) { const u = URL.createObjectURL(new Blob(['﻿' + filas.map((f) => f.map(celda).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
    const PLANT = {
      base: () => [['tema', 'categoria', 'texto'], ['Servicio estrella', 'error', 'esperar a que falle para recién venir'], ['Servicio estrella', 'sintoma', 'hace un ruido raro'], ['Servicio estrella', 'dato', 'una revisión a tiempo cuesta la mitad'], ['Servicio estrella', 'mito', 'si funciona, está bien'], ['Servicio estrella', 'parte', 'la pieza gastada'], ['Servicio estrella', 'costo', 'arreglarlo tarde cuesta 4 veces más'], ['Servicio estrella', 'idea_video', 'antes y después del trabajo'], ['Servicio estrella', 'cta', 'Agenda hoy por WhatsApp'], ['General', 'estructura_gancho', 'Error que cuesta: El error de {error} te sale caro'], ['General', 'toma', 'Primer plano del trabajo terminado']],
      historial: () => [['fecha de publicacion', 'red', 'formato', 'descripcion', 'visualizaciones', 'guardados', 'compartidos', 'comentarios', 'seguidores nuevos', 'clientes generados'], [hoy() + ' 19:00', 'instagram', 'reel', 'El error de esperar a que falle te sale caro', '1200', '15', '8', '4', '3', '1']]
    };
    function leerArchivo(cb) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,text/csv';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { const txt = window.Importador.decodificar(await f.arrayBuffer()); await cb(window.Importador.analizar(txt, f.name), f.name); pintar(); } catch (e) { toast('⚠️ ' + (e.message || e)); } };
      inp.click();
    }
    const subirBase = () => leerArchivo(async (r) => {
      if (r.tipo !== 'base') return toast('⚠️ El archivo debe tener columnas tema, categoria, texto (baja la plantilla).');
      const ya = new Set(base().map((b) => ((b.datos || {}).tema + '|' + (b.datos || {}).cat + '|' + b.titulo).toLowerCase()));
      const rows = r.filas.filter((f) => !ya.has((f.tema + '|' + f.categoria + '|' + f.texto).toLowerCase())).slice(0, 1500)
        .map((f) => ({ tipo: 'base', titulo: String(f.texto).slice(0, 200), datos: { tema: String(f.tema).slice(0, 60), cat: String(f.categoria).slice(0, 30) } }));
      if (!rows.length) return toast('Nada nuevo: esas filas ya estaban.');
      await guardar(rows); toast('✅ ' + rows.length + ' filas sumadas a la base');
    });
    const subirHistorial = () => leerArchivo(async (r, n) => {
      if (r.tipo !== 'contenido' || !r.filas.length) return toast('⚠️ No encontré publicaciones con métricas. Usa la plantilla o el export de Meta Business Suite / TikTok Studio.');
      const rows = r.filas.slice(0, 500).map((f) => {
        const ex = f.extra || {}, red = String(ex.red || ex.Red || r.red || (/tiktok/i.test(n) ? 'tiktok' : 'instagram')).toLowerCase();
        const fh = f.fecha_hora || '', m = { vistas: f.vistas || 0, guardados: f.guardados || 0, compartidos: f.compartidos || 0, comentarios: f.comentarios || 0, seguidores: f.seguidores_nuevos || 0, clientes: f.clientes_generados || 0 };
        const tx = String(f.texto || f.link || 'Publicación').slice(0, 200);
        return { tipo: 'idea', estado: 'publicada', titulo: tx, fecha: fh ? fh.slice(0, 10) : null,
          datos: { gancho: tx.slice(0, 300), red: REDES.some((x) => x[0] === red) ? red : 'instagram', formato: String(ex.formato || f.tipo || 'reel').slice(0, 60), hora: fh.slice(11, 13) ? fh.slice(11, 13) + ':00' : '', fecha_plan: fh.slice(0, 10) || null, tema: String(ex.tema || 'Importado').slice(0, 60), estructura: 'importado', m } };
      });
      await guardar(rows); toast('✅ ' + rows.length + ' publicaciones con métricas');
    });

    /* ---------- pantallas ---------- */
    const sinMod = () => D.puede ? '' : '<div class="e-card"><p>🧩 <b>Estudio de contenido</b> es un módulo: ideas para tus redes con gancho, guión, copy y hashtags listos para copiar. Pruébalo gratis 7 días o actívalo.</p>' +
      (o.probar ? '<button type="button" class="ok e-big" data-e="probar">▶️ Probar módulo</button>' : '') + (L.length ? '<p class="e-sub">Tus ideas y tu base siguen aquí, a la vista.</p>' : '') + '</div>';
    function vIdea() {
      let x = '<div class="e-chips">' + REDES.map((r) => '<button type="button" class="e-chip' + (ui.red === r[0] ? ' on' : '') + '" data-red="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>';
      if (!base().length) return x + '<div class="e-card"><p>Aún no tienes base de temas.</p><p class="e-sub">Con 1 tema y sus errores, síntomas o datos ya salen ideas. En 📚 Base bajas la plantilla y la subes llena, o agregas a mano.</p><button type="button" class="ok e-big" data-v="base">📚 Ir a la base</button></div>';
      if (D.puede) x += '<button type="button" class="ok e-big" data-e="generar">✨ Generar idea</button>';
      if (ui.idea) x += htmlCajas(ui.idea);
      return x;
    }
    const fila = (i) => '<div class="e-card"><button type="button" class="e-tit" data-e="abrir" data-id="' + esc(i.id) + '">' + esc(i.titulo || '(sin gancho)') + '</button><p class="e-sub">' + (i.fecha ? dia(i.fecha) + ' · ' : '') + esc(redN((i.datos || {}).red)) + ' · ' + esc((i.datos || {}).formato || '') + ' · <span class="e-pill">' + esc(i.estado) + '</span>' + (i.datos && i.datos.m ? ' · 👁️ ' + (+i.datos.m.vistas || 0) : '') + '</p></div>';
    function vSemana() {
      const P0 = ideas().filter((i) => i.estado !== 'publicada').sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
      let x = D.puede ? '<button type="button" class="ok e-big" data-e="semana">📅 Armar la semana (según tu ritmo)</button>' : '';
      if (ui.semana) x += '<div class="e-card"><b>' + ui.semana.length + ' ideas nuevas</b><p class="e-sub">' + ui.semana.slice(0, 30).map((i) => dia(i.fecha_plan) + ' · ' + esc(redN(i.red)) + ' · ' + esc(i.gancho)).join('<br>') + '</p><div class="e-b"><button type="button" class="small ok" data-e="guardarSemana">💾 Guardar todas</button><button type="button" class="small alt" data-e="semana">🔄 Otra</button></div></div>';
      x += '<h3>Por grabar y publicar</h3>' + (P0.length ? P0.map(fila).join('') : '<p class="e-sub">Sin ideas guardadas. Genera una o arma la semana.</p>');
      const P = ideas().filter((i) => i.estado === 'publicada').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      if (P.length) x += '<h3>Publicadas</h3>' + P.slice(0, 30).map(fila).join('');
      return x;
    }
    function vBase() {
      const B = base(), por = {};
      B.forEach((b) => { const d = b.datos || {}; const t = (por[d.tema || 'General'] = por[d.tema || 'General'] || {}); t[d.cat] = (t[d.cat] || 0) + 1; });
      let cap = { libres: 0, total: 0 }; try { cap = window.Motor.capacidad(ctx()); } catch (e) { /* sin base */ }
      let x = '<div class="e-card"><b>' + B.length + ' filas · ' + Object.keys(por).length + ' temas</b><p class="e-sub">Quedan ' + cap.libres + ' de ' + cap.total + ' ideas sin repetir. Cada combinación se usa 1 vez.</p>' +
        '<div class="e-b">' + (D.puede ? '<button type="button" class="small ok" data-e="subirBase">⬆️ Subir CSV</button>' : '') + '<button type="button" class="small alt" data-e="plant" data-p="base">⬇️ Plantilla</button>' + (D.puede ? '<button type="button" class="small alt" data-e="agregar">＋ Agregar</button>' : '') + '</div></div>';
      x += '<details><summary>¿Qué va en la base?</summary><p class="e-sub">Una fila por dato: <b>tema</b> (ej. tu servicio estrella), <b>categoria</b> (error, sintoma, dato, mito, parte, costo, idea_video, cta) y <b>texto</b>. Tema "General": estructura_gancho (con {error} {sintoma} {dato}…), toma, cta. Ábrela en Excel, llénala y súbela.</p></details>';
      x += Object.keys(por).sort().map((t) => '<div class="e-card"><button type="button" class="e-tit" data-e="tema" data-t="' + esc(t) + '">' + esc(t) + '</button><p class="e-sub">' + Object.keys(por[t]).map((c) => esc(CATN[c] || c) + ' ' + por[t][c]).join(' · ') + '</p></div>').join('');
      if (ui.tema != null) x += vTema();
      return x;
    }
    function vTema() {
      const t = ui.tema, T = t ? base().filter((b) => ((b.datos || {}).tema || 'General') === t) : [];
      return '<div class="e-card" id="cfxEstTema"><b>' + (t ? esc(t) : '＋ Agregar a la base') + '</b>' +
        T.map((b) => '<p class="e-sub">' + esc(CATN[(b.datos || {}).cat] || (b.datos || {}).cat) + ': ' + esc(b.titulo) + ' <button type="button" class="small alt" data-e="quitar" data-id="' + esc(b.id) + '" aria-label="Quitar fila">✕</button></p>').join('') +
        (D.puede ? '<label>Tema<input id="cfxEstT" maxlength="60" value="' + esc(t || '') + '" placeholder="ej. Corte degradado"></label><label>Categoría<select id="cfxEstC">' + CATS.concat(['estructura_gancho', 'toma']).map((c) => '<option value="' + c + '">' + esc(CATN[c]) + '</option>').join('') + '</select></label>' +
          '<label>Texto<input id="cfxEstX" maxlength="200" placeholder="ej. se ve disparejo al tercer día"></label><div class="e-b"><button type="button" class="ok" data-e="sumar">＋ Sumar</button><button type="button" class="alt" data-e="cerrarTema">Cerrar</button></div>' : '<div class="e-b"><button type="button" class="alt" data-e="cerrarTema">Cerrar</button></div>') + '</div>';
    }
    function vBI() {
      const P = publicadas();
      let x = '<div class="e-card"><b>📊 Lo que te funciona</b><p class="e-sub">Sale de TUS métricas: marca las ideas como publicadas con sus números, o sube tu historial / el export de Meta Business Suite o TikTok Studio.</p>' +
        '<div class="e-b">' + (D.puede ? '<button type="button" class="small ok" data-e="subirHist">⬆️ Subir historial</button>' : '') + '<button type="button" class="small alt" data-e="plant" data-p="historial">⬇️ Plantilla historial</button></div></div>';
      if (!P.length) return x + '<p class="e-sub">Aún sin publicaciones con métricas. Mientras tanto el motor usa 70 % lo probado y 30 % lo nuevo, con horas de fábrica.</p>';
      const media = P.reduce((a, i) => a + puntos(i.datos.m), 0) / P.length || 1;
      const top = (k, n, fmt) => {
        const g = {}; P.forEach((i) => { const v = fmt ? fmt(i) : i.datos[k]; if (v) (g[v] = g[v] || []).push(puntos(i.datos.m) / media); });
        const R = Object.keys(g).map((v) => [v, g[v].reduce((a, b) => a + b, 0) / g[v].length, g[v].length]).sort((a, b) => b[1] - a[1]);
        return R.length ? '<div class="e-card"><b>' + n + '</b>' + R.slice(0, 5).map((l, q) => '<p class="e-sub">' + (q === 0 ? '🏆 ' : '') + esc(k === 'red' ? redN(l[0]) : l[0]) + ' · ' + (l[1] >= 1 ? '▲ ' : '▼ ') + Math.round(l[1] * 100) + ' % del promedio (' + l[2] + ')</p>').join('') + '</div>' : '';
      };
      const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const tot = P.reduce((a, i) => { const m = i.datos.m; a.v += +m.vistas || 0; a.c += +m.clientes || 0; a.s += +m.seguidores || 0; return a; }, { v: 0, c: 0, s: 0 });
      x += '<div class="e-card"><b>' + P.length + ' publicaciones</b><p class="e-sub">👁️ ' + tot.v.toLocaleString('es-CL') + ' vistas · 👥 +' + tot.s + ' seguidores · 💰 ' + tot.c + ' clientes (' + (tot.c / P.length).toFixed(1).replace('.', ',') + ' por video)</p></div>';
      x += top('tema', '🏷️ Temas') + top('estructura_nombre', '🎣 Ganchos') + top('formato', '🎞️ Formatos') + top('red', '📱 Redes') + top('hora', '⏰ Horas') + top(null, '📅 Días', (i) => i.fecha ? DIAS[new Date(i.fecha + 'T12:00:00').getDay()] : '');
      const porT = {}; P.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).forEach((i) => { const t = i.datos.tema; if (t) (porT[t] = porT[t] || []).push(puntos(i.datos.m) / media); });
      const cans = Object.keys(porT).filter((t) => porT[t].length >= 3 && porT[t].slice(0, 3).every((v) => v < 0.8));
      if (cans.length) x += '<div class="e-card"><b>😴 Temas cansados</b><p class="e-sub">' + cans.map(esc).join(', ') + ': sus últimas 3 rindieron bajo el promedio. Descánsalos 2 semanas.</p></div>';
      const mes = hoy().slice(0, 7), delMes = P.filter((i) => (i.fecha || '').slice(0, 7) === mes);
      if (delMes.length) { const b = delMes.sort((a, c) => puntos(c.datos.m) - puntos(a.datos.m))[0]; x += '<div class="e-card"><b>📈 Lo mejor del mes</b><p class="e-sub">' + esc(b.titulo) + ' · 👁️ ' + (+b.datos.m.vistas || 0) + '</p>' + (D.puede ? '<button type="button" class="small ok" data-e="masAsi" data-id="' + esc(b.id) + '">✨ Más como esta</button>' : '') + '</div>'; }
      return x;
    }
    function vEspacio() {
      const c = cf();
      return '<div class="e-card"><b>🎯 Tu objetivo</b><p class="e-sub">Elige formatos, ganchos y CTA según lo que buscas.</p><div class="e-chips">' + OBJ.map((x) => '<button type="button" class="e-chip' + (c.obj === x[0] ? ' on' : '') + '" data-obj="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        '<label>Público<input id="cfxEstPub" maxlength="80" value="' + esc(c.publico) + '" placeholder="ej. vecinos de Ñuñoa"></label>' +
        '<label>Tono<input id="cfxEstTono" maxlength="60" value="' + esc(c.tono) + '" placeholder="ej. cercano, con humor"></label>' +
        '<label>Hashtags fijos<input id="cfxEstTags" maxlength="160" value="' + esc(c.tags) + '" placeholder="#minegocio #santiago"></label>' +
        '<p class="e-sub">Ritmo por semana</p><div class="e-grid">' + REDES.map((r) => '<label>' + r[1] + '<input type="number" min="0" max="21" inputmode="numeric" data-ritmo="' + r[0] + '" value="' + (+c.ritmo[r[0]] || 0) + '"></label>').join('') + '</div>' +
        (D.puede ? '<button type="button" class="ok e-big" data-e="guardarConf">💾 Guardar</button>' : '') + '</div>';
    }
    function vDet() {
      const it = get(ui.det); if (!it) { ui.det = null; return vSemana(); }
      const idea = Object.assign({}, it.datos, { gancho: it.titulo, fecha_plan: it.fecha }), m = (it.datos || {}).m || {};
      return '<button type="button" class="alt" data-e="volverLista">← Mis ideas</button><h3>🎬 ' + esc(dia(it.fecha) || 'Idea') + '</h3>' + htmlCajas(idea, true) +
        '<div class="e-card"><b>Estado</b><div class="e-chips">' + [['pendiente', '⏳ Por grabar'], ['grabada', '🎥 Grabada'], ['publicada', '✅ Publicada']].map((s) => '<button type="button" class="e-chip' + (it.estado === s[0] ? ' on' : '') + '" data-est="' + s[0] + '"' + (D.puede ? '' : ' disabled') + '>' + s[1] + '</button>').join('') + '</div>' +
        '<p class="e-sub">Métricas (a los 7 días)</p><div class="e-grid">' + [['vistas', '👁️ Vistas'], ['guardados', '🔖 Guardados'], ['compartidos', '🔁 Compartidos'], ['comentarios', '💬 Comentarios'], ['seguidores', '👥 Seguidores'], ['clientes', '💰 Clientes']].map((k) => '<label>' + k[1] + '<input type="number" min="0" inputmode="numeric" data-m="' + k[0] + '" value="' + (m[k[0]] != null ? +m[k[0]] : '') + '"></label>').join('') + '</div>' +
        '<div class="e-b">' + (D.puede ? '<button type="button" class="small ok" data-e="guardarM">💾 Guardar métricas</button>' : '') + '<button type="button" class="small alt" data-e="pedido">📲 Pedir grabación</button><button type="button" class="small alt" data-e="borrar">🗑️ Borrar</button></div></div>';
    }
    const ideaDet = () => { const it = get(ui.det); return it ? Object.assign({}, it.datos, { gancho: it.titulo, fecha_plan: it.fecha }) : {}; };

    function pintar() {
      const c = cf(), ob = OBJ.find((x) => x[0] === c.obj);
      const tabs = '<div class="e-chips" role="tablist">' + [['idea', '💡 Idea'], ['semana', '📅 Semana'], ['base', '📚 Base'], ['bi', '📊 Qué funciona'], ['espacio', '🎯 Objetivo']].map((t) => '<button type="button" class="e-chip' + (ui.v === t[0] && !ui.det ? ' on' : '') + '" data-v="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
      z.innerHTML = '<div class="cfx-est">' + sinMod() + tabs + '<p class="e-sub">Objetivo: ' + esc(ob ? ob[1] : '') + (conf() ? '' : ' · <button type="button" class="small alt" data-v="espacio">elegir</button>') + '</p>' +
        (ui.det ? vDet() : ({ idea: vIdea, semana: vSemana, base: vBase, bi: vBI, espacio: vEspacio }[ui.v] || vIdea)()) + '</div>';
    }
    z.onclick = async (ev) => {
      const b = ev.target.closest('[data-e],[data-v],[data-red],[data-obj],[data-est]'); if (!b || b.disabled) return;
      const a = b.dataset.e, id = b.dataset.id;
      try {
        if (b.dataset.v) { ui.v = b.dataset.v; ui.det = null; ui.tema = null; return pintar(); }
        if (b.dataset.red) { ui.red = b.dataset.red; ui.idea = null; return pintar(); }
        if (b.dataset.obj) { z.querySelectorAll('[data-obj]').forEach((x) => x.classList.toggle('on', x === b)); return; }
        if (b.dataset.est) { await guardar([{ id: ui.det, estado: b.dataset.est }]); toast('✅ Listo'); return pintar(); }
        const idea = ui.det ? ideaDet() : (ui.idea || {});
        if (a === 'probar') return o.probar && o.probar('estudio');
        if (a === 'copiar') { const c = cajas(idea).find((x) => x[0] === b.dataset.c); return copiar(c ? c[2] || '' : ''); }
        if (a === 'copiaAlt') return copiar(alternativas(idea)[+b.dataset.k].txt);
        if (a === 'prompt') return copiar(promptClaude(idea));
        if (a === 'generar' || a === 'masAsi') {
          const C = ctx(), it = id && get(id), op = it ? { tema: (it.datos || {}).tema } : {};
          const n = C.temas.includes(op.tema) ? window.Motor.nueva(C, ui.red, hoy(), op) : window.Motor.nueva(C, ui.red, hoy());
          if (!n) return toast('Se usaron todas las combinaciones: suma filas a la base (📚 Base).');
          ui.idea = ajustarObjetivo(n); ui.v = 'idea'; ui.det = null; return pintar();
        }
        if (a === 'refrescar') { const campo = REFRESCA[b.dataset.c], prev = ui.idea.cta, op = CTA_OBJ[cf().obj] || []; ui.idea = window.Motor.refrescar(ctx(), ui.idea, campo); if (campo === 'cta' && op.length) ui.idea.cta = op[(op.indexOf(prev) + 1) % op.length]; return pintar(); }
        if (a === 'usarAlt') { const al = alternativas(ui.idea)[+b.dataset.k]; ui.idea = Object.assign({}, ui.idea, { gancho: al.txt, estructura: al.k, estructura_nombre: al.tec }); return pintar(); }
        if (a === 'guardar') { b.disabled = true; await guardar([filaIdea(ui.idea)]); ui.idea = null; toast('💾 Guardada en 📅 Semana'); return pintar(); }
        if (a === 'semana') { const d = new Date(hoy() + 'T12:00:00'), w = d.getDay() || 7; d.setDate(d.getDate() + (w === 1 ? 0 : 8 - w)); ui.semana = window.Motor.semana(ctx(), cf().ritmo, d.toISOString().slice(0, 10)).map(ajustarObjetivo); if (!ui.semana.length) toast('Falta base: súbela en 📚 Base.'); return pintar(); }
        if (a === 'guardarSemana') { b.disabled = true; const S = ui.semana || []; await guardar(S.map(filaIdea)); ui.semana = null; toast('💾 ' + S.length + ' ideas guardadas'); return pintar(); }
        if (a === 'abrir') { ui.det = id; pintar(); return z.scrollIntoView && z.scrollIntoView({ block: 'start' }); }
        if (a === 'volverLista') { ui.det = null; ui.v = 'semana'; return pintar(); }
        if (a === 'subirBase') return subirBase();
        if (a === 'subirHist') return subirHistorial();
        if (a === 'plant') return bajarCsv('plantilla-' + b.dataset.p + '.csv', PLANT[b.dataset.p]());
        if (a === 'agregar' || a === 'tema') { ui.tema = b.dataset.t || ''; pintar(); const t = z.querySelector('#cfxEstTema'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); return; }
        if (a === 'cerrarTema') { ui.tema = null; return pintar(); }
        if (a === 'quitar') { await borrar([id]); return pintar(); }
        if (a === 'sumar') {
          const t = z.querySelector('#cfxEstT').value.trim(), tx = z.querySelector('#cfxEstX').value.trim();
          if (!t || !tx) return toast('Escribe tema y texto');
          await guardar([{ tipo: 'base', titulo: tx, datos: { tema: t.slice(0, 60), cat: z.querySelector('#cfxEstC').value } }]); ui.tema = t; toast('＋ Sumado'); pintar();
          const x = z.querySelector('#cfxEstX'); if (x) x.focus(); return;
        }
        if (a === 'guardarConf') {
          const ritmo = {}; z.querySelectorAll('[data-ritmo]').forEach((i) => { ritmo[i.dataset.ritmo] = Math.max(0, Math.min(21, Math.round(+i.value) || 0)); });
          const on = z.querySelector('[data-obj].on'), q = (s) => z.querySelector(s).value.trim();
          await guardar([{ tipo: 'conf', titulo: 'Estudio', datos: { obj: on ? on.dataset.obj : 'vender', publico: q('#cfxEstPub').slice(0, 80), tono: q('#cfxEstTono').slice(0, 60), tags: q('#cfxEstTags').slice(0, 160), ritmo } }]);
          toast('💾 Guardado'); ui.v = 'idea'; return pintar();
        }
        if (a === 'guardarM') { const nm = {}; z.querySelectorAll('[data-m]').forEach((i) => { if (i.value !== '') nm[i.dataset.m] = Math.max(0, Math.round(+i.value) || 0); }); await guardar([{ id: ui.det, estado: 'publicada', datos: Object.assign({}, get(ui.det).datos, { m: nm }) }]); toast('✅ Métricas guardadas: el motor ya aprende de esta'); ui.det = null; ui.v = 'semana'; return pintar(); }
        if (a === 'pedido') return window.open('https://wa.me/?text=' + encodeURIComponent(window.Motor.mensajePedido(idea, nombre)), '_blank', 'noopener');
        if (a === 'borrar') { if (!(await (window.CFX_DIALOGO ? CFX_DIALOGO.confirmar('¿Borrar esta idea?', { si: 'Borrar' }) : Promise.resolve(false)))) return; await borrar([ui.det]); ui.det = null; ui.v = 'semana'; return pintar(); }
      } catch (e) { b.disabled = false; toast('⚠️ ' + (e.message || e)); }
    };
    pintar();
  }
  window.CFX_ESTUDIO = { montar };
})();
