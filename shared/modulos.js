/* CodeFix · Núcleo (módulo opcional, G19) · 🧩 Módulos del negocio: packs y módulos sueltos con precio, prueba gratis y compra.
   CFX_MODULOS_TIENDA.montar(el, { rpc, alCambiar })  → pinta la tienda de módulos dentro de el (datos: cfx_modulos_tienda).
   Comprar abre CFX_PAGOS (pagos.js) con el producto; al aprobar el pago se activa solo. Probar: cfx_modulo_probar (7 días, una vez).
   G24: CFX_MODULOS_TIENDA.probar(clave, { rpc, alCambiar })  → hoja con DEMO animada (datos de ejemplo, no toca el negocio) + 🎁 prueba gratis + Comprar + Cerrar.
        CFX_MODULOS_TIENDA.candado(el, clave, { rpc, alCambiar }) → en la pantalla de un módulo que no tiene: aviso "Probar módulo" (devuelve false si el módulo no se vende). */
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
    '.cfxm-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cfxm-btns button{flex:1 1 0;min-width:110px;white-space:nowrap;padding:0 10px;min-height:42px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;' +
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
          (D.dueno ? '<div class="cfxm-btns">' + (!activo ? '<button type="button" data-probar="' + esc(p.clave) + '">▶️ Probar</button>' : '') +
            '<button type="button" class="si" data-comprar="' + esc(p.clave) + '">' + (activo ? '🔁 Renovar' : 'Comprar') + '</button></div>' : '') + '</div>';
      }).join('');
      const sueltos = mods.map((m) => '<div class="cfxm-mod"><div class="cfxm-fila"><h3>' + esc(m.nombre) + '</h3><b>' + pesos(precio(m)) + per() + '</b></div>' +
        '<p class="cfxm-sub">' + esc(m.detalle) + '</p>' + estado(m) +
        (D.dueno ? '<div class="cfxm-btns">' + (!m.activo ? '<button type="button" data-probar="' + esc(m.clave) + '">▶️ Probar</button>' : '') +
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
      if (b.dataset.probar) { probar(b.dataset.probar, { rpc: o.rpc, datos: D, alCambiar: async () => { await cargar(); if (o.alCambiar) o.alCambiar(D); } }); return; }  // demo + prueba gratis + Comprar
      const x = D.packs.find((p) => p.clave === b.dataset.comprar) || D.modulos.find((m) => m.clave === b.dataset.comprar);
      if (x && window.CFX_PAGOS) window.CFX_PAGOS.abrir({ rpc: o.rpc, producto: producto(x), alPagar: () => cargar() });  // queda en revisión: se activa cuando el administrador lo aprueba
    };
    el.innerHTML = '<p class="cfxm-sub">Cargando…</p>';
    return { cargar, datos: () => D };
  }

  /* ---------- G24 · ▶️ Probar: demo animada con datos de ejemplo ---------- */
  const css2 = document.createElement('style');
  css2.textContent =
    'dialog.cfxd{border:0;padding:0;margin:auto auto 0;width:100%;max-width:480px;max-height:94vh;background:transparent;color:inherit}dialog.cfxd::backdrop{background:rgba(15,23,42,.6)}' +
    '@media(min-width:600px){dialog.cfxd{margin:auto}}.cfxd *{box-sizing:border-box}' +
    '.cfxd>div{position:relative;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border-radius:20px 20px 0 0;padding:16px 16px calc(14px + env(safe-area-inset-bottom));font-family:var(--cfx-letra,system-ui,sans-serif);max-height:94vh;overflow:auto}' +
    '@media(min-width:600px){.cfxd>div{border-radius:20px}}.cfxd h2{margin:0 44px 2px 0;font-size:19px;overflow-wrap:anywhere}.cfxd p{margin:4px 0}.cfxd .cfxd-sub{color:var(--cfx-texto-2,#5b6472);font-size:14px}' +
    '.cfxd-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:50%;border:1px solid var(--cfx-borde,rgba(100,116,139,.35));background:transparent;color:inherit;font-size:18px;cursor:pointer}' +
    '.cfxd-chips{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 0}.cfxd-chips button{font:inherit;font-size:12px;padding:3px 9px;border-radius:99px;border:1px solid transparent;background:var(--cfx-fondo-2,rgba(100,116,139,.14));color:inherit;cursor:pointer}' +
    '.cfxd-chips button.on{border-color:var(--brand,#2563eb);color:var(--brand,#2563eb);font-weight:700}' +
    '.cfxd-esc{margin:10px 0 0;border-radius:16px;padding:12px;min-height:230px;background:var(--cfx-fondo-2,rgba(100,116,139,.12));display:flex;flex-direction:column;gap:8px;overflow:hidden}' +
    '.cfxd-tit{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--cfx-texto-2,#5b6472);display:flex;justify-content:space-between;gap:6px}' +
    '.cfxd-p{opacity:0;transform:scale(.6) translateY(10px);animation:cfxdPum .45s cubic-bezier(.2,1.6,.4,1) forwards;max-width:88%;padding:8px 11px;border-radius:14px;font-size:14px;line-height:1.3;overflow-wrap:anywhere}' +
    '@keyframes cfxdPum{to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.cfxd-p,.cfxd-bar i,.cfxd-sello{animation-duration:.01s!important}}' +
    '.cfxd-izq{align-self:flex-start;background:var(--cfx-tarjeta,#fff);border:1px solid var(--cfx-borde,rgba(100,116,139,.3))}' +
    '.cfxd-der{align-self:flex-end;background:var(--brand,#2563eb);color:#fff}' +
    '.cfxd-aviso{align-self:center;max-width:100%;background:#15803d;color:#fff;font-weight:700;text-align:center}' +
    '.cfxd-fila{align-self:stretch;max-width:100%;background:var(--cfx-tarjeta,#fff);border:1px solid var(--cfx-borde,rgba(100,116,139,.3))}' +
    '.cfxd-gran{align-self:center;max-width:100%;font-size:30px;letter-spacing:4px;text-align:center;background:none;padding:2px}' +
    '.cfxd-barras{display:flex;align-items:flex-end;gap:6px;height:120px;max-width:100%;align-self:stretch;background:none;padding:0}' +
    '.cfxd-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%;font-size:11px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfxd-bar i{display:block;width:100%;border-radius:6px 6px 2px 2px;background:var(--brand,#2563eb);transform-origin:bottom;transform:scaleY(0);animation:cfxdBar .7s ease-out forwards}' +
    '@keyframes cfxdBar{to{transform:scaleY(1)}}.cfxd-sello{display:inline-block;animation:cfxdPum .4s cubic-bezier(.2,1.6,.4,1) forwards;opacity:0;transform:scale(.3)}' +
    '.cfxd-ej{font-size:12px;color:var(--cfx-texto-2,#5b6472);text-align:center;margin:6px 0 0}.cfxd-precio{font-weight:800;font-size:18px;margin:10px 0 0;text-align:center}' +
    '.cfxd-precio small{font-weight:600;font-size:13px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfxd-btns{display:grid;gap:8px;margin-top:10px}.cfxd-btns button{width:100%;min-height:46px;border-radius:12px;font:inherit;font-weight:800;cursor:pointer;border:1px solid var(--brand,#2563eb);background:transparent;color:var(--brand,#2563eb);white-space:normal}' +
    '.cfxd-btns .si{background:var(--brand,#2563eb);color:#fff}.cfxd-btns .cerrar{border-color:var(--cfx-borde,rgba(100,116,139,.35));color:inherit;font-weight:700}.cfxd-btns button:disabled{opacity:.6}' +
    '.cfxd-err{color:#b91c1c;font-size:13px;min-height:1em;margin:6px 0 0}' +
    '.cfxk{border:1px dashed var(--brand,#2563eb);border-radius:16px;padding:16px;margin:14px auto;max-width:480px;text-align:center;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,inherit)}' +
    '.cfxk .ico{font-size:42px;line-height:1}.cfxk h2{margin:6px 0 2px;font-size:19px}.cfxk p{margin:4px 0;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfxk button{width:100%;min-height:46px;border-radius:12px;font:inherit;font-weight:800;margin-top:10px;cursor:pointer;border:0;background:var(--brand,#2563eb);color:#fff}';
  document.head.appendChild(css2);

  // Guion de cada demo (datos de ejemplo). k: izq/der = burbujas · aviso · fila · gran (emoji grande) · barras.
  const DEMO = {
    chat: { tit: 'Chat con tu cliente', pasos: [['izq', '👩 Lucía: Hola, ¿tienen la polera en talla M?'], ['der', 'Tú: ¡Sí! Me queda 1 😉'], ['izq', '👩 Lucía: Perfecto, la pido ahora'], ['aviso', '🛒 Nuevo pedido de Lucía · $12.990']] },
    cupones: { tit: 'Cupón en el carrito', pasos: [['fila', '🏷️ Creas el cupón VERANO10 (−10%)'], ['izq', '👩 Lucía escribe VERANO10 en su carrito'], ['fila', 'Total: <s>$12.990</s> → <b>$11.691</b>'], ['aviso', '✅ Pedido con cupón']] },
    sellos: { tit: 'Tarjeta de sellos', pasos: [['fila', '🎟️ Pedro compra y suma un sello'], ['gran', '<span class="cfxd-sello">☕</span><span class="cfxd-sello" style="animation-delay:.3s">☕</span><span class="cfxd-sello" style="animation-delay:.6s">☕</span><span class="cfxd-sello" style="animation-delay:.9s">☕</span><span class="cfxd-sello" style="animation-delay:1.2s">🎁</span>'], ['aviso', '🎁 ¡Completó 5! Su premio lo espera']] },
    calificaciones: { tit: 'Calificaciones', pasos: [['fila', '📦 Lucía recibió su pedido'], ['gran', '<span class="cfxd-sello">⭐</span><span class="cfxd-sello" style="animation-delay:.25s">⭐</span><span class="cfxd-sello" style="animation-delay:.5s">⭐</span><span class="cfxd-sello" style="animation-delay:.75s">⭐</span><span class="cfxd-sello" style="animation-delay:1s">⭐</span>'], ['izq', '“Llegó rápido y bien envuelto. ¡Recomendado!”'], ['aviso', '⭐ 4,9 en tu tienda: más gente se anima a comprar']] },
    carrito: { tit: 'Recordar carrito', pasos: [['fila', '🛒 Diego dejó 2 productos en el carrito'], ['fila', '🌙 Pasa la noche…'], ['izq', '🔔 “Diego, ¿te olvidaste algo? Tu carrito te espera”'], ['aviso', '✅ Diego volvió y compró $25.980']] },
    estadisticas: { tit: 'Tus ventas de la semana', pasos: [['barras', [['L', 35], ['M', 55], ['M', 40], ['J', 70], ['V', 95], ['S', 80], ['D', 50]]], ['fila', '🏆 Más vendido: Polera estampada · 18'], ['fila', '💰 Esta semana: $412.000 (+18%)']] },
    analisis: { tit: 'Para vender más', pasos: [['fila', '⚠️ Pedro compraba cada semana y no viene hace 45 días'], ['der', '💬 “Pedro, te guardamos 10% de descuento”'], ['fila', '📦 Taza blanca: 30 días sin ventas → ponla en oferta'], ['aviso', '✅ Pedro volvió a comprar']] },
    equipo: { tit: 'Mi equipo', pasos: [['fila', '➕ Camila · vendedora (ve Caja y Pedidos)'], ['fila', '➕ Diego · bodega (ve productos y stock)'], ['izq', '🔒 Cada uno entra con su cuenta y sus permisos'], ['aviso', '✅ Tú ves todo lo que hacen']] },
    campanas: { tit: 'Campaña automática', pasos: [['fila', '📣 Oferta 2x1 programada · viernes 19:00'], ['aviso', '🔔 120 clientes recibieron el aviso'], ['izq', '👩 “¡Justo lo que buscaba!”'], ['aviso', '🛒 8 pedidos esa noche']] },
    redes: { tit: 'Vender en redes', pasos: [['der', '📲 Tu tienda con foto y ofertas lista para WhatsApp'], ['izq', '👩 Lucía: ¡Quiero el 2x1!'], ['fila', '🛍️ Catálogo para Instagram y Google'], ['aviso', '🛒 Pedido directo desde WhatsApp']] },
    webhooks: { tit: 'Avisos a tu sistema', pasos: [['fila', '📦 Pedido #128 · $25.980'], ['fila', '🔗 Llega firmado a tu planilla o sistema'], ['aviso', '✅ Sin copiar nada a mano']] },
    medicion: { tit: 'Medir anuncios', pasos: [['fila', '📣 Anuncio en Instagram'], ['barras', [['Vistas', 90], ['Visitas', 55], ['Carrito', 30], ['Ventas', 18]]], ['aviso', '📊 Este anuncio te trajo 5 ventas']] },
    dominio: { tit: 'Dominio propio', pasos: [['fila', '🌐 Escriben <b>mitienda.cl</b>'], ['der', '🏪 Llegan directo a tu tienda'], ['aviso', '✅ Más confianza, tu propia marca']] },
    reservas: { tit: 'Reservas', pasos: [['fila', '📅 Viernes 18:00 libre'], ['izq', '👩 Lucía reserva a las 18:00'], ['aviso', '✅ Queda en tu agenda']] },
    recordatorios: { tit: 'Recordatorios', pasos: [['fila', '📅 Mañana 18:00 · Lucía'], ['izq', '🔔 “Lucía, te esperamos mañana a las 18:00”'], ['aviso', '✅ Menos clientes que olvidan venir']] }
  };
  function escena(clave, nombre, detalle) {
    const g = DEMO[clave] || { tit: nombre, pasos: [['fila', esc(detalle || nombre)], ['aviso', '✅ Listo para usar en tu negocio']] };
    let ms = 250;
    const html = g.pasos.map(([k, v]) => {
      const d = 'animation-delay:' + ms + 'ms'; ms += 750;
      if (k === 'barras') {
        const max = Math.max(...v.map((b) => b[1]));
        return '<div class="cfxd-p cfxd-barras" style="' + d + '">' + v.map((b, i) => '<div class="cfxd-bar"><i style="height:' + Math.round(b[1] * 100 / max) + '%;animation-delay:' + (ms - 600 + i * 120) + 'ms"></i>' + b[0] + '</div>').join('') + '</div>';
      }
      return '<div class="cfxd-p cfxd-' + k + '" style="' + d + '">' + v + '</div>';  // textos fijos de arriba (sin datos del usuario)
    }).join('');
    return { html: '<div class="cfxd-tit"><span>' + esc(g.tit) + '</span><span>Ejemplo</span></div>' + html, ms: ms + 1400 };
  }
  async function probar(clave, o) {
    o = o || {};
    let D = o.datos;
    if (!D) try { D = await o.rpc('cfx_modulos_tienda'); } catch (x) { D = null; }
    if (!D) return;
    const pack = (D.packs || []).find((p) => p.clave === clave);
    const mod = (D.modulos || []).find((m) => m.clave === clave);
    const x = pack || mod; if (!x) return;
    const lista = pack ? pack.modulos.map((k) => D.modulos.find((m) => m.clave === k) || { clave: k, nombre: k, detalle: '' }) : [mod];
    const activo = pack ? lista.every((m) => m.activo) : mod.activo;
    const puedeProbar = D.dueno && !activo && D.prueba_dias && (pack ? !D.prueba_pack : !mod.prueba_usada);
    const d = document.createElement('dialog'); d.className = 'cfxd';
    d.innerHTML = '<div><button type="button" class="cfxd-x" data-x aria-label="Cerrar">✕</button><h2>' + esc(x.nombre) + '</h2><p class="cfxd-sub">' + esc(x.detalle) + '</p>' +
      (pack ? '<div class="cfxd-chips">' + lista.map((m, i) => '<button type="button" data-i="' + i + '">' + esc(m.nombre) + '</button>').join('') + '</div>' : '') +
      '<div class="cfxd-esc" aria-live="polite"></div><p class="cfxd-ej">▶️ Ejemplo con datos inventados: no usa ni cambia nada de tu negocio. <a href="#" data-otra>Ver otra vez</a></p>' +
      (x.precio ? '<p class="cfxd-precio">' + pesos(x.precio) + '<small>/mes</small></p>' : '') +
      '<div class="cfxd-btns">' + (puedeProbar ? '<button type="button" class="si" data-gratis>🎁 Activar ' + D.prueba_dias + ' días gratis</button>' : '') +
      (activo ? '' : D.dueno ? '<button type="button" class="' + (puedeProbar ? '' : 'si') + '" data-comprar>Comprar</button>' : '<p class="cfxd-sub" style="text-align:center">Pídele al dueño de la tienda que lo active en Ajustes → 🧩 Módulos.</p>') +
      '<button type="button" class="cerrar" data-x>Cerrar</button></div><p class="cfxd-err"></p></div>';
    document.body.appendChild(d);
    const esc_ = d.querySelector('.cfxd-esc'); let i = 0, t = null;
    const ver = (n) => {
      i = n; clearTimeout(t);
      const m = lista[i], e = escena(m.clave, m.nombre, m.detalle);
      esc_.innerHTML = e.html;
      d.querySelectorAll('.cfxd-chips button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
      if (lista.length > 1) t = setTimeout(() => ver((i + 1) % lista.length), e.ms);  // pack: pasa solo al siguiente módulo
    };
    const cerrar = () => { clearTimeout(t); try { d.close(); } catch (e) { /* ya cerrado */ } d.remove(); };
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
    d.addEventListener('click', async (ev) => {
      if (ev.target === d || ev.target.closest('[data-x]')) return cerrar();
      if (ev.target.closest('[data-otra]')) { ev.preventDefault(); return ver(i); }
      const c = ev.target.closest('[data-i]'); if (c) return ver(+c.dataset.i);
      if (ev.target.closest('[data-comprar]')) {
        cerrar();
        if (window.CFX_PAGOS) window.CFX_PAGOS.abrir({ rpc: o.rpc, producto: { clave: x.clave, nombre: x.nombre, mensual: x.precio, anual: x.precio * D.anual_meses, links: D.descuento ? null : x.links }, alPagar: () => o.alCambiar && o.alCambiar() });
        return;
      }
      const g = ev.target.closest('[data-gratis]'); if (!g) return;
      g.disabled = true;
      try {
        const r = await o.rpc('cfx_modulo_probar', { p_item: x.clave });
        if (window.Core && Core.toast) Core.toast('🎁 Listo: gratis hasta el ' + fecha(r.hasta));
        cerrar(); if (o.alCambiar) o.alCambiar();
      } catch (e) { g.disabled = false; d.querySelector('.cfxd-err').textContent = (e && e.message) || String(e); }
    });
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    ver(0);
    return d;
  }
  // En la pantalla de un módulo que el negocio no tiene: aviso + ▶️ Probar módulo. false = no se vende (apagado desde el Centro de Mando).
  async function candado(el, clave, o) {
    o = o || {};
    let D = null;
    try { D = await o.rpc('cfx_modulos_tienda'); } catch (x) { return false; }
    const m = D && D.activo && (D.modulos || []).find((x) => x.clave === clave && x.vende);
    if (!m || m.activo) return false;
    el.innerHTML = '<div class="cfxk"><div class="ico">🧩</div><h2>' + esc(m.nombre) + '</h2><p>' + esc(m.detalle) + '</p>' +
      '<p><b>Este módulo no está activo en tu tienda.</b></p><button type="button">▶️ Probar módulo</button></div>';
    el.querySelector('button').onclick = () => probar(clave, Object.assign({}, o, { datos: D }));
    return true;
  }
  window.CFX_MODULOS_TIENDA = { montar, probar, candado };
})();
