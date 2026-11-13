/* 🖨️ Impresora térmica Bluetooth (G32 c · Órbita): imprime el comprobante en papel de 58 u 80 mm (ESC/POS) desde Chrome de Android o PC.
   iPhone/Safari no tiene Web Bluetooth → se avisa y se usa "🖨️ Imprimir o guardar PDF". Máquinas de pago por Bluetooth: NO (necesitan su app).
   Uso: CFX_IMPRESORA.imprimir(m) con m = CFX_COMPROBANTE.modelo(c) → Promise; CFX_IMPRESORA.soportado; .papel() / .papel(80); .olvidar(). */
(function () {
  'use strict';
  /* Servicios BLE de las impresoras térmicas más vendidas (genéricas 58 mm, Xprinter, MTP, Goojprt, PT-210…). */
  const SERV = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb'];
  const K_PAPEL = 'cfx:impresora:papel', K_ID = 'cfx:impresora:id';
  const lee = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const anota = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };
  const soportado = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const papel = (mm) => { if (mm) anota(K_PAPEL, String(mm)); return lee(K_PAPEL) === '80' ? 80 : 58; };

  /* Texto → bytes en la tabla PC850 (ESC t 2: la traen casi todas): tildes y ñ bien; emojis y lo raro se quitan. */
  const PC850 = { 'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ü': 0x81, 'Ü': 0x9A, '¿': 0xA8, '¡': 0xAD,
    'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, '°': 0xF8, 'º': 0xA7, 'ª': 0xA6, '×': 0x9E, '−': 0x2D, '–': 0x2D, '—': 0x2D, '·': 0xFA };
  function bytes(s) {
    const o = [];
    for (const ch of String(s == null ? '' : s)) {
      if (PC850[ch] != null) { o.push(PC850[ch]); continue; }
      const c = ch.normalize('NFD').charCodeAt(0);
      if (c >= 32 && c < 127) o.push(c);
    }
    return o;
  }
  const ancho = (s) => bytes(s).length;
  const corta = (s, n) => { let r = ''; for (const ch of String(s)) { if (ancho(r + ch) > n) break; r += ch; } return r; };
  function envolver(s, n) {
    const out = []; let l = '';
    String(s || '').split(/\s+/).filter(Boolean).forEach((w) => {
      while (ancho(w) > n) { if (l) { out.push(l); l = ''; } out.push(corta(w, n)); w = w.slice(corta(w, n).length); }
      if (!l) l = w; else if (ancho(l + ' ' + w) <= n) l += ' ' + w; else { out.push(l); l = w; }
    });
    if (l) out.push(l);
    return out;
  }
  /* Izquierda … derecha en una línea; si no cabe, el nombre baja en varias y el precio queda a la derecha de la última. */
  function fila(iz, de, n) {
    const d = String(de || ''), libre = n - ancho(d) - 1, ls = envolver(iz, Math.max(8, libre));
    if (!ls.length) ls.push('');
    const u = ls.pop();
    return ls.concat([u + ' '.repeat(Math.max(1, n - ancho(u) - ancho(d))) + d]);
  }

  /* Arma el ticket ESC/POS a partir del modelo del comprobante. */
  function ticket(m, mm) {
    const n = mm === 80 ? 48 : 32, o = [0x1B, 0x40, 0x1B, 0x74, 0x02];
    const cmd = (...b) => o.push(...b), lin = (s) => { o.push(...bytes(s), 0x0A); };
    const centro = (s) => { cmd(0x1B, 0x61, 1); envolver(s, n).forEach(lin); cmd(0x1B, 0x61, 0); };
    const raya = () => lin('-'.repeat(n));
    cmd(0x1B, 0x61, 1, 0x1D, 0x21, 0x11, 0x1B, 0x45, 1); envolver(m.negocio, n / 2).forEach(lin); cmd(0x1D, 0x21, 0, 0x1B, 0x45, 0);
    [m.rut && 'RUT ' + m.rut, m.giro, m.direccion].filter(Boolean).forEach(centro);
    raya(); cmd(0x1B, 0x45, 1); centro(m.titulo); cmd(0x1B, 0x45, 0);
    fila('Fecha', m.fecha, n).forEach(lin); fila('Hora', m.hora, n).forEach(lin);
    if (m.cliente) fila('Cliente', m.cliente, n).forEach(lin);
    raya(); m.items.forEach((i) => fila(i[0], i[1], n).forEach(lin)); raya();
    if (m.descuento) fila('Descuento', m.descuento, n).forEach(lin);
    cmd(0x1B, 0x45, 1, 0x1D, 0x21, 0x01); fila('TOTAL', m.total, n).forEach(lin); cmd(0x1D, 0x21, 0, 0x1B, 0x45, 0);
    if (m.medio) fila('Pago', m.medio, n).forEach(lin);
    if (m.entrega) envolver(m.entrega, n).forEach(lin);
    if (m.folio) { raya(); cmd(0x1B, 0x45, 1); centro('Boleta electrónica SII N° ' + m.folio); cmd(0x1B, 0x45, 0); }
    lin(''); centro('Gracias por tu compra');
    if (!m.folio) centro('No es boleta electrónica');
    cmd(0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00);
    return new Uint8Array(o);
  }

  /* Conexión: la primera vez Chrome muestra la lista de equipos; después se reusa la misma impresora sin preguntar. */
  let CAR = null;
  async function buscarCaracteristica(server) {
    const servicios = await server.getPrimaryServices();
    for (const s of servicios) {
      let cs = [];
      try { cs = await s.getCharacteristics(); } catch (_) { continue; }
      const c = cs.find((x) => x.properties.writeWithoutResponse || x.properties.write);
      if (c) return c;
    }
    throw new Error('Esa impresora no recibe datos por Bluetooth. Elige otra o revisa que sea térmica.');
  }
  async function conectar(nueva) {
    if (CAR && !nueva && CAR.service.device.gatt.connected) return CAR;
    let dev = null;
    if (!nueva && navigator.bluetooth.getDevices && lee(K_ID)) {
      try { dev = (await navigator.bluetooth.getDevices()).find((d) => d.id === lee(K_ID)) || null; } catch (_) { dev = null; }
    }
    if (!dev) dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERV });
    anota(K_ID, dev.id);
    const server = await dev.gatt.connect();
    CAR = await buscarCaracteristica(server);
    return CAR;
  }
  async function enviar(c, datos) {
    const sin = c.properties.writeWithoutResponse && c.writeValueWithoutResponse;
    for (let i = 0; i < datos.length; i += 100) {
      const trozo = datos.slice(i, i + 100);
      if (sin) await c.writeValueWithoutResponse(trozo); else if (c.writeValueWithResponse) await c.writeValueWithResponse(trozo); else await c.writeValue(trozo);
      await new Promise((r) => setTimeout(r, sin ? 30 : 5));
    }
  }
  const MSJ_NO = 'Este teléfono no puede imprimir por Bluetooth desde la web (iPhone no deja). Usa Chrome en Android o en un computador, o toca 🖨️ Imprimir o guardar PDF.';
  async function imprimir(m, opc) {
    if (!soportado) throw new Error(MSJ_NO);
    const datos = ticket(m, papel());
    try { await enviar(await conectar(opc && opc.nueva), datos); } catch (e) {
      if (e && e.name === 'NotFoundError') throw new Error('No elegiste impresora. Enciéndela, acércala y vuelve a tocar 🖨️ Impresora Bluetooth.');
      if (e && /GATT|disconnect|network/i.test(e.message || '')) { CAR = null; await enviar(await conectar(true), datos); return; }
      throw e;
    }
  }
  function olvidar() { anota(K_ID, null); try { if (CAR) CAR.service.device.gatt.disconnect(); } catch (_) {} CAR = null; }
  window.CFX_IMPRESORA = { soportado, imprimir, papel, olvidar, ticket, MSJ_NO };
})();
