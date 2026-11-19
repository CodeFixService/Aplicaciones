/* 🎬 Estudio del CM (copia de Contenido/app, G94) · Cerebro · Importador universal de métricas y de la base de contenido (todo en el navegador, sin costo).
   Entradas: archivo CSV/TXT (Meta Business Suite viene en UTF-16, TikTok Studio en UTF-8), texto pegado o captura de pantalla (lector de texto).
   Salidas (listas para metricas_importar):
     { tipo: 'cuenta',    red, filas: [{ fecha, metrica, valor }] }
     { tipo: 'audiencia', red, filas: [{ dimension, valor, porcentaje }] }
     { tipo: 'contenido', red, filas: [{ id_plataforma, link, fecha_hora, texto, tipo, vistas, …, extra }] }
     { tipo: 'base',      filas: [{ tema, categoria, texto }] }
     { tipo: 'pares',     pares: [{ clave, valor, etiqueta }] }  (capturas o texto pegado: se confirma dónde va)
   Funciona igual en el navegador (window.Importador) y en Node (pruebas). */
(function (global) {
  'use strict';

  /* ---------- texto y CSV ---------- */
  // Bytes → texto, detectando la codificación (Meta exporta en UTF-16 con BOM).
  function decodificar(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let enc = 'utf-8', ini = 0;
    if (b[0] === 0xff && b[1] === 0xfe) { enc = 'utf-16le'; ini = 2; }
    else if (b[0] === 0xfe && b[1] === 0xff) { enc = 'utf-16be'; ini = 2; }
    else if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) ini = 3;
    else if (b.length > 3 && b[1] === 0 && b[3] === 0) enc = 'utf-16le'; // UTF-16 sin BOM
    return new TextDecoder(enc).decode(b.subarray(ini)).replace(/\r\n?/g, '\n');
  }
  // CSV con comillas, comas dentro de comillas y saltos de línea. Detecta "sep=," y el separador ; o tab.
  function csv(texto) {
    let t = String(texto || '').replace(/^﻿/, '');
    let sep = ',';
    const m = t.match(/^sep=(.)\n/i);
    if (m) { sep = m[1]; t = t.slice(m[0].length); }
    else {
      const l1 = t.split('\n', 1)[0];
      if ((l1.match(/;/g) || []).length > (l1.match(/,/g) || []).length) sep = ';';
      else if ((l1.match(/\t/g) || []).length > (l1.match(/,/g) || []).length) sep = '\t';
    }
    const filas = []; let fila = [], campo = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; }
        else campo += c;
      } else if (c === '"') q = true;
      else if (c === sep) { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.map((f) => f.map((x) => x.trim()));
  }

  /* ---------- números ---------- */
  // "1,604,253" · "1.604.253" · "11,2 mil" · "688.4K" · "1.5 mill." · "+2.574" · "89%" · "3 mil" → número
  function numero(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s || s === '-' || s === '—') return null;
    let mult = 1;
    const suf = s.match(/\s?(mill(ones|\.)?|millón|m|mil|k)\.?$/);
    if (suf) { mult = /^(mil|k)$/.test(suf[1]) ? 1e3 : 1e6; s = s.slice(0, suf.index).trim(); }
    s = s.replace(/^[+]/, '').replace(/[%$\s]/g, '');
    if (!/^-?[\d.,]+$/.test(s)) return null;
    if (mult > 1) s = s.replace(',', '.');
    else if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');      // separador de miles
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                    // coma decimal
    else s = s.replace(/,/g, '');
    const n = Number(s) * mult;
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  /* ---------- diccionario de sinónimos ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
  // columna universal → palabras que la delatan (en español e inglés)
  const SINONIMOS = {
    vistas: ['visualizaciones', 'views', 'video views', 'reproducciones', 'impresiones', 'impressions', 'plays', 'visualizaciones del video'],
    espectadores: ['espectadores', 'viewers', 'cuentas alcanzadas', 'alcance', 'reach', 'personas alcanzadas', 'total de espectadores'],
    espectadores_nuevos: ['espectadores nuevos', 'new viewers'],
    espectadores_recurrentes: ['espectadores recurrentes', 'returning viewers'],
    me_gusta: ['me gusta', 'likes', 'reacciones', 'reactions'],
    comentarios: ['comentarios', 'comments'],
    compartidos: ['compartidos', 'shares', 'veces que se compartio', 'compartir', 'envios'],
    guardados: ['guardados', 'saves', 'veces que se guardo', 'guardar'],
    seguidores_nuevos: ['seguimientos', 'follows', 'seguidores nuevos', 'nuevos seguidores', 'seguidores netos', 'new followers', 'personas que empezaron a seguirte'],
    visitas_perfil: ['visitas al perfil', 'profile views', 'visitas a perfil', 'visitas'],
    retencion: ['retencion', 'tiempo de reproduccion promedio', 'average watch time', 'duracion media', 'watched full video', 'vieron el video completo'],
    interacciones: ['interacciones', 'interacciones con el contenido', 'engagement', 'interactions'],
    clics_enlace: ['clics en el enlace', 'link clicks'],
    id_plataforma: ['identificador de la publicacion', 'post id', 'id de la publicacion', 'video id', 'id'],
    link: ['enlace permanente', 'permalink', 'link', 'enlace', 'url', 'video link'],
    fecha_hora: ['hora de publicacion', 'fecha de publicacion', 'publish time', 'post time', 'date posted', 'fecha', 'date', 'created'],
    texto: ['descripcion', 'description', 'titulo', 'title', 'caption', 'video title', 'texto'],
    tipo: ['tipo de publicacion', 'post type', 'tipo', 'type', 'formato'],
    clientes_generados: ['clientes', 'clientes generados']
  };
  const METRICAS = Object.keys(SINONIMOS).filter((k) => !['id_plataforma', 'link', 'fecha_hora', 'texto', 'tipo'].includes(k));
  // Busca la columna universal de un encabezado (primero exacto, después la frase más larga contenida).
  function columna(encabezado, mapeos) {
    const n = norm(encabezado);
    if (!n) return null;
    if (mapeos && mapeos[n]) return mapeos[n];
    for (const k in SINONIMOS) if (SINONIMOS[k].some((s) => norm(s) === n)) return k;
    let mejor = null, largo = 0;
    for (const k in SINONIMOS) SINONIMOS[k].forEach((s) => { const x = norm(s); if (x.length > 3 && n.includes(x) && x.length > largo) { mejor = k; largo = x.length; } });
    return mejor;
  }
  const clave = (s) => norm(s).replace(/ /g, '_').slice(0, 40);
  function redDe(t) {
    const n = norm(t);
    if (/instagram/.test(n)) return 'instagram';
    if (/facebook/.test(n)) return 'facebook';
    if (/tiktok/.test(n)) return 'tiktok';
    return null;
  }

  /* ---------- fechas ---------- */
  const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, aug: 8, dec: 12 };
  const dos = (n) => String(n).padStart(2, '0');
  // "2026-09-30T00:00:00" · "21 de octubre" (sin año → anioBase) · "10/21/2026" · "21/10/2026" · "Oct 21" → "AAAA-MM-DD"
  function fecha(v, anioBase) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = norm(s).match(/^(\d{1,2}) (?:de )?([a-z]+)(?: (?:de )?(\d{4}))?$/) || null;
    if (m && MESES[m[2]]) return (m[3] || anioPara(MESES[m[2]], anioBase)) + '-' + dos(MESES[m[2]]) + '-' + dos(m[1]);
    m = norm(s).match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
    if (m && MESES[m[1]]) return (m[3] || anioPara(MESES[m[1]], anioBase)) + '-' + dos(MESES[m[1]]) + '-' + dos(m[2]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) { const a = +m[1], b = +m[2]; return a > 12 ? m[3] + '-' + dos(b) + '-' + dos(a) : b > 12 ? m[3] + '-' + dos(a) + '-' + dos(b) : m[3] + '-' + dos(b) + '-' + dos(a); }
    const d = new Date(s);
    return isNaN(d) ? null : d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }
  // Fecha sin año: el año del archivo o, si el mes queda en el futuro, el año anterior.
  function anioPara(mes, anioBase) {
    if (anioBase) return anioBase;
    const h = new Date();
    return mes > h.getMonth() + 1 ? h.getFullYear() - 1 : h.getFullYear();
  }
  const anioDeNombre = (nombre) => { const m = String(nombre || '').match(/(20\d{2})[-_]\d{2}[-_]\d{2}/); return m ? +m[1] : null; };

  /* ---------- detectores ---------- */
  // Meta, serie diaria: [título] / ["Fecha","Primary"] / filas.
  function metaSerie(filas, nombre) {
    if (filas.length < 3 || filas[0].length !== 1 || norm(filas[1][0]) !== 'fecha') return null;
    const titulo = filas[0][0];
    let metrica = columna(titulo) || clave(titulo);
    if (metrica === 'vistas') metrica = 'visualizaciones';
    if (/seguidores/.test(norm(titulo))) metrica = 'seguidores_nuevos';
    if (/visitas/.test(norm(titulo))) metrica = 'visitas_perfil';
    const out = [];
    filas.slice(2).forEach((f) => { const d = fecha(f[0]), v = numero(f[1]); if (d && v != null) out.push({ fecha: d, metrica, valor: v }); });
    return { tipo: 'cuenta', red: redDe(titulo) || redDe(nombre), titulo, metrica, filas: out, origen: 'Meta Business Suite (serie diaria)' };
  }
  // Meta, resumen por bloques (Audiencia, Formatos): bloques separados por línea vacía; título / nombres / valores.
  function metaBloques(filas, nombre) {
    const bloques = []; let b = [];
    filas.forEach((f) => { if (f.every((x) => x === '')) { if (b.length) bloques.push(b); b = []; } else b.push(f); });
    if (b.length) bloques.push(b);
    if (!bloques.length || !bloques.every((x) => x[0].length === 1 && x.length >= 3)) return null;
    const out = [];
    bloques.forEach((x) => {
      const t = norm(x[0][0]);
      if (/edad y sexo|age and gender/.test(t)) {
        const cab = x[1];
        x.slice(2).forEach((f) => cab.forEach((c, i) => { if (i && numero(f[i]) != null) out.push({ dimension: 'edad_sexo', valor: f[0] + ' · ' + c, porcentaje: numero(f[i]) }); }));
        return;
      }
      const dim = /ciudad|cities/.test(t) ? 'ciudad' : /pais|countries/.test(t) ? 'pais' : /sexo|gender/.test(t) ? 'sexo' : /edad|age/.test(t) ? 'edad' : 'formato';
      x[1].forEach((n, i) => { const v = numero((x[2] || [])[i]); if (n && v != null) out.push({ dimension: dim, valor: dim === 'formato' ? x[0][0] + ' · ' + n : n, porcentaje: v }); });
    });
    return out.length ? { tipo: 'audiencia', red: redDe(nombre), filas: out, origen: 'Meta Business Suite (resumen)' } : null;
  }
  // Tabla con encabezados: si trae una fila por día (Date + métricas) → serie de la cuenta; si trae publicaciones → contenido.
  function tabla(filas, nombre, mapeos) {
    if (filas.length < 2) return null;
    const cab = filas[0];
    const cols = cab.map((h) => columna(h, mapeos));
    const conocidas = cols.filter(Boolean).length;
    if (!conocidas) return { tipo: 'desconocido', encabezados: cab, filas: filas.slice(1), origen: 'Tabla sin columnas conocidas' };
    const anio = anioDeNombre(nombre);
    const iF = cols.indexOf('fecha_hora');
    const porPublicacion = cols.includes('id_plataforma') || cols.includes('link') || cols.includes('texto');
    const red = redDe(nombre) || (cab.some((h) => /^Video Views$|^Profile Views$/.test(h)) ? 'tiktok' : null);
    const sinMapear = cab.filter((h, i) => h && !cols[i]);
    if (!porPublicacion && iF >= 0) {
      const out = [];
      filas.slice(1).forEach((f) => {
        const d = fecha(f[iF], anio);
        if (!d) return;
        cols.forEach((c, i) => {
          if (!c || i === iF) return;
          const v = numero(f[i]);
          if (v != null) out.push({ fecha: d, metrica: c === 'vistas' ? 'visualizaciones' : c, valor: v });
        });
      });
      return { tipo: 'cuenta', red, filas: out, sinMapear, origen: red === 'tiktok' ? 'TikTok Studio (resumen diario)' : 'Tabla diaria' };
    }
    const out = [];
    filas.slice(1).forEach((f) => {
      if (f.every((x) => !x)) return;
      const o = { extra: {} };
      cols.forEach((c, i) => {
        if (!c) { if (cab[i] && f[i]) o.extra[cab[i]] = f[i]; return; }
        if (c === 'fecha_hora') { const raw = f[i]; const d = fecha(raw, anio); const h = String(raw).match(/(\d{1,2}):(\d{2})/); o.fecha_hora = d ? d + 'T' + (h ? dos(h[1]) + ':' + h[2] : '12:00') + ':00' : null; }
        else if (['id_plataforma', 'link', 'texto'].includes(c)) o[c] = String(f[i] || '').slice(0, c === 'texto' ? 600 : 400);
        else if (c === 'tipo') o.tipo = tipoDe(f[i]);
        else { const v = numero(f[i]); if (v != null) o[c] = v; }
      });
      if (o.id_plataforma || o.link || o.texto) out.push(o);
    });
    return { tipo: 'contenido', red, filas: out, sinMapear, origen: 'Tabla por publicación' };
  }
  function tipoDe(t) {
    const n = norm(t);
    if (/carrusel|carousel|varias|diversas/.test(n)) return 'carrusel';
    if (/histori|stor/.test(n)) return 'historia';
    if (/reel/.test(n)) return 'reel';
    if (/video/.test(n)) return 'video';
    if (/foto|photo|imagen|image/.test(n)) return 'foto';
    if (/enlace|link/.test(n)) return 'enlace';
    if (/texto|status|text/.test(n)) return 'texto';
    return 'reel';
  }
  // Base de contenido: columnas tema, categoria, texto (con o sin "empresa").
  function base(filas) {
    if (!filas.length) return null;
    const cab = filas[0].map(norm);
    const it = cab.indexOf('tema'), ic = cab.indexOf('categoria'), ix = cab.indexOf('texto');
    if (it < 0 || ic < 0 || ix < 0) return null;
    return { tipo: 'base', filas: filas.slice(1).filter((f) => f[it] && f[ic] && f[ix]).map((f) => ({ tema: f[it], categoria: norm(f[ic]).replace(/ /g, '_'), texto: f[ix] })), origen: 'Base de contenido' };
  }

  // Punto de entrada: texto (ya decodificado) + nombre del archivo.
  function analizar(texto, nombre, mapeos) {
    const filas = csv(texto);
    if (!filas.length) return { tipo: 'vacio' };
    return base(filas) || metaSerie(filas, nombre) || metaBloques(filas, nombre) || (filas[0].length > 1 ? tabla(filas, nombre, mapeos) : null) || pegado(texto);
  }

  /* ---------- texto pegado o leído de una captura ---------- */
  // Busca pares "etiqueta → número" en cualquier orden ("Visualizaciones 1,604,253" o "1,604,253\nVisualizaciones")
  // y filas de listas de contenido ("Título…  62.7 mil Visualizaciones").
  const NUM = /([+-]?\d[\d.,]*\s?(?:mil|k|mill\.?|m)?)(?=\s|$|%)/i;
  function pegado(texto) {
    const lineas = String(texto || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const pares = [], lista = [];
    const periodo = (String(texto).match(/(\d{1,3})\s*d[ií]as/i) || [])[1];
    const red = redDe(texto) || (/espectadores nuevos|recurrentes|tiktok/i.test(texto) ? 'tiktok' : null);
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      // "Título… 62.7 mil Visualizaciones" en una sola línea (fila de la lista de contenido)
      const mm = l.match(/^(.{12,}?)\s+([\d.,]+\s?(?:mil|k|mill\.?)?)\s+(visualizaciones|views)$/i);
      if (mm) { lista.push({ texto: mm[1].replace(/[…\.]+$/, ''), vistas: numero(mm[2]) }); continue; }
      const sinNum = l.replace(NUM, '').replace(/[%+]/g, '').trim();
      const n = (l.match(NUM) || [])[1];
      const c = columna(sinNum);
      if (c && n != null && numero(n) != null) { pares.push({ clave: c, valor: numero(n), etiqueta: sinNum }); continue; }
      // número solo en una línea y la etiqueta en la de al lado
      if (/^[+-]?\d[\d.,]*\s?(mil|k|mill\.?|m)?%?$/i.test(l)) {
        const prev = lineas[i - 1] && columna(lineas[i - 1]), sig = lineas[i + 1] && columna(lineas[i + 1]);
        if (sig && /visualizaciones|views/i.test(lineas[i + 1]) && lineas[i - 1] && !columna(lineas[i - 1]) && lineas[i - 1].length > 12) {
          lista.push({ texto: lineas[i - 1].replace(/[…\.]+$/, ''), vistas: numero(l) }); i++; continue;
        }
        if (prev) pares.push({ clave: prev, valor: numero(l), etiqueta: lineas[i - 1] });
        else if (sig) { pares.push({ clave: sig, valor: numero(l), etiqueta: lineas[i + 1] }); i++; }
        continue;
      }
    }
    const vistos = new Set();
    const unicos = pares.filter((p) => { const k = p.clave + p.valor; if (vistos.has(k)) return false; vistos.add(k); return true; });
    return { tipo: 'pares', red, periodo: periodo ? +periodo : null, pares: unicos, lista, origen: 'Texto o captura' };
  }

  /* ---------- captura de pantalla (lector de texto gratuito, se carga solo cuando se usa) ---------- */
  let cargando = null;
  function tesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (!cargando) cargando = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => ok(global.Tesseract); s.onerror = () => { cargando = null; no(new Error('No se pudo cargar el lector de capturas. Revisa tu internet.')); };
      document.head.appendChild(s);
    });
    return cargando;
  }
  async function leerCaptura(archivo, avance) {
    const T = await tesseract();
    const r = await T.recognize(archivo, 'spa+eng', { logger: (m) => { if (avance && m.status === 'recognizing text') avance(Math.round(m.progress * 100)); } });
    return pegado(r.data.text);
  }

  global.Importador = { decodificar, csv, numero, columna, fecha, analizar, pegado, leerCaptura, redDe, SINONIMOS, METRICAS, norm };
  if (typeof module !== 'undefined') module.exports = global.Importador;
})(typeof window !== 'undefined' ? window : globalThis);
