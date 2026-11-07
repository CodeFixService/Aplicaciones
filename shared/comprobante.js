/* 🧾 Comprobante de venta (Órbita): resumen de una venta de Caja o de un pedido, para enviarlo al cliente por WhatsApp.
   No es boleta electrónica (la boleta SII va aparte). Uso:
   CFX_COMPROBANTE.abrir({ negocio, fecha, numero, cliente, tel, items: [{ cant, nombre, opcion, precio }], descuento, total, medio, entrega }) */
(function () {
  'use strict';
  const esc = (s) => window.CFX_ESC(s);  // shared/seguro.js (núcleo)
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
  const MEDIOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mercadopago: 'Mercado Pago' };
  const telDe = (v) => { const t = String(v || '').trim(); if (!t) return ''; const d = window.CodeFixDatos && window.CodeFixDatos.telefono(t); return d || t.replace(/\D/g, ''); };

  function texto(c) {
    const f = new Date(c.fecha || Date.now());
    const l = ['🧾 *Comprobante de venta*', '*' + (c.negocio || 'Mi tienda') + '*',
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
    l.push('', 'Gracias por tu compra 🙌', '_No es boleta electrónica._');
    return l.join('\n');
  }

  function abrir(c) {
    const t = texto(c), d = document.createElement('div');
    d.className = 'elegir cfx-comp';
    d.innerHTML = '<div role="dialog" aria-label="Comprobante de venta"><b>🧾 Comprobante de venta</b>' +
      '<pre style="white-space:pre-wrap;margin:0;padding:10px;border-radius:10px;background:var(--field);font:inherit;font-size:14px;max-height:45vh;overflow:auto">' + esc(t.replace(/[*_]/g, '')) + '</pre>' +
      '<label for="compTel" class="muted" style="margin:4px 0 0">WhatsApp del cliente (opcional)</label>' +
      '<input id="compTel" type="tel" inputmode="tel" autocomplete="off" placeholder="9 1234 5678" value="' + esc(c.tel || '') + '">' +
      '<button type="button" class="ok" data-a="wsp">💬 Enviar por WhatsApp</button>' +
      (navigator.share ? '<button type="button" class="alt" data-a="share">📤 Compartir</button>' : '') +
      '<button type="button" class="alt" data-a="copiar">📋 Copiar</button>' +
      '<button type="button" class="small" data-a="x">Cerrar</button></div>';
    const fin = () => d.remove();
    d.onclick = (e) => {
      const b = e.target.closest('button');
      if (e.target === d || (b && b.dataset.a === 'x')) return fin();
      if (!b) return;
      const tel = telDe(d.querySelector('#compTel').value);
      if (b.dataset.a === 'copiar') return window.Core ? Core.copiar(t, '📋 Comprobante copiado') : null;
      if (b.dataset.a === 'share' || (b.dataset.a === 'wsp' && !tel && navigator.share)) {
        return navigator.share({ title: 'Comprobante de venta', text: t }).then(fin).catch(() => {});
      }
      window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
      fin();
    };
    document.body.appendChild(d);
    return d;
  }
  window.CFX_COMPROBANTE = { abrir, texto };
})();
