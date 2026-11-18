/* 📲 Tarjeta en el celular (núcleo G32 e · "Tap on Phone"): la web NO puede leer tarjetas (Web NFC no lee chips EMV; se necesita una app certificada).
   Por eso: muestra el monto (📋 copiar) → abre la app de cobro que el negocio ya usa (Android con NFC) → al volver pregunta "¿Se aprobó?".
   La venta queda como 💳 Tarjeta. Sin comisiones de CodeFix: el negocio paga solo lo de su proveedor.
   Uso: CFX_TAP.cobrar(monto, { titulo }) → Promise<{ proveedor } | null>.   CFX_TAP.proveedor() → id elegido en este celular. */
(function () {
  'use strict';
  if (window.CFX_TAP) return;
  const d = document;
  /* G33: Claude elige → Mercado Pago primero (el que más pymes ya tienen en Chile). Package = app de Android; si no está instalada, abre su ficha en Play Store. */
  const PROV = [
    { id: 'mp', nombre: 'Mercado Pago', pkg: 'com.mercadopago.wallet' },
    { id: 'sumup', nombre: 'SumUp', pkg: 'com.kaching.merchant' },
    { id: 'klap', nombre: 'Klap', buscar: 'Klap Tap on Phone' },
    { id: 'otra', nombre: 'Otra app' },
  ];
  const K = 'cfx:tap:proveedor';
  const lee = () => { try { return localStorage.getItem(K); } catch (_) { return null; } };
  const anota = (v) => { try { localStorage.setItem(K, v); } catch (_) {} };
  const proveedor = () => (PROV.find((p) => p.id === lee()) || PROV[0]).id;
  const android = /Android/i.test(navigator.userAgent || '');
  const plata = (n) => '$' + Math.round(+n || 0).toLocaleString('es-CL');
  function enlace(p) {
    if (p.pkg) return 'intent://#Intent;package=' + p.pkg + ';S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=' + p.pkg) + ';end';
    if (p.buscar) return 'https://play.google.com/store/search?q=' + encodeURIComponent(p.buscar) + '&c=apps';
    return null;
  }
  let css = null;
  function estilo() {
    if (css) return; css = d.createElement('style');
    css.textContent = 'dialog.cfx-tap{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;border:0;margin:0;padding:0;width:auto;height:auto;max-width:none;max-height:none;background:rgba(8,12,24,.55);color:inherit;overflow:visible;font-family:var(--cfx-letra,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)}' +
      'dialog.cfx-tap::backdrop{background:transparent}.cfx-tap-c{box-sizing:border-box;width:100%;max-width:520px;max-height:92vh;overflow:auto;padding:18px 16px 16px;border-radius:20px 20px 0 0;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border:1px solid var(--cfx-borde,#dce3ea);border-bottom:0}' +
      '.cfx-tap h2{margin:0 0 4px;font-size:17px}.cfx-tap p{margin:0 0 12px;font-size:14px;line-height:1.4;color:var(--cfx-suave,#5b6475)}' +
      '.cfx-tap-m{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:14px;background:var(--cfx-campo,#f1f4f7);border:1px solid var(--cfx-borde,#dce3ea)}' +
      '.cfx-tap-m b{font-size:28px;color:var(--cfx-texto,#111827)}.cfx-tap-p{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}' +
      '.cfx-tap button{min-height:44px;border-radius:14px;border:1px solid var(--cfx-borde,#dce3ea);background:var(--cfx-campo,#f1f4f7);color:var(--cfx-texto,#111827);font:inherit;font-weight:700;font-size:15px;cursor:pointer;padding:0 14px}' +
      '.cfx-tap-p button{flex:1 1 40%;min-height:40px;font-size:14px}.cfx-tap-p button.on{background:var(--brand,#2563eb);color:var(--brand-ink,#fff);border-color:transparent}' +
      '.cfx-tap-b{display:flex;flex-direction:column;gap:8px}.cfx-tap .si{border:2px solid var(--cfx-ok,#16a34a);color:var(--cfx-ok,#16a34a)}.cfx-tap.volvio .si,.cfx-tap.sin-app .si{background:var(--cfx-ok,#16a34a);color:#fff}.cfx-tap .abre{background:var(--brand,#2563eb);color:var(--brand-ink,#fff);border-color:transparent}' +
      '.cfx-tap .vuelta{display:none;font-weight:700;color:var(--cfx-texto,#111827)}.cfx-tap.volvio .vuelta{display:block}' +
      '@media (min-width:700px){dialog.cfx-tap{align-items:center}.cfx-tap-c{border-radius:20px;border-bottom:1px solid var(--cfx-borde,#dce3ea)}}';
    (d.head || d.documentElement).appendChild(css);
  }
  function cobrar(monto, o) {
    o = o || {}; estilo();
    return new Promise((fin) => {
      const v = d.createElement('dialog'); v.className = 'cfx-tap'; v.setAttribute('aria-label', 'Cobrar con tarjeta en el celular');
      const c = d.createElement('div'); c.className = 'cfx-tap-c'; v.appendChild(c);
      let elegido = proveedor(), salio = false;
      function pinta() {
        const p = PROV.find((x) => x.id === elegido), url = enlace(p);
        v.classList.toggle('sin-app', !url);
        c.innerHTML = '<h2>📲 ' + (o.titulo ? String(o.titulo).replace(/[<>&"]/g, '') : 'Tarjeta en el celular') + '</h2>' +
          '<p>El cliente acerca su tarjeta (o su celular) a la parte de atrás de tu teléfono. Se cobra en la app de tu proveedor.</p>' +
          '<div class="cfx-tap-m"><b>' + plata(monto) + '</b><button type="button" data-copiar aria-label="Copiar monto">📋 Copiar</button></div>' +
          '<p style="margin-bottom:6px"><b>Tu app de cobro</b></p><div class="cfx-tap-p">' +
          PROV.map((x) => '<button type="button" data-p="' + x.id + '" class="' + (x.id === elegido ? 'on' : '') + '">' + x.nombre + '</button>').join('') + '</div>' +
          (android ? '' : '<p>⚠️ Cobrar con el celular funciona en <b>Android con NFC</b>. Aquí cobra en tu app o máquina y luego confirma.</p>') +
          '<p class="vuelta">¿Se aprobó el pago de ' + plata(monto) + '?</p>' +
          '<div class="cfx-tap-b">' + (url ? '<button type="button" class="abre" data-abrir>📲 Abrir ' + p.nombre + '</button>' : '<p style="margin:0">Abre tu app de cobro, cobra ' + plata(monto) + ' y vuelve aquí.</p>') +
          '<button type="button" class="si" data-si>✅ Se aprobó</button><button type="button" data-no>Cancelar</button></div>';
      }
      function cerrar(r) { d.removeEventListener('visibilitychange', vis); try { v.close(); } catch (_) {} v.remove(); fin(r); }
      function vis() { if (salio && d.visibilityState === 'visible') v.classList.add('volvio'); }
      d.addEventListener('visibilitychange', vis);
      v.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
      v.addEventListener('click', (e) => {
        if (e.target === v) return cerrar(null);
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.p) { elegido = b.dataset.p; anota(elegido); return pinta(); }
        if (b.hasAttribute('data-copiar')) { const t = String(Math.round(+monto || 0)); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = '✅ Copiado'; }).catch(() => { b.textContent = t; }); return; }
        if (b.hasAttribute('data-abrir')) { salio = true; v.classList.add('volvio'); window.CFX_TAP.ir(enlace(PROV.find((x) => x.id === elegido))); return; }
        if (b.hasAttribute('data-si')) return cerrar({ proveedor: elegido });
        if (b.hasAttribute('data-no')) return cerrar(null);
      });
      pinta(); d.body.appendChild(v);
      try { v.showModal(); } catch (_) { v.setAttribute('open', ''); }
    });
  }
  const ir = (u) => { if (/^https:/.test(u)) window.open(u, '_blank', 'noopener'); else location.href = u; };  // las pruebas la reemplazan
  window.CFX_TAP = { cobrar, proveedor, ir, PROVEEDORES: PROV.map((p) => ({ id: p.id, nombre: p.nombre })) };
})();
