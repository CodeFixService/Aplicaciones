/* CodeFix · Núcleo · Pagar Premium (mismo archivo en cada repositorio). Precios, Mercado Pago, link y transferencia vienen de la base
   (cfx_pago_estado), y se editan una sola vez para las 7 apps en el Centro de Mando → Pagos.
   CFX_PAGOS.abrir({ rpc })            → elegir plan (1 mes, 3 meses o 1 año), pagar y subir el comprobante, paso a paso:
                                          1) paga el total  2) saca pantallazo  3) súbelo  4) espera 5–10 min (te avisamos).
                                          Transferencia = precio exacto. Mercado Pago o link = precio + "cargo por pago online (X %)" en una línea aparte.
   CFX_PAGOS.abrir({ rpc, producto })  → G19: comprar un módulo o pack. producto = { clave, nombre, mensual, anual, links: { m, a } } (1 mes o 1 año;
                                          links = link de pago con el monto fijo, si el administrador lo puso). Al aprobarlo se activa solo ese módulo.
                                          G28 (M2): el link general es ABIERTO (sin monto) y sirve para todo: se muestra el total con 📋 Copiar monto.
                                          Un link de monto fijo, si existe para ese plan, se usa en su lugar.
   G85: ⚡ Mercado Pago automático (si CodeFix lo conectó en CM → Pagos): paga y se activa solo, sin comprobante (aviso push).
        Solo 3 formas: ⚡ Mercado Pago · 🔗 link general (abierto) · 🏦 transferencia. Cupón a la vista. Ya no hay links de monto fijo ni tarjeta aparte.
   G38: ⚡ Flow (Webpay débito/crédito, transferencia o MACH) como 2.º pago automático, igual que Mercado Pago (cfx_flow_pagar).
   G95: arriba de la hoja ⭐ Premium, "🎁 Probar Premium N días gratis" (cfx_pro_probar) si la cuenta nunca lo usó con su correo; al Continuar recarga.
   G108: 🔁 "Renovar solo cada mes/año" (1 mes o 1 año con ⚡ Mercado Pago): cfx_mp_suscribir → MP autoriza la tarjeta 1 vez y cobra solo;
        arriba se ve "🔁 Se renueva solo · Quitar" (cfx_mp_sub_quitar). Cada cobro = pago aprobado (cfx_mp_sub_cobro).
   CFX_PAGOS.mpVolver(rpc)             → al volver de Mercado Pago (lo llama ayuda.js al iniciar): confirma el pago y avisa.
   CFX_PAGOS.revisar({ rpc, salir })   → si es un negocio nuevo que debe su primer pago, muestra la pantalla de activación (no se cierra).
   rpc(nombre, args) debe devolver una promesa con los datos (cada app pasa su propia función). */
(function () {
  'use strict';
  if (window.CFX_PAGOS) return;
  const AQUI = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  const css = document.createElement('style');
  css.textContent =
    'dialog.cfx-pago{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
    'dialog.cfx-pago::backdrop{background:transparent}' +
    '.cfx-pago>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box}' +
    '@media(min-width:600px){.cfx-pago{align-items:center}.cfx-pago>div{border-radius:20px}}' +
    '.cfx-pago h2{margin:0 0 4px;font-size:20px}.cfx-pago p{margin:6px 0;color:var(--cfx-texto-2,#5b6472);font-size:14px;line-height:1.4}' +
    '.cfx-pago .cp-planes{display:grid;gap:8px;margin:12px 0}.cfx-pago .cp-plan{display:flex;align-items:center;gap:10px;border:2px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:10px 12px;cursor:pointer;background:var(--cfx-campo,#f7f9fb)}' +
    '.cfx-pago .cp-plan.on{border-color:var(--cp-color)}.cfx-pago .cp-plan b{flex:1}.cfx-pago .cp-plan small{display:block;font-weight:400;color:var(--cfx-texto-2,#5b6472)}.cfx-pago .cp-precio{font-weight:800;font-size:17px}' +
    '.cfx-pago .cp-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:6px;margin:12px 0 8px}.cfx-pago .cp-tabs button{min-width:0;min-height:56px;padding:4px 2px;font-size:13px;line-height:1.15;white-space:nowrap;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}.cfx-pago button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;padding:0 12px;background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto,#111827)}' +
    '.cfx-pago button.cp-si,.cfx-pago .cp-tabs button.on{background:var(--cp-color);color:#fff}.cfx-pago button:disabled{opacity:.6}' +
    '.cfx-pago .cp-caja{border:1px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:12px;margin:8px 0}.cfx-pago .cp-monto{font-size:28px;font-weight:800;margin:2px 0}' +
    '.cfx-pago .cp-fila{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.cfx-pago .cp-fila>*{flex:1 1 140px}.cfx-pago a.cp-btn{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:10px 14px;box-sizing:border-box;border-radius:12px;background:var(--cp-color);color:#fff;font-weight:700;line-height:1.2;text-align:center;text-decoration:none}' +
    '.cfx-pago .cp-caja .cp-fila>*{flex:1 1 100%;min-height:44px;margin:0}' +
    '.cfx-pago summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--cfx-texto-2,#5b6472)}.cfx-pago label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}.cfx-pago input{width:100%;box-sizing:border-box;min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:8px 12px}' +
    '.cfx-pago .cp-err{color:var(--cfx-mal,#dc2626);font-weight:600;min-height:1em}.cfx-pago .cp-ok{background:color-mix(in srgb,var(--cfx-ok,#16a34a) 14%,transparent);border-radius:12px;padding:10px 12px;margin:10px 0}' +
    '.cfx-pago .cp-dato{display:flex;align-items:center;gap:8px;font-size:14px;padding:5px 0;border-top:1px dashed var(--cfx-borde,#e2e7ec)}.cfx-pago .cp-dato:first-of-type{border-top:0}.cfx-pago .cp-dato span{color:var(--cfx-texto-2,#5b6472);min-width:84px}.cfx-pago .cp-dato b{flex:1;word-break:break-all}' +
    '.cfx-pago .cp-dato button{min-height:34px;padding:0 10px;font-size:13px;flex:none}.cfx-pago img.cp-vista{max-width:100%;max-height:180px;border-radius:10px;margin-top:8px}' +
    '.cfx-pago .cp-pasos{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:10px 0;counter-reset:p}.cfx-pago .cp-pasos div{font-size:11.5px;line-height:1.25;text-align:center;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-pago .cp-pasos div::before{counter-increment:p;content:counter(p);display:flex;align-items:center;justify-content:center;width:26px;height:26px;margin:0 auto 4px;border-radius:50%;background:var(--cp-color);color:#fff;font-weight:800;font-size:13px}' +
    '.cfx-pago .cp-linea{display:flex;justify-content:space-between;font-size:14px;padding:2px 0}.cfx-pago .cp-linea.total{font-weight:800;font-size:16px;border-top:1px solid var(--cfx-borde,#e2e7ec);margin-top:4px;padding-top:6px}' +
    '.cfx-pago .cp-ayuda{font-size:13px;background:var(--cfx-campo,#f7f9fb);border-radius:10px;padding:8px 10px;margin:8px 0}.cfx-pago select{width:100%;min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:0 10px}';
  css.textContent +=
    '.cfx-pago .cp-cupon{display:flex;align-items:center;gap:8px;border:2px dashed color-mix(in srgb,var(--cp-color) 55%,transparent);background:color-mix(in srgb,var(--cp-color) 7%,transparent);border-radius:14px;padding:8px 10px;margin:10px 0}' +
    '.cfx-pago .cp-cupon>span{font-size:22px;flex:none}.cfx-pago .cp-cupon input{flex:1 1 auto;min-width:0;min-height:42px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}' +
    '.cfx-pago .cp-cupon button{flex:none;min-height:42px;padding:0 14px}.cfx-pago .cp-cupon.on{border-style:solid;border-color:var(--cfx-ok,#16a34a);background:color-mix(in srgb,var(--cfx-ok,#16a34a) 12%,transparent)}' +
    '.cfx-pago .cp-cupon.on b{flex:1;min-width:0;font-size:15px}.cfx-pago .cp-cupon.on small{display:block;font-weight:500;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-pago .cp-plan s{display:block;font-size:12px;font-weight:500;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-pago a.cp-mp,.cfx-pago button.cp-mp{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:14px;background:#009ee3;color:#fff;font-weight:800;font-size:16px;text-decoration:none;margin-top:10px;cursor:pointer}' +
    '.cfx-pago .cp-pasos.tres{grid-template-columns:repeat(3,1fr)}.cfx-pago button.cp-flow{background:var(--cp-color)}' +
    '.cfx-pago .cp-tabs:has(>:nth-child(4)){grid-template-columns:repeat(2,minmax(0,1fr))}.cfx-pago .cp-tabs:has(>:nth-child(4)) button{min-height:48px;flex-direction:row;gap:6px}';
  document.head.appendChild(css);
  const MP_KEY = 'cfx-mp-pago';
  const AUTO = { mp: 'Mercado Pago', flow: 'Flow' };  // G38: pagos que se activan solos
  const mpMarca = (v) => { try { if (v) localStorage.setItem(MP_KEY, String(Date.now())); else localStorage.removeItem(MP_KEY); } catch (e) { /* sin almacenamiento */ } };
  const mpMarcado = () => { try { const t = +localStorage.getItem(MP_KEY) || 0; return t && Date.now() - t < 2 * 864e5; } catch (e) { return false; } };

  const esc = (s) => window.CFX_ESC(s);  // seguro.js (núcleo)
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || '#2563eb';
  async function copiar(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } }

  // Achica la foto del comprobante en el teléfono (núcleo: fotos.js → comprobante).
  function achicar(file) {
    if (window.CFX_ACHICAR) return window.CFX_ACHICAR(file, 'comprobante'); // núcleo fotos.js (WebP o JPEG)
    const q = (window.CFX_FOTO_DE && window.CFX_FOTO_DE('comprobante')) || { lado: 1000, calidad: 0.6 };
    return new Promise((ok, mal) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, q.lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        let cal = q.calidad, d = c.toDataURL('image/jpeg', cal);
        while (d.length > 380000 && cal > 0.3) { cal -= 0.1; d = c.toDataURL('image/jpeg', cal); }
        // Si aún pesa mucho (fotos gigantes), se achica el tamaño hasta que quepa: el servidor acepta hasta ~290 KB.
        while (d.length > 380000 && c.width > 400) {
          const c2 = document.createElement('canvas'); c2.width = Math.round(c.width * 0.8); c2.height = Math.round(c.height * 0.8);
          const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, c2.width, c2.height); g2.drawImage(c, 0, 0, c2.width, c2.height);
          c.width = c2.width; c.height = c2.height; g.drawImage(c2, 0, 0); d = c.toDataURL('image/jpeg', 0.5);
        }
        ok(d);
      };
      img.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se pudo leer la foto. Sube un pantallazo (JPG o PNG) del comprobante.')); };
      img.src = u;
    });
  }

  function planes(e, pr) {
    if (pr) return [{ k: 'mensual', t: '1 mes', d: '30 días de ' + pr.nombre, p: pr.mensual },
      pr.anual && { k: 'anual', t: '1 año', d: '365 días' + (pr.mensual && pr.anual < pr.mensual * 12 ? ' · ahorras ' + Math.round(100 - pr.anual * 100 / (pr.mensual * 12)) + '%' : ''), p: pr.anual }].filter(Boolean);
    const c = e.config || {}, n = c.negocio || {}, cl = c.cliente || {}, rol = e.yo && e.yo.rol;
    const ahorro = (m, a) => (m && a && a < m * 12) ? ' · ahorras ' + Math.round(100 - a * 100 / (m * 12)) + '%' : '';
    // Solo 3 planes (igual que los links de pago): 1 mes, 3 meses y 1 año. El primer pago es el de 1 mes y da 30 días.
    const base = rol === 'cliente' ? cl : n;
    const l = [];
    if (rol === 'negocio' && e.debe_inicio) l.push({ k: 'inicio', t: '1 mes', d: (n.inicio_dias || 30) + ' días de Premium', p: n.inicio || n.mensual });
    else if (base.mensual) l.push({ k: 'mensual', t: '1 mes', d: '30 días de Premium', p: base.mensual });
    if (base.mensual) l.push({ k: 'meses', t: '3 meses', d: '90 días de Premium', p: base.mensual, m: 3 });
    if (base.anual) l.push({ k: 'anual', t: '1 año', d: '365 días de Premium' + ahorro(base.mensual, base.anual), p: base.anual });
    return l;
  }

  // Es un <dialog> modal: queda por encima de todo. Si es obligatorio y otra ventana se abre encima (una guía, un aviso), vuelve al frente.
  let abierta = null, vigia = null;
  function cerrar() { clearInterval(vigia); if (abierta) { try { abierta.close(); } catch (e) { /* nada */ } abierta.remove(); abierta = null; } }
  function alFrente(capa) {
    vigia = setInterval(() => {
      if (!capa.isConnected) return clearInterval(vigia);
      const otras = [...document.querySelectorAll('dialog[open]')].filter((d) => d !== capa && !d.classList.contains('cfx-ayuda'));  // el chat y los términos sí pueden ir encima
      if (otras.length || !capa.open) { otras.forEach((d) => { try { d.close(); } catch (e) { /* nada */ } }); try { capa.close(); capa.showModal(); } catch (e) { /* nada */ } }
    }, 400);
  }

  async function abrir(o) {
    o = o || {};
    if (!o.rpc) throw new Error('CFX_PAGOS necesita rpc');
    cerrar();
    const capa = document.createElement('dialog'); capa.className = 'cfx-pago'; capa.style.setProperty('--cp-color', color());
    capa.innerHTML = '<div><p>Cargando…</p></div>';
    document.body.appendChild(capa); abierta = capa; capa.showModal();
    const caja = capa.firstChild;
    let e;
    try { e = await o.rpc('cfx_pago_estado'); } catch (x) { caja.innerHTML = '<p class="cp-err">' + esc(x.message || x) + '</p><button type="button" data-x>Cerrar</button>'; caja.querySelector('[data-x]').onclick = cerrar; return; }
    // comoNegocio: la app pide el pago de negocio aunque la cuenta aún no lo sea (Estaciona: al publicar el primer estacionamiento).
    if (o.comoNegocio && e.yo && e.yo.rol === 'cliente') e.yo.rol = 'negocio';
    const pr = o.producto || null;  // G19: módulo o pack (nunca obligatorio)
    let obligatorio = !pr && !!(o.obligatorio || e.bloqueado || (o.comoNegocio && e.debe_inicio));
    const c = e.config || {}, t = c.transferencia || {};
    // G85: un solo pago general para las 7 apps: ⚡ Mercado Pago automático, 🔗 link general abierto y 🏦 transferencia.
    const PCT = { mp: Number(c.comision_pct) || 0, flow: Number(c.comision_pct) || 0, link: Number(c.comision_pct) || 0, transferencia: 0 };
    const L = planes(e, pr), medios = [e.mp ? 'mp' : null, e.flow ? 'flow' : null, c.link ? 'link' : null, t.numero ? 'transferencia' : null].filter(Boolean);
    const NOMBRE_MEDIO = { mp: '⚡ Mercado Pago', flow: '💳 Webpay', link: '🔗 Link de pago', transferencia: '🏦 Transferencia' };
    let plan = L[0], medio = medios[0], foto = null;
    const ayudaChat = window.CFX_AYUDA ? '<p style="text-align:center"><a href="#" data-chat>💬 ¿Dudas? Escríbenos por el chat</a></p>' : '';
    const pie = (obligatorio ? (o.salir ? '<button type="button" data-salir style="width:100%;margin-top:10px">' + esc(o.salirTexto || 'Cerrar sesión') + '</button>' : '') : '<button type="button" data-x style="width:100%;margin-top:10px">Ahora no</button>') +
      ayudaChat + (c.whatsapp ? '<p style="text-align:center"><a href="https://wa.me/' + esc(String(c.whatsapp).replace(/\D/g, '')) + '" target="_blank" rel="noopener">¿Prefieres WhatsApp? Escríbenos</a></p>' : '') +
      (window.CFX_AYUDA ? '<p style="text-align:center;font-size:12px">Al pagar aceptas los <a href="#" data-terminos>Términos y condiciones</a>.</p>' : '');
    const u = e.ultimo;
    // G108 🔁 renovación automática (preapproval de MP) de ESTE producto (null = Premium).
    const miSub = (e.subs || []).find((s) => (s.producto || null) === (pr ? pr.clave : null)) || null;
    const cada = (k) => k === 'anual' ? 'cada año' : 'cada mes';
    const subHtml = () => !miSub ? '' : miSub.estado === 'pendiente'
      ? '<div class="cp-ok cp-sub"><b>⏳ Falta autorizar tu tarjeta</b><br><small>Renovación automática ' + cada(miSub.periodo) + ' · ' + pesos(miSub.monto) + '. Si ya la autorizaste en Mercado Pago, toca Revisar.</small>' +
        '<div class="cp-fila"><button type="button" class="cp-si" data-subrev>🔄 Ya autoricé, revisar</button><button type="button" data-subq>Quitar</button></div><p class="cp-err" id="cpSubErr" style="margin:4px 0 0;min-height:0"></p></div>'
      : '<div class="cp-ok cp-sub"><b>🔁 Se renueva solo ' + cada(miSub.periodo) + '</b> · ' + pesos(miSub.monto) + '<br><small>' + (miSub.estado === 'pausada' ? '⏸️ Pausada en Mercado Pago. ' : '') +
        (miSub.cobros ? miSub.cobros + (miSub.cobros === 1 ? ' cobro' : ' cobros') + ' · último el ' + fechaL(miSub.ultimo) : '1.er cobro el ' + fechaL(miSub.inicio)) + '. Si la quitas, lo pagado sigue activo hasta que venza.</small>' +
        '<div class="cp-fila"><button type="button" data-subq>Quitar renovación automática</button></div><p class="cp-err" id="cpSubErr" style="margin:4px 0 0;min-height:0"></p></div>';
    // G87 K: 🔑 keys que compré (🎁 regalo o respaldo): siempre a la vista para copiarlas.
    const misKeys = (e.keys || []).length ? '<details style="margin-top:8px"><summary>🎁 Mis keys compradas (' + e.keys.length + ')</summary>' + e.keys.map((k) =>
      '<div class="cp-dato"><span>' + esc(k.producto ? '🧩 ' + k.producto : '⭐ Premium') + ' · ' + (+k.dias || 0) + ' d' + (k.usada ? ' · ✓ usada' : '') + '</span><b>' + esc(k.key) + '</b><button type="button" data-copkey="' + esc(k.key) + '">Copiar</button></div>').join('') + '</details>' : '';
    const keyHtml = misKeys + '<details style="margin-top:8px"><summary>🔑 Tengo una key</summary><div class="cp-fila"><input id="cpKey" placeholder="CFX-XXXX-XXXX-XXXX" autocapitalize="characters"><button type="button" data-key>Activar</button></div><p class="cp-err" id="cpKeyErr"></p></details>';
    // G95: 🎁 Probar Premium N días gratis, una sola vez por correo (todos parten gratis). Sin tarjeta.
    let recargar = false;
    const prueba = () => !pr && !obligatorio && e.prueba_pro && e.prueba_pro.puede
      ? '<div class="cp-ok" style="text-align:center"><b>🎁 Prueba Premium ' + e.prueba_pro.dias + ' días gratis</b><br><small>Una sola vez. Sin tarjeta. Al terminar vuelves a gratis sin perder nada.</small>' +
        '<button type="button" class="cp-si" data-propro style="width:100%;margin-top:8px">🎁 Probar ' + e.prueba_pro.dias + ' días gratis</button><p class="cp-err" id="cpProErr" style="margin:4px 0 0;min-height:0"></p></div>' : '';
    const lib = e.liberado_hasta ? '<div class="cp-ok">🎁 Registro liberado hasta el <b>' + new Date(e.liberado_hasta).toLocaleDateString('es-CL') + '</b>: puedes usar la app sin pagar.</div>' : '';
    if (u && u.estado === 'pendiente' && AUTO[u.medio]) {
      // G85: abrió Mercado Pago (G38: o Flow): confirmar (por si ya pagó) o pagar de otra forma.
      caja.innerHTML = '<h2>⏳ Esperando tu pago</h2><div class="cp-ok">Abriste ' + AUTO[u.medio] + ' por <b>' + pesos(u.monto) + '</b>. Apenas ' + AUTO[u.medio] + ' lo apruebe, tu plan se activa solo y te llega un aviso.</div>' +
        '<button type="button" class="cp-si" data-mpver style="width:100%;margin-top:10px">🔄 Ya pagué, revisar</button><p class="cp-err" id="cpErr"></p>' +
        '<button type="button" data-mpotra style="width:100%;margin-top:8px">Pagar de otra forma</button>' + pie;
      caja.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-mpver],[data-mpotra]'); if (!b) return;
        b.disabled = true;
        try {
          if ('mpotra' in b.dataset) { await o.rpc('cfx_mp_cancelar'); mpMarca(false); return abrir(o); }
          const r = await o.rpc('cfx_mp_revisar');
          if (r && r.aprobado) { mpMarca(false); armarListo(caja, r.pago); obligatorio = false; clearInterval(vigia); if (o.alPagar) o.alPagar(); return; }
          caja.querySelector('#cpErr').textContent = AUTO[u.medio] + ' aún no lo aprueba. Si ya pagaste, espera 1 minuto: se activa solo.'; b.disabled = false;
        } catch (x) { caja.querySelector('#cpErr').textContent = (x && x.message) || String(x); b.disabled = false; }
      });
    } else if (u && u.estado === 'pendiente') {
      caja.innerHTML = '<h2>⏳ Pago en revisión</h2><div class="cp-ok">Recibimos tu comprobante de <b>' + pesos(u.monto) + '</b>. Normalmente lo revisamos en 5 a 10 minutos y te llega un aviso apenas se active.</div>' + pie;
    } else if (!medios.length) {
      caja.innerHTML = '<h2>' + (obligatorio ? 'Activa tu cuenta' : pr ? esc(pr.nombre) : '⭐ Hazte Premium') + '</h2>' + lib + prueba() + '<p>Los pagos aún no están configurados. Escríbenos y te ayudamos.</p>' + keyHtml + pie;
    } else {
      let cupon = null;  // { codigo, pct }: descuento sobre el precio del plan (no sobre "otro monto")
      const conCupon = (p) => cupon && !o._renovar ? Math.round(p * (100 - cupon.pct) / 100) : p;
      const base = () => plan.k === 'otro' ? Math.round(Number((caja.querySelector('#cpOtro') || {}).value || o._otro || 0)) : conCupon(plan.k === 'meses' ? plan.p * plan.m : plan.p);
      const cargo = () => Math.ceil(base() * PCT[medio] / 100);
      const monto = () => base() + cargo();
      const linea = (a, b, cls) => '<div class="cp-linea' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><b>' + b + '</b></div>';
      const datos = [['Titular', t.titular], ['RUT', t.rut], ['Banco', t.banco], ['Tipo de cuenta', t.tipo], ['N° de cuenta', t.numero], ['Correo', t.correo]].filter((x) => x[1]);
      const pintar = () => {
        const pc = PCT[medio], url = medio === 'link' ? c.link : '', mp = !!AUTO[medio];
        const ren = medio === 'mp' && (plan.k === 'mensual' || plan.k === 'anual') && !obligatorio && !miSub;
        if (!ren) o._renovar = false;
        const precio = (x) => x.k === 'meses' ? x.p * x.m : x.p;
        // 🏷️ Cupón bien a la vista (Premium; los módulos traen su propio descuento Premium).
        const cajaCupon = pr ? '' : cupon
          ? '<div class="cp-cupon on"><span>🏷️</span><b>Cupón ' + esc(cupon.codigo) + ' · −' + cupon.pct + '%<small>Ya está descontado del total</small></b><button type="button" data-sincupon>Quitar</button></div>'
          : '<div class="cp-cupon"><span>🏷️</span><input id="cpCupon" placeholder="¿Tienes cupón?" autocapitalize="characters" autocomplete="off" aria-label="Cupón de descuento"><button type="button" data-cupon>Aplicar</button></div>';
        caja.innerHTML = '<h2>' + (obligatorio ? '🚀 Activa tu cuenta' : pr ? esc(pr.nombre) : '⭐ Hazte Premium') + '</h2>' + lib + subHtml() + prueba() +
          (obligatorio ? '<p>Para empezar a usar la app haz tu primer pago. Te da ' + esc(plan.d) + '; después puedes seguir en Premium o quedar en la versión gratis.</p>' : '') +
          (mp ? '<div class="cp-pasos tres"><div>Toca Pagar</div><div>Paga en ' + AUTO[medio] + '</div><div>Se activa solo</div></div>'
            : '<div class="cp-pasos"><div>Paga el total</div><div>Saca un pantallazo</div><div>Súbelo aquí</div><div>Espera 5–10 min</div></div>') +
          (u && u.estado === 'rechazado' && !AUTO[u.medio] ? '<div class="cp-err">Tu último comprobante fue rechazado: ' + esc(u.motivo || '') + '</div>' : '') +
          '<div class="cp-planes">' + L.map((x, i) => '<div class="cp-plan' + (x === plan ? ' on' : '') + '" data-p="' + i + '"><b>' + esc(x.t) + '<small>' + esc(x.d) + '</small></b><span class="cp-precio">' +
            (x.p ? (cupon && x.k !== 'otro' ? '<s>' + pesos(precio(x)) + '</s>' + pesos(conCupon(precio(x))) : pesos(precio(x))) : '') + '</span></div>').join('') + '</div>' +
          (plan.k === 'otro' ? '<label for="cpOtro">Monto a pagar</label><input id="cpOtro" type="number" inputmode="numeric" min="1" placeholder="Ej: 10000">' : '') +
          cajaCupon +
          (medios.length > 1 ? '<div class="cp-tabs">' + medios.map((m) => '<button type="button" data-m="' + m + '" class="' + (m === medio ? 'on' : '') + '">' + NOMBRE_MEDIO[m] + '</button>').join('') + '</div>' : '') +
          (mp ? '<div class="cp-caja"><div id="cpDesglose">' + desglose() + '</div>' +
              (ren ? '<label class="cp-renovar" style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px"><input type="checkbox" id="cpRenovar"' + (o._renovar ? ' checked' : '') + ' style="width:auto;min-height:0"> 🔁 Renovar solo ' + cada(plan.k) + ' (se cobra a tu tarjeta; lo quitas cuando quieras)</label>' +
                (o._renovar ? '<label for="cpMpCorreo">Correo de tu cuenta de Mercado Pago</label><input id="cpMpCorreo" type="email" inputmode="email" autocomplete="email" value="' + esc(o._mpCorreo || (e.yo && e.yo.email) || '') + '">' : '') : '') +
              (obligatorio || plan.k === 'inicio' || o._renovar ? '' : '<label class="cp-regalo" style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px"><input type="checkbox" id="cpRegalo"' + (o._regalo ? ' checked' : '') + ' style="width:auto;min-height:0"> 🎁 Es para otra cuenta (te damos una key para regalar)</label>') +
              (medio === 'flow' ? '<button type="button" class="cp-mp cp-flow" data-mp>💳 Pagar con Webpay</button>' : (o._renovar ? '<button type="button" class="cp-mp" data-mp>🔁 Autorizar en Mercado Pago</button>' : '<button type="button" class="cp-mp" data-mp>⚡ Pagar con Mercado Pago</button>')) +
              (o._renovar ? '<div class="cp-ayuda">Autorizas tu tarjeta <b>1 vez</b> en Mercado Pago (entra con la cuenta de ese correo). Se cobra sola ' + cada(plan.k) + ' y tu plan se extiende solo (te llega un aviso).' + (cupon ? ' El cupón es solo para un pago suelto.' : '') + '</div><p class="cp-err" id="cpErr"></p></div>' + (pr ? '' : keyHtml) + pie : '') +
              (o._renovar ? '' : '<div class="cp-ayuda">' + (medio === 'flow' ? 'Pagas en Flow con Webpay (débito, crédito o prepago), transferencia o MACH.' : 'Pagas con tarjeta, débito o saldo de Mercado Pago.') + ' Al terminar vuelves a la app y tu plan <b>se activa solo, al tiro</b> (te llega un aviso). Sin comprobante.</div><p class="cp-err" id="cpErr"></p></div>' + (pr ? '' : keyHtml) + pie)
          : '<div class="cp-caja"><div id="cpDesglose">' + desglose() + '</div><div class="cp-fila"><button type="button" data-copiar>📋 Copiar monto</button>' +
            (medio === 'link' && url ? '<a class="cp-btn" href="' + esc(url) + '" target="_blank" rel="noopener">🔗 Abrir link de pago</a>' : '') + '</div>' +
          (medio === 'transferencia'
            ? '<div class="cp-ayuda">Copia cada dato, abre la app de tu banco y pégalo (mantén presionado el campo → <b>Pegar</b>). La transferencia no tiene cargo extra.</div>' +
              datos.map((x, i) => '<div class="cp-dato"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b>' + (/^(Banco|Tipo de cuenta)$/.test(x[0]) ? '' : '<button type="button" data-d="' + i + '">Copiar</button>') + '</div>').join('')
            : !url ? '<div class="cp-err">Este plan aún no tiene link de pago. Elige otro plan o escríbenos por el chat.</div>'
            : '<div class="cp-ayuda">Toca <b>Copiar monto</b>, abre el link y pega el total donde dice monto.' + (pc ? ' El cargo por pago online (' + String(pc).replace('.', ',') + ' %) lo cobra la plataforma de pago; por transferencia no se cobra.' : '') + '</div>') + '</div>' +
          '<label for="cpFoto">Pantallazo del comprobante</label><input id="cpFoto" type="file" accept="image/*">' + (foto ? '<img class="cp-vista" alt="Comprobante" src="' + foto + '">' : '') +
          '<label for="cpPagado">Monto que pagaste</label><input id="cpPagado" type="number" inputmode="numeric" value="' + (monto() || '') + '">' +
          '<p class="cp-err" id="cpErr"></p><button type="button" class="cp-si" data-enviar style="width:100%">Enviar comprobante</button>' +
          (pr ? '' : keyHtml) + pie);
        if (plan.k === 'otro') { const i = caja.querySelector('#cpOtro'); i.value = o._otro || ''; i.oninput = () => { o._otro = i.value; refrescar(); }; }
        const pg = caja.querySelector('#cpPagado');
        if (pg) { if (o._pagado) pg.value = o._pagado; pg.oninput = (ev) => { o._pagado = ev.target.value; }; }
        const mc = caja.querySelector('#cpMpCorreo'); if (mc) mc.oninput = () => { o._mpCorreo = mc.value; };
        const ci = caja.querySelector('#cpCupon'); if (ci) ci.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); caja.querySelector('[data-cupon]').click(); } };
      };
      function desglose() {
        const pc = PCT[medio];
        return (pc ? linea('Precio' + (plan.k === 'meses' ? ' (' + plan.m + ' meses)' : ''), pesos(base())) + linea('Cargo por pago online (' + String(pc).replace('.', ',') + ' %)', pesos(cargo())) : '') +
          linea('Total a pagar', '<span class="cp-monto" id="cpMonto" style="font-size:24px">' + pesos(monto()) + '</span>', 'total');
      }
      function refrescar() { caja.querySelector('#cpDesglose').innerHTML = desglose(); const pg = caja.querySelector('#cpPagado'); if (pg && !o._pagado) pg.value = monto() || ''; }
      // Si "otro monto" no se puede pagar automático, igual queda el link o la transferencia.
      if (AUTO[medio] && plan.k === 'otro') medio = medios.find((m) => !AUTO[m]) || medio;
      pintar();
      caja.addEventListener('change', async (ev) => {
        if (ev.target.id === 'cpRenovar') { o._renovar = ev.target.checked; o._pagado = ''; pintar(); return; }
        if (ev.target.id !== 'cpFoto' || !ev.target.files[0]) return;
        try { foto = await achicar(ev.target.files[0]); pintar(); } catch (x) { caja.querySelector('#cpErr').textContent = x.message; }
      });
      caja.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-p],[data-m],[data-copiar],[data-d],[data-enviar],[data-cupon],[data-sincupon],[data-key],[data-mp],[data-subq],[data-subrev]'); if (!b) return;
        if (b.dataset.p) { plan = L[+b.dataset.p]; o._pagado = ''; pintar(); }
        else if ('cupon' in b.dataset) {
          const cod = caja.querySelector('#cpCupon').value.trim().toUpperCase();
          if (!cod) { caja.querySelector('#cpCupon').focus(); return; }
          try { cupon = { codigo: cod, pct: await o.rpc('cfx_cupon_ver', { p_codigo: cod }) }; o._pagado = ''; pintar(); }
          catch (x) { caja.querySelector('#cpErr').textContent = (x && x.message) || String(x); }
        } else if ('sincupon' in b.dataset) { cupon = null; o._pagado = ''; pintar(); }
        else if ('key' in b.dataset) return;
        else if ('subq' in b.dataset || 'subrev' in b.dataset) {
          // G108 🔁 quitar la renovación automática / revisar si ya autorizó.
          const err = caja.querySelector('#cpSubErr');
          if ('subq' in b.dataset && window.CFX_DIALOGO && !await window.CFX_DIALOGO.confirmar('¿Quitar la renovación automática? Lo que pagaste sigue activo hasta que venza.')) return;
          b.disabled = true;
          try {
            if ('subq' in b.dataset) { const r = await o.rpc('cfx_mp_sub_quitar', { p_producto: pr ? pr.clave : null }); if (!r || !r.ok) throw new Error((r && r.error) || 'Mercado Pago no respondió'); }
            else { const r = await o.rpc('cfx_mp_revisar'); if (r && r.aprobado) { armarListo(caja, r.pago); obligatorio = false; clearInterval(vigia); if (o.alPagar) o.alPagar(); return; } }
            return abrir(o);
          } catch (x) { if (err) err.textContent = (x && x.message) || String(x); b.disabled = false; }
        }
        else if ('mp' in b.dataset && o._renovar) {
          const err = caja.querySelector('#cpErr'), txt = b.textContent, correo = ((caja.querySelector('#cpMpCorreo') || {}).value || '').trim();
          if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(correo)) { err.textContent = 'Escribe el correo de tu cuenta de Mercado Pago'; return; }
          b.disabled = true; b.textContent = 'Abriendo Mercado Pago…';
          try {
            const r = await o.rpc('cfx_mp_suscribir', { p_periodo: plan.k, p_producto: pr ? pr.clave : null, p_email: correo, p_volver: location.href.split('#')[0] });
            if (!r || !r.ok) throw new Error((r && r.error) || 'Mercado Pago no respondió');
            mpMarca(true); location.href = r.url;
          } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = txt; }
        }
        else if ('mp' in b.dataset) {
          // G85: ⚡ el cobro lo arma la base (mismo total que se ve aquí) y abre Mercado Pago; al volver se confirma solo.
          const err = caja.querySelector('#cpErr'), txt = b.textContent; b.disabled = true; b.textContent = 'Abriendo ' + AUTO[medio] + '…';
          try {
            const rg = caja.querySelector('#cpRegalo'); o._regalo = !!(rg && rg.checked);
            const r = await o.rpc(medio === 'flow' ? 'cfx_flow_pagar' : 'cfx_mp_pagar', { p_periodo: plan.k, p_meses: plan.k === 'meses' ? plan.m : null, p_producto: pr ? pr.clave : null, p_cupon: cupon ? cupon.codigo : null, p_volver: location.href.split('#')[0], ...(o._regalo ? { p_regalo: true } : {}) });
            if (r && r.aprobado) { armarListo(caja, (await o.rpc('cfx_mp_revisar').catch(() => ({}))).pago); obligatorio = false; clearInterval(vigia); if (o.alPagar) o.alPagar(); return; }
            if (!r || !r.ok) throw new Error((r && r.error) || AUTO[medio] + ' no respondió');
            mpMarca(true); location.href = r.url;
          } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = txt; }
        }
        else if (b.dataset.m) { medio = b.dataset.m; o._pagado = ''; pintar(); }
        else if ('copiar' in b.dataset) { await copiar(String(monto())); b.textContent = '✓ Monto copiado'; }
        else if (b.dataset.d) { await copiar(String(datos[+b.dataset.d][1])); caja.querySelectorAll('[data-d]').forEach((x) => { x.textContent = 'Copiar'; }); b.textContent = '✓ Copiado'; }
        else {
          const err = caja.querySelector('#cpErr'), pagado = Math.round(Number(caja.querySelector('#cpPagado').value || 0));
          if (!foto) { err.textContent = 'Sube el pantallazo del comprobante'; return; }
          if (pagado < 1) { err.textContent = 'Escribe el monto que pagaste'; return; }
          if (plan.k !== 'otro' && monto() && pagado < monto() && !o._menosOk) { o._menosOk = true; err.textContent = 'Pagaste menos que el total (' + pesos(monto()) + '). Si es correcto, toca Enviar otra vez.'; return; }
          b.disabled = true; b.textContent = 'Enviando…';
          const args = { p_periodo: plan.k, p_monto: pagado, p_medio: medio, p_comprobante: foto, p_nota: plan.k === 'otro' ? 'Otro monto' : plan.k === 'meses' ? plan.m + ' meses' : '', p_cupon: cupon ? cupon.codigo : null, p_meses: plan.k === 'meses' ? plan.m : null, ...(pr ? { p_producto: pr.clave } : {}) };
          // Señal débil (4G): si se corta, revisa si igual llegó y, si no, reintenta solo 2 veces antes de avisar.
          const red = (x) => /Failed to fetch|NetworkError|Load failed|Sin conexi[oó]n|network/i.test((x && x.message) || String(x));
          const llego = async () => { try { const s = await o.rpc('cfx_pago_estado'); return !!(s && s.ultimo && s.ultimo.estado === 'pendiente'); } catch (y) { return false; } };
          try {
            for (let n = 0; ; n++) {
              try { await o.rpc('cfx_pago_pedir', args); break; } catch (x) {
                if (!red(x)) throw x;
                await new Promise((r) => setTimeout(r, 1500));
                if (await llego()) break;
                if (n >= 2) throw new Error('No se pudo enviar: la señal está débil. Conéctate a Wi-Fi o acércate a mejor señal y toca Enviar otra vez.');
                b.textContent = 'Reintentando…';
              }
            }
            caja.innerHTML = '<h2>✅ ¡Recibido!</h2><div class="cp-ok">Ya nos llegó tu comprobante. Lo revisamos en 5 a 10 minutos y te llega un aviso apenas se active. Puedes cerrar esta ventana.</div>' + pie;
            if (o.alPagar) o.alPagar();
          } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = 'Enviar comprobante'; }
        }
      });
    }
    caja.addEventListener('click', async (ev) => {
      const ck = ev.target.closest('[data-copkey]');
      if (ck) { await copiar(ck.dataset.copkey); ck.textContent = '✓ Copiada'; return; }
      if (ev.target.closest('[data-key]')) {
        try {
          const r = await o.rpc('cfx_key_canjear', { p_codigo: caja.querySelector('#cpKey').value });
          if (r && r.error) throw new Error(r.error);
          caja.innerHTML = '<h2>🎉 ¡Listo!</h2><div class="cp-ok">' + esc(r.nombre || 'Premium') + ' activo por ' + r.dias + ' días.</div><button type="button" data-x style="width:100%;margin-top:10px">Continuar</button>';
          obligatorio = false; clearInterval(vigia); if (o.alPagar) o.alPagar();
        } catch (x) { caja.querySelector('#cpKeyErr').textContent = (x && x.message) || String(x); }
        return;
      }
      const pp = ev.target.closest('[data-propro]');
      if (pp) {
        pp.disabled = true;
        try {
          const r = await o.rpc('cfx_pro_probar');
          caja.innerHTML = '<h2>🎉 ¡Listo!</h2><div class="cp-ok">⭐ Premium gratis hasta el <b>' + new Date(r.hasta).toLocaleDateString('es-CL') + '</b>. Al terminar vuelves a gratis y no pierdes nada.</div>' +
            '<button type="button" class="cp-si" data-x style="width:100%;margin-top:10px">Continuar</button>';
          recargar = true; if (o.alPrueba) o.alPrueba(r);
        } catch (x) { pp.disabled = false; const er = caja.querySelector('#cpProErr'); if (er) er.textContent = (x && x.message) || String(x); }
        return;
      }
      if (ev.target.closest('[data-chat]')) { ev.preventDefault(); window.CFX_AYUDA.chat({ rpc: o.rpc }); return; }
      if (ev.target.closest('[data-terminos]')) { ev.preventDefault(); window.CFX_AYUDA.terminos(); return; }
      if (ev.target.closest('[data-x]')) { cerrar(); if (e.bloqueado || e.debe_inicio || recargar) location.reload(); }
      if (ev.target.closest('[data-salir]')) { cerrar(); o.salir(); }
    });
    capa.addEventListener('click', (ev) => { if (ev.target === capa && !obligatorio) cerrar(); });
    capa.addEventListener('cancel', (ev) => { ev.preventDefault(); if (!obligatorio) cerrar(); });
    if (obligatorio) alFrente(capa);
    return e;
  }

  // G87 K: 🎉 lo que quedó activo y hasta cuándo + 🧾 comprobante. Regalo (o respaldo si no se pudo activar solo) = 🔑 key de 1 uso para copiar o enviar.
  const fechaL = (f) => { try { return new Date(f).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (x) { return ''; } };
  // G112 c2 · 🔄 Desde cuándo está la llave; con más de 1 año: "Cámbiala" (si alguien la vio, la nueva la deja sin uso).
  const llaveDesde = (m) => (m.conectado && m.desde ? ' Pegada el ' + esc(fechaL(m.desde)) + '.' : '');
  const llaveRotar = (m, donde) => (m.conectado && m.rotar ? '<p class="cp-mpn-nota" data-cfx-rotar style="color:var(--cfx-aviso)">🔄 Esta llave tiene más de 1 año: crea una nueva en ' + esc(donde) + ' y pégala aquí.</p>' : '');
  const queEs = (p) => (p.producto ? '🧩 Módulo ' + p.producto : '⭐ Premium') + ' · ' + (p.periodo === 'anual' ? '1 año' : p.periodo === 'meses' ? (p.meses || 2) + ' meses' : p.periodo === 'inicio' ? 'primer pago' : '1 mes');
  const listo = (p) => {
    const fin = '<button type="button" data-comp style="width:100%;margin-top:10px">🧾 Ver comprobante</button><button type="button" data-x class="cp-si" style="width:100%;margin-top:8px">Continuar</button>';
    if (!p) return '<h2>🎉 ¡Pago aprobado!</h2><div class="cp-ok">Mercado Pago confirmó tu pago: tu plan ya está activo. ¡Gracias!</div><button type="button" data-x style="width:100%;margin-top:10px">Continuar</button>';
    if (p.key_regalo) {
      const m = (p.regalo ? '🎁 Te regalo ' : '🔑 Key de ') + queEs(p) + ' (' + (+p.dias || 0) + ' días).\nKey: ' + p.key_regalo + '\nSe activa en la app → Premium → 🔑 Tengo una key (1 uso).';
      return '<h2>' + (p.regalo ? '🎁 ¡Tu regalo está listo!' : '✅ Pago aprobado') + '</h2><div class="cp-ok">' + (p.regalo ? 'Comparte esta key con quien quieras regalar: la activa en Premium → 🔑 Tengo una key. Sirve 1 vez.'
        : 'No se pudo activar solo, pero tu pago quedó guardado en esta key: actívala en Premium → 🔑 Tengo una key.') + '</div>' +
        '<p style="margin:10px 0 2px;text-align:center">' + esc(queEs(p)) + '</p><div style="font:700 19px/1.3 ui-monospace,monospace;text-align:center;white-space:nowrap;overflow-x:auto;padding:12px 8px;border:2px dashed var(--cp-color);border-radius:12px">' + esc(p.key_regalo) + '</div>' +
        '<button type="button" data-copkey="' + esc(p.key_regalo) + '" style="width:100%;margin-top:8px">📋 Copiar key</button>' +
        '<a class="cp-btn" style="margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(m) + '">💬 Enviar por WhatsApp</a>' + fin;
    }
    return '<h2>🎉 ¡Pago aprobado!</h2><div class="cp-ok">' + esc(queEs(p)) + (p.hasta ? ' activo hasta el <b>' + fechaL(p.hasta) + '</b>' : ' activo') + '. ¡Gracias!</div>' + fin;
  };
  function cargarComprobante() {
    if (window.CFX_COMPROBANTE) return Promise.resolve(window.CFX_COMPROBANTE);
    return new Promise((ok) => { const sc = document.createElement('script'); sc.src = AQUI + 'comprobante.js'; sc.onload = () => ok(window.CFX_COMPROBANTE || null); sc.onerror = () => ok(null); document.head.appendChild(sc); });
  }
  function armarListo(caja, p) {
    caja.innerHTML = listo(p);
    caja.addEventListener('click', async (ev) => {
      const k = ev.target.closest('[data-copkey]');
      if (k) { ev.stopPropagation(); await copiar(k.dataset.copkey); k.textContent = '✓ Copiada'; return; }
      if (!ev.target.closest('[data-comp]') || !p) return;
      const c = { titulo: 'Comprobante de pago', negocio: 'CodeFix', fecha: p.resuelto || Date.now(), numero: p.mp_pago || String(p.id || '').slice(0, 8), cliente: p.nombre || p.email || '',
        items: [{ cant: 1, nombre: queEs(p) + (p.regalo ? ' (🎁 regalo)' : ''), precio: +p.monto || 0 }], total: +p.monto || 0, medio: /^flow:/.test(p.mp_pago || '') ? 'Flow' : 'mercadopago', cliente_ve: true,
        entrega: p.key_regalo ? 'Key: ' + p.key_regalo : p.hasta ? 'Activo hasta el ' + fechaL(p.hasta) : '' };
      const C = await cargarComprobante();
      if (C) { cerrar(); C.abrir(c); }  // la ventana de pago está encima de todo: se cierra para que el comprobante se vea else { await copiar(c.titulo + '\nCodeFix · ' + c.items[0].nombre + '\nTotal: ' + pesos(c.total) + ' · ' + (/^flow:/.test(p.mp_pago || '') ? 'Flow' : 'Mercado Pago') + ' N° ' + c.numero + '\n' + c.entrega); ev.target.textContent = '✓ Comprobante copiado'; }
    });
  }
  // G85: al volver de Mercado Pago (la app abre de nuevo): confirma el pago con la base. Reintenta un rato por si Mercado Pago tarda.
  async function mpVolver(rpc) {
    if (!rpc || !mpMarcado()) return;
    for (let n = 0; n < 8; n++) {
      let r = null;
      try { r = await rpc('cfx_mp_revisar'); } catch (x) { return; }
      if (r && r.aprobado) {
        mpMarca(false); cerrar();
        const capa = document.createElement('dialog'); capa.className = 'cfx-pago'; capa.style.setProperty('--cp-color', color());
        capa.innerHTML = '<div></div>'; armarListo(capa.firstChild, r.pago); document.body.appendChild(capa); abierta = capa; capa.showModal();
        capa.querySelector('[data-x]').onclick = () => { cerrar(); location.reload(); };
        return;
      }
      if (!r || !r.pendiente) {
        mpMarca(false);
        // G108: volvió de autorizar la 🔁 renovación automática.
        const sv = r && (r.subs || []).find((s) => s.estado === 'activa' && !s.cobros);
        if (sv && !abierta) {
          const capa = document.createElement('dialog'); capa.className = 'cfx-pago'; capa.style.setProperty('--cp-color', color());
          capa.innerHTML = '<div><h2>🔁 ¡Listo!</h2><div class="cp-ok">' + esc(sv.producto ? '🧩 ' + sv.producto : '⭐ Premium') + ' se renueva solo ' + (sv.periodo === 'anual' ? 'cada año' : 'cada mes') + ' (' + pesos(sv.monto) + '). 1.er cobro el <b>' + fechaL(sv.inicio) + '</b>; te avisamos en cada cobro.</div><button type="button" class="cp-si" data-x style="width:100%">Entendido</button></div>';
          document.body.appendChild(capa); abierta = capa; capa.showModal(); capa.querySelector('[data-x]').onclick = cerrar;
        }
        return;
      }
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }

  // Al entrar: si es un negocio que debe su primer pago, muestra la activación (y no deja seguir).
  async function revisar(o) {
    try {
      const e = await o.rpc('cfx_pago_estado');
      if (e && (e.bloqueado || (o.comoNegocio && e.debe_inicio))) await abrir(Object.assign({}, o, { obligatorio: true }));
      return e;
    } catch (x) { return null; }
  }

  // G98 ⚡ Mercado Pago PROPIO del negocio (para cobrar a SUS clientes). CFX_PAGOS.mpNegocio(el, { rpc, para: 'el abono de tus reservas', btn, btnAlt })
  // (btn/btnAlt = clases de los botones de la app, si sus botones no tienen estilo propio).
  // pinta en el elemento la tarjeta para conectar / pausar / desconectar (el token queda solo en el servidor: cfx_mp_neg_*).
  async function mpNegocio(el, o) {
    if (!el || !o || !o.rpc) return;
    const para = o.para || 'tus cobros';
    const avisar = (t) => (window.CFX_DIALOGO ? window.CFX_DIALOGO.avisar(t) : null);
    let m = {};
    try { m = await o.rpc('cfx_mp_neg_estado') || {}; } catch (x) { el.innerHTML = '<p class="cp-mpn-nota">⚠️ ' + esc(x.message || x) + '</p>'; return; }
    if (!m.dueno) { el.innerHTML = ''; el.hidden = true; return; }
    flowNegocio(el, o);
    el.hidden = false; el.classList.add('cfx-mpn');
    el.innerHTML = '<b>⚡ Tu Mercado Pago' + (m.conectado ? (m.activo ? ' · ✅ Activo' : ' · ⏸️ En pausa') : '') + '</b>' +
      '<p class="cp-mpn-nota">Tu cliente paga ' + esc(para) + ' con tarjeta o saldo y se aprueba <b>solo</b> (sin comprobante). La plata llega directo a tu cuenta.' +
      (m.conectado ? ' Conectado como <b>' + esc(m.nick || 'tu cuenta') + '</b> (…' + esc(m.fin || '') + ').' : '') + llaveDesde(m) + '</p>' + llaveRotar(m, 'Mercado Pago → Credenciales') +
      '<label for="cfxMpnTok">' + (m.conectado ? 'Cambiar Access Token' : 'Access Token') + '</label>' +
      '<input id="cfxMpnTok" type="password" autocomplete="off" placeholder="APP_USR-…">' +
      '<details class="cp-mpn-nota"><summary>¿Dónde lo saco?</summary>Mercado Pago → Tu negocio → Configuración → Credenciales → <b>Credenciales de producción</b> → Access Token. Nadie más lo ve.</details>' +
      (m.conectado ? '<label class="cp-mpn-si"><input type="checkbox" id="cfxMpnOn"' + (m.activo ? ' checked' : '') + '> <span>Cobrar con Mercado Pago</span></label>' : '') +
      '<div class="cp-mpn-btns"><button type="button" class="' + esc(o.btn || '') + '" data-mpn="guardar">' + (m.conectado ? 'Guardar' : '⚡ Conectar') + '</button>' +
      (m.conectado ? '<button type="button" class="' + esc(o.btnAlt || 'alt') + '" data-mpn="quitar">Desconectar</button>' : '') + '</div>';
    el.onclick = async (e) => {
      const a = e.target.dataset && e.target.dataset.mpn;
      if (!a) return;
      if (a === 'quitar' && window.CFX_DIALOGO && !await window.CFX_DIALOGO.confirmar('¿Desconectar tu Mercado Pago? Tus clientes volverán al link y comprobante.')) return;
      e.target.disabled = true;
      try {
        const on = el.querySelector('#cfxMpnOn');
        await o.rpc('cfx_mp_neg_guardar', a === 'quitar' ? { p_token: null, p_activo: null } : { p_token: el.querySelector('#cfxMpnTok').value, p_activo: on ? on.checked : true });
        avisar(a === 'quitar' ? 'Mercado Pago desconectado' : '⚡ Mercado Pago guardado');
        mpNegocio(el, o);
      } catch (x) { avisar(x.message || String(x)); e.target.disabled = false; }
    };
  }
  // G107 💳 Flow PROPIO del negocio (Webpay): tarjeta hermana, justo debajo de la de Mercado Pago (las llaves quedan solo en el servidor).
  async function flowNegocio(mpEl, o, propio) {
    let el = propio ? mpEl : mpEl.nextElementSibling;
    if (propio) el.classList.add('cfx-mpn', 'cfx-fln');
    if (!el || !el.classList.contains('cfx-fln')) { el = document.createElement('div'); el.className = 'cfx-mpn cfx-fln'; mpEl.insertAdjacentElement('afterend', el); }
    const para = o.para || 'tus cobros';
    const avisar = (t) => (window.CFX_DIALOGO ? window.CFX_DIALOGO.avisar(t) : null);
    let m = {};
    try { m = await o.rpc('cfx_flow_neg_estado') || {}; } catch (x) { el.hidden = true; return; }  // base sin G107: no se muestra
    if (!m.dueno) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<b>💳 Tu Webpay con Flow' + (m.conectado ? (m.activo ? ' · ✅ Activo' : ' · ⏸️ En pausa') : '') + (m.sandbox ? ' · 🧪 Pruebas' : '') + '</b>' +
      '<p class="cp-mpn-nota">Tu cliente paga ' + esc(para) + ' con débito, crédito o transferencia y se aprueba <b>solo</b>. La plata llega a tu cuenta Flow.' +
      (m.conectado ? ' Conectado (…' + esc(m.fin || '') + ').' : '') + llaveDesde(m) + '</p>' + llaveRotar(m, 'Flow → Integración → API Keys') +
      '<label for="cfxFlnKey">API Key</label><input id="cfxFlnKey" type="password" autocomplete="off" placeholder="' + (m.conectado ? 'Igual que antes' : 'XXXX-XXXX-…') + '">' +
      '<label for="cfxFlnSec">Secret Key</label><input id="cfxFlnSec" type="password" autocomplete="off">' +
      '<details class="cp-mpn-nota"><summary>¿Dónde las saco?</summary>flow.cl → entra a tu cuenta → Mis datos → <b>Integración</b> → API Key y Secret Key. Nadie más las ve.</details>' +
      '<label class="cp-mpn-si"><input type="checkbox" id="cfxFlnSb"' + (m.sandbox ? ' checked' : '') + '> <span>🧪 Son llaves de pruebas (sandbox)</span></label>' +
      (m.conectado ? '<label class="cp-mpn-si"><input type="checkbox" id="cfxFlnOn"' + (m.activo ? ' checked' : '') + '> <span>Cobrar con Webpay</span></label>' : '') +
      '<div class="cp-mpn-btns"><button type="button" class="' + esc(o.btn || '') + '" data-fln="guardar">' + (m.conectado ? 'Guardar' : '💳 Conectar') + '</button>' +
      (m.conectado ? '<button type="button" class="' + esc(o.btnAlt || 'alt') + '" data-fln="quitar">Desconectar</button>' : '') + '</div>';
    el.onclick = async (e) => {
      const a = e.target.dataset && e.target.dataset.fln;
      if (!a) return;
      if (a === 'quitar' && window.CFX_DIALOGO && !await window.CFX_DIALOGO.confirmar('¿Desconectar tu Flow? Tus clientes dejarán de ver Webpay.')) return;
      e.target.disabled = true;
      try {
        const on = el.querySelector('#cfxFlnOn'), k = el.querySelector('#cfxFlnKey').value, sc = el.querySelector('#cfxFlnSec').value;
        await o.rpc('cfx_flow_neg_guardar', a === 'quitar' ? { p_apikey: null, p_secret: null, p_activo: null }
          : { p_apikey: k || null, p_secret: sc || null, p_activo: on ? on.checked : true, p_sandbox: el.querySelector('#cfxFlnSb').checked });
        avisar(a === 'quitar' ? 'Flow desconectado' : '💳 Webpay con Flow guardado');
        flowNegocio(mpEl, o, propio);
      } catch (x) { avisar(x.message || String(x)); e.target.disabled = false; }
    };
  }
  // G107: botones para el CLIENTE según lo que tenga el negocio (medios = { mp, flow }; sin medios = base vieja → solo MP).
  //   CFX_PAGOS.botonesNegocio(medios, clase) → html con data-mp="mp" | data-mp="flow".
  function botonesNegocio(md, clase) {
    md = md || { mp: true };
    const c = esc(clase || '');
    return (md.mp ? '<button class="' + c + '" data-mp="mp">⚡ Pagar con Mercado Pago</button>' : '') +
      (md.flow ? '<button class="' + c + '" data-mp="flow">💳 Pagar con Webpay</button>' : '');
  }
  if (!document.getElementById('cfx-mpn-css')) {
    const st = document.createElement('style'); st.id = 'cfx-mpn-css';
    st.textContent = '.cfx-mpn{display:block;border:1px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:12px;margin:10px 0;overflow-wrap:anywhere}' +
      '.cfx-mpn label{display:block;font-size:13px;font-weight:600;margin:8px 0 4px}.cfx-mpn input[type=password]{width:100%;box-sizing:border-box}' +
      '.cfx-mpn .cp-mpn-nota{margin:4px 0;font-size:13px;color:var(--cfx-texto-2,#5b6472)}.cfx-mpn .cp-mpn-si{display:flex;gap:8px;align-items:center;font-weight:500}' +
      '.cfx-mpn .cp-mpn-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.cfx-mpn .cp-mpn-btns button{flex:1 1 120px;min-height:44px}';
    document.head.appendChild(st);
  }

  window.CFX_PAGOS = { abrir, revisar, cerrar, mpVolver, mpNegocio, botonesNegocio, flowNegocio: (el, o) => flowNegocio(el, o, true) };
})();

/* G128 🛒 COBRO DE PEDIDOS (núcleo, las 6; parte por Despega). Todo lo decide y valida la BASE; esto solo muestra.
   CFX_COBRO.estado(p)            → { e: '⏳ Esperando pago', t: 'qué pasa' }  p = { estado, cobro, pagado, servicio, digital, entrega }
   CFX_COBRO.opciones(lineas, o)  → [{ k: 'ahora'|'abono'|'retiro', txt, monto, resto }] lo que el cliente PUEDE elegir
                                     lineas = [{ subtotal, cobro: 'ahora'|'abono'|'retiro', abono: %, tipo }], o = { medios: bool, extra: $despacho, entrega }
   CFX_COBRO.elegir(el, ops, k, cb) → botones (solo lo permitido; con 1 sola opción, solo el texto) · cb(k)
   CFX_COBRO.sinMedios(el, { ir })  → aviso al DUEÑO: "⚠️ Tus clientes no pueden pagar en línea → Configurar"
   CFX_COBRO.enlace(el, { url, tel, tienda }) → comprador SIN cuenta: 📋 Copiar / 📲 Mandarme por WhatsApp el enlace del pedido
   CFX_COBRO.wa(tel, texto)         → link wa.me con el texto listo (p. ej. "📲 Enviar enlace al cliente" de la tienda)
   CFX_COBRO.hilo(el, { rpc, ref }) → 💬 chat DEL PEDIDO (solo con cuenta; cfx_hilo_ver / cfx_hilo_enviar). Se borra a los 7 días de cerrado. */
(function () {
  'use strict';
  if (window.CFX_COBRO) return;
  const esc = (s) => (window.CFX_ESC ? window.CFX_ESC(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'));
  const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const avisar = (t) => (window.CFX_AVISO ? window.CFX_AVISO(t) : window.CFX_DIALOGO ? window.CFX_DIALOGO.avisar(t) : null);
  if (!document.getElementById('cfx-cobro-css')) {
    const st = document.createElement('style'); st.id = 'cfx-cobro-css';
    st.textContent = '.cfx-cobro{display:grid;gap:8px;margin:8px 0}.cfx-cobro button{display:flex;gap:8px;align-items:center;text-align:left;width:100%;min-height:48px;padding:10px 12px;border-radius:12px;' +
      'border:2px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);font:inherit;cursor:pointer;overflow-wrap:anywhere}' +
      '.cfx-cobro button.on{border-color:var(--cfx-acento,#2563eb);background:color-mix(in srgb,var(--cfx-acento,#2563eb) 10%,var(--cfx-tarjeta,#fff))}' +
      '.cfx-cobro small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:13px}.cfx-cobro .cc-uno{margin:0;font-size:14px;color:var(--cfx-texto-2,#5b6472)}' +
      '.cfx-sinmedio{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:12px;margin:0 0 10px;overflow-wrap:anywhere;' +
      'background:color-mix(in srgb,#f59e0b 14%,var(--cfx-tarjeta,#fff));border:1px solid color-mix(in srgb,#f59e0b 45%,transparent);color:var(--cfx-texto,#111827)}' +
      '.cfx-sinmedio>span{flex:1 1 180px}.cfx-sinmedio a{flex:none}' +
      '.cfx-enlace{display:grid;gap:8px}.cfx-enlace code{display:block;font-size:12px;overflow-wrap:anywhere;padding:6px 8px;border-radius:8px;background:var(--cfx-fondo,#f3f5f8);color:var(--cfx-texto,#111827)}' +
      '.cfx-enlace .ce-b{display:flex;gap:8px;flex-wrap:wrap}.cfx-enlace .ce-b>*{flex:1 1 130px;min-height:44px}' +
      '.cfx-hilo .ch-l{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto;margin:6px 0;padding:2px}' +
      '.cfx-hilo .ch-m{max-width:85%;padding:7px 10px;border-radius:12px;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--cfx-fondo,#f3f5f8);color:var(--cfx-texto,#111827)}' +
      '.cfx-hilo .ch-m.mio{align-self:flex-end;background:color-mix(in srgb,var(--cfx-acento,#2563eb) 16%,var(--cfx-tarjeta,#fff))}' +
      '.cfx-hilo .ch-m small{display:block;font-size:11px;color:var(--cfx-texto-2,#5b6472);margin-top:2px}' +
      '.cfx-hilo .ch-f{display:flex;gap:6px}.cfx-hilo textarea{flex:1;min-width:0;min-height:44px;resize:vertical;box-sizing:border-box}.cfx-hilo .ch-f button{flex:none;min-height:44px}' +
      '.cfx-hilo .ch-n{margin:4px 0 0;font-size:12px;color:var(--cfx-texto-2,#5b6472)}';
    document.head.appendChild(st);
  }

  // i) Estados claros (los mismos textos en las 6).
  const E = {
    pagando: ['⏳ Esperando pago', 'Paga antes de que se acabe el tiempo.'],
    en_revision: ['🔍 Revisando comprobante', 'La tienda está revisando tu pago.'],
    recibido: ['📦 Recibido', 'La tienda recibió tu pedido.'],
    preparando: ['👩‍🍳 Preparando', 'Pago aprobado: lo están preparando.'],
    listo: ['✅ Listo', 'Ya puedes retirarlo.'],
    en_camino: ['🚚 En camino', 'Va hacia tu dirección.'],
    entregado: ['🎉 Entregado', '¡Gracias por tu compra!'],
    cancelado: ['❌ Cancelado', ''], rechazado: ['❌ Rechazado', 'El pago no se aprobó.'], expirado: ['❌ Expirado', 'Se acabó el tiempo para pagar.']
  };
  function estado(p) {
    p = p || {};
    const r = E[p.estado] || [String(p.estado || '')], deb = (p.cobro === 'retiro' || p.cobro === 'abono') && !p.pagado;
    let e = r[0], t = r[1] || '';
    if (p.estado === 'recibido' && deb) { e = '💰 Pagar al retirar'; t = p.entrega === 'despacho' ? 'Pagas al recibir: la tienda te contacta.' : 'Pagas en la tienda al retirar.'; }
    else if (['recibido', 'preparando', 'listo'].includes(p.estado) && deb) t = (p.cobro === 'abono' ? 'Abono pagado. ' : '') + '💰 El resto lo pagas al ' + (p.entrega === 'despacho' ? 'recibir.' : 'retirar.');
    if (p.estado === 'listo' && p.servicio) { e = '✅ Listo'; t = 'Tu servicio está listo.'; }
    if (p.estado === 'entregado' && p.servicio) e = '🛠️ Servicio realizado';
    if (p.estado === 'entregado' && p.digital) t = '🔑 Tu acceso está en el detalle.';
    return { e, t };
  }

  // b) ¿Cómo puede pagar el cliente? Lo de fábrica es ⚡ Pagar ahora. Sin ningún medio: 💰 Pagas al retirar.
  function opciones(lineas, o) {
    o = o || {};
    const l = (lineas || []).filter((x) => Number(x.subtotal) > 0), extra = Number(o.extra) || 0;
    const base = l.reduce((a, x) => a + Number(x.subtotal), 0), total = base + extra;
    const al = o.entrega === 'despacho' ? 'recibir' : 'retirar';
    if (!o.medios) return [{ k: 'retiro', txt: '💰 Pagas al ' + al, nota: 'La tienda aún no recibe pagos en línea.', monto: 0, resto: total }];
    const ops = [{ k: 'ahora', txt: '⚡ Pagar todo ahora', monto: total, resto: 0 }];
    if (l.some((x) => x.cobro === 'abono' && x.tipo !== 'digital')) {
      const ya = l.reduce((a, x) => a + (x.cobro === 'abono' && x.tipo !== 'digital' ? Number(x.subtotal) * (Number(x.abono) || 50) / 100 : x.cobro === 'retiro' && x.tipo !== 'digital' ? 0 : Number(x.subtotal)), 0);
      const m = Math.max(1, Math.round(ya + extra));
      if (m < total) ops.push({ k: 'abono', txt: '💵 Abono ahora', monto: m, resto: total - m });
    }
    if (l.length && l.every((x) => x.cobro === 'retiro' && x.tipo !== 'digital') && o.entrega !== 'despacho') ops.push({ k: 'retiro', txt: '💰 Pagar al ' + al, monto: 0, resto: total });
    return ops;
  }
  function elegir(el, ops, k, cb) {
    if (!el) return;
    if (!ops.some((x) => x.k === k)) k = ops[0] && ops[0].k;
    const det = (x) => x.k === 'ahora' ? plata(x.monto) + ' en línea' : x.k === 'abono' ? plata(x.monto) + ' ahora · ' + plata(x.resto) + ' después' : x.nota || plata(x.resto) + ' al entregar';
    el.innerHTML = ops.length === 1 ? '<div class="cfx-cobro"><p class="cc-uno"><b>' + esc(ops[0].txt) + '</b> · ' + esc(det(ops[0])) + '</p></div>'
      : '<div class="cfx-cobro" role="radiogroup" aria-label="Cómo pagas">' + ops.map((x) => '<button type="button" role="radio" aria-checked="' + (x.k === k) + '" class="' + (x.k === k ? 'on' : '') +
        '" data-cobro="' + x.k + '"><span><b>' + esc(x.txt) + '</b><small>' + esc(det(x)) + '</small></span></button>').join('') + '</div>';
    el.onclick = (e) => { const b = e.target.closest('[data-cobro]'); if (!b) return; elegir(el, ops, b.dataset.cobro, cb); };
    if (cb) cb(k);
    return k;
  }

  // d) Aviso al dueño cuando sus clientes no tienen cómo pagar.
  function sinMedios(el, o) {
    if (!el) return;
    o = o || {};
    el.innerHTML = '<div class="cfx-sinmedio" role="status"><span>⚠️ <b>Tus clientes no pueden pagar en línea.</b> Sus pedidos quedan "💰 Pagas al retirar".</span>' +
      '<a class="btn small" href="' + esc(o.ir || '#') + '" data-cfx-cobro-ir="">Configurar</a></div>';
    const a = el.querySelector('[data-cfx-cobro-ir]');
    if (a && o.alTocar) a.onclick = (e) => { e.preventDefault(); o.alTocar(); };
  }

  // h) Enlace del pedido para quien compra SIN cuenta (y para la tienda).
  const wa = (tel, texto) => 'https://wa.me/' + String(tel || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(texto || '');
  function enlace(el, o) {
    if (!el || !o || !o.url) return;
    el.innerHTML = '<div class="cfx-enlace"><b>🔗 Guarda el enlace de tu pedido</b><span style="font-size:13px;color:var(--cfx-texto-2,#5b6472)">Con él ves el estado, pagas y subes el comprobante.</span>' +
      '<code>' + esc(o.url) + '</code><div class="ce-b"><button type="button" class="alt" data-ce="copiar">📋 Copiar enlace</button>' +
      '<a class="btn ok" target="_blank" rel="noopener" href="' + esc(wa(o.tel, '🧾 Mi pedido' + (o.tienda ? ' en ' + o.tienda : '') + ': ' + o.url)) + '">📲 Mandarme por WhatsApp</a></div></div>';
    el.querySelector('[data-ce=copiar]').onclick = async () => {
      try { await navigator.clipboard.writeText(o.url); avisar('📋 Enlace copiado'); }
      catch (e) { if (window.CFX_DIALOGO) window.CFX_DIALOGO.pedir('Copia el enlace', o.url, { si: 'Cerrar' }); }
    };
  }

  // e) 💬 Chat DEL PEDIDO (dentro del pedido; no aparece en Mensajes).
  function hilo(el, o) {
    if (!el || !o || !o.rpc || !o.ref) return;
    const hora = (f) => new Date(f).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let vivo = null;
    async function cargar(bajar) {
      let r;
      try { r = await o.rpc('cfx_hilo_ver', { p_ref: o.ref }); } catch (e) { r = { ok: false, error: e.message }; }
      if (!el.isConnected) { clearInterval(vivo); return; }
      if (!r || !r.ok) { el.innerHTML = '<p class="ch-n">💬 ' + esc((r && r.error) || 'Chat no disponible') + '</p>'; return; }
      const l = r.mensajes || [];
      const cuerpo = l.length ? l.map((m) => '<div class="ch-m' + (m.mio ? ' mio' : '') + '">' + esc(m.texto) + '<small>' + (m.mio ? 'Tú' : m.tienda ? '🏪 Tienda' : '👤 Cliente') + ' · ' + hora(m.creado) + '</small></div>').join('')
        : '<p class="ch-n">Aún no hay mensajes. Pregunta lo que necesites de este pedido.</p>';
      const ya = el.querySelector('.ch-l');
      if (ya) { const abajo = ya.scrollTop + ya.clientHeight >= ya.scrollHeight - 20; ya.innerHTML = cuerpo; if (abajo || bajar) ya.scrollTop = ya.scrollHeight; return; }
      el.innerHTML = '<div class="cfx-hilo"><b>💬 Chat del pedido</b><div class="ch-l" aria-live="polite">' + cuerpo + '</div>' +
        '<div class="ch-f"><textarea maxlength="1000" rows="1" aria-label="Escribe tu mensaje" placeholder="Escribe aquí…"></textarea><button type="button" class="ok">Enviar</button></div>' +
        '<p class="ch-n">🔒 Solo tú y ' + (o.tienda ? 'el cliente' : 'la tienda') + '. Se borra 7 días después de cerrar el pedido.</p></div>';
      const lst = el.querySelector('.ch-l'); lst.scrollTop = lst.scrollHeight;
      const tx = el.querySelector('textarea'), bt = el.querySelector('.ch-f button');
      bt.onclick = async () => {
        const v = tx.value.trim(); if (!v) return;
        bt.disabled = true;
        try { const x = await o.rpc('cfx_hilo_enviar', { p_ref: o.ref, p_texto: v }); if (!x || !x.ok) throw new Error((x && x.error) || 'No se pudo enviar'); tx.value = ''; await cargar(true); }
        catch (e) { avisar(e.message || String(e)); } finally { bt.disabled = false; }
      };
    }
    cargar(true);
    vivo = setInterval(() => { if (!document.hidden) cargar(false); }, 20000);
  }

  window.CFX_COBRO = { estado, opciones, elegir, sinMedios, enlace, wa, hilo, plata };
})();
