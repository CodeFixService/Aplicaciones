/* CodeFix · Núcleo · Respaldo descargable (mismo archivo en cada repositorio).
   CFX_RESPALDO.excel('respaldo-mi-negocio', { Clientes: [{...}], Pedidos: [{...}] })  → descarga un .xlsx (una hoja por tabla).
   CFX_RESPALDO.json('respaldo-mi-negocio', datos)                                     → descarga el mismo contenido en .json.
   El Excel se arma en el teléfono (sin servidor ni librerías): se abre en Excel, Google Sheets y Numbers. */
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
  window.CFX_RESPALDO = {
    excel: (nombre, hojas) => bajar(libro(hojasDe(hojas)), limpio(nombre) + '.xlsx'),
    json: (nombre, datos) => bajar(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }), limpio(nombre) + '.json'),
    libro
  };
})();
