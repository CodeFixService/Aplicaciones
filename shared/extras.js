/* G96 🧩 Módulos de tienda (propio de Despega, no del núcleo): 🎁 Gift cards · 🛒 Carritos olvidados · 🔁 Compras recurrentes ·
   📦 Stock mínimo y proveedores · 🛒 Mercado Libre (G101). Cada uno se abre en su hoja del Más (CFX_MENU → abrir). Todo lo valida el servidor (pro_o_modulo).
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

  /* ---------- 🏬 Sucursales y bodegas (G96 b) ---------- */
  // El total de siempre es lo que ve la tienda online; cada sucursal guarda su parte y la principal es lo que queda.
  async function sucursales(z, o) {
    if (!puede('sucursales')) return candado(z, 'sucursales', 'Lleva el stock separado por local o bodega: la Caja de cada sucursal descuenta de lo suyo y mueves mercadería entre ellas con un toque.', o);
    let d; try { d = await R('bodegas_lista'); } catch (e) { return error(z, e); }
    const B = d.bodegas, otras = B.filter((b) => !b.principal), nom = (id) => (B.find((b) => b.id === id) || {}).nombre || '';
    const opt = (sel) => B.map((b) => '<option value="' + esc(b.id) + '"' + (b.id === sel ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('');
    const cant = (p, b) => b.principal ? (p.principal == null ? '' : Math.max(0, p.principal)) : (p.en[b.id] == null ? '' : p.en[b.id]);
    const c = caja(z, '<p class="muted">El stock total es el que ve tu tienda online. Cada sucursal tiene su parte; la principal es lo que queda. En la Caja eliges desde qué sucursal vendes.</p>' +
      '<h3>Sucursales</h3>' + (B.length ? B.map((b) => '<div class="gx-f"><div><b>' + (b.principal ? '⭐ ' : '🏬 ') + esc(b.nombre) + '</b><br><small class="muted">' +
        (b.principal ? 'Principal · aquí suman los pedidos online y la mercadería nueva' : esc(b.direccion || 'Sin dirección') + (b.telefono ? ' · +' + esc(b.telefono) : '')) + '</small></div>' +
        (d.dueno ? '<div class="btns"><button type="button" class="small alt" data-ren="' + esc(b.id) + '" aria-label="Cambiar nombre de ' + esc(b.nombre) + '">✏️</button>' +
          (b.principal ? '' : '<button type="button" class="small alt" data-borrarb="' + esc(b.id) + '" aria-label="Borrar sucursal ' + esc(b.nombre) + '">🗑️</button>') + '</div>' : '') + '</div>').join('')
        : '<p class="muted">Aún no tienes sucursales. Agrega la primera: tu stock de hoy queda en la principal (Casa matriz).</p>') +
      (d.dueno ? '<div class="gx-row" style="margin-top:6px"><input id="gxBn" maxlength="40" placeholder="Nombre" aria-label="Nombre de la sucursal">' +
        '<input id="gxBd" maxlength="120" placeholder="Dirección" aria-label="Dirección de la sucursal"></div>' +
        '<button type="button" class="small" data-gx="bodega" style="margin-top:6px">+ Agregar sucursal</button>' : '') +
      (otras.length && d.productos.length ? '<h3>⇄ Mover mercadería</h3><label for="gxMp">Producto</label><select id="gxMp">' +
        d.productos.map((p) => '<option value="' + esc(p.clave) + '">' + esc(p.nombre) + '</option>').join('') + '</select>' +
        '<div class="gx-row"><div><label for="gxMde">Desde</label><select id="gxMde">' + opt(B[0].id) + '</select></div><div><label for="gxMa">Hacia</label><select id="gxMa">' + opt(otras[0].id) + '</select></div></div>' +
        '<label for="gxMc">Cantidad</label><input id="gxMc" type="number" inputmode="numeric" min="1" placeholder="10">' +
        '<button type="button" class="ok" data-gx="mover" style="width:100%;margin-top:8px">⇄ Mover</button>' : '') +
      (otras.length ? '<h3>Stock por sucursal</h3><p class="muted">Escribe lo que contaste en cada una. Las opciones (talla, color) se cuentan en el total.</p>' +
        (d.productos.length ? d.productos.map((p, i) => '<div class="gx-f"><div><b>' + esc(p.nombre) + '</b><br><small class="muted">Total: ' + (p.total == null ? 'sin contar' : p.total) +
          (p.principal != null && p.principal < 0 ? ' · <span class="gx-bajo">⚠️ revisa: las sucursales suman más que el total</span>' : '') + '</small>' +
          '<div class="gx-row">' + B.map((b) => '<div><small>' + esc(b.nombre) + '</small><input type="number" min="0" inputmode="numeric" data-p="' + i + '" data-b="' + esc(b.id) + '" value="' + cant(p, b) +
            '" aria-label="Stock de ' + esc(p.nombre) + ' en ' + esc(b.nombre) + '"></div>').join('') + '</div></div></div>').join('')
          : '<p class="muted">Publica tus productos primero (Más → Productos).</p>') : ''));
    c.onchange = async (ev) => {
      const t = ev.target; if (t.dataset.p == null || !t.dataset.b) return;
      const p = d.productos[+t.dataset.p], v = t.value === '' ? 0 : Math.round(+t.value);
      if (!(v >= 0)) return Core.toast('Cantidad no válida');
      try { await R('bodega_stock_fijar', { p_bodega: t.dataset.b, p_clave: p.clave, p_cant: v }); Core.toast('✅ ' + p.nombre + ' en ' + nom(t.dataset.b) + ': ' + v); sucursales(z, o); } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.gx === 'bodega') {
          await R('bodega_guardar', { p_id: null, p_nombre: c.querySelector('#gxBn').value, p_direccion: c.querySelector('#gxBd').value, p_tel: null });
          Core.toast('🏬 Sucursal agregada'); return sucursales(z, o);
        }
        if (b.dataset.gx === 'mover') {
          const n = Math.round(+c.querySelector('#gxMc').value || 0); if (n <= 0) return Core.toast('Escribe cuántos mueves');
          await R('bodega_mover', { p_clave: c.querySelector('#gxMp').value, p_de: c.querySelector('#gxMde').value, p_a: c.querySelector('#gxMa').value, p_cant: n });
          Core.toast('⇄ Movidos ' + n); return sucursales(z, o);
        }
        if (b.dataset.ren) {
          const x = B.find((y) => y.id === b.dataset.ren); const nn = await Core.pedir('Nombre de la sucursal', x.nombre); if (!nn) return;
          await R('bodega_guardar', { p_id: x.id, p_nombre: nn, p_direccion: x.direccion, p_tel: x.telefono }); return sucursales(z, o);
        }
        if (b.dataset.borrarb) {
          if (!(await Core.confirmar('¿Borrar la sucursal ' + nom(b.dataset.borrarb) + '? Lo que tenía vuelve a la principal (no se pierde stock).'))) return;
          await R('bodega_borrar', { p_id: b.dataset.borrarb }); Core.toast('Sucursal borrada'); return sucursales(z, o);
        }
      } catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }
  // 📣 Promos en la app de tus clientes (núcleo).
  const promos = (z, o) => window.CFX_ANUNCIOS && CFX_ANUNCIOS.promos ? CFX_ANUNCIOS.promos(z, { rpc: R, probar: o.probar }) : error(z, 'Actualiza la app');

  /* ---------- 🛒 Mercado Libre (G101) ---------- */
  // La vuelta desde Mercado Libre (?code=…&state=ml…) la guarda index.html al partir (cfx-ml-volver); el canje lo hace el servidor.
  async function mercadolibre(z, o) {
    if (!puede('mercadolibre')) return candado(z, 'mercadolibre', 'Une tus productos con tus publicaciones de Mercado Libre: cuando vendes allá se descuenta aquí, y si cambias el stock aquí se actualiza allá.', o);
    let pend = null; try { pend = JSON.parse(sessionStorage.getItem('cfx-ml-volver') || 'null'); sessionStorage.removeItem('cfx-ml-volver'); } catch (e) { /* nada */ }
    if (pend) { try { const r = await R('ml_volver', { p_state: pend[0], p_code: pend[1] }); Core.toast('✅ Mercado Libre conectado' + (r && r.nick ? ': ' + r.nick : '')); } catch (e) { Core.toast('⚠️ ' + e.message); } }
    let d; try { d = await R('ml_estado'); } catch (e) { return error(z, e); }
    const irML = async (b) => { b.disabled = true; try { const u = await R('ml_conectar'); if (/^https:\/\/auth\.mercadolibre\.cl\//.test(u)) location.href = u; } catch (e) { b.disabled = false; Core.toast('⚠️ ' + e.message); } };
    if (!d.conectado) {
      const c = caja(z, '<p class="muted">Conecta tu cuenta de Mercado Libre y une cada producto con su publicación: el stock queda igual en los dos lados, sin anotar a mano.</p>' +
        (d.app ? '<button type="button" class="ok" data-ml="conectar">🔗 Conectar Mercado Libre</button><p><small class="muted">Te lleva a Mercado Libre a dar el permiso y vuelves aquí.</small></p>'
          : '<button type="button" disabled>🔗 Conectar Mercado Libre</button><p><small class="muted">⏳ CodeFix aún lo está activando. Si lo necesitas ya, escríbenos por 🛟 Soporte.</small></p>') +
        (d.vinculos.length ? '<p><small class="muted">Tienes ' + d.vinculos.length + ' publicaciones unidas guardadas: vuelven a funcionar al conectar.</small></p>' : ''));
      const b = c.querySelector('[data-ml=conectar]');
      if (b) b.onclick = () => irML(b);
      return;
    }
    const prod = (sel) => '<option value="">— Sin unir —</option>' + d.productos.map((p) => '<option value="' + esc(p.clave) + '"' + (p.clave === sel ? ' selected' : '') + '>' +
      esc(p.nombre) + (p.stock == null ? ' (sin stock)' : ' (' + p.stock + ')') + '</option>').join('');
    const est = (v) => !v.existe ? '⚠️ El producto ya no está' : v.error ? '⚠️ Mercado Libre: ' + esc(v.error) : v.stock == null ? 'Sin stock en tu tienda: no se manda' :
      v.enviado === v.stock ? '✅ ' + v.stock + ' en los dos lados' : '⏳ Se manda ' + v.stock + ' a Mercado Libre';
    const c = caja(z, '<p>✅ Conectado' + (d.nick ? ' como <b>' + esc(d.nick) + '</b>' : '') + (d.activo ? '' : ' · ⏸️ en pausa') + '</p>' +
      (d.error ? '<p class="gx-err">⚠️ ' + esc(d.error) + '</p><button type="button" class="ok" data-ml="conectar">🔗 Conectar de nuevo</button>' : '') +
      '<div class="gx-k"><div><small class="muted">Publicaciones unidas</small><b>' + d.vinculos.length + '</b></div><div><small class="muted">Vendidas en ML este mes</small><b>' + d.ventas_mes + '</b></div></div>' +
      '<div class="gx-row"><button type="button" data-ml="sync"' + (d.activo ? '' : ' disabled') + '>🔄 Sincronizar</button><button type="button" class="alt" data-ml="traer">📥 Unir publicaciones</button></div>' +
      '<p><small class="muted">Se revisa solo cada 5 minutos' + (d.revisado ? ' · última vez ' + hace(d.revisado) : '') + '.</small></p>' +
      '<div data-ml="lista"></div>' +
      '<h3>Unidas</h3>' + (d.vinculos.length ? d.vinculos.map((v) => '<div class="gx-f"><div><b>' + esc(v.nombre || v.titulo || v.item) + '</b><br><small class="muted">' + esc(v.item) +
        (v.titulo && v.nombre ? ' · ' + esc(v.titulo) : '') + '</small><br><small>' + est(v) + '</small></div><div class="btns"><button type="button" class="small alt" data-soltar="' + esc(v.item) + '">Soltar</button></div></div>').join('')
        : '<p class="muted">Aún no unes ninguna. Toca 📥 Unir publicaciones.</p>') +
      '<div class="gx-row" style="margin-top:12px"><button type="button" class="alt" data-ml="pausa">' + (d.activo ? '⏸️ Pausar' : '▶️ Reanudar') + '</button><button type="button" class="alt" data-ml="salir">Desconectar</button></div>');
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b || b.disabled) return;
      try {
        const k = b.dataset.ml;
        if (k === 'conectar') return irML(b);
        if (k === 'sync') { b.disabled = true; b.textContent = 'Revisando…'; const n = await R('ml_sincronizar_mio'); Core.toast(n ? '✅ ' + n + ' cambios al día' : '✅ Todo al día'); return mercadolibre(z, o); }
        if (k === 'pausa') { await R('ml_pausar', { p_activo: !d.activo }); return mercadolibre(z, o); }
        if (k === 'salir') { if (!(await Core.confirmar('¿Desconectar Mercado Libre? Las publicaciones unidas quedan guardadas para cuando vuelvas a conectar.'))) return; await R('ml_desconectar'); return mercadolibre(z, o); }
        if (k === 'traer') {
          const l = c.querySelector('[data-ml=lista]'); b.disabled = true; l.innerHTML = '<p class="muted">Trayendo tus publicaciones…</p>';
          let P; try { P = await R('ml_publicaciones'); } catch (e) { b.disabled = false; l.innerHTML = '<p class="gx-err">⚠️ ' + esc(e.message) + '</p>'; return; }
          b.disabled = false;
          l.innerHTML = '<h3>Tus publicaciones activas</h3>' + (P.length ? '<p><small class="muted">Elige qué producto de tu tienda es cada una.</small></p>' + P.map((p) => '<div class="gx-f">' +
            (p.foto ? '<img src="' + esc(p.foto) + '" alt="" width="44" height="44" style="border-radius:8px;object-fit:cover;flex:none;background:var(--cfx-suave,#8881)">' : '') +
            '<div><b>' + esc(p.titulo) + '</b><br><small class="muted">' + esc(p.item) + ' · ' + $$(p.precio) + (p.stock == null ? '' : ' · ' + p.stock + ' disp.') + '</small>' +
            '<select data-unir="' + esc(p.item) + '" data-tit="' + esc(p.titulo) + '" aria-label="Producto de tu tienda">' + prod(p.clave) + '</select></div></div>').join('')
            : '<p class="muted">No encontramos publicaciones activas en tu Mercado Libre.</p>');
          return;
        }
        if (b.dataset.soltar) { await R('ml_vincular', { p_item: b.dataset.soltar, p_clave: null }); Core.toast('Soltada'); return mercadolibre(z, o); }
      } catch (e) { Core.toast('⚠️ ' + e.message); b.disabled = false; }
    };
    c.onchange = async (ev) => {
      const s = ev.target.closest('[data-unir]'); if (!s) return;
      try { await R('ml_vincular', { p_item: s.dataset.unir, p_clave: s.value || null, p_titulo: s.dataset.tit }); Core.toast(s.value ? '✅ Unida: el stock se manda en unos minutos' : 'Soltada'); return mercadolibre(z, o); }
      catch (e) { Core.toast('⚠️ ' + e.message); }
    };
  }

  window.EXTRAS = { giftcards, carritos, recurrentes, misRecurrentes, proveedores, sucursales, promos, mercadolibre };
})();
