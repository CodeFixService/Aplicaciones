/* CodeFix · Núcleo (módulo opcional, G19) · 🧩 Módulos del negocio: packs y módulos sueltos con precio, prueba gratis y compra.
   CFX_MODULOS_TIENDA.montar(el, { rpc, alCambiar })  → pinta la tienda de módulos dentro de el (datos: cfx_modulos_tienda).
   Comprar abre CFX_PAGOS (pagos.js) con el producto; al aprobar el pago se activa solo. Probar: cfx_modulo_probar (7 días, una vez). */
(function () {
  'use strict';
  if (window.CFX_MODULOS_TIENDA) return;
  const esc = (s) => window.CFX_ESC(s);
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const fecha = (d) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const css = document.createElement('style');
  css.textContent =
    '.cfxm{display:grid;gap:12px}.cfxm *{box-sizing:border-box}.cfxm p{margin:4px 0}.cfxm .cfxm-sub{color:var(--cfx-texto-2,#5b6472);font-size:13px}' +
    '.cfxm-per{display:flex;gap:6px;background:var(--cfx-fondo-2,rgba(100,116,139,.12));border-radius:12px;padding:4px}' +
    '.cfxm-per button{flex:1;min-height:40px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
    '.cfxm-per button.on{background:var(--cfx-tarjeta,#fff);box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
    '.cfxm-packs{display:grid;gap:10px}@media(min-width:760px){.cfxm-packs{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '.cfxm-pack,.cfxm-mod{border:1px solid var(--cfx-borde,rgba(100,116,139,.3));border-radius:14px;padding:12px;background:var(--cfx-tarjeta,#fff);min-width:0}' +
    '.cfxm-pack.top{border:2px solid var(--brand,#2563eb)}.cfxm-pack h3,.cfxm-mod h3{margin:0;font-size:16px;overflow-wrap:anywhere}' +
    '.cfxm-tag{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:var(--brand,#2563eb);color:#fff;margin-bottom:4px}' +
    '.cfxm-precio{font-size:22px;font-weight:800;margin:6px 0 0}.cfxm-precio small{font-size:13px;font-weight:600;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfxm-antes{text-decoration:line-through;color:var(--cfx-texto-2,#5b6472);font-size:13px;margin-left:6px}' +
    '.cfxm-chips{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}.cfxm-chips span{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--cfx-fondo-2,rgba(100,116,139,.12))}' +
    '.cfxm-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cfxm-btns button{flex:1 1 130px;min-height:42px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;' +
    'border:1px solid var(--brand,#2563eb);background:transparent;color:var(--brand,#2563eb)}.cfxm-btns button.si{background:var(--brand,#2563eb);color:#fff}' +
    '.cfxm-btns button:disabled{opacity:.6}.cfxm-ok{color:#15803d;font-weight:700;font-size:13px}.cfxm-prueba{color:#b45309;font-weight:700;font-size:13px}' +
    '.cfxm-mods{display:grid;gap:8px}@media(min-width:760px){.cfxm-mods{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.cfxm-fila{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.cfxm-fila b{white-space:nowrap}' +
    '.cfxm-aviso{border-radius:12px;padding:10px 12px;background:rgba(217,162,27,.14);font-size:14px}.cfxm-err{color:#b91c1c;font-size:13px;min-height:1em}';
  document.head.appendChild(css);

  function montar(el, o) {
    o = o || {};
    let D = null, anual = false;
    const precio = (x) => anual ? x.precio * D.anual_meses : x.precio;
    const per = () => anual ? '/año' : '/mes';
    const estado = (m) => !m.vende ? '<span class="cfxm-ok">✓ Incluido</span>' : !m.activo ? '' : m.origen === 'prueba'
      ? '<span class="cfxm-prueba">🎁 Prueba gratis hasta el ' + fecha(m.hasta) + '</span>' : '<span class="cfxm-ok">✅ Activo hasta el ' + fecha(m.hasta) + '</span>';
    const nombreDe = (k) => ((D.modulos.find((m) => m.clave === k) || {}).nombre || k);
    function producto(x) {
      // Con descuento Premium el monto no calza con el link fijo: paga con el link general o transferencia.
      return { clave: x.clave, nombre: x.nombre, mensual: x.precio, anual: x.precio * D.anual_meses, links: D.descuento ? null : x.links };
    }
    function pintar() {
      if (!D.activo) { el.innerHTML = '<p class="cfxm-sub">Todos los módulos vienen incluidos en tu plan.</p>'; return; }
      const mods = D.modulos.filter((m) => m.vende);
      const packs = D.packs.map((p) => {
        const activo = p.modulos.length && p.modulos.every((k) => (D.modulos.find((m) => m.clave === k) || {}).activo);
        const ahorro = p.suelto > p.lista ? Math.round(100 - p.lista * 100 / p.suelto) : 0;
        return '<div class="cfxm-pack' + (p.destacado ? ' top' : '') + '">' + (p.destacado ? '<span class="cfxm-tag">⭐ Más elegido</span>' : '') +
          '<h3>' + esc(p.nombre) + '</h3><p class="cfxm-sub">' + esc(p.detalle) + '</p>' +
          '<p class="cfxm-precio">' + pesos(precio(p)) + '<small>' + per() + '</small>' + (D.descuento ? '<span class="cfxm-antes">' + pesos(anual ? p.lista * D.anual_meses : p.lista) + '</span>' : '') + '</p>' +
          (ahorro ? '<p class="cfxm-sub">Sueltos costarían ' + pesos(anual ? p.suelto * D.anual_meses : p.suelto) + ': ahorras ' + ahorro + '%</p>' : '') +
          '<div class="cfxm-chips">' + p.modulos.map((k) => '<span>' + esc(nombreDe(k)) + '</span>').join('') + '</div>' +
          (activo ? '<span class="cfxm-ok">✅ Lo tienes activo</span>' : '') +
          (D.dueno ? '<div class="cfxm-btns">' + (!D.prueba_pack && !activo && D.prueba_dias ? '<button type="button" data-probar="' + esc(p.clave) + '">🎁 Probar ' + D.prueba_dias + ' días gratis</button>' : '') +
            '<button type="button" class="si" data-comprar="' + esc(p.clave) + '">' + (activo ? '🔁 Renovar' : 'Comprar') + '</button></div>' : '') + '</div>';
      }).join('');
      const sueltos = mods.map((m) => '<div class="cfxm-mod"><div class="cfxm-fila"><h3>' + esc(m.nombre) + '</h3><b>' + pesos(precio(m)) + per() + '</b></div>' +
        '<p class="cfxm-sub">' + esc(m.detalle) + '</p>' + estado(m) +
        (D.dueno ? '<div class="cfxm-btns">' + (!m.prueba_usada && !m.activo && D.prueba_dias ? '<button type="button" data-probar="' + esc(m.clave) + '">🎁 Probar gratis</button>' : '') +
          '<button type="button" class="si" data-comprar="' + esc(m.clave) + '">' + (m.activo && m.origen !== 'prueba' ? '🔁 Renovar' : 'Comprar') + '</button></div>' : '') + '</div>').join('');
      const incluidos = D.modulos.filter((m) => !m.vende);
      el.innerHTML = '<div class="cfxm">' +
        (D.premium && D.descuento ? '<div class="cfxm-aviso">⭐ Eres Premium: pagas ' + D.descuento + '% menos en todos los módulos.</div>'
          : D.descuento_pro ? '<div class="cfxm-aviso">⭐ Con Premium pagas ' + D.descuento_pro + '% menos en todos los módulos.</div>' : '') +
        (D.dueno ? '' : '<p class="cfxm-sub">Solo el dueño de la tienda puede comprar módulos.</p>') +
        '<div class="cfxm-per" role="group" aria-label="Forma de pago"><button type="button" data-per="m" class="' + (anual ? '' : 'on') + '">Mensual</button>' +
        '<button type="button" data-per="a" class="' + (anual ? 'on' : '') + '">Anual · ' + (12 - D.anual_meses) + ' meses gratis</button></div>' +
        (packs ? '<h3 style="margin:4px 0 0">Packs</h3><div class="cfxm-packs">' + packs + '</div>' : '') +
        (sueltos ? '<h3 style="margin:4px 0 0">Módulos sueltos</h3><div class="cfxm-mods">' + sueltos + '</div>' : '') +
        (incluidos.length ? '<p class="cfxm-sub">✓ Incluidos sin costo: ' + incluidos.map((m) => esc(m.nombre)).join(', ') + '</p>' : '') +
        '<p class="cfxm-sub">Se activan apenas revisamos tu pago. Si no renuevas, el módulo se apaga y tus datos quedan guardados: al volver a activarlo está todo.</p>' +
        '<p class="cfxm-err" id="cfxmErr"></p></div>';
    }
    async function cargar() {
      try { D = await o.rpc('cfx_modulos_tienda'); pintar(); } catch (x) { el.innerHTML = '<p class="cfxm-err">' + esc((x && x.message) || x) + '</p>'; }
      return D;
    }
    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-per],[data-probar],[data-comprar]'); if (!b || !D) return;
      if (b.dataset.per) { anual = b.dataset.per === 'a'; pintar(); return; }
      const err = el.querySelector('#cfxmErr');
      if (b.dataset.probar) {
        b.disabled = true;
        try {
          const r = await o.rpc('cfx_modulo_probar', { p_item: b.dataset.probar });
          if (window.Core && Core.toast) Core.toast('🎁 Listo: gratis hasta el ' + fecha(r.hasta));
          await cargar(); if (o.alCambiar) o.alCambiar(D);
        } catch (x) { b.disabled = false; err.textContent = (x && x.message) || String(x); }
        return;
      }
      const x = D.packs.find((p) => p.clave === b.dataset.comprar) || D.modulos.find((m) => m.clave === b.dataset.comprar);
      if (x && window.CFX_PAGOS) window.CFX_PAGOS.abrir({ rpc: o.rpc, producto: producto(x), alPagar: () => cargar() });  // queda en revisión: se activa cuando el administrador lo aprueba
    };
    el.innerHTML = '<p class="cfxm-sub">Cargando…</p>';
    return { cargar, datos: () => D };
  }
  window.CFX_MODULOS_TIENDA = { montar };
})();
