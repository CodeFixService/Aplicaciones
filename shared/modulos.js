/* CodeFix · Núcleo (módulo opcional, G19) · 🧩 Módulos del negocio: packs y módulos sueltos con precio, prueba gratis y compra.
   CFX_MODULOS_TIENDA.montar(el, { rpc, alCambiar })  → pinta la tienda de módulos dentro de el (datos: cfx_modulos_tienda).
   Comprar abre CFX_PAGOS (pagos.js) con el producto; al aprobar el pago se activa solo. Probar: cfx_modulo_probar (7 días, una vez).
   G24: CFX_MODULOS_TIENDA.probar(clave, { rpc, alCambiar })  → hoja con DEMO animada (datos de ejemplo, no toca el negocio) + 🎁 Probar arriba (o ⌛ 'ya la usaste') + Comprar + Cerrar.
        CFX_MODULOS_TIENDA.candado(el, clave, { rpc, alCambiar }) → en la pantalla de un módulo que no tiene: aviso "Probar módulo" (devuelve false si el módulo no se vende).
        CFX_MODULOS_TIENDA.prueba(el, clave, { rpc, alCambiar }) → G142 a: solo el 🎁 (o el aviso ⌛) dentro de otra hoja de la app (candado ⭐ Premium).
   G95: 🎁 Probar N días gratis (cfx_modulo_probar) en cada módulo/pack sin activar: tarjeta, hoja de demo y candado. Una vez por correo; al
        usarla el botón desaparece para siempre. Al vencer se apaga solo (los datos quedan) y queda Comprar.
   G74 b: 🎁 Campaña del Centro de Mando → los módulos en campaña dicen "🎁 GRATIS N meses" y 🎁 Activar (cfx_modulo_campana) los deja activos al tiro. */
(function () {
  'use strict';
  if (window.CFX_MODULOS_TIENDA) return;
  const esc = (s) => window.CFX_ESC(s);
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const fecha = (d) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const aviso = (t) => { if (window.CFX_AVISO) window.CFX_AVISO(t, { tipo: 'ok' }); else if (window.Core && Core.toast) Core.toast(t); };
  // G74 b: activar el regalo de la campaña (gratis, sin pagar). Devuelve true si quedó activo.
  async function activarRegalo(rpc, clave, b) {
    if (b) b.disabled = true;
    try { const r = await rpc('cfx_modulo_campana', { p_modulo: clave }); aviso('🎁 ¡Listo! Lo tienes gratis hasta el ' + fecha(r.hasta)); return true; }
    catch (x) { if (b) b.disabled = false; if (window.CFX_DIALOGO) window.CFX_DIALOGO.avisar((x && x.message) || String(x)); return false; }
  }
  // G95: 🎁 prueba gratis de un módulo o pack (una vez por correo). Devuelve true si quedó activo.
  async function activarPrueba(rpc, clave, b) {
    if (b) b.disabled = true;
    try { const r = await rpc('cfx_modulo_probar', { p_item: clave }); aviso('🎁 ¡Listo! Gratis hasta el ' + fecha(r.hasta)); return true; }
    catch (x) { if (b) b.disabled = false; if (window.CFX_DIALOGO) window.CFX_DIALOGO.avisar((x && x.message) || String(x)); return false; }
  }
  const puedePrueba = (D, x, pack) => !!(D && D.dueno && D.prueba_dias > 0 && (pack ? !D.prueba_pack : !x.prueba_usada && !x.plan && !(x.regalo && D.campana)));
  const USADA = '⌛ Ya usaste tu prueba gratis de este módulo con este correo (es 1 vez por correo). Tus datos quedan guardados: cómpralo y sigues.';
  // G142 a: 🎁 en cualquier hoja de la app (p. ej. el candado ⭐ Premium de Barbería): pone el botón si se puede probar, o el aviso si ya lo usó.
  // CFX_MODULOS_TIENDA.prueba(el, clave, { rpc, alCambiar }) → true si puso algo.
  async function prueba(el, clave, o) {
    o = o || {}; let D = null;
    try { D = await o.rpc('cfx_modulos_tienda'); } catch (x) { return false; }
    const m = D && D.activo && (D.modulos || []).find((x) => x.clave === clave && x.vende);
    if (!el || !m || m.activo || !D.dueno) return false;
    if (!puedePrueba(D, m)) { if (!m.prueba_usada) return false; el.innerHTML = '<p class="cfxd-usada">' + USADA + '</p>'; return true; }
    el.innerHTML = '<button type="button" class="si" data-gratis style="width:100%">🎁 Probar ' + esc(m.nombre) + ' ' + D.prueba_dias + ' días gratis</button>';
    const g = el.querySelector('[data-gratis]');
    g.onclick = async () => { if (await activarPrueba(o.rpc, clave, g)) { if (o.alCambiar) o.alCambiar(); else location.reload(); } };
    return true;
  }
  const btnPrueba = (D, clave) => '<button type="button" class="si" data-gratis="' + esc(clave) + '">🎁 Probar ' + D.prueba_dias + ' días</button>';
  const css = document.createElement('style');
  css.textContent =
    '.cfxm{display:grid;gap:12px}.cfxm *{box-sizing:border-box}.cfxm p{margin:4px 0}.cfxm .cfxm-sub{color:var(--cfx-texto-2,#5b6472);font-size:13px}' +
    '.cfxm-per{display:flex;gap:6px;background:var(--cfx-fondo-2,rgba(100,116,139,.12));border-radius:12px;padding:4px}' +
    '.cfxm-per button{flex:1;min-height:40px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
    '.cfxm-per button.on{background:var(--cfx-tarjeta,#fff);box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
    '.cfxm-packs{display:grid;gap:10px}@media(min-width:760px){.cfxm-packs{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '.cfxm-pack,.cfxm-mod{border:1px solid var(--cfx-borde,rgba(100,116,139,.3));border-radius:14px;padding:12px;background:var(--cfx-tarjeta,#fff);min-width:0}' +
    '.cfxm-pack.cfxm-top{border:2px solid var(--brand,#2563eb)}.cfxm-pack h3,.cfxm-mod h3{margin:0;font-size:16px;overflow-wrap:anywhere}' +
    '.cfxm-tag{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:var(--brand,#2563eb);color:#fff;margin-bottom:4px}' +
    '.cfxm-precio{font-size:22px;font-weight:800;margin:6px 0 0}.cfxm-precio small{font-size:13px;font-weight:600;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfxm-antes{text-decoration:line-through;color:var(--cfx-texto-2,#5b6472);font-size:13px;margin-left:6px}' +
    '.cfxm-chips{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}.cfxm-chips span{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--cfx-fondo-2,rgba(100,116,139,.12))}' +
    '.cfxm-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.cfxm-btns button{flex:1 1 0;min-width:110px;white-space:nowrap;padding:0 10px;min-height:42px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;' +
    'border:1px solid var(--brand,#2563eb);background:transparent;color:var(--brand,#2563eb)}.cfxm-btns button.si{background:var(--brand,#2563eb);color:#fff}' +
    '.cfxm-btns button[data-gratis]{order:-1;flex-basis:100%;background:var(--cfx-ok,#15803d);border-color:var(--cfx-ok,#15803d);color:#fff}.cfxm-btns button:disabled{opacity:.6}.cfxm-ok{color:#15803d;font-weight:700;font-size:13px}.cfxm-prueba{color:#b45309;font-weight:700;font-size:13px}' +
    '.cfxm-mods{display:grid;gap:8px}@media(min-width:760px){.cfxm-mods{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.cfxm-fila{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.cfxm-fila b{white-space:nowrap}' +
    '.cfxm-key{margin:12px 0 0}.cfxm-key summary{cursor:pointer;font-weight:600}.cfxm-key .cfxm-fila{margin-top:8px;align-items:center}.cfxm-key input{flex:1;min-width:0}' +
    '.cfxm-aviso{border-radius:12px;padding:10px 12px;background:rgba(217,162,27,.14);font-size:14px}.cfxm-camp{background:rgba(22,163,74,.14);font-weight:600}' +
    '.cfxm-gratis{display:inline-block;font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;background:#15803d;color:#fff;margin:4px 0}.cfxm-err{color:#b91c1c;font-size:13px;min-height:1em}';
  document.head.appendChild(css);

  function montar(el, o) {
    o = o || {};
    let D = null, anual = false;
    const precio = (x) => anual ? x.precio * D.anual_meses : x.precio;
    const per = () => anual ? '/año' : '/mes';
    const estado = (m) => m.plan ? '<span class="cfxm-ok">✅ Incluido en tu Premium</span>' : !m.vende ? '<span class="cfxm-ok">✓ Incluido</span>'
      : !m.activo ? (m.prueba_usada ? '<span class="cfxm-sub">⌛ Tu prueba gratis terminó. Tus datos siguen guardados: cómpralo y sigues.</span>' : '') : m.origen === 'prueba'
      ? '<span class="cfxm-prueba">🎁 Prueba gratis hasta el ' + fecha(m.hasta) + '</span>' : m.origen === 'regalo' ? '<span class="cfxm-ok">🎁 Regalo hasta el ' + fecha(m.hasta) + '</span>'
      : '<span class="cfxm-ok">✅ Activo hasta el ' + fecha(m.hasta) + '</span>';
    const nombreDe = (k) => ((D.modulos.find((m) => m.clave === k) || {}).nombre || k);
    function producto(x) {
      // Con descuento Premium el monto no calza con el link fijo: paga con el link general o transferencia.
      return { clave: x.clave, nombre: x.nombre, mensual: x.precio, anual: x.precio * D.anual_meses, links: D.descuento ? null : x.links };
    }
    function pintar() {
      if (!D.activo) { el.innerHTML = '<p class="cfxm-sub">Todos los módulos vienen incluidos en tu plan.</p>'; return; }
      const mods = D.modulos.filter((m) => m.vende).sort((a, b) => (b.regalo && D.campana ? 1 : 0) - (a.regalo && D.campana ? 1 : 0));  // G74 b: los de regalo primero
      const enPlan = (k) => (D.modulos.find((m) => m.clave === k) || {}).plan;
      const packs = D.packs.filter((p) => !(p.modulos.length && p.modulos.every(enPlan))).map((p) => {  // G53: sin packs que el plan ya trae
        const activo = p.modulos.length && p.modulos.every((k) => (D.modulos.find((m) => m.clave === k) || {}).activo);
        const ahorro = p.suelto > p.lista ? Math.round(100 - p.lista * 100 / p.suelto) : 0;
        return '<div class="cfxm-pack' + (p.destacado ? ' cfxm-top' : '')  /* G129: 'top' chocaba con el encabezado fijo de Estaciona */ + '">' + (p.destacado ? '<span class="cfxm-tag">⭐ Más elegido</span>' : '') +
          '<h3>' + esc(p.nombre) + '</h3><p class="cfxm-sub">' + esc(p.detalle) + '</p>' +
          '<p class="cfxm-precio">' + pesos(precio(p)) + '<small>' + per() + '</small>' + (D.descuento ? '<span class="cfxm-antes">' + pesos(anual ? p.lista * D.anual_meses : p.lista) + '</span>' : '') + '</p>' +
          (ahorro ? '<p class="cfxm-sub">Sueltos costarían ' + pesos(anual ? p.suelto * D.anual_meses : p.suelto) + ': ahorras ' + ahorro + '%</p>' : '') +
          '<div class="cfxm-chips">' + p.modulos.map((k) => '<span>' + esc(nombreDe(k)) + '</span>').join('') + '</div>' +
          (activo ? '<span class="cfxm-ok">✅ Lo tienes activo</span>' : '') +
          (D.dueno ? '<div class="cfxm-btns">' + (!activo ? '<button type="button" data-probar="' + esc(p.clave) + '">▶️ Ver demo</button>' + (puedePrueba(D, p, true) ? btnPrueba(D, p.clave) : '') : '') +
            '<button type="button" class="si" data-comprar="' + esc(p.clave) + '">' + (activo ? '🔁 Renovar' : 'Comprar') + '</button></div>' : '') + '</div>';
      }).join('');
      const sueltos = mods.map((m) => '<div class="cfxm-mod"><div class="cfxm-fila"><h3>' + esc(m.nombre) + '</h3><b>' + pesos(precio(m)) + per() + '</b></div>' +
        (m.regalo && D.campana ? '<span class="cfxm-gratis">🎁 GRATIS ' + D.campana.meses + (D.campana.meses === 1 ? ' mes' : ' meses') + '</span>' : '') +
        '<p class="cfxm-sub">' + esc(m.detalle) + '</p>' + estado(m) +
        (D.dueno && !m.plan ? '<div class="cfxm-btns">' + (!m.activo ? '<button type="button" data-probar="' + esc(m.clave) + '">▶️ Ver demo</button>' + (puedePrueba(D, m) ? btnPrueba(D, m.clave) : '') : '') +
          (m.regalo && D.campana ? '<button type="button" class="si" data-regalo="' + esc(m.clave) + '">🎁 Activar gratis</button>'
            : '<button type="button" class="si" data-comprar="' + esc(m.clave) + '">' + (m.activo && m.origen !== 'prueba' ? '🔁 Renovar' : 'Comprar') + '</button>') + '</div>' : '') + '</div>').join('');
      const incluidos = D.modulos.filter((m) => !m.vende);
      const nReg = mods.filter((m) => m.regalo).length;
      el.innerHTML = '<div class="cfxm">' +
        (D.campana && nReg ? '<div class="cfxm-aviso cfxm-camp">🎁 Lanzamiento: ' + (nReg === 1 ? '1 módulo GRATIS' : nReg + ' módulos GRATIS') + ' por ' + D.campana.meses + (D.campana.meses === 1 ? ' mes' : ' meses') +
          '. Toca 🎁 Activar gratis y lo tienes al tiro. Solo hasta el ' + fecha(D.campana.hasta) + '.</div>' : '') +
        (D.premium && D.descuento ? '<div class="cfxm-aviso">⭐ Eres Premium: pagas ' + D.descuento + '% menos en los módulos' + (D.modulos.some((m) => m.plan) ? ' y algunos ya vienen incluidos' : '') + '.</div>'
          : D.descuento_pro ? '<div class="cfxm-aviso">⭐ Con Premium pagas ' + D.descuento_pro + '% menos en todos los módulos.</div>' : '') +
        (D.dueno ? '' : '<p class="cfxm-sub">Solo el dueño del negocio puede comprar módulos.</p>') +
        '<div class="cfxm-per" role="group" aria-label="Forma de pago"><button type="button" data-per="m" class="' + (anual ? '' : 'on') + '">Mensual</button>' +
        '<button type="button" data-per="a" class="' + (anual ? 'on' : '') + '">Anual · ' + (12 - D.anual_meses) + ' meses gratis</button></div>' +
        (packs ? '<h3 style="margin:4px 0 0">Packs</h3><div class="cfxm-packs">' + packs + '</div>' : '') +
        (sueltos ? '<h3 style="margin:4px 0 0">Módulos sueltos</h3><div class="cfxm-mods">' + sueltos + '</div>' : '') +
        (incluidos.length ? '<p class="cfxm-sub">✓ Incluidos sin costo: ' + incluidos.map((m) => esc(m.nombre)).join(', ') + '</p>' : '') +
        '<p class="cfxm-sub">Se activan apenas revisamos tu pago. Si no renuevas, el módulo se apaga y tus datos quedan guardados: al volver a activarlo está todo.</p>' +
        // G81 d: key de módulo o pack (1 uso, la crea el CM en Control → 🔑 Keys).
        (D.dueno ? '<details class="cfxm-key"><summary>🔑 Tengo una key</summary><div class="cfxm-fila"><input id="cfxmKey" placeholder="CFX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" maxlength="20">' +
          '<button type="button" class="si" data-key>Activar</button></div></details>' : '') +
        '<p class="cfxm-err" id="cfxmErr"></p></div>';
    }
    async function cargar() {
      try { D = await o.rpc('cfx_modulos_tienda'); pintar(); } catch (x) { el.innerHTML = '<p class="cfxm-err">' + esc((x && x.message) || x) + '</p>'; }
      return D;
    }
    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-per],[data-probar],[data-comprar],[data-regalo],[data-key],[data-gratis]'); if (!b || !D) return;
      if (b.dataset.gratis) { if (await activarPrueba(o.rpc, b.dataset.gratis, b)) { await cargar(); if (o.alCambiar) o.alCambiar(D); } return; }
      if (b.dataset.key !== undefined) {
        const err = el.querySelector('#cfxmErr'); err.textContent = ''; b.disabled = true;
        try {
          const r = await o.rpc('cfx_key_canjear', { p_codigo: el.querySelector('#cfxmKey').value });
          if (r && r.error) throw new Error(r.error);
          await cargar(); if (o.alCambiar) o.alCambiar(D);
          if (window.CFX_DIALOGO) window.CFX_DIALOGO.avisar('🎉 ' + (r.nombre || 'Listo') + ' activo por ' + r.dias + ' días.');
        } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; }
        return;
      }
      if (b.dataset.per) { anual = b.dataset.per === 'a'; pintar(); return; }
      if (b.dataset.regalo) { if (await activarRegalo(o.rpc, b.dataset.regalo, b)) { await cargar(); if (o.alCambiar) o.alCambiar(D); } return; }
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
    '.cfxd-top{margin:10px 0 0}.cfxd-usada{margin:8px 0 0;padding:8px 10px;border-radius:12px;font-size:13px;background:var(--cfx-fondo-2,rgba(100,116,139,.14));color:var(--cfx-texto-2,#5b6472)}' +
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
    '.cfxk button{width:100%;min-height:46px;border-radius:12px;font:inherit;font-weight:800;margin-top:10px;cursor:pointer;border:0;background:var(--brand,#2563eb);color:#fff}' +
    '.cfxk button+button{background:transparent;color:var(--brand,#2563eb);border:1px solid var(--brand,#2563eb)}';
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
    antifalta: { tit: 'Anti-falta', pasos: [['fila', '📅 Pedro reservó y no llegó (2ª vez)'], ['fila', '🔒 Ahora debe pagar el abono para reservar'], ['izq', '💳 Pedro paga $3.000 de abono'], ['aviso', '✅ Llega a la hora: tu agenda no pierde plata']] },
    espera: { tit: 'Lista de espera', pasos: [['fila', '📅 Sábado: todo lleno'], ['izq', '🔔 Lucía: “Avísame si se libera una hora”'], ['fila', '❌ Diego anula su hora de las 12:00'], ['aviso', '🔔 Lucía recibe el aviso y la toma']] },
    resenas: { tit: 'Reseñas en Google', pasos: [['fila', '⭐⭐⭐⭐⭐ Lucía calificó su atención'], ['izq', '“¿Nos ayudas con tu reseña en Google?”'], ['der', '👍 Lucía la deja en 1 toque'], ['aviso', '📍 Más gente te encuentra en Google Maps']] },
    portafolio: { tit: 'Portafolio', pasos: [['fila', '📸 Subes la foto de tu mejor degradado'], ['izq', '👀 Lucía la ve en tu página de reservas'], ['aviso', '📅 “Quiero ese corte” → reserva']] },
    giftcards: { tit: 'Gift cards', pasos: [['fila', '🎁 Ana compra una gift card de $15.000'], ['der', '📲 Se la regala a su papá con código'], ['fila', '✂️ Él la canjea en caja'], ['aviso', '💰 Venta extra + cliente nuevo']] },
    membresia: { tit: 'Membresía', pasos: [['fila', '🔁 Plan 4 cortes al mes · $25.000'], ['izq', '👨 Diego se suscribe'], ['fila', '✂️ Corte 1 de 4 usado'], ['aviso', '💰 Plata segura todos los meses']] },
    productos: { tit: 'Productos y stock', pasos: [['fila', '🧴 Pomada mate · stock 8'], ['der', '💵 Vendes 1 en la caja con el corte'], ['fila', '📦 Stock 7 · te avisamos cuando queden 2'], ['aviso', '💰 +$8.990 en la venta']] },
    presupuesto: { tit: 'Presupuesto por link', pasos: [['fila', '🔧 Revisaste la bici: cadena $18.000 · pastillas $9.000'], ['der', '📲 Le llega el link a Pedro'], ['izq', '✅ Cadena: Sí · ❌ Pastillas: No'], ['aviso', '✅ Trabajas solo lo aprobado: total $18.000']] },
    aviso_lista: { tit: 'Aviso “bici lista”', pasos: [['fila', '🚦 Mueves la bici de Pedro a “Lista”'], ['der', '📲 “Pedro, tu bici está lista ✅ Total $27.000 · ver detalle 👉 link”'], ['fila', '⏳ Pasan 2 días y no la retira…'], ['aviso', '🔔 Le recordamos solo: menos bicis ocupando espacio']] },
    mantencion: { tit: 'Recordatorio de mantención', pasos: [['fila', '🔧 Pedro hizo mantención en marzo'], ['fila', '📅 Pasan 4 meses…'], ['izq', '🔔 “Pedro, a tu bici le toca mantención. Reserva aquí 👉”'], ['aviso', '✅ Pedro vuelve solo: $25.000 más']] },
    certificadas: { tit: 'Bicis usadas certificadas', pasos: [['fila', '🔍 Revisas la Trek usada: 50 de 50 puntos ✅'], ['fila', '📸 3 fotos · 🛡️ garantía 3 meses · $380.000'], ['der', '🏷️ Queda publicada en tu página con su informe'], ['izq', '📲 “Hola, me interesa la Trek. ¿Aceptas $350.000?”'], ['aviso', '💰 Vendes la bici con confianza: trae su “papel”']] },
    tradein: { tit: 'Parte de pago', pasos: [['fila', '🚲 Pedro trae su Oxford 2021 · buena'], ['der', '🔄 Calculadora: se vende en $220.000 · arreglos $30.000'], ['fila', '💵 Ofrécele $135.000 en parte de pago'], ['izq', '👍 Pedro acepta y se lleva una nueva'], ['aviso', '✅ Vendes más y ganas al revenderla']] },
    pasaporte: { tit: 'Pasaporte de la bici', pasos: [['fila', '🪪 Le pegas el sticker QR al cuadro de la bici de Pedro'], ['fila', '🔧 Cada mantención queda en su historial'], ['izq', '🚨 A Pedro le roban la bici: la reporta en 1 toque'], ['der', '📱 Alguien escanea el QR: “REPORTADA COMO ROBADA”'], ['aviso', '✅ Bici más segura y Pedro vuelve siempre a tu taller']] },
    domicilio: { tit: 'Mecánico a domicilio', pasos: [['izq', '🏠 Pedro reserva: “Vengan a mi casa” · Av. Grecia 1234'], ['fila', '🚐 Visita a domicilio +$5.000'], ['fila', '🗺️ Tu ruta del día: 3 visitas en orden'], ['der', '📲 “Pedro, vamos en camino 🚐”'], ['aviso', '✅ Cobras más y llegas a quien no puede venir']] },
    garantias: { tit: 'Garantías', pasos: [['fila', '🎉 Entregas la bici de Pedro: 🛡️ Garantía 3 meses del trabajo'], ['der', '📲 “Pedro, tu garantía vale hasta el 16/02”'], ['izq', '😟 Al mes suena el cambio: Pedro toca 🛡️ Usar mi garantía'], ['fila', '🔔 Te llega el aviso y lo resuelves'], ['aviso', '✅ El cliente confía y vuelve a tu taller']] },
    acuerdo: { tit: 'Acuerdo de pago firmado', pasos: [['fila', '📝 Juan te debe $90.000: arma 3 cuotas de $30.000, una al mes'], ['der', '📲 “Juan, revisa y acepta tu acuerdo de pago”'], ['izq', '✍️ Juan escribe su nombre y toca Acepto'], ['fila', '✅ Acuerdo firmado el 17/11 con su calendario'], ['aviso', '🤝 Sin “yo no acordé eso”: queda todo por escrito']] },
    contador: { tit: 'Link para el contador', pasos: [['fila', '🧮 Activas el link del contador'], ['der', '📲 Se lo mandas una vez por WhatsApp'], ['izq', '📊 Tu contador ve ventas, gastos y cobros de cada mes'], ['fila', '⬇️ Baja la planilla para Excel'], ['aviso', '✅ Nada de pantallazos ni fotos de cuadernos']] },
    escalonado: { tit: 'Cobranza escalonada', pasos: [['fila', '📅 María lleva 3 días atrasada → mensaje 😊 amable'], ['fila', '📅 A los 10 días → 😐 neutral'], ['fila', '📅 A los 25 días → 😠 firme (con respeto y en horario)'], ['der', '💬 Tú solo tocas Enviar: el tono lo elige la app'], ['aviso', '💰 Cobras más sin pelear']] },
    gastos_fijos: { tit: 'Gastos fijos automáticos', pasos: [['fila', '🔁 Arriendo $250.000 · día 5 de cada mes'], ['fila', '🔁 Luz $35.000 · día 20'], ['izq', '📅 Llega el 5: el arriendo ya está anotado en tu caja'], ['aviso', '✅ Tu balance del mes siempre cuadra']] },
    destacar: { tit: 'Destacado en el mapa', pasos: [['fila', '⭐ Tu estacionamiento sale con borde dorado'], ['izq', '🔎 Quien busca cerca lo ve primero en la lista'], ['der', '📲 “Reservé tu lugar para mañana”'], ['aviso', '💰 Más reservas con el mismo lugar']] },
    acceso: { tit: 'Control de acceso con QR', pasos: [['izq', '🚗 Llega Pedro con su reserva'], ['fila', '📷 Escaneas su pase QR'], ['fila', '✅ VIGENTE · patente ABCD12 · hasta las 18:00'], ['fila', '🕐 Entrada 09:02 · Salida 17:45 anotadas'], ['aviso', '🔒 Nadie entra sin reserva']] },
    descuentos: { tit: 'Descuento por estadía larga', pasos: [['fila', '🏷️ Desde 5 días: 10 % menos'], ['izq', '🔎 Ana ve “-10 % reservando 5 días o más”'], ['der', '✅ Reserva 7 días en vez de 3'], ['aviso', '💰 Lugar ocupado más tiempo']] },
    suscripciones: { tit: 'Compras recurrentes', pasos: [['fila', '🔁 Ana · 1 kg de café cada 15 días · $12.000'], ['izq', '🔔 “Mañana toca tu compra: $12.000”'], ['fila', '📅 Llega el día: se crea solo y ⚡ se cobra con su tarjeta'], ['aviso', '💰 $24.000 al mes seguros, sin pedirlos']] },
    courier: { tit: 'Courier Chilexpress', pasos: [['fila', '📦 Pedido de Ana · despacho a Temuco'], ['der', '💲 Cotizas: Express $5.990 · Día hábil $4.990'], ['aviso', '🏷️ Etiqueta lista para imprimir'], ['izq', '🚚 A Ana le llega su código de seguimiento']] },
    mercadolibre: { tit: 'Mercado Libre', pasos: [['fila', '🛒 Vendiste 2 × Polera en Mercado Libre'], ['aviso', '📦 Tu stock baja solo: 10 → 8'], ['der', '✏️ Cambias el stock en la Caja'], ['aviso', '✅ Mercado Libre se actualiza solo']] },
    proveedores: { tit: 'Stock mínimo y proveedores', pasos: [['fila', '📦 Harina: mínimo 10 · quedan 4'], ['aviso', '⚠️ Bajó de su mínimo'], ['der', '💬 “Hola Don Juan, necesito: 16 × Harina, 12 × Azúcar”'], ['aviso', '✅ Pedido al proveedor en 1 toque']] },
    sucursales: { tit: 'Sucursales y bodegas', pasos: [['fila', '🏬 Centro: 12 · Mall: 5 · Bodega: 30'], ['izq', '🛒 Venta en la Caja del Mall → baja solo ahí'], ['fila', '⇄ Mover 10 de Bodega a Mall'], ['aviso', '✅ Sabes qué hay en cada local']] },
    estudio: { tit: 'Estudio de contenido', pasos: [['fila', '🎯 Objetivo: 💰 Vender · Instagram'], ['der', '🎣 “Estás perdiendo plata por esto: el freno chilla”'], ['fila', '🎬 Guión por segundos · copy · #hashtags · 📋 Copiar'], ['aviso', '📊 Tus reels de los viernes 19:00 rinden ▲ 140 %']] },
    promos: { tit: 'Promo destacada', pasos: [['fila', '📣 “2x1 en cortes este jueves” + foto'], ['izq', '📱 Tus clientes la ven al abrir la app'], ['barras', [['Vieron', 80], ['Tocaron', 35]]], ['aviso', '✅ 28 la vieron · 12 la tocaron']] },
    ganancias: { tit: 'Ganancias y ocupación', pasos: [['fila', '📊 Noviembre: $186.000 · 42 reservas'], ['fila', '📈 Ocupación: Lugar centro 78 % · Lugar casa 35 %'], ['fila', '📅 Tu mejor día: viernes'], ['aviso', '⬇️ Planilla para Excel con un toque']] },
    plan_mant: { tit: 'Plan de mantención', pasos: [['fila', '🔁 Plan Rodador · $15.000 al mes · 1 mantención + 10% en repuestos'], ['izq', '🚲 Pedro se suscribe y paga 3 meses'], ['fila', '🔧 Trae la bici: ✅ Usar el plan · total -10%'], ['der', '📲 “Pedro, tu plan vence el 16/02: ¿lo renovamos?”'], ['aviso', '💰 Plata segura cada mes y Pedro vuelve siempre']] },
    stock: { tit: 'Repuestos y stock', pasos: [['fila', '⛓️ Cadena 11v · stock 3'], ['der', '🔧 La usas en la orden de Pedro'], ['fila', '📦 Stock 2 · quedan pocas'], ['izq', '📲 Pedido listo a tu proveedor: 5 cadenas 11v'], ['aviso', '✅ Nunca te quedas sin repuestos']] },
    agenda_redes: { tit: 'Reservas desde tus redes', pasos: [['izq', '📲 Instagram: “¿Tienes hora hoy?”'], ['der', '🤖 Respuesta lista: “Reserva aquí 👉 tu link”'], ['fila', '📅 Reserva hecha en 30 segundos'], ['aviso', '✅ Sin contestar uno por uno']] },
    cuentas_pagar: { tit: 'Cuentas por pagar', pasos: [['fila', '📤 Distribuidora Sur · $120.000 · vence el 30'], ['aviso', '🔔 “Vence en 3 días”'], ['fila', '✅ Pagar → 🏦 Transferencia'], ['aviso', '💰 Queda como gasto en tu caja']] },
    cierre_caja: { tit: 'Cierre de caja', pasos: [['fila', '💵 Partiste con $20.000'], ['fila', '➕ Ventas $85.000 · ➕ Abonos $30.000 · ➖ Gastos $15.000'], ['fila', '🧮 Debería haber $120.000 · contaste $118.000'], ['aviso', '⬇️ Faltan $2.000 · queda anotado']] },
    aviso_vence: { tit: 'Aviso de vencimiento', pasos: [['fila', '📅 La cuota de María vence mañana'], ['der', '🔔 “Tu pago vence mañana: $25.000 · paga desde tu link”'], ['izq', '💳 María sube su comprobante'], ['aviso', '✅ Cobraste sin escribir nada']] },
    tarifas: { tit: 'Tarifa fin de semana y noche', pasos: [['fila', '🌙 Sábado y domingo +20 % · noche −10 %'], ['izq', '🚗 Ana reserva el sábado 4 horas'], ['fila', '💲 $2.000 → $2.400 la hora'], ['aviso', '💰 Ganas más cuando más te buscan']] },
    frecuentes: { tit: 'Clientes frecuentes', pasos: [['fila', '🥇 Pedro · 12 reservas · $186.000'], ['fila', '🎁 Premio: 10 % menos desde la 3.ª reserva'], ['izq', '🔁 “¡Me sale más barato aquí!”'], ['aviso', '✅ Pedro vuelve siempre contigo']] },
    calendario: { tit: 'Cerrar fechas', pasos: [['fila', '⛔ Cerrado del 20/12 al 05/01 · vacaciones'], ['izq', '🔎 Ana ve las fechas cerradas en la ficha'], ['aviso', '✅ Nadie reserva cuando no estás']] },
    avisame: { tit: 'Lista de espera', pasos: [['fila', '🚗 Tu lugar mensual está ocupado'], ['izq', '🔔 3 personas: “Avísame cuando se libere”'], ['fila', '✅ Lo marcas Disponible'], ['aviso', '📲 Les llega el aviso y lo arriendan al tiro']] },
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
    const puedeProbar = !activo && puedePrueba(D, pack || mod, !!pack);  // G95: vuelve 🎁 (G25 lo había quitado), una vez por correo
    const usada = !activo && D.dueno && (pack ? D.prueba_pack : mod.prueba_usada && !mod.plan);
    const d = document.createElement('dialog'); d.className = 'cfxd';
    d.innerHTML = '<div><button type="button" class="cfxd-x" data-x aria-label="Cerrar">✕</button><h2>' + esc(x.nombre) + '</h2><p class="cfxd-sub">' + esc(x.detalle) + '</p>' +
      (pack ? '<div class="cfxd-chips">' + lista.map((m, i) => '<button type="button" data-i="' + i + '">' + esc(m.nombre) + '</button>').join('') + '</div>' : '') +
      // G142 a: 🎁 arriba (a la vista sin desplazar) y, si ese correo ya lo probó, se DICE (no desaparece en silencio).
      (puedeProbar ? '<div class="cfxd-btns cfxd-top"><button type="button" class="si" data-gratis>🎁 Probar ' + D.prueba_dias + ' días gratis</button></div>' : '') +
      (usada ? '<p class="cfxd-usada">' + USADA + '</p>' : '') +
      '<div class="cfxd-esc" aria-live="polite"></div><p class="cfxd-ej">▶️ Ejemplo con datos inventados: no usa ni cambia nada de tu negocio. <a href="#" data-otra>Ver otra vez</a></p>' +
      (x.precio ? '<p class="cfxd-precio">' + pesos(x.precio) + '<small>/mes</small></p>' : '') +
      '<div class="cfxd-btns">' +
      (activo ? '' : D.dueno && !pack && mod.regalo && D.campana ? '<button type="button" class="si" data-regalo>🎁 Activar gratis ' + D.campana.meses + (D.campana.meses === 1 ? ' mes' : ' meses') + '</button>'
        : D.dueno ? '<button type="button" class="' + (puedeProbar ? '' : 'si') + '" data-comprar>Comprar</button>' : '<p class="cfxd-sub" style="text-align:center">Pídele al dueño del negocio que lo active en 🧩 Módulos.</p>') +
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
      const rg = ev.target.closest('[data-regalo]');
      if (rg) { if (await activarRegalo(o.rpc, x.clave, rg)) { cerrar(); if (o.alCambiar) o.alCambiar(); } return; }
      if (ev.target.closest('[data-comprar]')) {
        cerrar();
        if (window.CFX_PAGOS) window.CFX_PAGOS.abrir({ rpc: o.rpc, producto: { clave: x.clave, nombre: x.nombre, mensual: x.precio, anual: x.precio * D.anual_meses, links: D.descuento ? null : x.links }, alPagar: () => o.alCambiar && o.alCambiar() });
        return;
      }
      const g = ev.target.closest('[data-gratis]'); if (!g) return;
      g.disabled = true;
      try {
        const r = await o.rpc('cfx_modulo_probar', { p_item: x.clave });
        aviso('🎁 ¡Listo! Gratis hasta el ' + fecha(r.hasta));
        cerrar(); if (o.alCambiar) o.alCambiar();
      } catch (e) { g.disabled = false; d.querySelector('.cfxd-err').textContent = (e && e.message) || String(e); }
    });
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    ver(0);
    return d;
  }
  // En la pantalla de un módulo que el negocio no tiene: aviso + 🎁 Probar N días (G95, si no la usó) + ▶️ Ver demo. false = no se vende (apagado desde el Centro de Mando).
  async function candado(el, clave, o) {
    o = o || {};
    let D = null;
    try { D = await o.rpc('cfx_modulos_tienda'); } catch (x) { return false; }
    const m = D && D.activo && (D.modulos || []).find((x) => x.clave === clave && x.vende);
    if (!m || m.activo) return false;
    el.innerHTML = '<div class="cfxk"><div class="ico">🧩</div><h2>' + esc(m.nombre) + '</h2><p>' + esc(m.detalle) + '</p>' +
      '<p><b>Este módulo no está activo en tu negocio.</b></p>' + (m.prueba_usada && D.dueno ? '<p class="cfxd-usada">' + USADA + '</p>' : '') +
      (puedePrueba(D, m) ? '<button type="button" data-gratis>🎁 Probar ' + D.prueba_dias + ' días gratis</button> ' : '') + '<button type="button" data-demo>▶️ ' + (m.prueba_usada ? 'Ver y comprar' : 'Ver demo') + '</button></div>';
    el.querySelector('[data-demo]').onclick = () => probar(clave, Object.assign({}, o, { datos: D }));
    const g = el.querySelector('[data-gratis]');
    if (g) g.onclick = async () => { if (await activarPrueba(o.rpc, clave, g)) { if (o.alCambiar) o.alCambiar(); else location.reload(); } };
    return true;
  }
  window.CFX_MODULOS_TIENDA = { montar, probar, candado, prueba };
})();
