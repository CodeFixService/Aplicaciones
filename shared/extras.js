/* G96 🧩 Módulos de tienda (propio de Despega, no del núcleo): 🎁 Gift cards · 🛒 Carritos olvidados · 🔁 Compras recurrentes ·
   📦 Stock mínimo y proveedores. Cada uno se abre en su hoja del Más (CFX_MENU → abrir). Todo lo valida el servidor (pro_o_modulo).
   Sin el módulo: qué hace + ▶️ Probar módulo (demo + 🎁 prueba 7 días + Comprar, núcleo). */
(function () {
  'use strict';
  const esc = (s) => Core.esc(s == null ? '' : String(s)), $$ = (n) => Core.money(Math.round(Number(n) || 0));
  const fecha = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL') : '';
  const hace = (d) => { const h = Math.round((Date.now() - new Date(d)) / 36e5); return h < 1 ? 'recién' : h < 24 ? 'hace ' + h + ' h' : 'hace ' + Math.round(h / 24) + ' d'; };
  const wa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '56' + d; else if (d.length === 8) d = '569' + d; return /^\d{10,15}$/.test(d) ? d : ''; };
  const abrirWa = (tel, txt) => window.open('https://wa.me/' + (wa(tel) || '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  const R = (f, a) => Cuenta.rpc(f, a);
  const css = '.gx p{margin:4px 0}.gx .gx-f{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--cfx-borde,#8883)}' +
    '.gx .gx-f>div{flex:1;min-width:0;overflow-wrap:anywhere}.gx .gx-f .btns{flex:none;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}' +
    '.gx .gx-k{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:6px 0}.gx .gx-k>div{background:var(--cfx-suave,#8881);border-radius:12px;padding:8px}' +
    '.gx .gx-k b{display:block;font-size:18px}.gx .gx-cod{font:700 20px/1.2 monospace;letter-spacing:1px}.gx .gx-bajo{color:var(--cfx-rojo,#c0392b)}' +
    '.gx .gx-row{display:flex;gap:8px;flex-wrap:wrap}.gx .gx-row>*{flex:1;min-width:120px}.gx .gx-err{color:var(--cfx-rojo,#c0392b)}';
  function estilo() { if (!document.getElementById('gx-css')) { const s = document.createElement('style'); s.id = 'gx-css'; s.textContent = css; document.head.appendChild(s); } }
  const puede = (k) => window.Cuenta && Cuenta.puede(k);
  // Sin el módulo: qué hace + 1 botón.
  function candado(z, k, txt, o) {
    z.innerHTML = '<div class="gx"><p class="muted">' + txt + '</p><p>🧩 Es un módulo: pruébalo gratis o actívalo.</p>' +
      '<button type="button" class="ok" data-gx="probar">▶️ Probar módulo</button></div>';
    z.querySelector('[data-gx=probar]').onclick = () => o.probar(k);
  }
  const caja = (z, h) => { estilo(); z.innerHTML = '<div class="gx">' + h + '</div>'; return z.firstChild; };
  const error = (z, e) => { z.innerHTML = '<p class="muted">⚠️ ' + esc(e.message || e) + '</p>'; };

  /* ---------- 🎁 Gift cards ---------- */
  async function giftcards(z, o) {
    if (!puede('giftcards')) return candado(z, 'giftcards', 'Vende tarjetas de regalo con código. Se canjean en la Caja (🎁 Gift card) o en el carrito de tu tienda, hasta agotar el saldo.', o);
    let d; try { d = await R('giftcard_lista'); } catch (e) { return error(z, e); }
    const tienda = (Cuenta.account || {}).empresa || 'mi tienda';
    const msg = (g) => '🎁 Gift card de ' + tienda + ' por ' + $$(g.saldo) + (g.para ? ' para ' + g.para : '') + '\nCódigo: ' + g.codigo +
      '\nÚsala en la caja o escríbela en el carrito (campo Cupón) hasta el ' + fecha(g.vence) + '.';
    const fila = (g) => '<div class="gx-f"><div><b class="gx-cod">' + esc(g.codigo) + '</b><br><small class="muted">' + $$(g.saldo) + ' de ' + $$(g.monto) +
      (g.para ? ' · para ' + esc(g.para) : '') + ' · ' + (g.anulada ? '❌ anulada' : g.vigente ? 'vence ' + fecha(g.vence) : g.saldo > 0 ? '⌛ vencida' : '✅ usada') + '</small></div>' +
      '<div class="btns">' + (g.vigente ? '<button type="button" class="small alt" data-wa="' + esc(g.id) + '" aria-label="Enviar por WhatsApp">💬</button>' +
      '<button type="button" class="small alt" data-anular="' + esc(g.id) + '">Anular</button>' : '') + '</div></div>';
    const c = caja(z, '<div class="gx-k"><div><small class="muted">Vendidas este mes</small><b>' + $$(d.vendido_mes) + '</b></div><div><small class="muted">Saldo por canjear</small><b>' + $$(d.saldo) + '</b></div></div>' +
      '<h3>Vender una gift card</h3><label for="gxMonto">Monto</label><input id="gxMonto" type="number" inputmode="numeric" min="1000" step="500" placeholder="15000">' +
      '<div class="gx-row"><div><label for="gxPara">Para (opcional)</label><input id="gxPara" maxlength="60" placeholder="Papá"></div><div><label for="gxDe">De (opcional)</label><input id="gxDe" maxlength="60" placeholder="Ana"></div></div>' +
      '<label for="gxMedio">Cómo te pagaron</label><select id="gxMedio"><option value="efectivo">💵 Efectivo</option><option value="tarjeta">💳 Tarjeta</option><option value="transferencia">📲 Transferencia</option></select>' +
      '<button type="button" class="ok" data-gx="crear" style="width:100%;margin-top:8px">🎁 Crear gift card</button><div id="gxNueva"></div>' +
      '<h3>Tus gift cards</h3>' + (d.lista.length ? d.lista.map(fila).join('') : '<p class="muted">Aún no vendes gift cards.</p>'));
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.gx === 'crear') {
        const m = Math.round(+c.querySelector('#gxMonto').value || 0);
        if (m < 1000) return Core.toast('Monto desde $1.000');
        b.disabled = true;
        try {
          const g = await R('giftcard_crear', { p_monto: m, p_para: c.querySelector('#gxPara').value, p_de: c.querySelector('#gxDe').value, p_medio: c.querySelector('#gxMedio').value });
          Core.toast('🎁 Gift card ' + g.codigo + ' creada');
          await giftcards(z, o);
          const n = z.querySelector('#gxNueva');
          if (n) {
            n.innerHTML = '<div class="gx-k" style="grid-template-columns:1fr"><div><small class="muted">Nueva gift card</small><b class="gx-cod">' + esc(g.codigo) + '</b><small>' + $$(g.monto) + ' · vence ' + fecha(g.vence) + '</small>' +
              '<div class="btns" style="margin-top:6px"><button type="button" class="small" data-copiar>📋 Copiar</button><button type="button" class="small ok" data-wanueva>💬 Enviar por WhatsApp</button></div></div></div>';
            n.querySelector('[data-copiar]').onclick = () => { try { navigator.clipboard.writeText(msg(g)); Core.toast('📋 Copiado'); } catch (e) { Core.toast(g.codigo); } };
            n.querySelector('[data-wanueva]').onclick = () => abrirWa('', msg(g));
          }
        } catch (e) { Core.toast('⚠️ ' + e.message); b.disabled = false; }
        return;
      }
      const g = d.lista.find((x) => x.id === (b.dataset.wa || b.dataset.anular));
      if (!g) return;
      if (b.dataset.wa) return abrirWa('', msg(g));
      if (!(await Core.confirmar('¿Anular la gift card ' + g.codigo + '? Ya no se podrá usar.'))) return;
      try { await R('giftcard_anular', { p_id: g.id }); Core.toast('Gift card anulada'); giftcards(z, o); } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }

  /* ---------- 🛒 Carritos olvidados ---------- */
  async function carritos(z, o) {
    if (!puede('carrito')) return candado(z, 'carrito', 'Mira quién dejó productos en el carrito sin pedir y escríbele por WhatsApp con un toque. Además le llega un aviso solo al día siguiente.', o);
    let L; try { L = await R('cfx_carritos_mios'); } catch (e) { return error(z, e); }
    const tienda = (Cuenta.account || {}).empresa || 'nuestra tienda';
    const link = (Cuenta.account || {}).slug ? Core.rootUrl() + 't/?s=' + encodeURIComponent(Cuenta.account.slug) : '';
    const txt = (x) => 'Hola ' + (x.nombre || '') + ' 👋 Vimos que dejaste en tu carrito de ' + tienda + ': ' + (x.items || []).map((i) => i.cant + ' × ' + (i.nombre || 'producto')).join(', ') +
      '. ¿Te ayudo a terminar tu pedido?' + (link ? ' ' + link : '');
    const c = caja(z, '<p class="muted">Clientes con productos en el carrito sin pedir (últimos 14 días).</p>' + (L.length ? L.map((x, i) =>
      '<div class="gx-f"><div><b>' + esc(x.nombre) + '</b><br><small class="muted">' + esc((x.items || []).map((it) => it.cant + ' × ' + (it.nombre || 'producto')).join(', ')) + ' · ' + hace(x.actualizado) +
      (x.wa_at ? ' · ✓ le escribiste' : x.avisado ? ' · 🔔 aviso enviado' : '') + '</small></div><div class="btns">' +
      (wa(x.tel) ? '<button type="button" class="small ok" data-i="' + i + '">💬 WhatsApp</button>' : '<small class="muted">Sin WhatsApp</small>') + '</div></div>').join('')
      : '<p>🎉 No hay carritos olvidados.</p>'));
    c.onclick = (ev) => {
      const b = ev.target.closest('[data-i]'); const x = b && L[+b.dataset.i]; if (!x) return;
      abrirWa(x.tel, txt(x)); R('cfx_carrito_wa', { p_cliente: x.cliente }).catch(() => {});
      x.wa_at = new Date().toISOString(); b.textContent = '✓ Escrito';
    };
  }

  /* ---------- 🔁 Compras recurrentes ---------- */
  async function recurrentes(z, o) {
    if (!puede('suscripciones')) return candado(z, 'suscripciones', 'Arma el pedido fijo de un cliente (ej. 1 kg de café cada 15 días): el pedido se crea solo ese día y al cliente le llega el aviso para pagar.', o);
    let L, cli, prods;
    try { [L, cli, prods] = await Promise.all([R('suscripciones_lista'), R('my_clients'), R('catalog_of', { p_negocio: Cuenta.account.id })]); } catch (e) { return error(z, e); }
    prods = (prods || []).filter((p) => p.client_key || p.clave);
    const clave = (p) => p.client_key || p.clave;
    const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const optP = '<option value="">Producto…</option>' + prods.map((p) => '<option value="' + esc(clave(p)) + '">' + esc(p.nombre) + ' · ' + $$(p.precio) + '</option>').join('');
    const linea = () => '<div class="gx-row gx-l"><select class="gxP">' + optP + '</select><input class="gxC" type="number" min="1" max="99" value="1" style="max-width:80px;min-width:64px" aria-label="Cantidad"></div>';
    const fila = (x) => '<div class="gx-f"><div><b>' + esc(x.nombre) + '</b> · cada ' + x.cada + ' días<br><small class="muted">' +
      esc((x.lineas || []).map((l) => l.cant + ' × ' + l.nombre).join(', ')) + (x.total != null ? ' · ' + $$(x.total) : '') + '<br>' +
      (x.activa ? '📅 Próximo: ' + fecha(x.proxima) : '⏸️ Pausada') + ' · ' + x.pedidos + ' pedido(s)</small>' + (x.error ? '<br><small class="gx-err">⚠️ ' + esc(x.error) + '</small>' : '') + '</div>' +
      '<div class="btns"><button type="button" class="small alt" data-est="' + esc(x.id) + '">' + (x.activa ? '⏸️ Pausar' : '▶️ Seguir') + '</button>' +
      '<button type="button" class="small alt" data-borrar="' + esc(x.id) + '" aria-label="Borrar">🗑️</button></div></div>';
    const c = caja(z, '<p class="muted">El pedido se crea solo el día que toca, con los precios del día, y le avisamos al cliente.</p>' +
      (cli.length && prods.length ? '<h3>Nueva compra recurrente</h3><label for="gxCli">Cliente</label><select id="gxCli"><option value="">Elige…</option>' +
        cli.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.nombre || x.email) + '</option>').join('') + '</select>' +
        '<label>Productos</label><div id="gxLs">' + linea() + '</div><button type="button" class="small alt" data-gx="mas">+ Otro producto</button>' +
        '<div class="gx-row"><div><label for="gxCada">Cada</label><select id="gxCada"><option value="7">7 días</option><option value="14">14 días</option><option value="30" selected>30 días</option></select></div>' +
        '<div><label for="gxDesde">Primer pedido</label><input id="gxDesde" type="date" min="' + hoy + '" value="' + hoy + '"></div></div>' +
        '<label for="gxEnt">Entrega</label><select id="gxEnt"><option value="retiro">🏪 Retiro en tienda</option><option value="despacho">🚚 Despacho</option></select>' +
        '<input id="gxDir" class="hidden" maxlength="200" placeholder="Dirección y comuna" aria-label="Dirección de despacho">' +
        '<button type="button" class="ok" data-gx="guardar" style="width:100%;margin-top:8px">🔁 Guardar</button>'
        : '<p>' + (cli.length ? 'Publica tus productos primero.' : 'Primero invita a tus clientes (Más → Clientes).') + '</p>') +
      '<h3>Activas</h3>' + (L.length ? L.map(fila).join('') : '<p class="muted">Aún no tienes compras recurrentes.</p>'));
    const ent = c.querySelector('#gxEnt'); if (ent) ent.onchange = () => c.querySelector('#gxDir').classList.toggle('hidden', ent.value !== 'despacho');
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.gx === 'mas') { c.querySelector('#gxLs').insertAdjacentHTML('beforeend', linea()); return; }
      if (b.dataset.gx === 'guardar') {
        const items = [...c.querySelectorAll('.gx-l')].map((l) => ({ clave: l.querySelector('.gxP').value, cant: +l.querySelector('.gxC').value || 1 })).filter((x) => x.clave);
        b.disabled = true;
        try {
          await R('suscripcion_guardar', { p: { cliente: c.querySelector('#gxCli').value, items, cada: +c.querySelector('#gxCada').value, entrega: ent.value,
            direccion: c.querySelector('#gxDir').value, proxima: c.querySelector('#gxDesde').value } });
          Core.toast('🔁 Compra recurrente guardada'); recurrentes(z, o);
        } catch (e) { Core.toast('⚠️ ' + e.message); b.disabled = false; }
        return;
      }
      const x = L.find((y) => y.id === (b.dataset.est || b.dataset.borrar)); if (!x) return;
      try {
        if (b.dataset.est) await R('suscripcion_estado', { p_id: x.id, p_activa: !x.activa });
        else { if (!(await Core.confirmar('¿Borrar la compra recurrente de ' + x.nombre + '?'))) return; await R('suscripcion_borrar', { p_id: x.id }); }
        recurrentes(z, o);
      } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }
  // El cliente: sus compras recurrentes (pausar / seguir). Sin ninguna, no muestra nada.
  async function misRecurrentes(z) {
    let L; try { L = await R('mis_suscripciones'); } catch (e) { L = []; }
    if (!L.length) { z.innerHTML = ''; z.classList.add('hidden'); return; }
    z.classList.remove('hidden');
    const c = caja(z, '<h2>🔁 Tus compras recurrentes</h2>' + L.map((x) => '<div class="gx-f"><div><b>' + esc(x.tienda) + '</b> · cada ' + x.cada + ' días<br><small class="muted">' +
      esc((x.lineas || []).map((l) => l.cant + ' × ' + l.nombre).join(', ')) + '<br>' + (x.activa ? '📅 Próximo: ' + fecha(x.proxima) : '⏸️ Pausada') + '</small></div>' +
      '<div class="btns"><button type="button" class="small alt" data-est="' + esc(x.id) + '">' + (x.activa ? '⏸️ Pausar' : '▶️ Seguir') + '</button></div></div>').join(''));
    c.onclick = async (ev) => {
      const b = ev.target.closest('[data-est]'); const x = b && L.find((y) => y.id === b.dataset.est); if (!x) return;
      try { await R('suscripcion_estado', { p_id: x.id, p_activa: !x.activa }); Core.toast(x.activa ? '⏸️ Pausada' : '▶️ Retomada'); misRecurrentes(z); } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }

  /* ---------- 📦 Stock mínimo y proveedores ---------- */
  async function proveedores(z, o) {
    if (!puede('proveedores')) return candado(z, 'proveedores', 'Ponle a cada producto su stock mínimo y su proveedor: te avisamos cuando baja y armas el pedido por WhatsApp con un toque.', o);
    let d; try { d = await R('proveedores_lista'); } catch (e) { return error(z, e); }
    const optV = (sel) => '<option value="">Sin proveedor</option>' + d.proveedores.map((v) => '<option value="' + esc(v.id) + '"' + (v.id === sel ? ' selected' : '') + '>' + esc(v.nombre) + '</option>').join('');
    const bajos = d.productos.filter((p) => p.bajo).length;
    const c = caja(z, '<div class="gx-k"><div><small class="muted">Bajo el mínimo</small><b' + (bajos ? ' class="gx-bajo"' : '') + '>' + bajos + '</b></div><div><small class="muted">Proveedores</small><b>' + d.proveedores.length + '</b></div></div>' +
      '<h3>Proveedores</h3>' + d.proveedores.map((v) => '<div class="gx-f"><div><b>' + esc(v.nombre) + '</b><br><small class="muted">' + (v.tel ? '+' + esc(v.tel) : 'Sin WhatsApp') + ' · ' + v.bajos + ' por pedir</small></div>' +
        '<div class="btns">' + (v.bajos ? '<button type="button" class="small ok" data-pedir="' + esc(v.id) + '">💬 Pedir</button>' : '') +
        '<button type="button" class="small alt" data-borrarv="' + esc(v.id) + '" aria-label="Borrar proveedor">🗑️</button></div></div>').join('') +
      '<div class="gx-row" style="margin-top:6px"><input id="gxVn" maxlength="60" placeholder="Nombre del proveedor" aria-label="Nombre del proveedor"><input id="gxVt" inputmode="tel" maxlength="16" placeholder="+56 9 1234 5678" aria-label="WhatsApp del proveedor"></div>' +
      '<button type="button" class="small" data-gx="prov" style="margin-top:6px">+ Agregar proveedor</button>' +
      '<h3>Productos</h3><p class="muted">Mínimo = cuántos quieres tener siempre. Al bajar de ahí te avisamos.</p>' +
      (d.productos.length ? d.productos.map((p, i) => '<div class="gx-f"><div><b' + (p.bajo ? ' class="gx-bajo"' : '') + '>' + esc(p.nombre) + '</b><br><small class="muted">Stock: ' + (p.stock == null ? 'sin contar' : p.stock) + (p.bajo ? ' · ⚠️ bajo el mínimo' : '') + '</small>' +
        '<div class="gx-row"><input type="number" min="0" max="100000" inputmode="numeric" data-min="' + i + '" value="' + (p.min == null ? '' : p.min) + '" placeholder="Mínimo" aria-label="Stock mínimo de ' + esc(p.nombre) + '" style="max-width:110px">' +
        '<select data-prov="' + i + '" aria-label="Proveedor de ' + esc(p.nombre) + '">' + optV(p.proveedor) + '</select></div></div></div>').join('')
        : '<p class="muted">Publica tus productos primero (Más → Productos).</p>'));
    c.onchange = async (ev) => {
      const i = ev.target.dataset.min || ev.target.dataset.prov; if (i == null) return;
      const p = d.productos[+i], m = c.querySelector('[data-min="' + i + '"]').value, v = c.querySelector('[data-prov="' + i + '"]').value;
      try { await R('producto_minimo', { p_clave: p.clave, p_min: m === '' ? null : Math.round(+m), p_proveedor: v || null }); Core.toast('✅ ' + p.nombre + ' guardado'); } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.gx === 'prov') {
          await R('proveedor_guardar', { p_id: null, p_nombre: c.querySelector('#gxVn').value, p_tel: c.querySelector('#gxVt').value, p_nota: null });
          Core.toast('✅ Proveedor agregado'); return proveedores(z, o);
        }
        if (b.dataset.pedir) { const r = await R('pedido_proveedor', { p_id: b.dataset.pedir }); return abrirWa(r.tel, r.texto); }
        if (b.dataset.borrarv) {
          const v = d.proveedores.find((x) => x.id === b.dataset.borrarv);
          if (!(await Core.confirmar('¿Borrar a ' + (v ? v.nombre : 'este proveedor') + '? Sus productos quedan sin proveedor.'))) return;
          await R('proveedor_borrar', { p_id: b.dataset.borrarv }); return proveedores(z, o);
        }
      } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }

  window.EXTRAS = { giftcards, carritos, recurrentes, misRecurrentes, proveedores };
})();
