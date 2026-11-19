/* CodeFix · Núcleo · Respaldo descargable (mismo archivo en cada repositorio).
   CFX_RESPALDO.excel('respaldo-mi-negocio', { Clientes: [{...}], Pedidos: [{...}] })  → descarga un .xlsx (una hoja por tabla).
   CFX_RESPALDO.json('respaldo-mi-negocio', datos)                                     → descarga el mismo contenido en .json.
   El Excel se arma en el teléfono (sin servidor ni librerías): se abre en Excel, Google Sheets y Numbers.
   await CFX_RESPALDO.leer(archivo) → filas [[celda, …], …] de un .xlsx (primera hoja), .csv o .txt (D21: cargar productos o clientes de una vez).
   CFX_RESPALDO.csv(texto)          → lo mismo desde texto pegado (separado por ; , o tabulación, como sale de Excel o Google Sheets).
   CFX_RESPALDO.planilla(nodo, o)   → G118: ⬇️ planilla del rubro · ⬆️ subir/💬 pegar · vista previa · ✅ confirmar (ver abajo). */
(function () {
  'use strict';
  if (window.CFX_RESPALDO) return;
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  // ZIP sin compresión (suficiente para un respaldo: el .xlsx es un zip de archivos XML).
  function zip(archivos) {
    const partes = [], central = []; let pos = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [nombre, texto] of archivos) {
      const n = enc.encode(nombre), d = enc.encode(texto), c = crc32(d);
      const cab = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)]);
      partes.push(cab, n, d);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length),
        ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
      pos += cab.length + n.length + d.length;
    }
    const tam = central.reduce((s, x) => s + x.length, 0);
    const fin = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tam), ...u32(pos), ...u16(0)]);
    return new Blob([...partes, ...central, fin], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const FECHA = /^\d{4}-\d\d-\d\d([T ]\d\d:\d\d(:\d\d(\.\d+)?)?([+-]\d\d(:?\d\d)?|Z)?)?$/;
  function celda(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return { n: v };
    if (typeof v === 'boolean') return { t: v ? 'Sí' : 'No' };
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    if (FECHA.test(v) && v.length > 10) { const d = new Date(v); if (!isNaN(d)) v = d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
    if (v.startsWith('data:')) v = '(imagen)';
    return { t: v.length > 32000 ? v.slice(0, 32000) + '…' : v };
  }
  function hoja(filas) {
    filas = Array.isArray(filas) ? filas : filas && typeof filas === 'object' ? [filas] : [];
    const cols = [];
    filas.forEach((f) => Object.keys(f || {}).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
    const fila = (r, vals) => '<row r="' + r + '">' + vals.map((v, i) => {
      const c = celda(v); if (!c) return '';
      const ref = col(i) + r;
      return 'n' in c ? '<c r="' + ref + '"><v>' + c.n + '</v></c>' : '<c r="' + ref + '" t="inlineStr"' + (r === 1 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + x(c.t) + '</t></is></c>';
    }).join('') + '</row>';
    const filasXml = [fila(1, cols.map((c) => c.replace(/_/g, ' ')))].concat(filas.map((f, i) => fila(i + 2, cols.map((c) => f[c]))));
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (cols.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '') +
      '<sheetData>' + (cols.length ? filasXml.join('') : '<row r="1"><c r="A1" t="inlineStr"><is><t>Sin datos</t></is></c></row>') + '</sheetData></worksheet>';
  }
  function libro(hojas) {
    const nombres = [], usados = new Set();
    Object.keys(hojas).forEach((k) => {
      let n = String(k).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
      let b = n, i = 2; while (usados.has(n.toLowerCase())) n = b.slice(0, 28) + ' ' + i++;
      usados.add(n.toLowerCase()); nombres.push(n);
    });
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        nombres.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        nombres.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (nombres.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']
    ];
    Object.keys(hojas).forEach((k, i) => files.push(['xl/worksheets/sheet' + (i + 1) + '.xml', hoja(hojas[k])]));
    return zip(files);
  }
  function bajar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const limpio = (n) => String(n || 'respaldo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() +
    '-' + new Date().toISOString().slice(0, 10);
  // Acepta { hoja: filas } o { tabla: { ... } } (objetos sueltos van como una fila).
  const hojasDe = (d) => { const o = {}; Object.keys(d || {}).forEach((k) => { o[k] = d[k] == null ? [] : d[k]; }); return o; };
  // ---------- Leer Excel o CSV (D21) ----------
  function csv(t) {
    t = String(t || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    const l1 = t.split('\n')[0], sep = ['\t', ';', ','].sort((a, b) => l1.split(b).length - l1.split(a).length)[0];
    const filas = []; let f = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch === '"' && c === '') q = true;
      else if (ch === sep) { f.push(c.trim()); c = ''; }
      else if (ch === '\n') { f.push(c.trim()); filas.push(f); f = []; c = ''; }
      else c += ch;
    }
    f.push(c.trim()); filas.push(f);
    return filas.filter((r) => r.some((x) => x !== ''));
  }
  // .xlsx = zip de XML: se abre con DecompressionStream (Chrome, Safari y Firefox de hoy), sin librerías.
  async function xlsx(buf) {
    const b = new Uint8Array(buf), dv = new DataView(buf), td = new TextDecoder();
    let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('El archivo no es un Excel (.xlsx)');
    const zipA = {}; let p = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      zipA[td.decode(b.subarray(p + 46, p + 46 + nl))] = { m: dv.getUint16(p + 10, true), t: dv.getUint32(p + 20, true), o: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    const sacar = async (nombre) => {
      const z = zipA[nombre]; if (!z) return null;
      const ini = z.o + 30 + dv.getUint16(z.o + 26, true) + dv.getUint16(z.o + 28, true), datos = b.subarray(ini, ini + z.t);
      if (z.m === 0) return td.decode(datos);
      if (typeof DecompressionStream === 'undefined') throw new Error('Este teléfono no abre Excel: guárdalo como CSV');
      return new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
    const ss = await sacar('xl/sharedStrings.xml'), textos = ss ? [...xml(ss).getElementsByTagName('si')].map((x) => [...x.getElementsByTagName('t')].filter((t) => !t.closest || !t.closest('rPh')).map((t) => t.textContent).join('')) : [];
    const hoja = Object.keys(zipA).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, c) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(c.replace(/\D/g, ''), 10))[0];
    if (!hoja) throw new Error('El Excel no tiene hojas');
    const colN = (r) => { let n = 0; for (const ch of String(r).replace(/\d/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    return [...xml(await sacar(hoja)).getElementsByTagName('row')].map((row) => {
      const f = [];
      [...row.getElementsByTagName('c')].forEach((c, i) => {
        const tipo = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], k = c.getAttribute('r') ? colN(c.getAttribute('r')) : i;
        f[k] = (tipo === 's' ? textos[Number(v && v.textContent)] : tipo === 'inlineStr' ? [...c.getElementsByTagName('t')].map((t) => t.textContent).join('') : v ? v.textContent : '') || '';
      });
      return Array.from(f, (x) => String(x == null ? '' : x).trim());
    }).filter((r) => r.some((x) => x !== ''));
  }
  async function leer(archivo) {
    if (!archivo) return [];
    if (archivo.size > 5e6) throw new Error('El archivo es muy grande (máximo 5 MB)');
    if (/\.xlsx$/i.test(archivo.name) || /spreadsheetml/.test(archivo.type)) return xlsx(await archivo.arrayBuffer());
    if (/\.xls$/i.test(archivo.name)) throw new Error('Ese Excel es antiguo (.xls): ábrelo y guárdalo como .xlsx o CSV');
    return csv(await archivo.text());
  }

  // ===== G118 📥 UNA planilla de carga masiva (igual en las 6) =====
  // CFX_RESPALDO.planilla(nodo, o) dibuja 3 pasos: ⬇️ Descargar planilla (Excel con columnas claras + filas de ejemplo del rubro) ·
  // ⬆️ Subir (Excel/CSV) o 💬 Pegar (lo que te dio Claude) → vista previa "se crean 40 · se actualizan 5 · 3 con error: fila 7 precio" → ✅ Confirmar.
  //   o = { que: 'productos', archivo: 'planilla-productos', max: 500,
  //         cols: [{ k, t: 'Título', tipo: 'texto'|'plata'|'entero'|'si_no'|'telefono'|'correo'|'lista', req, max, ops: [...], al: /alias/i, ayuda }],
  //         ejemplos: [{ k: valor }], existe(fila) → true si ya está (se actualiza), guardar: async (filas) → { creados, actualizados, errores: [{ fila, msg }] } }
  //   El servidor valida de nuevo (cada app); la planilla nunca borra nada: crea o actualiza por la clave (nombre / teléfono). o.soloCrear = los que ya están no se tocan.
  const sinTilde = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const plata = (t) => { const s = String(t == null ? '' : t).replace(/[\s$]/g, ''); if (!s) return null; if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return +s.replace(/[.,]/g, '');
    const n = Number(s.replace(',', '.')); return isFinite(n) ? Math.round(n) : NaN; };
  function valor(c, v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return c.req ? { e: 'falta ' + c.t.toLowerCase() } : { v: null };
    if (c.tipo === 'plata' || c.tipo === 'entero') { const n = plata(s); return isNaN(n) || n < 0 || n > (c.tope || 99999999) ? { e: c.t.toLowerCase() + ' no es un número válido' } : { v: n }; }
    if (c.tipo === 'si_no') { if (/^(s[ií]|si|x|1|yes|true|ok)$/i.test(s)) return { v: true }; if (/^(no|0|false|-)$/i.test(s)) return { v: false }; return { e: c.t.toLowerCase() + ': escribe sí o no' }; }
    if (c.tipo === 'telefono') { let d = s.replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '56' + d; if (d.length === 8) d = '569' + d;
      return /^569\d{8}$/.test(d) ? { v: d } : { e: 'teléfono no es +56 9 válido' }; }
    if (c.tipo === 'correo') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? { v: s.toLowerCase() } : { e: 'correo no válido' };
    if (c.tipo === 'lista') { const o = (c.ops || []).find((x) => sinTilde(x) === sinTilde(s)); return o ? { v: o } : { e: c.t.toLowerCase() + ': usa ' + c.ops.join(', ') }; }
    return { v: s.slice(0, c.max || 120) };
  }
  // filas [[...]] → { L: [{ fila, d, e: [] }], falta } (busca la fila de títulos; sin títulos usa el orden de la planilla)
  function interpretar(filas, o) {
    const cols = o.cols;
    let ti = filas.findIndex((f) => f.filter((x) => cols.some((c) => sinTilde(c.t) === sinTilde(x) || (c.al && c.al.test(sinTilde(x))))).length >= Math.min(2, cols.length));
    const idx = {};
    if (ti >= 0) filas[ti].forEach((x, i) => { const c = cols.find((c) => idx[c.k] == null && (sinTilde(c.t) === sinTilde(x) || (c.al && c.al.test(sinTilde(x))))); if (c) idx[c.k] = i; });
    else cols.forEach((c, i) => { idx[c.k] = i; });
    let falta = cols.filter((c) => c.req && idx[c.k] == null).map((c) => c.t);
    // Sin fila de títulos: se usa el orden de la planilla solo si la 1.ª fila calza (números donde van números); si no, falta la columna.
    if (ti < 0 && filas[0] && cols.some((c) => c.req && /plata|entero/.test(c.tipo || '') && valor(c, filas[0][idx[c.k]]).e)) falta = cols.filter((c) => c.req).map((c) => c.t);
    const vistos = {}, L = [];
    filas.slice(ti + 1).forEach((f, j) => {
      const n = ti + 2 + j, d = {}, e = [];
      if (f.every((x) => !String(x || '').trim())) return;
      cols.forEach((c) => { if (idx[c.k] == null) return; const r = valor(c, f[idx[c.k]]); if (r.e) e.push(r.e); else if (r.v != null) d[c.k] = r.v; });
      const k = sinTilde(d[o.clave || cols[0].k]);
      if (k && vistos[k]) e.push('repetida (igual a la fila ' + vistos[k] + ')'); else if (k) vistos[k] = n;
      L.push({ fila: n, d, e });
    });
    return { L, falta };
  }
  function planilla(nodo, o) {
    if (!nodo) return;
    const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const max = o.max || 500, que = o.que || 'filas';
    if (!document.getElementById('cfxPlEst')) {
      const st = document.createElement('style'); st.id = 'cfxPlEst';
      st.textContent = '.cfx-pl{display:flex;flex-direction:column;gap:8px}.cfx-pl .cfx-pl-b{display:flex;flex-wrap:wrap;gap:8px}.cfx-pl .cfx-pl-b>*{flex:1 1 140px;min-height:42px}' +
        '.cfx-pl-res{border-radius:12px;padding:10px;background:var(--field);font-size:14px}.cfx-pl-res ul{margin:6px 0 0;padding-left:18px;max-height:180px;overflow:auto}' +
        '.cfx-pl-err{color:var(--cfx-rojo,#dc2626)}.cfx-pl-ok{color:var(--cfx-verde,#15803d)}.cfx-pl textarea{min-height:110px;font-family:inherit}' +
        '.cfx-pl details summary{cursor:pointer;font-weight:700}.cfx-pl pre{white-space:pre-wrap;font:13px/1.4 inherit;background:var(--field);padding:8px;border-radius:10px;margin:6px 0}';
      document.head.appendChild(st);
    }
    const encab = o.cols.map((c) => c.t);
    const textoClaude = 'Hazme una planilla para cargar mis ' + que + ' en mi app. Mi negocio es: ' + (o.rubro || '(escribe aquí tu rubro)') + '.\n' +
      'Columnas, en este orden, separadas por punto y coma (;):\n' + o.cols.map((c) => '- ' + c.t + (c.req ? ' (obligatoria)' : ' (opcional)') + (c.ayuda ? ': ' + c.ayuda : c.tipo === 'plata' ? ': número sin $ ni puntos' : c.tipo === 'si_no' ? ': sí o no' : c.tipo === 'lista' ? ': ' + c.ops.join(' / ') : '')).join('\n') +
      '\nPrimera fila = los títulos. Una fila por cada uno. Ejemplo:\n' + encab.join(';') + '\n' + (o.ejemplos || []).slice(0, 2).map((r) => o.cols.map((c) => r[c.k] == null ? '' : r[c.k]).join(';')).join('\n') +
      '\nDevuélvemela como texto para copiar (sin explicaciones).';
    nodo.innerHTML = '<div class="cfx-pl"><p class="muted" style="margin:0;font-size:13px">1) Descarga la planilla, 2) llénala en Excel o Google Sheets, 3) súbela. Si ya existe (mismo ' + E((o.cols.find((c) => c.k === (o.clave || o.cols[0].k)) || {}).t || 'nombre') + '), ' + (o.soloCrear ? 'no se toca' : 'se <b>actualiza</b>') + '; nunca se borra nada.</p>' +
      '<div class="cfx-pl-b"><button type="button" class="alt" data-pl="bajar">⬇️ Descargar planilla</button>' +
      '<label class="btn" style="display:flex;align-items:center;justify-content:center;gap:6px;margin:0;cursor:pointer">⬆️ Subir planilla<input type="file" data-pl="arch" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div>' +
      '<details><summary>🤖 Pídele a Claude que te la llene</summary><p class="muted" style="font-size:13px;margin:6px 0">Copia esto, pégalo en Claude con tu lista (fotos, texto, lo que tengas) y pega aquí lo que te responda.</p>' +
      '<pre>' + E(textoClaude) + '</pre><button type="button" class="alt" data-cfx-copiar="' + E(textoClaude) + '">📋 Copiar texto para Claude</button>' +
      '<textarea data-pl="txt" placeholder="Pega aquí lo que te dio Claude (o tu planilla copiada)" style="margin-top:8px"></textarea><button type="button" class="alt" data-pl="leer">👀 Ver qué se carga</button></details>' +
      '<div data-pl="vista"></div></div>';
    const vista = nodo.querySelector('[data-pl="vista"]');
    let actual = null;
    const bajarErrores = (L) => window.CFX_RESPALDO.excel((o.archivo || 'planilla') + '-con-errores', { Errores: L.map((x) => Object.assign({ Fila: x.fila, Error: x.e.join(', ') }, Object.fromEntries(o.cols.map((c) => [c.t, x.d[c.k] == null ? '' : x.d[c.k]])))) });
    function mostrar(filas) {
      const r = interpretar(filas, o);
      if (r.falta.length) { vista.innerHTML = '<div class="cfx-pl-res cfx-pl-err">⚠️ No encontré la columna ' + E(r.falta.join(', ')) + '. Usa la planilla descargada (⬇️) o pon esos títulos en la primera fila.</div>'; return; }
      if (!r.L.length) { vista.innerHTML = '<div class="cfx-pl-res cfx-pl-err">⚠️ La planilla no tiene filas con datos.</div>'; return; }
      if (r.L.length > max) { vista.innerHTML = '<div class="cfx-pl-res cfx-pl-err">⚠️ Son ' + r.L.length + ' filas: el máximo es ' + max + ' por vez. Divide la planilla.</div>'; return; }
      let buenas = r.L.filter((x) => !x.e.length); const malas = r.L.filter((x) => x.e.length);
      const act = buenas.filter((x) => o.existe && o.existe(x.d)).length, nuevas = buenas.length - act;
      // soloCrear (ej: clientes con saldo): los que ya están no se tocan.
      if (o.soloCrear) buenas = buenas.filter((x) => !(o.existe && o.existe(x.d)));
      actual = { buenas, malas };
      vista.innerHTML = '<div class="cfx-pl-res"><b>' + [nuevas ? '🆕 Se crean ' + nuevas : '', act ? (o.soloCrear ? '⏭️ ' + act + ' ya están (no se tocan)' : '🔄 se actualizan ' + act) : '', malas.length ? '<span class="cfx-pl-err">⚠️ ' + malas.length + ' con error</span>' : ''].filter(Boolean).join(' · ') + '</b>' +
        (malas.length ? '<ul>' + malas.slice(0, 30).map((x) => '<li>Fila ' + x.fila + ': ' + E(x.e.join(', ')) + '</li>').join('') + '</ul><p class="muted" style="font-size:13px;margin:6px 0 0">Las filas con error no se cargan: corrígelas y vuelve a subir (no se duplican).</p>' : '') +
        '<div class="cfx-pl-b" style="margin-top:8px">' + (buenas.length ? '<button type="button" data-pl="ok">✅ Confirmar ' + buenas.length + '</button>' : '') +
        (malas.length ? '<button type="button" class="alt" data-pl="errs">⬇️ Bajar filas con error</button>' : '') + '<button type="button" class="alt" data-pl="cancelar">Cancelar</button></div></div>';
      vista.scrollIntoView && vista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    nodo.addEventListener('change', async (e) => {
      if (e.target.dataset.pl !== 'arch') return;
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { mostrar(await window.CFX_RESPALDO.leer(f)); } catch (er) { vista.innerHTML = '<div class="cfx-pl-res cfx-pl-err">⚠️ ' + E(er.message) + '</div>'; }
    });
    nodo.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pl]'); if (!b) return;
      const k = b.dataset.pl;
      if (k === 'bajar') window.CFX_RESPALDO.excel(o.archivo || 'planilla', { [que.charAt(0).toUpperCase() + que.slice(1)]: (o.ejemplos && o.ejemplos.length ? o.ejemplos : [{}]).map((r) => Object.fromEntries(o.cols.map((c) => [c.t, r[c.k] == null ? '' : r[c.k]]))) });
      else if (k === 'leer') mostrar(window.CFX_RESPALDO.csv(nodo.querySelector('[data-pl="txt"]').value));
      else if (k === 'cancelar') { vista.innerHTML = ''; actual = null; }
      else if (k === 'errs' && actual) bajarErrores(actual.malas);
      else if (k === 'ok' && actual) {
        b.disabled = true; const antes = b.textContent; b.textContent = '⏳ Cargando…';
        try {
          const r = (await o.guardar(actual.buenas.map((x) => Object.assign({ _fila: x.fila }, x.d)))) || {};
          const er = r.errores || [];
          vista.innerHTML = '<div class="cfx-pl-res"><b class="cfx-pl-ok">✅ Listo: ' + [(r.creados || 0) + ' creados', (r.actualizados || 0) + ' actualizados'].join(' · ') + '</b>' +
            (er.length ? '<p class="cfx-pl-err" style="margin:6px 0 0">⚠️ ' + er.length + ' no se cargaron:</p><ul>' + er.slice(0, 30).map((x) => '<li>Fila ' + E(x.fila) + ': ' + E(x.msg) + '</li>').join('') + '</ul>' : '') + '</div>';
          actual = null;
          if (o.listo) o.listo(r);
        } catch (er) { b.disabled = false; b.textContent = antes; vista.insertAdjacentHTML('beforeend', '<p class="cfx-pl-err">⚠️ ' + E(er.message) + ' — no se cargó nada, prueba de nuevo.</p>'); }
      }
    });
  }

  window.CFX_RESPALDO = {
    leer, csv, planilla, interpretar,
    excel: (nombre, hojas) => bajar(libro(hojasDe(hojas)), limpio(nombre) + '.xlsx'),
    json: (nombre, datos) => bajar(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }), limpio(nombre) + '.json'),
    libro
  };
})();
