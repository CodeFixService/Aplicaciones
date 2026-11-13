/* 🧾 Comprobante de venta (Órbita): resumen de una venta de Caja o de un pedido, para enviarlo al cliente por WhatsApp.
   No es boleta electrónica (la boleta SII va aparte). G30: se ve como boleta de papel (logo, firma) e imprime. Uso:
   CFX_COMPROBANTE.abrir({ negocio, fecha, numero, cliente, tel, items: [{ cant, nombre, opcion, precio }], descuento, total, medio, entrega })
   G25 pedidos online: { compra: true } → "Detalle de compra" (+ boleta: { folio, url } si la tienda la emitió); { cliente_ve: true } = lo abre el cliente (sin WhatsApp). */
(function () {
  'use strict';
  const esc = (s) => window.CFX_ESC(s);  // shared/seguro.js (núcleo)
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
  const MEDIOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mercadopago: 'Mercado Pago' };
  const telDe = (v) => { const t = String(v || '').trim(); if (!t) return ''; const d = window.CodeFixDatos && window.CodeFixDatos.telefono(t); return d || t.replace(/\D/g, ''); };

  const titulo = (c) => c.compra ? 'Detalle de compra' : 'Comprobante de venta';
  function texto(c) {
    const f = new Date(c.fecha || Date.now());
    const l = ['🧾 *' + titulo(c) + '*', '*' + (c.negocio || 'Mi tienda') + '*',
      'Fecha: ' + f.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) + (c.numero ? ' · N° ' + c.numero : '')];
    if (c.cliente) l.push('Cliente: ' + c.cliente);
    l.push('');
    (c.items || []).forEach((i) => {
      const nom = i.nombre + (i.opcion && String(i.nombre).indexOf('(' + i.opcion + ')') < 0 ? ' (' + i.opcion + ')' : '');
      l.push(i.cant + ' × ' + nom + ' — ' + money(i.precio * i.cant));
    });
    if (c.descuento > 0) l.push('Descuento: −' + money(c.descuento));
    l.push('', '*TOTAL: ' + money(c.total) + '*');
    if (c.medio) l.push('Pago: ' + (MEDIOS[c.medio] || c.medio));
    if (c.entrega) l.push(c.entrega);
    if (c.boleta && c.boleta.folio) l.push('Boleta electrónica N° ' + c.boleta.folio + (c.boleta.url ? ': ' + c.boleta.url : ''));
    l.push('', 'Gracias por tu compra 🙌');
    if (!(c.boleta && c.boleta.folio)) l.push('_No es boleta electrónica._');
    return l.join('\n');
  }

  /* G30: formato boleta (papel blanco, logo, líneas, fecha y hora, firma de la empresa) + 🖨️ Imprimir / PDF.
     c.logo y c.firma { razon, rut, giro, direccion, comuna } son opcionales: si faltan y hay sesión de la tienda, se toman solos. */
  let FIRMA = null;
  async function completar(c) {
    const a = window.Cuenta && Cuenta.account;
    if (!c.logo && a) { const l = a.role === 'client' || a.role === 'equipo' ? a.negocio_logo : a.logo; if (/^(https:|data:image\/)/.test(l || '')) c.logo = l; }
    if (!c.firma && !c.cliente_ve && a && a.role === 'user' && window.Cuenta.rpc) {
      if (!FIRMA) FIRMA = Cuenta.rpc('boleta_estado').catch(() => ({}));
      const b = (await FIRMA) || {};
      if (b.rut || b.razon) c.firma = b;
    }
  }
  const rutF = (r) => { const m = String(r || '').replace(/[^0-9kK]/g, '').toUpperCase().match(/^(\d+)([0-9K])$/); return m ? m[1].replace(/\B(?=(\d{3})+$)/g, '.') + '-' + m[2] : String(r || ''); };
  function papel(c) {
    const f = new Date(c.fecha || Date.now()), fi = c.firma || {};
    const fila = (iz, de, cl) => '<div class="cb-f' + (cl ? ' ' + cl : '') + '"><span>' + iz + '</span><span>' + de + '</span></div>';
    const items = (c.items || []).map((i) => {
      const nom = i.nombre + (i.opcion && String(i.nombre).indexOf('(' + i.opcion + ')') < 0 ? ' (' + i.opcion + ')' : '');
      return fila(esc(i.cant + ' × ' + nom), esc(money(i.precio * i.cant)));
    }).join('');
    return '<div class="cb-papel">' +
      (c.logo ? '<img class="cb-logo" alt="" src="' + esc(window.CFX_URL(c.logo)) + '">' : '') +
      '<div class="cb-neg">' + esc(fi.razon || c.negocio || 'Mi tienda') + '</div>' +
      (fi.rut ? '<div class="cb-c">RUT ' + esc(rutF(fi.rut)) + '</div>' : '') + (fi.giro ? '<div class="cb-c">' + esc(fi.giro) + '</div>' : '') +
      (fi.direccion ? '<div class="cb-c">' + esc(fi.direccion + (fi.comuna ? ', ' + fi.comuna : '')) + '</div>' : '') +
      '<hr><div class="cb-tit">' + esc(titulo(c).toUpperCase()) + (c.numero ? ' N° ' + esc(c.numero) : '') + '</div>' +
      fila('Fecha', esc(f.toLocaleDateString('es-CL'))) + fila('Hora', esc(f.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))) +
      (c.cliente ? fila('Cliente', esc(c.cliente)) : '') + '<hr>' + items + '<hr>' +
      (c.descuento > 0 ? fila('Descuento', '−' + esc(money(c.descuento))) : '') +
      fila('<b>TOTAL</b>', '<b>' + esc(money(c.total)) + '</b>', 'cb-tot') +
      (c.medio ? fila('Pago', esc(MEDIOS[c.medio] || c.medio)) : '') + (c.entrega ? '<div class="cb-c" style="margin-top:4px">' + esc(c.entrega) + '</div>' : '') +
      (c.boleta && c.boleta.folio ? '<hr><div class="cb-c"><b>Boleta electrónica SII N° ' + esc(c.boleta.folio) + '</b></div>' : '') +
      '<div class="cb-firma"><div class="cb-raya">' + esc(fi.razon || c.negocio || 'Mi tienda') + '</div><div class="cb-c">Firma y timbre' + (fi.rut ? ' · RUT ' + esc(rutF(fi.rut)) : '') + '</div></div>' +
      '<div class="cb-c">Gracias por tu compra 🙌</div>' +
      (c.boleta && c.boleta.folio ? '' : '<div class="cb-c cb-chico">No es boleta electrónica</div>') + '</div>';
  }
  /* G32 c: lo mismo que papel() en texto plano, para la impresora Bluetooth (shared/impresora.js). */
  function modelo(c) {
    const f = new Date(c.fecha || Date.now()), fi = c.firma || {};
    return { negocio: fi.razon || c.negocio || 'Mi tienda', rut: fi.rut ? rutF(fi.rut) : '', giro: fi.giro || '',
      direccion: fi.direccion ? fi.direccion + (fi.comuna ? ', ' + fi.comuna : '') : '',
      titulo: titulo(c).toUpperCase() + (c.numero ? ' N° ' + c.numero : ''), fecha: f.toLocaleDateString('es-CL'),
      hora: f.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }), cliente: c.cliente || '',
      items: (c.items || []).map((i) => [i.cant + ' x ' + i.nombre + (i.opcion && String(i.nombre).indexOf('(' + i.opcion + ')') < 0 ? ' (' + i.opcion + ')' : ''), money(i.precio * i.cant)]),
      descuento: c.descuento > 0 ? '-' + money(c.descuento) : '', total: money(c.total), medio: c.medio ? MEDIOS[c.medio] || c.medio : '',
      entrega: c.entrega || '', folio: c.boleta && c.boleta.folio ? String(c.boleta.folio) : '' };
  }
  const CSS = '.cfx-comp .cb-papel{background:#fff;color:#111;border-radius:6px;padding:14px 14px 10px;font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;max-height:52vh;overflow:auto;box-shadow:0 1px 4px rgba(0,0,0,.2)}' +
    '.cb-papel hr{border:0;border-top:1px dashed #555;margin:8px 0}.cb-logo{display:block;max-width:90px;max-height:60px;margin:0 auto 6px;object-fit:contain}' +
    '.cb-neg{text-align:center;font-weight:800;font-size:15px}.cb-c{text-align:center;font-size:12px}.cb-chico{font-size:11px;color:#555}.cb-tit{text-align:center;font-weight:700;margin-bottom:4px}' +
    '.cb-f{display:flex;justify-content:space-between;gap:8px}.cb-f span:first-child{min-width:0;overflow-wrap:anywhere}.cb-f span:last-child{white-space:nowrap}.cb-tot{font-size:15px;margin:2px 0}' +
    '.cb-firma{margin:22px 0 8px}.cb-raya{border-top:1px solid #111;width:70%;margin:0 auto;padding-top:3px;text-align:center;font-style:italic;font-weight:700}' +
    '.cfx-comp .cb-bt{margin:0}.cfx-comp .cb-bt summary{cursor:pointer}.cfx-comp .cb-bt .cb-op{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}' +
    '@media print{body.cfx-imprimiendo>*:not(.cfx-comp){display:none!important}body.cfx-imprimiendo .cfx-comp{position:static!important;background:none!important}' +
    'body.cfx-imprimiendo .cfx-comp>div>*:not(.cb-papel){display:none!important}body.cfx-imprimiendo .cb-papel{max-height:none;box-shadow:none;max-width:80mm;margin:0 auto}}';

  function abrir(c) {
    c = Object.assign({}, c);
    const t = texto(c), d = document.createElement('div');
    if (!document.getElementById('cfxCompCss')) { const st = document.createElement('style'); st.id = 'cfxCompCss'; st.textContent = CSS; document.head.appendChild(st); }
    d.className = 'elegir cfx-comp';
    d.innerHTML = '<div role="dialog" aria-label="' + titulo(c) + '"><b>🧾 ' + titulo(c) + '</b>' + papel(c) +
      (c.boleta && c.boleta.url ? '<a class="btn ok" target="_blank" rel="noopener" href="' + esc(window.CFX_URL(c.boleta.url)) + '">🧾 Ver boleta N° ' + esc(c.boleta.folio) + '</a>' : '') +
      (c.cliente_ve ? '' : '<label for="compTel" class="muted" style="margin:4px 0 0">WhatsApp del cliente (opcional)</label>' +
      '<input id="compTel" type="tel" inputmode="tel" autocomplete="off" placeholder="9 1234 5678" value="' + esc(c.tel || '') + '">' +
      '<button type="button" class="ok" data-a="wsp">💬 Enviar por WhatsApp</button>') +
      (window.CFX_IMPRESORA && !c.cliente_ve ? '<button type="button" class="alt" data-a="bt">🖨️ Impresora Bluetooth</button>' +
        '<p class="muted cb-btmsg" role="status" hidden></p>' +
        '<details class="cb-bt"><summary class="muted">⚙️ Impresora: papel ' + CFX_IMPRESORA.papel() + ' mm</summary><div class="cb-op">' +
        '<button type="button" class="small" data-a="p58">58 mm</button><button type="button" class="small" data-a="p80">80 mm</button>' +
        '<button type="button" class="small" data-a="otra">Usar otra impresora</button></div>' +
        '<p class="muted">Enciende la impresora, acércala y toca 🖨️ Impresora Bluetooth: la primera vez elígela de la lista. Funciona en Chrome de Android o computador (iPhone no).</p></details>' : '') +
      '<button type="button" class="alt" data-a="print">🖨️ Imprimir o guardar PDF</button>' +
      (navigator.share ? '<button type="button" class="alt" data-a="share">📤 Compartir</button>' : '') +
      '<button type="button" class="alt" data-a="copiar">📋 Copiar</button>' +
      '<button type="button" class="small" data-a="x">Cerrar</button></div>';
    completar(c).then(() => { const p = d.querySelector('.cb-papel'); if (p && (c.logo || c.firma)) p.outerHTML = papel(c); });
    const fin = () => d.remove();
    d.onclick = (e) => {
      const b = e.target.closest('button');
      if (e.target === d || (b && b.dataset.a === 'x')) return fin();
      if (!b) return;
      if (b.dataset.a === 'bt' || b.dataset.a === 'otra') {
        const msj = d.querySelector('.cb-btmsg'), dice = (t, mal) => { msj.hidden = false; msj.textContent = t; msj.classList.toggle('warn', !!mal); };
        if (!CFX_IMPRESORA.soportado) return dice(CFX_IMPRESORA.MSJ_NO, true);
        b.disabled = true; dice('🖨️ Imprimiendo…');
        CFX_IMPRESORA.imprimir(modelo(c), { nueva: b.dataset.a === 'otra' }).then(() => dice('✅ Impreso. ¿No salió? Toca ⚙️ Impresora → Usar otra impresora.'))
          .catch((x) => dice('⚠️ ' + ((x && x.message) || 'No se pudo imprimir.'), true)).finally(() => { b.disabled = false; });
        return;
      }
      if (b.dataset.a === 'p58' || b.dataset.a === 'p80') {
        CFX_IMPRESORA.papel(b.dataset.a === 'p80' ? 80 : 58);
        d.querySelector('.cb-bt summary').textContent = '⚙️ Impresora: papel ' + CFX_IMPRESORA.papel() + ' mm';
        return;
      }
      if (b.dataset.a === 'print') {
        document.body.classList.add('cfx-imprimiendo');
        const fuera = () => { document.body.classList.remove('cfx-imprimiendo'); removeEventListener('afterprint', fuera); };
        addEventListener('afterprint', fuera); window.print();
        return;
      }
      const tel = c.cliente_ve ? '' : telDe(d.querySelector('#compTel').value);
      if (b.dataset.a === 'copiar') return window.Core ? Core.copiar(t, '📋 Copiado') : null;
      if (b.dataset.a === 'share' || (b.dataset.a === 'wsp' && !tel && navigator.share)) {
        return navigator.share({ title: titulo(c), text: t }).then(fin).catch(() => {});
      }
      window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
      fin();
    };
    document.body.appendChild(d);
    return d;
  }
  window.CFX_COMPROBANTE = { abrir, texto, modelo };
})();
