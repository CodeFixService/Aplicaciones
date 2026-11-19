/* 🎬 Estudio del CM (copia de Contenido/app, G94) · Cerebro · Motor de ideas (sin IA, sin costo): combina estructuras de gancho con la base de contenido de cada empresa.
   · Cada combinación estructura + elemento se usa UNA sola vez por empresa (antirrepetición).
   · El mismo tema descansa 7 días y la misma estructura no va dos veces seguidas.
   · Lo que mejor rinde sale más seguido, pero siempre queda un 30% para probar lo nuevo.
   Funciona igual en el navegador (window.Motor) y en Node (pruebas). */
(function (global) {
  'use strict';

  // Estructuras por defecto (si la empresa no trae las suyas en la base). Cada una admite varias redacciones separadas por " | ".
  // Marcadores: {error} {sintoma} {dato} {mito} {parte} {costo}; con mayúscula ({Error}) la primera letra va en mayúscula.
  const ESTRUCTURAS_BASE = [
    'Error que cuesta: El error de {error} te sale caro | {Error}: el error que más plata cuesta',
    'Síntoma: {Sintoma}: no lo ignores | Síntoma: {sintoma}. ¿Sabes qué es?',
    'Pregunta directa: ¿Culpable? {Error} 🙋 | ¿Tú también? {Error}',
    'Dato revelador: Nadie te dice que {dato} | Dato que pocos saben: {dato}',
    'Situación: Llegó diciendo: «{sintoma}». Mira lo que era | El cliente: «{sintoma}». Nosotros: 👀',
    'Así llegó: {Parte}: así llegó 😬 | Mira cómo llegó: {parte} 😬',
    'Mito vs. realidad: «{Mito}». Falso. | Mito: {mito}. La verdad 👇',
    'Reto: Reto 🔎 Pista: {parte}. ¿Qué tiene? | ¿Qué falla aquí? Pista: {parte}',
    'Costo: Lo barato que sale caro: {costo} | {Costo}. Haz la cuenta',
    'Detrás de cámaras: Así lo hacemos: {idea_video} | Detrás de cámaras: {idea_video}'
  ];
  const PRINCIPAL = ['error', 'sintoma', 'dato', 'mito', 'parte', 'costo', 'idea_video'];

  // 19 formatos. redes = dónde calza; dur = segundos sugeridos.
  const FORMATOS = [
    { k: 'educativo', t: 'Reel educativo (problema → solución)', redes: ['tiktok', 'instagram', 'facebook'], dur: 30 },
    { k: 'diagnostico', t: 'Diagnóstico por síntoma o sonido', redes: ['tiktok', 'instagram', 'facebook'], dur: 20 },
    { k: 'mito', t: 'Mito vs. realidad', redes: ['tiktok', 'instagram', 'facebook'], dur: 20 },
    { k: 'tip', t: 'Tip rápido (1 consejo en 15 s)', redes: ['tiktok', 'instagram', 'facebook'], dur: 15 },
    { k: 'pov', t: 'POV o sketch (cliente / equipo)', redes: ['tiktok', 'instagram'], dur: 25 },
    { k: 'antes_despues', t: 'Antes y después', redes: ['tiktok', 'instagram', 'facebook'], dur: 15 },
    { k: 'proceso', t: 'Proceso (timelapse o sonido real)', redes: ['tiktok', 'instagram'], dur: 20 },
    { k: 'respuesta', t: 'Respuesta a comentario', redes: ['tiktok', 'instagram'], dur: 25 },
    { k: 'top', t: 'Top o lista ("3 errores que…")', redes: ['tiktok', 'instagram', 'facebook'], dur: 30 },
    { k: 'testimonio', t: 'Testimonio de cliente', redes: ['instagram', 'facebook'], dur: 30 },
    { k: 'serie', t: 'Serie por partes (parte 1, 2, 3)', redes: ['tiktok', 'instagram'], dur: 30 },
    { k: 'tendencia', t: 'Tendencia adaptada (audio o formato del momento)', redes: ['tiktok'], dur: 15 },
    { k: 'carrusel_pasos', t: 'Carrusel educativo paso a paso (4:5)', redes: ['instagram', 'facebook'], dur: 0 },
    { k: 'carrusel_check', t: 'Carrusel checklist para guardar (4:5)', redes: ['instagram', 'facebook'], dur: 0 },
    { k: 'carrusel_compara', t: 'Carrusel comparativa (bien vs. mal) (4:5)', redes: ['instagram', 'facebook'], dur: 0 },
    { k: 'carrusel_caso', t: 'Carrusel caso real (llegó → diagnóstico → resultado) (4:5)', redes: ['instagram', 'facebook'], dur: 0 },
    { k: 'h_llega_se_va', t: 'Historia: cómo llega y cómo se va', redes: ['historias'], dur: 15 },
    { k: 'h_interactiva', t: 'Historia interactiva (encuesta, quiz, pregunta)', redes: ['historias'], dur: 15 },
    { k: 'h_agenda', t: 'Historia: prueba social y agenda (cupos)', redes: ['historias'], dur: 15 }
  ];
  const TOMAS_BASE = ['Primer plano de la pieza con problema', 'Detalle del sonido (micrófono cerca)', 'Manos trabajando', 'Pantalla dividida antes / después',
    'Cámara lenta del movimiento', 'Producto completo girando', 'Toma en primera persona (POV)', 'Timelapse del proceso completo', 'Mirando a cámara explicando', 'Zoom al detalle que nadie ve'];
  const CTAS_BASE = ['Guárdalo para después', 'Compártelo con quien lo necesita', 'Comenta "SÍ" si te pasó', 'Agenda por DM', 'Link en la bio', 'Síguenos para la parte 2'];
  const PANTALLA = ['MIRA HASTA EL FINAL', 'ERROR COMÚN', 'NO HAGAS ESTO', '¿TE PASA?', 'GUARDA ESTO', 'NADIE TE LO DICE', 'ANTES DE QUE SEA TARDE'];
  const HORAS = { tiktok: '19:00', instagram: '20:00', facebook: '20:30', historias: '12:30' };
  const REDES = ['tiktok', 'instagram', 'facebook', 'historias'];

  /* ---------- utilidades ---------- */
  const may = (s) => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Azar con semilla opcional (las pruebas usan semilla fija).
  function azar(semilla) {
    let x = semilla == null ? Math.floor(Math.random() * 2147483646) + 1 : (semilla % 2147483646) + 1;
    return () => { x = (x * 48271) % 2147483647; return (x - 1) / 2147483646; };
  }
  function elegir(lista, rnd, peso) {
    if (!lista.length) return null;
    if (!peso) return lista[Math.floor(rnd() * lista.length)];
    const p = lista.map((x) => Math.max(0.0001, peso(x))), t = p.reduce((a, b) => a + b, 0);
    let r = rnd() * t;
    for (let i = 0; i < lista.length; i++) { r -= p[i]; if (r <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  /* ---------- estructuras ---------- */
  // "Nombre: plantilla 1 | plantilla 2" → { k, nombre, plantillas, principal }
  function leerEstructura(txt) {
    const s = String(txt || '').trim();
    const i = s.indexOf(':');
    const nombre = i > 0 && i < 40 && !/[{]/.test(s.slice(0, i)) ? s.slice(0, i).trim() : 'Gancho';
    const resto = i > 0 && nombre !== 'Gancho' ? s.slice(i + 1) : s;
    const plantillas = resto.split(' | ').map((x) => x.trim().replace(/^['"]|['"]$/g, '').trim()).filter(Boolean);
    const todas = plantillas.join(' ');
    const principal = PRINCIPAL.find((c) => new RegExp('\\{' + c + '\\}', 'i').test(todas)) || 'idea_video';
    return { k: norm(nombre).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'gancho', nombre, plantillas: plantillas.length ? plantillas : [s], principal };
  }
  function rellenar(plantilla, valores) {
    let out = plantilla.replace(/\{([A-Za-zÁÉÍÓÚáéíóú_]+)\}/g, (m, c) => {
      const v = valores[norm(c)];
      if (v == null) return m;
      return c[0] === c[0].toUpperCase() && c[0] !== c[0].toLowerCase() ? may(v) : String(v);
    });
    if (/\{[a-z_]+\}/i.test(out)) return null; // faltó algún dato
    out = out.replace(/\s+/g, ' ').trim();
    return may(out);
  }

  /* ---------- contexto de una empresa ---------- */
  // base: filas { id, tema, categoria, texto } · ideas: filas de la tabla ideas · rendimiento: { estructura: {k: puntaje}, tema: {t: puntaje} }
  function contexto(base, ideas, opciones) {
    opciones = opciones || {};
    const porTema = {}, general = { cta: [], toma: [], estructura_gancho: [], formato: [] };
    (base || []).forEach((b) => {
      if (b.tema === 'General') { (general[b.categoria] = general[b.categoria] || []).push(b); return; }
      const t = (porTema[b.tema] = porTema[b.tema] || {});
      (t[b.categoria] = t[b.categoria] || []).push(b);
    });
    const estructuras = (general.estructura_gancho.length ? general.estructura_gancho.map((b) => b.texto) : ESTRUCTURAS_BASE).map(leerEstructura);
    const usados = new Set((ideas || []).map((i) => i.combo));
    const temas = Object.keys(porTema).filter((t) => Object.keys(porTema[t]).some((c) => PRINCIPAL.includes(c) || c === 'idea_video'));
    return {
      porTema, general, estructuras, usados, temas, ideas: ideas || [],
      tomas: general.toma.length ? general.toma.map((b) => b.texto) : TOMAS_BASE,
      ctasGenerales: general.cta.length ? general.cta.map((b) => b.texto) : CTAS_BASE,
      rendimiento: opciones.rendimiento || { estructura: {}, tema: {} },
      horas: Object.assign({}, HORAS, opciones.horas || {}),
      rnd: azar(opciones.semilla)
    };
  }

  // Cuántas combinaciones quedan sin usar (lo que muestra la pantalla Base).
  function capacidad(ctx) {
    let total = 0, libres = 0;
    ctx.estructuras.forEach((e) => ctx.temas.forEach((t) => {
      (ctx.porTema[t][e.principal] || []).forEach((el) => { total++; if (!ctx.usados.has(e.k + '|' + el.id)) libres++; });
    }));
    return { total, libres, usados: total - libres };
  }

  /* ---------- rendimiento (para priorizar) ---------- */
  // ideas publicadas + sus métricas → puntaje promedio por estructura y por tema (1 = promedio de la cuenta).
  function rendimiento(ideas, publicaciones, metricas) {
    const ultima = {};
    (metricas || []).forEach((m) => { const u = ultima[m.publicacion_id]; if (!u || m.fecha_corte > u.fecha_corte) ultima[m.publicacion_id] = m; });
    const filas = [];
    (publicaciones || []).forEach((p) => {
      const m = ultima[p.id], i = p.idea_id && (ideas || []).find((x) => x.id === p.idea_id);
      if (!m || !i) return;
      filas.push({ e: i.estructura, t: i.tema, v: +m.vistas || 0, c: +m.compartidos || 0, g: +m.guardados || 0, cl: +m.clientes_generados || 0 });
    });
    if (!filas.length) return { estructura: {}, tema: {}, n: 0 };
    const prom = (k) => Math.max(1, filas.reduce((a, f) => a + f[k], 0) / filas.length);
    const pv = prom('v'), pc = prom('c'), pg = prom('g');
    const punt = (f) => (f.v / pv) + 2 * (f.c / pc) + (f.g / pg) + 3 * f.cl;
    const media = filas.reduce((a, f) => a + punt(f), 0) / filas.length || 1;
    const agrupar = (k) => {
      const o = {};
      filas.forEach((f) => { (o[f[k]] = o[f[k]] || []).push(punt(f) / media); });
      Object.keys(o).forEach((x) => { o[x] = o[x].reduce((a, b) => a + b, 0) / o[x].length; });
      return o;
    };
    return { estructura: agrupar('e'), tema: agrupar('t'), n: filas.length };
  }

  /* ---------- generar una idea ---------- */
  const formatosDe = (red) => FORMATOS.filter((f) => f.redes.includes(red));
  function temaPara(ctx, evitar) {
    const recientes = new Set(ctx.ideas.filter((i) => Date.now() - new Date(i.created_at || Date.now()) < 7 * 864e5).map((i) => i.tema).concat(evitar || []));
    let cand = ctx.temas.filter((t) => !recientes.has(t));
    if (!cand.length) cand = ctx.temas.slice();
    const r = ctx.rendimiento.tema;
    return ctx.rnd() < 0.3 ? elegir(cand, ctx.rnd) : elegir(cand, ctx.rnd, (t) => r[t] || 1);
  }
  function estructuraPara(ctx, tema, anterior) {
    const conDatos = ctx.estructuras.filter((e) => (ctx.porTema[tema][e.principal] || []).some((el) => !ctx.usados.has(e.k + '|' + el.id)));
    let cand = conDatos.filter((e) => e.k !== anterior);
    if (!cand.length) cand = conDatos;
    const r = ctx.rendimiento.estructura;
    return ctx.rnd() < 0.3 ? elegir(cand, ctx.rnd) : elegir(cand, ctx.rnd, (e) => r[e.k] || 1);
  }
  function gancho(ctx, tema, est, elemento) {
    const T = ctx.porTema[tema] || {};
    const val = { tema };
    PRINCIPAL.forEach((c) => { const l = T[c] || []; if (l.length) val[c] = (elegir(l, ctx.rnd) || {}).texto; });
    val[est.principal] = elemento.texto;
    let txt = rellenar(elegir(est.plantillas, ctx.rnd), val);
    if (!txt) txt = may(elemento.texto);
    if (est.principal === 'idea_video' && est.plantillas.every((p) => !/\{/.test(p))) txt = may(est.plantillas[0]) + ' · ' + elemento.texto;
    return txt;
  }
  function textoPantalla(ctx, elemento, actual) {
    const op = PANTALLA.concat([String(elemento.texto).toUpperCase().slice(0, 42)]).filter((x) => x !== actual);
    return elegir(op, ctx.rnd);
  }
  function tomaPara(ctx, tema, actual) {
    const ideasVideo = ((ctx.porTema[tema] || {}).idea_video || []).map((b) => b.texto);
    const op = [];
    ctx.tomas.forEach((t) => op.push(t));
    ideasVideo.forEach((iv) => op.push(elegir(ctx.tomas, ctx.rnd) + ' · Idea: ' + iv));
    const libres = op.filter((x) => x !== actual);
    return elegir(libres.length ? libres : op, ctx.rnd);
  }
  function ctaPara(ctx, tema, actual) {
    const op = ((ctx.porTema[tema] || {}).cta || []).map((b) => b.texto).concat(ctx.ctasGenerales).filter((x) => x !== actual);
    return elegir(op, ctx.rnd) || actual || '';
  }
  function formatoPara(ctx, red, actual, usadosSemana) {
    let op = formatosDe(red).filter((f) => f.t !== actual && !(usadosSemana || []).includes(f.t));
    if (!op.length) op = formatosDe(red).filter((f) => f.t !== actual);
    return elegir(op.length ? op : formatosDe(red), ctx.rnd);
  }

  // Una idea nueva para una red y fecha. Devuelve null si ya no quedan combinaciones.
  function nueva(ctx, red, fecha, opc) {
    opc = opc || {};
    if (!ctx.temas.length) return null;
    const probados = new Set();
    for (let intento = 0; intento < 14; intento++) {
      let tema = opc.tema || temaPara(ctx, Array.from(probados).concat(opc.evitarTemas || []));
      let est = tema && estructuraPara(ctx, tema, opc.estructuraAnterior);
      // Quedan pocas combinaciones: se busca en todos los temas (así se usan todas antes de recargar la base).
      if (!est && intento >= 6) {
        const libre = [];
        (opc.tema ? [opc.tema] : ctx.temas).forEach((t) => ctx.estructuras.forEach((e) => { if ((ctx.porTema[t][e.principal] || []).some((el) => !ctx.usados.has(e.k + '|' + el.id))) libre.push([t, e]); }));
        const par = elegir(libre, ctx.rnd);
        if (!par) return null;
        tema = par[0]; est = par[1];
      }
      probados.add(tema);
      if (!est) continue;
      const libres = (ctx.porTema[tema][est.principal] || []).filter((el) => !ctx.usados.has(est.k + '|' + el.id));
      const el = elegir(libres, ctx.rnd);
      if (!el) continue;
      const combo = est.k + '|' + el.id;
      ctx.usados.add(combo);
      const f = formatoPara(ctx, red, null, opc.formatosSemana);
      const idea = {
        combo, tema, red, estructura: est.k, estructura_nombre: est.nombre, elemento_id: el.id, elemento: el.texto,
        gancho: gancho(ctx, tema, est, el), formato: f.t, duracion_seg: f.dur || 15,
        toma: tomaPara(ctx, tema), texto_pantalla: textoPantalla(ctx, el), cta: ctaPara(ctx, tema),
        hora: ctx.horas[red] || '19:00', fecha_plan: fecha || null, estado: 'pendiente', bloqueados: []
      };
      return idea;
    }
    return null;
  }

  // 🔄 de un campo, respetando lo bloqueado 🔒. Devuelve la idea con el campo cambiado (y combo nuevo si cambió el gancho).
  function refrescar(ctx, idea, campo) {
    const i = Object.assign({}, idea);
    if ((i.bloqueados || []).includes(campo)) return i;
    if (campo === 'gancho') {
      const temaFijo = (i.bloqueados || []).includes('tema') ? i.tema : null;
      const n = nueva(ctx, i.red, i.fecha_plan, { tema: temaFijo || i.tema, estructuraAnterior: i.estructura }) || nueva(ctx, i.red, i.fecha_plan, { estructuraAnterior: i.estructura });
      if (!n) return i;
      ctx.usados.delete(i.combo);
      ['combo', 'tema', 'estructura', 'estructura_nombre', 'elemento_id', 'elemento', 'gancho'].forEach((k) => { i[k] = n[k]; });
      if (!(i.bloqueados || []).includes('texto_pantalla')) i.texto_pantalla = n.texto_pantalla;
    } else if (campo === 'formato') {
      const f = formatoPara(ctx, i.red, i.formato); i.formato = f.t; i.duracion_seg = f.dur || i.duracion_seg;
    } else if (campo === 'toma') i.toma = tomaPara(ctx, i.tema, i.toma);
    else if (campo === 'texto_pantalla') i.texto_pantalla = textoPantalla(ctx, { texto: i.elemento || i.tema }, i.texto_pantalla);
    else if (campo === 'cta') i.cta = ctaPara(ctx, i.tema, i.cta);
    else if (campo === 'red') {
      const sig = REDES[(REDES.indexOf(i.red) + 1) % REDES.length];
      i.red = sig; i.hora = ctx.horas[sig] || i.hora;
      if (!formatosDe(sig).some((f) => f.t === i.formato)) { const f = formatoPara(ctx, sig); i.formato = f.t; i.duracion_seg = f.dur || i.duracion_seg; }
    }
    return i;
  }

  // Semana completa según el ritmo de la empresa: { tiktok: 7, instagram: 5, facebook: 5, historias: 4 } (historias = por día → 1 idea diaria).
  function semana(ctx, ritmo, lunes) {
    ritmo = Object.assign({ tiktok: 7, instagram: 5, facebook: 5, historias: 4 }, ritmo || {});
    const dias = Array.from({ length: 7 }, (_, d) => { const x = new Date(lunes + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); });
    const out = [], usadosF = {};
    let anterior = null;
    REDES.forEach((red) => {
      const n = red === 'historias' ? (ritmo.historias > 0 ? 7 : 0) : Math.max(0, Math.min(21, +ritmo[red] || 0));
      for (let k = 0; k < n; k++) {
        const dia = dias[Math.floor((k * 7) / Math.max(n, 1)) % 7];
        const temasDia = out.filter((x) => x.fecha_plan === dia).map((x) => x.tema);
        const idea = nueva(ctx, red, dia, { estructuraAnterior: anterior, evitarTemas: temasDia, formatosSemana: usadosF[red] });
        if (!idea) return;
        anterior = idea.estructura;
        (usadosF[red] = usadosF[red] || []).push(idea.formato);
        if (usadosF[red].length >= formatosDe(red).length) usadosF[red] = [];
        out.push(idea);
      }
    });
    return out;
  }

  // Mensaje del pedido de grabación (WhatsApp).
  function mensajePedido(idea, empresa, para) {
    const vertical = /Carrusel/.test(idea.formato) ? 'Fotos verticales 4:5 (mínimo 5)' : 'Video vertical 9:16, sin música' + (idea.duracion_seg ? ', ' + idea.duracion_seg + ' s aprox.' : '');
    return '🎬 Pedido de grabación' + (empresa ? ' · ' + empresa : '') + '\n' +
      (para ? 'Para: ' + para + '\n' : '') +
      (idea.fecha_plan ? 'Lo necesito para el ' + idea.fecha_plan.split('-').reverse().join('/') + '\n' : '') +
      '\nFormato: ' + idea.formato + '\n' + vertical +
      '\nQué grabar: ' + may(idea.toma) +
      '\nTema: ' + idea.tema + (idea.elemento ? ' — ' + idea.elemento : '') +
      '\n\nTips: buena luz, cámara firme, sonido real cerca de la pieza.\nMándalo por aquí cuando esté 🙌';
  }

  global.Motor = { ESTRUCTURAS_BASE, FORMATOS, TOMAS_BASE, CTAS_BASE, HORAS, REDES, leerEstructura, rellenar, contexto, capacidad, rendimiento, nueva, refrescar, semana, mensajePedido, formatosDe, may };
  if (typeof module !== 'undefined') module.exports = global.Motor;
})(typeof window !== 'undefined' ? window : globalThis);
