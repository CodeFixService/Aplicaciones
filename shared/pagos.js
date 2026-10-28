/* CodeFix · Núcleo · Pagar Premium (mismo archivo en cada repositorio). Precios, link y transferencia vienen de la base
   (cfx_pago_estado), y se editan una sola vez para las 6 apps en el Centro de Mando → Pagos.
   CFX_PAGOS.abrir({ rpc })            → elegir plan, pagar (link sin monto + comisión, o transferencia) y subir el comprobante.
   CFX_PAGOS.revisar({ rpc, salir })   → si es un negocio nuevo que debe su primer pago, muestra la pantalla de activación (no se cierra).
   rpc(nombre, args) debe devolver una promesa con los datos (cada app pasa su propia función). */
(function () {
  'use strict';
  if (window.CFX_PAGOS) return;
  const css = document.createElement('style');
  css.textContent =
    'dialog.cfx-pago{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
    'dialog.cfx-pago::backdrop{background:transparent}' +
    '.cfx-pago>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box}' +
    '@media(min-width:600px){.cfx-pago{align-items:center}.cfx-pago>div{border-radius:20px}}' +
    '.cfx-pago h2{margin:0 0 4px;font-size:20px}.cfx-pago p{margin:6px 0;color:var(--cfx-texto-2,#5b6472);font-size:14px;line-height:1.4}' +
    '.cfx-pago .cp-planes{display:grid;gap:8px;margin:12px 0}.cfx-pago .cp-plan{display:flex;align-items:center;gap:10px;border:2px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:10px 12px;cursor:pointer;background:var(--cfx-campo,#f7f9fb)}' +
    '.cfx-pago .cp-plan.on{border-color:var(--cp-color)}.cfx-pago .cp-plan b{flex:1}.cfx-pago .cp-plan small{display:block;font-weight:400;color:var(--cfx-texto-2,#5b6472)}.cfx-pago .cp-precio{font-weight:800;font-size:17px}' +
    '.cfx-pago .cp-tabs{display:flex;gap:6px;margin:12px 0 8px}.cfx-pago .cp-tabs button{flex:1}.cfx-pago button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;padding:0 12px;background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto,#111827)}' +
    '.cfx-pago button.cp-si,.cfx-pago .cp-tabs button.on{background:var(--cp-color);color:#fff}.cfx-pago button:disabled{opacity:.6}' +
    '.cfx-pago .cp-caja{border:1px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:12px;margin:8px 0}.cfx-pago .cp-monto{font-size:28px;font-weight:800;margin:2px 0}' +
    '.cfx-pago .cp-fila{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.cfx-pago .cp-fila>*{flex:1 1 140px}.cfx-pago a.cp-btn{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;background:var(--cp-color);color:#fff;font-weight:700;text-decoration:none}' +
    '.cfx-pago summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--cfx-texto-2,#5b6472)}.cfx-pago label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}.cfx-pago input{width:100%;box-sizing:border-box;min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:8px 12px}' +
    '.cfx-pago .cp-err{color:var(--cfx-mal,#dc2626);font-weight:600;min-height:1em}.cfx-pago .cp-ok{background:color-mix(in srgb,var(--cfx-ok,#16a34a) 14%,transparent);border-radius:12px;padding:10px 12px;margin:10px 0}' +
    '.cfx-pago .cp-dato{display:flex;justify-content:space-between;gap:8px;font-size:14px;padding:3px 0}.cfx-pago .cp-dato span{color:var(--cfx-texto-2,#5b6472)}.cfx-pago img.cp-vista{max-width:100%;max-height:180px;border-radius:10px;margin-top:8px}';
  document.head.appendChild(css);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || '#2563eb';
  async function copiar(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } }

  // Achica la foto del comprobante en el teléfono (núcleo: fotos.js → comprobante).
  function achicar(file) {
    const q = (window.CFX_FOTO_DE && window.CFX_FOTO_DE('comprobante')) || { lado: 1000, calidad: 0.6 };
    return new Promise((ok, mal) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, q.lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        let cal = q.calidad, d = c.toDataURL('image/jpeg', cal);
        while (d.length > 380000 && cal > 0.3) { cal -= 0.1; d = c.toDataURL('image/jpeg', cal); }
        ok(d);
      };
      img.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se pudo leer la foto')); };
      img.src = u;
    });
  }

  function planes(e) {
    const c = e.config || {}, n = c.negocio || {}, cl = c.cliente || {}, rol = e.yo && e.yo.rol;
    const ahorro = (m, a) => (m && a && a < m * 12) ? ' · ahorras ' + Math.round(100 - a * 100 / (m * 12)) + '%' : '';
    if (rol === 'negocio' && e.debe_inicio) return [{ k: 'inicio', t: 'Activar mi cuenta', d: (n.inicio_dias || 30) + ' días de Premium', p: n.inicio }];
    const base = rol === 'cliente' ? cl : n;
    const l = [];
    if (base.mensual) l.push({ k: 'mensual', t: 'Mensual', d: '30 días de Premium', p: base.mensual });
    if (base.anual) l.push({ k: 'anual', t: 'Anual', d: '365 días de Premium' + ahorro(base.mensual, base.anual), p: base.anual });
    l.push({ k: 'otro', t: 'Otro monto', d: 'Un pago distinto (lo que acordaste)', p: 0 });
    return l;
  }

  // Es un <dialog> modal: queda por encima de todo. Si es obligatorio y otra ventana se abre encima (una guía, un aviso), vuelve al frente.
  let abierta = null, vigia = null;
  function cerrar() { clearInterval(vigia); if (abierta) { try { abierta.close(); } catch (e) { /* nada */ } abierta.remove(); abierta = null; } }
  function alFrente(capa) {
    vigia = setInterval(() => {
      if (!capa.isConnected) return clearInterval(vigia);
      const otras = [...document.querySelectorAll('dialog[open]')].filter((d) => d !== capa);
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
    let obligatorio = !!(o.obligatorio || e.bloqueado || (o.comoNegocio && e.debe_inicio));
    const c = e.config || {}, t = c.transferencia || {}, pct = Number(c.comision_pct) || 0;
    const L = planes(e), medios = [c.link ? 'link' : null, t.numero ? 'transferencia' : null].filter(Boolean);
    let plan = L[0], medio = medios[0], foto = null;
    if (!plan.p && L.length > 1) plan = L[0];
    const pie = (obligatorio ? (o.salir ? '<button type="button" data-salir style="width:100%;margin-top:10px">' + esc(o.salirTexto || 'Cerrar sesión') + '</button>' : '') : '<button type="button" data-x style="width:100%;margin-top:10px">Ahora no</button>') +
      (c.whatsapp ? '<p style="text-align:center"><a href="https://wa.me/' + esc(String(c.whatsapp).replace(/\D/g, '')) + '" target="_blank" rel="noopener">¿Dudas? Escríbenos por WhatsApp</a></p>' : '');
    const u = e.ultimo;
    const keyHtml = '<details style="margin-top:8px"><summary>🔑 Tengo una key</summary><div class="cp-fila"><input id="cpKey" placeholder="CFX-XXXX-XXXX-XXXX" autocapitalize="characters"><button type="button" data-key>Activar</button></div><p class="cp-err" id="cpKeyErr"></p></details>';
    if (u && u.estado === 'pendiente') {
      caja.innerHTML = '<h2>⏳ Pago en revisión</h2><div class="cp-ok">Recibimos tu comprobante de <b>' + pesos(u.monto) + '</b>. Te avisamos apenas se apruebe (normalmente el mismo día).</div>' + pie;
    } else if (!medios.length) {
      caja.innerHTML = '<h2>' + (obligatorio ? 'Activa tu cuenta' : '⭐ Hazte Premium') + '</h2><p>Los pagos aún no están configurados. Escríbenos y te ayudamos.</p>' + keyHtml + pie;
    } else {
      let cupon = null;  // { codigo, pct }: descuento sobre el precio del plan (no sobre "otro monto")
      const monto = () => {
        let b = plan.k === 'otro' ? Number((caja.querySelector('#cpOtro') || {}).value || 0) : plan.p;
        if (cupon && plan.k !== 'otro') b = Math.round(b * (100 - cupon.pct) / 100);
        return medio === 'link' ? Math.ceil(b * (1 + pct / 100)) : b;
      };
      const pintar = () => {
        caja.innerHTML = '<h2>' + (obligatorio ? '🚀 Activa tu cuenta' : '⭐ Hazte Premium') + '</h2>' +
          (obligatorio ? '<p>Para empezar a usar la app haz tu primer pago. Te da ' + esc(plan.d) + '; después puedes seguir en Premium o quedar en la versión gratis.</p>' : '<p>Paga con link o transferencia y sube la foto del comprobante. Lo revisamos y se activa.</p>') +
          (u && u.estado === 'rechazado' ? '<div class="cp-err">Tu último comprobante fue rechazado: ' + esc(u.motivo || '') + '</div>' : '') +
          '<div class="cp-planes">' + L.map((x, i) => '<div class="cp-plan' + (x === plan ? ' on' : '') + '" data-p="' + i + '"><b>' + esc(x.t) + '<small>' + esc(x.d) + '</small></b><span class="cp-precio">' + (x.p ? pesos(x.p) : '') + '</span></div>').join('') + '</div>' +
          (plan.k === 'otro' ? '<label for="cpOtro">Monto a pagar</label><input id="cpOtro" type="number" inputmode="numeric" min="1" placeholder="Ej: 10000">' : '') +
          (medios.length > 1 ? '<div class="cp-tabs">' + medios.map((m) => '<button type="button" data-m="' + m + '" class="' + (m === medio ? 'on' : '') + '">' + (m === 'link' ? '💳 Link de pago' : '🏦 Transferencia') + '</button>').join('') + '</div>' : '') +
          '<div class="cp-caja"><span>Monto a pagar</span><div class="cp-monto" id="cpMonto">' + pesos(monto()) + '</div>' +
          (medio === 'link' ? (pct ? '<p>Incluye ' + String(pct).replace('.', ',') + '% de comisión del link de pago.</p>' : '') + '<p>En el link escribe tú este monto.</p>' +
            '<div class="cp-fila"><button type="button" data-copiar>📋 Copiar monto</button><a class="cp-btn" href="' + esc(c.link) + '" target="_blank" rel="noopener">Abrir link de pago</a></div>'
            : [['Banco', t.banco], ['Tipo de cuenta', t.tipo], ['Número', t.numero], ['RUT', t.rut], ['Titular', t.titular], ['Correo', t.correo]].filter((x) => x[1]).map((x) => '<div class="cp-dato"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') +
              '<div class="cp-fila"><button type="button" data-datos>📋 Copiar datos</button><button type="button" data-copiar>📋 Copiar monto</button></div>') + '</div>' +
          '<label for="cpFoto">Foto del comprobante</label><input id="cpFoto" type="file" accept="image/*">' + (foto ? '<img class="cp-vista" alt="Comprobante" src="' + foto + '">' : '') +
          '<label for="cpPagado">Monto que pagaste</label><input id="cpPagado" type="number" inputmode="numeric" value="' + (monto() || '') + '">' +
          '<p class="cp-err" id="cpErr"></p><button type="button" class="cp-si" data-enviar style="width:100%">Enviar comprobante</button>' +
          '<details style="margin-top:12px"><summary>🏷️ Tengo un cupón</summary><div class="cp-fila"><input id="cpCupon" placeholder="CUPÓN" autocapitalize="characters" value="' + esc(cupon ? cupon.codigo : '') + '"><button type="button" data-cupon>Aplicar</button></div>' +
            (cupon ? '<p>Cupón ' + esc(cupon.codigo) + ': ' + cupon.pct + '% de descuento.</p>' : '') + '</details>' +
          keyHtml + pie;
        if (plan.k === 'otro') { const i = caja.querySelector('#cpOtro'); i.value = o._otro || ''; i.oninput = () => { o._otro = i.value; caja.querySelector('#cpMonto').textContent = pesos(monto()); caja.querySelector('#cpPagado').value = monto() || ''; }; }
        if (o._pagado) caja.querySelector('#cpPagado').value = o._pagado;
        caja.querySelector('#cpPagado').oninput = (ev) => { o._pagado = ev.target.value; };
      };
      pintar();
      caja.addEventListener('change', async (ev) => {
        if (ev.target.id !== 'cpFoto' || !ev.target.files[0]) return;
        try { foto = await achicar(ev.target.files[0]); pintar(); } catch (x) { caja.querySelector('#cpErr').textContent = x.message; }
      });
      caja.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-p],[data-m],[data-copiar],[data-datos],[data-enviar],[data-cupon],[data-key]'); if (!b) return;
        if (b.dataset.p) { plan = L[+b.dataset.p]; o._pagado = ''; pintar(); }
        else if ('cupon' in b.dataset) {
          const cod = caja.querySelector('#cpCupon').value.trim().toUpperCase();
          try { cupon = { codigo: cod, pct: await o.rpc('cfx_cupon_ver', { p_codigo: cod }) }; o._pagado = ''; pintar(); caja.querySelector('details').open = true; }
          catch (x) { caja.querySelector('#cpErr').textContent = (x && x.message) || String(x); }
        } else if ('key' in b.dataset) return;
        else if (b.dataset.m) { medio = b.dataset.m; o._pagado = ''; pintar(); }
        else if ('copiar' in b.dataset) { await copiar(String(monto())); b.textContent = '✓ Copiado'; }
        else if ('datos' in b.dataset) { await copiar([t.titular, t.rut, t.banco, t.tipo, t.numero, t.correo].filter(Boolean).join('\n')); b.textContent = '✓ Copiado'; }
        else {
          const err = caja.querySelector('#cpErr'), pagado = Math.round(Number(caja.querySelector('#cpPagado').value || 0));
          if (!foto) { err.textContent = 'Sube la foto del comprobante'; return; }
          if (pagado < 1) { err.textContent = 'Escribe el monto que pagaste'; return; }
          b.disabled = true; b.textContent = 'Enviando…';
          try {
            await o.rpc('cfx_pago_pedir', { p_periodo: plan.k, p_monto: pagado, p_medio: medio, p_comprobante: foto, p_nota: plan.k === 'otro' ? 'Otro monto' : '', p_cupon: cupon ? cupon.codigo : null });
            caja.innerHTML = '<h2>✅ ¡Recibido!</h2><div class="cp-ok">Revisamos tu comprobante y te avisamos apenas se active.</div>' + pie;
            if (o.alPagar) o.alPagar();
          } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = 'Enviar comprobante'; }
        }
      });
    }
    caja.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-key]')) {
        try {
          const r = await o.rpc('cfx_key_canjear', { p_codigo: caja.querySelector('#cpKey').value });
          caja.innerHTML = '<h2>🎉 ¡Listo!</h2><div class="cp-ok">Premium activo por ' + r.dias + ' días.</div><button type="button" data-x style="width:100%;margin-top:10px">Continuar</button>';
          obligatorio = false; clearInterval(vigia); if (o.alPagar) o.alPagar();
        } catch (x) { caja.querySelector('#cpKeyErr').textContent = (x && x.message) || String(x); }
        return;
      }
      if (ev.target.closest('[data-x]')) { cerrar(); if (e.bloqueado || e.debe_inicio) location.reload(); }
      if (ev.target.closest('[data-salir]')) { cerrar(); o.salir(); }
    });
    capa.addEventListener('click', (ev) => { if (ev.target === capa && !obligatorio) cerrar(); });
    capa.addEventListener('cancel', (ev) => { ev.preventDefault(); if (!obligatorio) cerrar(); });
    if (obligatorio) alFrente(capa);
    return e;
  }

  // Al entrar: si es un negocio que debe su primer pago, muestra la activación (y no deja seguir).
  async function revisar(o) {
    try {
      const e = await o.rpc('cfx_pago_estado');
      if (e && (e.bloqueado || (o.comoNegocio && e.debe_inicio))) await abrir(Object.assign({}, o, { obligatorio: true }));
      return e;
    } catch (x) { return null; }
  }

  window.CFX_PAGOS = { abrir, revisar, cerrar };
})();
