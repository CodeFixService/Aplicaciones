(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  Core.registerSW('../../');
  Core.marca();
  const cuenta = await Cuenta.require('../../');
  // Clientes: Caja privada solo con Premium (sus productos no se publican en ningún lado).
  const esCliente = cuenta.role === 'client';
  if (esCliente && !cuenta.is_pro) { location.replace('../../#plan'); return; }
  const equipo = cuenta.role === 'equipo';
  Cuenta.nav(esCliente ? 'cuenta' : 'caja');
  const db = Core.store('caja:' + cuenta.id);
  if (!localStorage.getItem('caja:migrado')) {
    const viejo = Core.store('caja').dump();
    Object.keys(viejo).forEach((k) => { localStorage.setItem(k.replace(/^caja:/, 'caja:' + cuenta.id + ':'), viejo[k]); localStorage.removeItem(k); });
    localStorage.setItem('caja:migrado', '1');
  }
  const pro = Cuenta.isPro();
  const FREE_PRODUCTOS = 50, PRO_PRODUCTOS = 200;
  const LIMITE = pro ? PRO_PRODUCTOS : FREE_PRODUCTOS;
  const alLimite = () => Core.toast(pro ? 'Llegaste al máximo de ' + PRO_PRODUCTOS + ' productos'
    : '⭐ Llegaste a ' + FREE_PRODUCTOS + ' productos. Pásate a Pro para tener hasta ' + PRO_PRODUCTOS + ' (o agrupa colores y tallas como opciones).');
  const soloPro = (que) => Core.toast('⭐ ' + que + ' es de la versión Pro');

  // Montos en pesos: sin decimales cuando son enteros.
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
  // "1.500" = mil quinientos (punto de miles); "2,5" o "2.5" = dos coma cinco.
  const num = (v) => {
    let t = String(v == null ? '' : v).trim().replace(/[$\s]/g, '');
    t = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? NaN : n;
  };

  let productos = db.get('productos', []).map((p) => Object.assign({ categoria: '', publicado: false, premium: null }, p));
  // Equipo: vende los productos publicados del negocio (sin editar precios ni ver finanzas).
  // Rol en el equipo: vendedor (vende), bodega (inventario) o admin (las dos cosas). Nadie del equipo edita productos ni ve Finanzas.
  const rol = equipo ? (cuenta.equipo_rol || 'vendedor') : '';
  const vende = !equipo || rol !== 'bodega', invEquipo = equipo && rol !== 'vendedor';
  if (equipo) {
    ['tabProd', 'tabFin'].forEach((id) => $(id).classList.add('hidden'));
    if (invEquipo) {
      $('tabProd').classList.remove('hidden');
      $('tabProd').lastChild.textContent = 'Inventario';
      document.querySelectorAll('#v-productos > .card:not(#invCard)').forEach((c) => c.classList.add('hidden'));
    }
    if (!vende) document.querySelectorAll('nav.tabs button[data-v="vender"], nav.tabs button[data-v="reporte"]').forEach((b) => b.classList.add('hidden'));
    try {
      const l = await Cuenta.rpc('catalog_of', { p_negocio: cuenta.negocio_id });
      productos = l.map((x) => ({ id: x.clave, nombre: x.nombre, precio: Number(x.precio), costo: 0, stock: '', categoria: x.categoria || '', publicado: true, ops: x.opciones || '' }));
      db.set('productos', productos);
    } catch (e) { /* sin red: usa la copia */ }
  }
  // Un solo stock: el del servidor (lo descuentan la Caja y los pedidos online aprobados).
  let pendStock = db.get('stockPend', []);
  async function enviarStock() {
    if (esCliente || !pendStock.length) return;
    try { await Cuenta.rpc('caja_descontar', { p_items: pendStock }); pendStock = []; db.set('stockPend', []); } catch (e) { /* sin red: se envía después */ }
  }
  async function traerStock() {
    if (esCliente) return;
    try {
      const l = await Cuenta.rpc('inventario');
      productos.forEach((p) => { if (p.publicado) p.apartado = 0; });
      l.forEach((x) => {
        const p = productos.find((y) => y.id === x.clave && y.publicado);
        if (!p) return;
        if (x.opcion == null) { p.stock = x.stock; p.apartado = x.apartado; return; }
        p.vars = p.vars || [];
        const v = p.vars.find((y) => y.nombre.toLowerCase() === x.opcion.toLowerCase());
        const d = { stock: x.stock, apartado: x.apartado, precio: x.precio == null ? null : Number(x.precio) };
        if (v) Object.assign(v, d); else p.vars.push(Object.assign({ nombre: x.opcion }, d));
      });
      guardarProductos(); renderProds(); renderInv();
    } catch (e) { /* sin red */ }
  }
  let ventas = db.get('ventas', []);
  let ticket = [];
  let medio = 'efectivo';
  let cat = '';
  let editId = null;

  document.querySelectorAll('nav.tabs button').forEach((b) => { b.onclick = () => show(b.dataset.v); });
  function show(v) {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    scrollTo(0, 0);
    if (v === 'productos') { renderLista(); renderInv(); }
    if (v === 'reporte') renderReporte();
    if (v === 'finanzas') renderFinanzas();
    if (v === 'vender') renderProds();
  }
  const categorias = () => [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const guardarProductos = () => db.set('productos', productos);

  /* ---------- Vender ---------- */
  function renderCats() {
    const cs = categorias();
    $('listaCats').innerHTML = cs.map((c) => '<option value="' + Core.esc(c) + '">').join('');
    $('cats').innerHTML = cs.length ? ['<button class="small ' + (cat ? 'alt' : 'on') + '" data-c="">Todas</button>']
      .concat(cs.map((c) => '<button class="small ' + (cat === c ? 'on' : 'alt') + '" data-c="' + Core.esc(c) + '">' + Core.esc(c) + '</button>')).join('') : '';
  }
  $('cats').onclick = (e) => { if (e.target.dataset.c !== undefined) { cat = e.target.dataset.c; renderProds(); } };
  $('q').oninput = () => renderProds();

  function renderProds() {
    renderCats();
    // Aviso de stock bajo (3 o menos).
    const bajos = [];
    productos.forEach((p) => {
      if (p.stock !== '' && p.stock != null && p.stock <= 3) bajos.push(p.nombre + ' (' + p.stock + ')');
      if (p.ops) (p.vars || []).forEach((v) => { if (v.stock != null && v.stock <= 3 && opsDe(p).some((o) => o.toLowerCase() === v.nombre.toLowerCase())) bajos.push(p.nombre + ' ' + v.nombre + ' (' + v.stock + ')'); });
    });
    $('stockBajo').classList.toggle('hidden', !bajos.length);
    $('stockBajo').innerHTML = '⚠️ <b>Stock bajo:</b> ' + bajos.map(Core.esc).join(', ');
    const q = $('q').value.trim().toLowerCase();
    const l = productos.filter((p) => (!cat || p.categoria === cat) && (!q || p.nombre.toLowerCase().includes(q)));
    $('prods').innerHTML = '<button class="prod otro" id="bOtro"><b>➕ Otro</b><small>sin registrar</small></button>' +
      l.map((p) => '<button class="prod' + (p.stock !== '' && p.stock <= 3 ? ' low' : '') + '" data-id="' + p.id + '">' + (p.vip ? '<small>⭐ VIP</small>' : '') +
        '<b>' + Core.esc(p.nombre) + '</b><span>' + money(p.precio) + '</span>' +
        '<small>' + (p.stock === '' ? Core.esc(p.categoria || '') : 'Stock: ' + p.stock) + '</small></button>').join('') +
      (!productos.length ? '<p class="empty" style="grid-column:1/-1">Agrega tus productos en 📦 o usa ➕ Otro para vender algo al tiro.</p>' : '');
  }
  $('prods').onclick = (e) => {
    const b = e.target.closest('.prod');
    if (!b) return;
    if (b.id === 'bOtro') return abrirOtro();
    const p = productos.find((x) => x.id === b.dataset.id);
    const ops = opsDe(p);
    if (!ops.length) return agregar({ id: p.id, nombre: p.nombre, precio: +p.precio, costo: +p.costo || 0 });
    const txt = ops.map((o) => { const v = varDe(p, o); return o + (v && v.stock != null ? ' · stock ' + v.stock : '') + (v && v.precio != null ? ' · ' + money(v.precio) : ''); });
    Core.elegir(p.nombre + ': ¿qué opción?', txt).then((t) => {
      if (t == null) return;
      const o = ops[txt.indexOf(t)], v = varDe(p, o);
      agregar({ id: p.id, opcion: o, nombre: p.nombre + ' (' + o + ')', precio: v && v.precio != null ? +v.precio : +p.precio, costo: +p.costo || 0 });
    });
  };
  const opsDe = (p) => (p.ops || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
  const varDe = (p, o) => (p.vars || []).find((v) => v.nombre.toLowerCase() === String(o).toLowerCase());

  function agregar(item) {
    const line = ticket.find((l) => l.id === item.id && l.precio === item.precio && (l.opcion || '') === (item.opcion || ''));
    if (line) line.cant++; else ticket.push(Object.assign({ cant: 1 }, item));
    $('bComp').hidden = true;
    if (navigator.vibrate) navigator.vibrate(12);
    renderTicket();
  }

  /* ---------- 🎤 G20: venta por voz en la misma pantalla ----------
     "2 cortinas rojas, 50 globos rojos de 9 pulgadas" → busca cada producto (aproximado, núcleo CFX_PEDIDO), arma las líneas y las
     agrega a la venta; al Cobrar se descuenta el stock y queda el comprobante, como siempre. Elige mejor entre parecidos con lo más
     vendido: ventas de esta Caja + lo que calculó el análisis de anoche (analisis.py → voz). */
  let vozL = [], vozFrec = null, vozRec = null;
  async function frecuentes() {
    if (vozFrec) return vozFrec;
    const f = {}, lin = {}, desde = Date.now() - 90 * 864e5;
    ventas.filter((v) => (v.fecha || v.t || 0) >= desde || !(v.fecha || v.t)).forEach((v) => (v.items || []).forEach((l) => {
      const k = l.id; if (!k) return; (f[k] = f[k] || { u: 0, cant: 1 }).u += l.cant || 1; (lin[k] = lin[k] || []).push(l.cant || 1);
    }));
    try {
      const an = await Cuenta.rpc('cfx_analisis_mio');
      ((an && an.voz) || []).forEach((x) => { (f[x.k] = f[x.k] || { u: 0, cant: x.cant || 1 }).u += x.u || 0; if (!lin[x.k]) f[x.k].cant = x.cant || 1; });
    } catch (e) { /* sin módulo de análisis o sin red */ }
    Object.keys(lin).forEach((k) => { const a = lin[k].slice().sort((x, y) => x - y); f[k].cant = a[a.length >> 1]; });
    return (vozFrec = f);
  }
  const vozCat = () => productos.map((p) => ({ id: p.id, nombre: p.nombre, ops: opsDe(p), alias: p.categoria || '' }));
  const stockDe = (p, o) => { const v = o ? varDe(p, o) : null; return v && v.stock != null ? +v.stock : p.stock === '' || p.stock == null ? null : +p.stock; };
  async function vozArmar(txt) {
    $('vozTxt').value = txt;
    if (!txt.trim()) { $('vozEstado').textContent = 'No se escuchó nada. Toca 🎤 Otra vez o escríbelo.'; return; }
    const r = window.CFX_PEDIDO.leer(txt, vozCat(), await frecuentes());
    vozL = r.lineas.map((l) => ({ id: l.prod.id, opcion: l.opcion || (opsDe(productos.find((p) => p.id === l.prod.id)).length ? null : ''), cant: l.cant, texto: l.texto, dicha: l.dicha,
      otros: [{ prod: l.prod, opcion: l.opcion }].concat(l.otros) }));
    $('vozEstado').textContent = vozL.length ? 'Revisa y toca "Agregar a la venta".' + (r.sin.length ? ' No encontré: ' + r.sin.join(', ') + '.' : '')
      : 'No encontré esos productos' + (r.sin.length ? ': ' + r.sin.join(', ') : '') + '. Usa ➕ Otro o búscalo.';
    vozPintar();
  }
  function vozPintar() {
    $('vozBtns').classList.toggle('hidden', !vozL.length);
    $('vozLista').innerHTML = vozL.map((l, i) => {
      const p = productos.find((x) => x.id === l.id), ops = p ? opsDe(p) : [], st = p ? stockDe(p, l.opcion) : null;
      const prods = [...new Map(l.otros.map((o) => [o.prod.id, o.prod])).values()];
      return '<div class="vozL" data-i="' + i + '"><input inputmode="numeric" data-c="' + i + '" value="' + l.cant + '" aria-label="Cantidad">' +
        '<select data-p="' + i + '" aria-label="Producto">' + prods.map((x) => '<option value="' + Core.esc(x.id) + '"' + (x.id === l.id ? ' selected' : '') + '>' + Core.esc(x.nombre) + '</option>').join('') +
        '<option value="">— No agregar</option></select>' +
        (ops.length ? '<select class="vozOp" data-o="' + i + '" aria-label="Opción">' + (l.opcion ? '' : '<option value="">¿Qué opción?</option>') +
          ops.map((o) => '<option' + (o === l.opcion ? ' selected' : '') + '>' + Core.esc(o) + '</option>').join('') + '</select>' : '') +
        '<small' + (st != null && l.cant > st ? ' class="mal"' : '') + '>"' + Core.esc(l.texto) + '"' + (p ? ' · ' + money(precioVoz(p, l.opcion)) + ' c/u' : '') +
        (st != null ? ' · stock ' + st + (l.cant > st ? ' ⚠️ no alcanza' : '') : '') + (!l.dicha ? ' · cantidad de siempre' : '') + '</small></div>';
    }).join('');
  }
  const precioVoz = (p, o) => { const v = o ? varDe(p, o) : null; return v && v.precio != null ? +v.precio : +p.precio; };
  $('vozLista').onchange = (e) => {
    const t = e.target, i = +(t.dataset.c ?? t.dataset.p ?? t.dataset.o); const l = vozL[i]; if (!l) return;
    if (t.dataset.c !== undefined) l.cant = Math.max(0, Math.round(num(t.value)) || 0);
    if (t.dataset.p !== undefined) { if (!t.value) { vozL.splice(i, 1); } else { l.id = t.value; const o = l.otros.find((x) => x.prod.id === t.value); l.opcion = o && o.opcion || ''; } }
    if (t.dataset.o !== undefined) l.opcion = t.value || null;
    vozPintar(); $('vozBtns').classList.toggle('hidden', !vozL.length);
  };
  function vozEscuchar() {
    if (!window.CodeFixVoz || !CodeFixVoz.escuchar) { $('vozEstado').textContent = 'Este navegador no permite dictar: escribe el pedido y toca Armar.'; $('vozTxt').focus(); return; }
    if (vozRec) { vozRec.parar && vozRec.parar(); return; }
    vozRec = { parcial: (t) => { $('vozTxt').value = t; } };
    $('bVoz').classList.add('on'); $('vozEstado').textContent = '🎙️ Escuchando… habla y espera 2 segundos.';
    CodeFixVoz.escuchar(vozRec).then(vozArmar).catch((e) => { $('vozEstado').textContent = e.message + ' También puedes escribirlo.'; })
      .finally(() => { vozRec = null; $('bVoz').classList.remove('on'); });
  }
  $('bVoz').onclick = () => { $('vozCard').classList.remove('hidden'); $('otroForm').classList.add('hidden'); vozEscuchar(); };
  $('vozOtra').onclick = vozEscuchar;
  $('vozLeer').onclick = () => { if (vozRec && vozRec.parar) vozRec.parar(); vozArmar($('vozTxt').value); };
  $('vozTxt').addEventListener('keydown', (e) => { if (e.key === 'Enter') vozArmar($('vozTxt').value); });
  $('vozX').onclick = () => { if (vozRec && vozRec.parar) vozRec.parar(); vozL = []; $('vozCard').classList.add('hidden'); $('vozLista').innerHTML = ''; $('vozTxt').value = ''; $('vozBtns').classList.add('hidden'); };
  $('vozAgregar').onclick = () => {
    const falta = vozL.find((l) => l.cant > 0 && l.opcion === null);
    if (falta) { Core.toast('Elige la opción de ' + (productos.find((p) => p.id === falta.id) || {}).nombre); return; }
    let n = 0;
    vozL.forEach((l) => {
      const p = productos.find((x) => x.id === l.id); if (!p || !(l.cant > 0)) return;
      const item = { id: p.id, nombre: p.nombre + (l.opcion ? ' (' + l.opcion + ')' : ''), precio: precioVoz(p, l.opcion), costo: +p.costo || 0 };
      if (l.opcion) item.opcion = l.opcion;
      const line = ticket.find((x) => x.id === item.id && x.precio === item.precio && (x.opcion || '') === (item.opcion || ''));
      if (line) line.cant += l.cant; else ticket.push(Object.assign({ cant: l.cant }, item));
      n++;
    });
    if (!n) return;
    $('bComp').hidden = true; renderTicket(); $('vozX').click();
    Core.toast('🎤 ' + n + ' producto(s) en la venta. Revisa y toca Cobrar.');
    const c = document.querySelector('.ticketCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* "Otro": producto sin registrar, con nombre y precio en el momento */
  function abrirOtro() {
    $('otroForm').classList.remove('hidden');
    $('oNombre').value = $('q').value.trim();
    $('oPrecio').value = '';
    $('oGuardar').checked = false;
    $('oCatRow').classList.add('hidden');
    $('oCat').value = cat;
    ($('oNombre').value ? $('oPrecio') : $('oNombre')).focus();
  }
  $('oGuardar').onchange = (e) => $('oCatRow').classList.toggle('hidden', !e.target.checked);
  $('bOtroCancelar').onclick = () => $('otroForm').classList.add('hidden');
  $('oPrecio').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bOtroAgregar').click(); });
  $('bOtroAgregar').onclick = () => {
    const nombre = $('oNombre').value.trim() || 'Varios';
    const precio = num($('oPrecio').value);
    if (isNaN(precio) || precio < 0) { Core.toast('Escribe el precio'); $('oPrecio').focus(); return; }
    let id = 'otro-' + Core.uid();
    if ($('oGuardar').checked) {
      if (productos.length >= LIMITE) alLimite();
      else {
        const p = { id: Core.uid(), nombre, precio, costo: 0, stock: '', categoria: $('oCat').value.trim(), publicado: !esCliente, premium: null };
        productos.push(p); guardarProductos(); id = p.id;
        sincronizar(p).then((ok) => { if (!ok) { p.publicado = false; guardarProductos(); } });
      }
    }
    agregar({ id, nombre, precio, costo: 0 });
    $('otroForm').classList.add('hidden');
    $('q').value = '';
    renderProds();
  };

  const totalTicket = () => ticket.reduce((s, l) => s + l.precio * l.cant, 0);
  function renderTicket() {
    $('ticketTotal').textContent = money(totalTicket());
    $('ticket').innerHTML = ticket.length ? ticket.map((l, i) =>
      '<div class="linea"><div class="grow">' + Core.esc(l.nombre) + '<div class="muted">' + money(l.precio) + ' c/u</div></div>' +
      '<div class="qty"><button class="alt" data-i="' + i + '" data-d="-1" aria-label="Quitar uno">−</button><b>' + l.cant +
      '</b><button class="alt" data-i="' + i + '" data-d="1" aria-label="Agregar uno">+</button></div>' +
      '<b style="min-width:70px;text-align:right">' + money(l.precio * l.cant) + '</b></div>').join('')
      : '<p class="muted" style="margin:12px 0">Toca un producto para agregarlo.</p>';
    calcVuelto();
  }
  $('ticket').onclick = (e) => {
    const { i, d } = e.target.dataset;
    if (i === undefined) return;
    ticket[i].cant += +d;
    if (ticket[i].cant <= 0) ticket.splice(i, 1);
    renderTicket();
  };
  $('pago').onclick = (e) => {
    const m = e.target.closest('button') && e.target.closest('button').dataset.m;
    if (!m) return;
    medio = m;
    $('pago').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('rowRecibido').classList.toggle('hidden', m !== 'efectivo');
  };
  function calcVuelto() {
    const r = num($('recibido').value), t = totalTicket();
    $('vuelto').textContent = !isNaN(r) && r > 0 && t > 0 ? (r >= t ? 'Vuelto: ' + money(r - t) : 'Faltan ' + money(t - r)) : '';
  }
  $('recibido').oninput = calcVuelto;
  $('bLimpiar').onclick = () => { ticket = []; $('recibido').value = ''; renderTicket(); };
  /* ---------- 🧾 Comprobante de venta (no es boleta): se envía al cliente por WhatsApp ---------- */
  let ultimaVenta = null;
  function comprobante(id) {
    const v = ventas.find((x) => x.id === id);
    if (!v || !window.CFX_COMPROBANTE) return;
    CFX_COMPROBANTE.abrir({ negocio: equipo ? cuenta.negocio : cuenta.empresa, fecha: v.t, numero: String(v.id).slice(-6).toUpperCase(),
      items: v.items, total: v.items.reduce((s, l) => s + l.precio * l.cant, 0), medio: v.medio || 'efectivo' });
  }
  $('bComp').onclick = () => comprobante(ultimaVenta);
  $('bCobrar').onclick = () => {
    if (!ticket.length) return Core.toast('La venta está vacía');
    const venta = { id: Core.uid(), t: Date.now(), medio, items: ticket.map((l) => Object.assign({}, l)) };
    ventas.push(venta); ultimaVenta = venta.id; $('bComp').hidden = false;
    ticket.forEach((l) => {
      const p = productos.find((x) => x.id === l.id);
      if (p && p.stock !== '') p.stock = Math.max(0, p.stock - l.cant);
      const v = p && l.opcion && varDe(p, l.opcion);
      if (v && v.stock != null) v.stock = Math.max(0, v.stock - l.cant);
    });
    db.set('ventas', ventas); guardarProductos(); renderInv();
    ticket.forEach((l) => { const p = productos.find((x) => x.id === l.id); if (p && p.publicado) pendStock.push(l.opcion ? { clave: p.id, cant: l.cant, opcion: l.opcion } : { clave: p.id, cant: l.cant }); });
    db.set('stockPend', pendStock); enviarStock();
    const low = productos.filter((p) => p.stock !== '' && p.stock <= 3);
    if (low.length) Core.notify('Stock bajo', { body: low.map((p) => p.nombre + ' (' + p.stock + ')').join(', ') });
    Core.toast('✅ Venta registrada: ' + $('ticketTotal').textContent);
    ticket = []; $('recibido').value = '';
    renderTicket(); renderProds();
  };

  /* ---------- Inventario: stock real de productos y opciones + "Entró mercadería" ---------- */
  function renderInv() {
    if (!$('invLista')) return;
    const filas = [];
    let unidades = 0, valor = 0, agotados = 0;
    productos.forEach((p) => {
      const vs = opsDe(p).map((o) => varDe(p, o)).filter((v) => v && v.stock != null);
      const st = p.stock === '' || p.stock == null ? null : +p.stock;
      if (st == null && !vs.length) return;
      const u = vs.length ? vs.reduce((a, v) => a + v.stock, 0) : st;
      unidades += u; valor += u * (+p.costo || 0);
      if ((st != null && st <= 0) || (vs.length && vs.every((v) => v.stock <= 0))) agotados++;
      const ap = (n) => n ? ' · ' + n + ' apartado(s)' : '';
      const btn = (o) => '<button class="small alt" data-inv="' + p.id + '"' + (o ? ' data-op="' + Core.esc(o) + '"' : '') + ' aria-label="Entró mercadería">➕ Entró</button>';
      filas.push('<div class="linea"><div class="grow"><b>' + Core.esc(p.nombre) + '</b><div class="muted">' +
        (st == null ? 'Stock por opción' : 'Stock ' + st + ap(p.apartado)) + '</div></div>' + (st == null ? '' : btn('')) + '</div>' +
        vs.map((v) => '<div class="linea" style="padding-left:16px"><div class="grow">🎨 ' + Core.esc(v.nombre) + '<div class="muted">' +
          (v.stock <= 0 ? '⛔ Agotado' : 'Stock ' + v.stock) + ap(v.apartado) + '</div></div>' + btn(v.nombre) + '</div>').join(''));
    });
    $('invKpis').innerHTML = '<div class="card"><b>' + filas.length + '</b>con stock</div><div class="card"><b>' + unidades + '</b>unidades</div>' +
      (equipo ? '' : '<div class="card"><b>' + money(valor) + '</b>valor a costo</div>') + '<div class="card"><b>' + agotados + '</b>agotados</div>';
    $('invLista').innerHTML = filas.join('') || '<p class="empty">Pon un stock a tus productos (o a sus opciones) y aquí verás tu inventario.</p>';
  }
  $('invLista') && ($('invLista').onclick = async (e) => {
    const b = e.target.closest('[data-inv]');
    if (!b) return;
    const p = productos.find((x) => x.id === b.dataset.inv), o = b.dataset.op || '';
    const t = prompt('¿Cuántas unidades entraron de ' + p.nombre + (o ? ' (' + o + ')' : '') + '?\n(Para restar, escribe con signo menos: -2)', '');
    const n = parseInt(t, 10);
    if (!t || isNaN(n) || !n) return;
    const v = o && varDe(p, o);
    try {
      let nuevo;
      if (!esCliente && p.publicado) nuevo = await Cuenta.rpc('stock_sumar', { p_clave: p.id, p_opcion: o || null, p_cant: n });
      else nuevo = Math.max(0, (+(v ? v.stock : p.stock) || 0) + n);
      if (v) v.stock = nuevo; else p.stock = nuevo;
      guardarProductos(); renderInv(); renderLista();
      Core.toast('📦 ' + p.nombre + (o ? ' ' + o : '') + ': stock ' + nuevo);
    } catch (err) { Core.toast('⚠️ ' + (err.message || err)); }
  });

  /* ---------- Productos ---------- */
  $('pq').oninput = renderLista;
  function renderLista() {
    renderCats();
    const q = $('pq').value.trim().toLowerCase();
    const l = productos.filter((p) => !q || (p.nombre + ' ' + p.categoria).toLowerCase().includes(q))
      .sort((a, b) => (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz') || a.nombre.localeCompare(b.nombre));
    let grupo = null;
    $('listaProds').innerHTML = l.length ? l.map((p) => {
      const g = p.categoria || 'Sin categoría';
      const head = g !== grupo ? '<div class="grupo">' + Core.esc(grupo = g) + '</div>' : '';
      return head + '<div class="linea"><div class="grow"><b>' + Core.esc(p.nombre) + '</b><div class="muted">' + money(p.precio) +
        (p.stock === '' ? '' : ' · stock ' + p.stock) + (p.publicado ? ' · 🛍️ en catálogo' : '') + (p.foto ? ' · 📷' : '') +
        (p.ops ? '<br>🎨 ' + Core.esc(p.ops) : '') + '</div></div>' +
        '<button class="small alt" data-a="edit" data-id="' + p.id + '">Editar</button>' +
        '<button class="small danger" data-a="del" data-id="' + p.id + '" aria-label="Eliminar">✕</button></div>';
    }).join('') : '<p class="empty">Sin productos</p>';
    $('formTitulo').textContent = editId ? 'Editar producto' : 'Nuevo producto (' + productos.length + '/' + LIMITE + ')';
    const sinPublicar = esCliente ? 0 : productos.filter((p) => !p.publicado).length;
    $('rowPublicar').classList.toggle('hidden', !sinPublicar);
    $('txtPublicar').textContent = sinPublicar + ' producto(s) no aparecen en el catálogo de tus clientes.';
  }

  // Publica de una vez los productos que aún no están en el catálogo.
  $('bPublicarTodos').onclick = async () => {
    const l = productos.filter((p) => !p.publicado);
    if (!l.length) return;
    $('bPublicarTodos').disabled = true;
    let n = 0;
    try {
      for (const p of l) {
        try {
          await Cuenta.rpc('catalog_upsert', { p_key: p.id, p_nombre: p.nombre, p_precio: p.precio, p_premium: p.premium, p_categoria: p.categoria, p_vip: !!p.vip, p_descripcion: p.desc || '', p_opciones: p.ops || '' });
        } catch (e) { Core.toast('Se publicaron ' + n + '. ' + e.message); break; }
        p.publicado = true; n++;
      }
      guardarProductos();
      if (n === l.length) Core.toast('✅ ' + n + ' producto(s) publicados: tus clientes ya los ven');
    } finally { $('bPublicarTodos').disabled = false; renderLista(); }
  };
  /* ---------- 📥 D21 + D22 · Cargar muchos productos de una vez: Excel/CSV, lista pegada (WhatsApp), varias fotos o plantilla del rubro ---------- */
  let imp = []; // { nombre, precio, categoria, ops, stock, costo, desc, foto, ok }
  const precioDe = (t) => { // "$15.000" · "15000" · "15,990" (miles) · "2.500,50"
    const m = String(t || '').replace(/\s/g, '').match(/\d{1,3}(?:[.,]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
    if (!m) return NaN;
    const x = /^\d{1,3}(,\d{3})+$/.test(m[0]) ? m[0].replace(/,/g, '') : m[0];
    return Math.round(num(x));
  };
  const limpiar = (t) => String(t || '').replace(/https?:\/\/\S+/g, '').replace(/[*_~`]/g, '').replace(/^[\s•·\-–—>]+|^\d{1,3}[.)]\s+/, '').replace(/[\s:\-–—|·•,]+$/, '').trim();
  // Lista pegada: "Nombre - $precio" por línea, o el nombre en una línea y el precio en la siguiente (así copia WhatsApp su catálogo).
  function deTexto(t) {
    const out = []; let nombre = '', cat = '';
    String(t || '').split(/\r?\n/).map((l) => l.replace(/https?:\/\/\S+/g, '').trim()).filter(Boolean).forEach((l) => {
      const pm = l.match(/\$\s?\d[\d.,]*|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d{3,7}\b(?!\s*(?:ml|cc|gr?|kg|cm|mm|personas|unid|u\b|x\b))/i);
      const resto = pm ? limpiar(l.slice(0, pm.index) + ' ' + l.slice(pm.index + pm[0].length)) : limpiar(l);
      const precio = pm ? precioDe(pm[0]) : NaN;
      if (pm && resto && !/^(precio|valor)$/i.test(resto)) { out.push({ nombre: resto, precio, categoria: cat }); nombre = ''; }
      else if (pm && nombre) { out.push({ nombre, precio, categoria: cat }); nombre = ''; }
      else if (!pm) { if (/:$/.test(l.trim()) || (resto.length > 2 && resto === resto.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(resto))) { cat = resto.slice(0, 40); nombre = ''; } else nombre = resto; }
    });
    return out;
  }
  // Excel o CSV: busca la fila de títulos (Nombre, Precio, Categoría, Stock, Costo, Descripción, Opciones); si no hay, adivina las columnas.
  function deFilas(filas) {
    const T = { nombre: /^(nombre|producto|art[ií]culo|item|servicio|t[ií]tulo)/i, precio: /^(precio|valor|\$|monto|venta)/i, categoria: /^(categor|tipo|secci|familia|grupo)/i,
      stock: /^(stock|cantidad|existencia|inventario)/i, costo: /^(costo|compra)/i, desc: /^(descrip|detalle)/i, ops: /^(opci|talla|color|variante)/i };
    const ti = filas.findIndex((f) => f.some((c) => T.nombre.test(c)) && f.some((c) => T.precio.test(c)));
    const col = {};
    if (ti >= 0) filas[ti].forEach((c, i) => { const k = Object.keys(T).find((x) => T[x].test(String(c).trim()) && col[x] == null); if (k) col[k] = i; });
    else {
      const muestra = filas.slice(0, 20), ancho = Math.max(...muestra.map((f) => f.length));
      for (let i = 0; i < ancho; i++) {
        const nums = muestra.filter((f) => !isNaN(precioDe(f[i])) && /^[$\s\d.,]+$/.test(f[i] || '')).length;
        if (col.precio == null && nums >= muestra.length / 2) col.precio = i; else if (col.nombre == null && nums < muestra.length / 2) col.nombre = i;
      }
    }
    if (col.nombre == null || col.precio == null) throw new Error('No encontré las columnas Nombre y Precio');
    return filas.slice(ti + 1).map((f) => ({ nombre: limpiar(f[col.nombre]).slice(0, 60), precio: precioDe(f[col.precio]), categoria: col.categoria != null ? String(f[col.categoria] || '').trim().slice(0, 40) : '',
      stock: col.stock != null && /^\d+$/.test(String(f[col.stock] || '').trim()) ? parseInt(f[col.stock], 10) : '', costo: col.costo != null ? precioDe(f[col.costo]) || 0 : 0,
      desc: col.desc != null ? String(f[col.desc] || '').trim().slice(0, 300) : '', ops: col.ops != null ? String(f[col.ops] || '').split(/[,;/]/).map((x) => x.trim()).filter(Boolean).slice(0, 20).join(', ') : '' }))
      .filter((x) => x.nombre);
  }
  const ya = (n) => productos.some((p) => p.nombre.trim().toLowerCase() === n.trim().toLowerCase());
  function verImp(lista, de) {
    imp = lista.slice(0, 300).map((x) => Object.assign({ categoria: '', ops: '', stock: '', costo: 0, desc: '' }, x, { nombre: String(x.nombre || '').slice(0, 60), ok: !ya(x.nombre || '') }));
    $('impVista').classList.toggle('hidden', !imp.length);
    $('impPubW').classList.toggle('hidden', esCliente);
    if (!imp.length) return Core.toast('No encontré productos con precio en ' + de);
    pintarImp();
    $('impVista').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function pintarImp() {
    const n = imp.filter((x) => x.ok).length, libres = LIMITE - productos.length;
    $('impRes').textContent = imp.length + ' encontrados · ' + n + ' marcados' + (imp.some((x) => !x.ok && ya(x.nombre)) ? ' · los que ya tienes van sin marcar' : '') + (n > libres ? ' · te caben ' + Math.max(0, libres) : '') + '. Corrige el nombre o el precio si hace falta.';
    $('impLista').innerHTML = imp.map((x, i) => '<div class="impF' + (x.ok ? '' : ' no') + '" data-i="' + i + '"><input type="checkbox" data-k="ok"' + (x.ok ? ' checked' : '') + ' aria-label="Agregar">' +
      (x.foto ? '<img src="' + Core.esc(CFX_URL(x.foto)) + '" alt="">' : '<span class="sinF"></span>') +
      '<input data-k="nombre" value="' + Core.esc(x.nombre) + '" maxlength="60" aria-label="Nombre" placeholder="Nombre">' +
      '<input data-k="precio" value="' + (isNaN(x.precio) ? '' : x.precio) + '" inputmode="decimal" aria-label="Precio" placeholder="Precio">' +
      ((x.categoria || x.ops || x.stock !== '') ? '<small>' + Core.esc([x.categoria, x.ops && '🎨 ' + x.ops, x.stock !== '' && 'stock ' + x.stock].filter(Boolean).join(' · ')) + '</small>' : '') + '</div>').join('');
    $('impAgregar').textContent = 'Agregar ' + n + ' producto' + (n === 1 ? '' : 's');
    $('impAgregar').disabled = !n;
  }
  $('impLista').oninput = $('impLista').onchange = (e) => {
    const f = e.target.closest('[data-i]'), k = e.target.dataset.k; if (!f || !k) return;
    const x = imp[f.dataset.i];
    if (k === 'ok') { x.ok = e.target.checked; f.classList.toggle('no', !x.ok); $('impAgregar').textContent = 'Agregar ' + imp.filter((y) => y.ok).length + ' productos'; $('impAgregar').disabled = !imp.some((y) => y.ok); }
    else if (k === 'precio') x.precio = precioDe(e.target.value); else x.nombre = e.target.value.trim();
  };
  const cerrarImp = () => { imp = []; $('impLista').innerHTML = ''; ['impVista', 'impTexto', 'impRubroW'].forEach((id) => $(id).classList.add('hidden')); };
  $('impCancelar').onclick = cerrarImp;
  $('impArch').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { verImp(deFilas(await CFX_RESPALDO.leer(f)), 'el archivo'); } catch (err) { Core.toast('📄 ' + err.message); }
  };
  $('impPegar').onclick = () => { $('impTexto').classList.toggle('hidden'); $('impRubroW').classList.add('hidden'); if (!$('impTexto').classList.contains('hidden')) $('impTxt').focus(); };
  $('impLeer').onclick = () => verImp(deTexto($('impTxt').value), 'el texto');
  $('impFotos').onchange = async (e) => {
    const l = [...e.target.files].slice(0, 30); e.target.value = ''; if (!l.length) return;
    if (esCliente) return Core.toast('📷 Las fotos son para los productos de tu catálogo');
    const out = [];
    for (const f of l) {
      try { out.push({ nombre: limpiar(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/^(img|dsc|pxl|photo|foto|image|screenshot|captura|wa)[\w -]*\d{4,}[\w -]*$/i, '').replace(/[_-]+/g, ' ')), precio: NaN, foto: await Core.fotoChica(f) }); }
      catch (err) { Core.toast('📷 ' + f.name + ': ' + err.message); }
    }
    verImp(out, 'las fotos');
    if (imp.length) Core.toast('Escribe el nombre y el precio de cada foto');
  };
  $('impPlant').onclick = async () => {
    $('impTexto').classList.add('hidden');
    let rubro = '';
    try { rubro = (await Cuenta.rpc('tienda_info', { p_negocio: cuenta.id }) || {}).rubro || ''; } catch (e) { /* sin red: que elija */ }
    if (!Core.RUBROS.some((x) => x[1] === rubro)) rubro = '';
    if (!$('impRubro').options.length) $('impRubro').innerHTML = '<option value="">Elige tu rubro…</option>' + Core.RUBROS.map(([i, n]) => '<option value="' + Core.esc(n) + '">' + i + ' ' + Core.esc(n) + '</option>').join('');
    $('impRubroW').classList.remove('hidden');
    $('impRubro').value = rubro;
    if (rubro) verImp(Core.plantilla(rubro), 'la plantilla'); else $('impRubro').focus();
  };
  $('impRubro').onchange = (e) => e.target.value && verImp(Core.plantilla(e.target.value), 'la plantilla');
  $('impAgregar').onclick = async () => {
    const l = imp.filter((x) => x.ok), malos = l.filter((x) => !x.nombre || isNaN(x.precio));
    if (malos.length) return Core.toast('Falta nombre o precio en ' + malos.length + ' (ej: ' + (malos[0].nombre || 'sin nombre') + ')');
    const libres = LIMITE - productos.length;
    if (libres <= 0) return alLimite();
    const pub = !esCliente && $('impPub').checked, nuevos = l.slice(0, libres).map((x) => ({ id: Core.uid(), nombre: x.nombre.slice(0, 60), precio: x.precio, costo: x.costo || 0, stock: x.stock,
      categoria: x.categoria || '', publicado: false, premium: null, vip: false, desc: x.desc || '', ops: x.ops || '', vars: [], _foto: x.foto || null }));
    productos.push(...nuevos); guardarProductos();
    $('impAgregar').disabled = true;
    let ok = 0, fotosOk = 0;
    try {
      if (pub) for (const p of nuevos) {
        p.publicado = true;
        if (!(await sincronizar(p))) { p.publicado = false; break; }
        ok++;
        if (p.stock !== '') Cuenta.rpc('set_stock', { p_key: p.id, p_stock: p.stock }).catch(() => {});
        if (p._foto) { try { await Cuenta.rpc('set_foto_producto', { p_key: p.id, p_foto: p._foto }); p.foto = true; fotosOk++; } catch (err) { Core.toast('📷 ' + err.message); } }
      }
    } finally {
      nuevos.forEach((p) => delete p._foto);
      guardarProductos(); cerrarImp(); renderProds(); renderLista();
      $('impAgregar').disabled = false;
    }
    Core.toast('✅ ' + nuevos.length + ' agregados' + (pub ? ' · ' + ok + ' en tu catálogo' + (fotosOk ? ' · ' + fotosOk + ' con foto' : '') : '') + (l.length > nuevos.length ? ' · llegaste al máximo de ' + LIMITE : ''));
  };

  $('p-pub').onchange = (e) => $('rowPrem').classList.toggle('hidden', !e.target.checked);

  /* ---------- 📷 Foto del producto (1 por producto; se guarda en el servidor, liviana) ---------- */
  let fotoNueva = null, fotoQuitar = false;
  $('rowFoto').classList.toggle('hidden', esCliente); // la Caja del cliente es privada: sin fotos
  function verFoto(src) {
    $('p-fotoPrev').classList.toggle('hidden', !src);
    if (src) $('p-fotoPrev').src = src; else $('p-fotoPrev').removeAttribute('src');
    $('bQuitarFoto').classList.toggle('hidden', !src);
  }
  $('p-foto').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { fotoNueva = await Core.fotoChica(f); fotoQuitar = false; verFoto(fotoNueva); }
    catch (err) { Core.toast(err.message); }
    e.target.value = '';
  };
  $('bQuitarFoto').onclick = () => { fotoNueva = null; fotoQuitar = true; verFoto(null); };
  async function guardarFoto(prod) {
    if (esCliente || (!fotoNueva && !fotoQuitar)) return;
    if (!prod.publicado) { if (fotoNueva) Core.toast('📷 Para mostrar la foto, marca "Mostrar en mi catálogo"'); return; }
    try {
      await Cuenta.rpc('set_foto_producto', { p_key: prod.id, p_foto: fotoQuitar ? null : fotoNueva });
      prod.foto = !fotoQuitar;
    } catch (err) { Core.toast('📷 Foto: ' + err.message); }
  }

  // Precio y stock por opción (tabla variantes): una fila por cada opción escrita arriba.
  function pintarVars(lista) {
    const ant = {}; (lista || leerVars()).forEach((x) => { ant[x.nombre.toLowerCase()] = x; });
    const ops = $('p-ops').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
    $('p-varsW').classList.toggle('hidden', !ops.length || esCliente);
    $('p-vars').innerHTML = ops.map((o) => { const x = ant[o.toLowerCase()] || {};
      return '<div class="row" style="align-items:center" data-var="' + Core.esc(o) + '"><b style="flex:1.2;min-width:70px">' + Core.esc(o) + '</b>' +
        '<input aria-label="Precio de ' + Core.esc(o) + '" inputmode="decimal" placeholder="Precio" value="' + (x.precio == null ? '' : x.precio) + '" style="flex:1">' +
        '<input aria-label="Stock de ' + Core.esc(o) + '" inputmode="numeric" placeholder="Stock" value="' + (x.stock == null ? '' : x.stock) + '" style="flex:1"></div>'; }).join('');
  }
  function leerVars() {
    return [...$('p-vars').querySelectorAll('[data-var]')].map((r) => { const [a, b] = r.querySelectorAll('input'), pr = num(a.value), st = parseInt(b.value, 10);
      return { nombre: r.dataset.var, precio: a.value.trim() === '' || isNaN(pr) ? null : pr, stock: b.value.trim() === '' || isNaN(st) ? null : Math.max(0, st) }; });
  }
  $('p-ops').addEventListener('input', () => pintarVars());

  function limpiarForm() {
    editId = null;
    fotoNueva = null; fotoQuitar = false; verFoto(null);
    ['nombre', 'precio', 'costo', 'stock', 'cat', 'prem', 'desc', 'ops'].forEach((k) => { $('p-' + k).value = ''; });
    $('p-pub').checked = !esCliente; $('rowPrem').classList.toggle('hidden', esCliente); // lo nuevo se publica por defecto
    $('p-vip').checked = false; pintarVars([]);
    renderLista();
  }
  $('bCancelarProd').onclick = limpiarForm;

  async function sincronizar(p, borrar) {
    if (esCliente) return true; // la Caja del cliente es privada
    try {
      if (borrar || !p.publicado) { await Cuenta.rpc('catalog_delete', { p_key: p.id }); p.foto = false; }
      else await Cuenta.rpc('catalog_upsert', { p_key: p.id, p_nombre: p.nombre, p_precio: p.precio, p_premium: p.premium, p_categoria: p.categoria, p_vip: !!p.vip, p_descripcion: p.desc || '', p_opciones: p.ops || '' });
      return true;
    } catch (e) {
      Core.toast('Catálogo: ' + e.message);
      return false;
    }
  }

  $('bGuardarProd').onclick = async () => {

    const p = {
      nombre: $('p-nombre').value.trim(),
      precio: num($('p-precio').value),
      costo: num($('p-costo').value) || 0,
      stock: $('p-stock').value === '' ? '' : parseInt($('p-stock').value, 10),
      categoria: $('p-cat').value.trim(),
      publicado: !esCliente && $('p-pub').checked,
      premium: null,
      vip: false,
      desc: $('p-desc').value.trim(),
      ops: $('p-ops').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20).join(', '),
      vars: leerVars()
    };
    if (!p.nombre || isNaN(p.precio)) return Core.toast('Nombre y precio son obligatorios');
    let prod;
    if (editId) {
      prod = productos.find((x) => x.id === editId);
      const antes = prod.publicado;
      Object.assign(prod, p);
      if (antes || p.publicado) {
        const ok = await sincronizar(prod);
        if (!ok && p.publicado) prod.publicado = antes;
      }
    } else {
      if (productos.length >= LIMITE) return alLimite();
      prod = Object.assign({ id: Core.uid() }, p);
      productos.push(prod);
      if (p.publicado && !(await sincronizar(prod))) prod.publicado = false;
    }
    await guardarFoto(prod);
    if (!esCliente && prod.publicado) Cuenta.rpc('set_stock', { p_key: prod.id, p_stock: prod.stock === '' ? null : prod.stock }).catch(() => {});
    if (!esCliente && prod.publicado && (prod.ops || (prod.vars || []).length)) Cuenta.rpc('variantes_guardar', { p_clave: prod.id, p_lista: prod.ops ? prod.vars || [] : [] }).catch((e) => Core.toast('⚠️ ' + (e.message || e)));
    guardarProductos();
    Core.toast('Producto guardado');
    limpiarForm(); renderProds();
  };
  $('listaProds').onclick = async (e) => {
    const { a, id } = e.target.dataset;
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    if (a === 'edit') {
      editId = id;
      $('p-nombre').value = p.nombre; $('p-precio').value = p.precio; $('p-costo').value = p.costo || '';
      $('p-stock').value = p.stock; $('p-cat').value = p.categoria || '';
      $('p-pub').checked = !!p.publicado; $('p-prem').value = p.premium == null ? '' : p.premium;
      $('p-vip').checked = !!p.vip;
      $('p-desc').value = p.desc || ''; $('p-ops').value = p.ops || ''; pintarVars(p.vars || []);
      $('rowPrem').classList.toggle('hidden', !p.publicado);
      fotoNueva = null; fotoQuitar = false; verFoto(null);
      if (p.publicado && !esCliente) {
        Cuenta.rpc('fotos_productos', { p_negocio: cuenta.id, p_claves: [p.id] })
          .then((l) => { p.foto = !!l[0]; if (editId === id && l[0] && !fotoNueva && !fotoQuitar) verFoto(l[0].foto); }).catch(() => {});
      }
      renderLista();
      scrollTo(0, 0);
    }
    if (a === 'del' && confirm('¿Eliminar ' + p.nombre + '?')) {
      if (p.publicado) await sincronizar(p, true);
      productos = productos.filter((x) => x.id !== id);
      guardarProductos(); renderLista(); renderProds();
    }
  };

  /* ---------- Reporte ---------- */
  const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  $('r-dia').value = hoy();
  $('r-dia').onchange = renderReporte;
  let rango = 'dia';
  $('r-rango').onclick = (e) => {
    const r = e.target.dataset.r;
    if (!r) return;
    if (r !== 'dia' && !pro) return soloPro('El reporte por semana y mes');
    rango = r;
    $('r-rango').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.r === r); b.classList.toggle('alt', b.dataset.r !== r); });
    renderReporte();
  };
  if (!pro) $('r-rango').querySelectorAll('button:not([data-r=dia])').forEach((b) => b.classList.add('lock'));
  function delDia() {
    const [y, m, d] = $('r-dia').value.split('-').map(Number);
    let ini = new Date(y, m - 1, d).getTime(), fin = ini + 864e5;
    if (rango === '7' || rango === '30') ini = fin - (+rango) * 864e5;
    if (rango === 'mes') { ini = new Date(y, m - 1, 1).getTime(); fin = new Date(y, m, 1).getTime(); }
    return ventas.filter((v) => v.t >= ini && v.t < fin);
  }
  const MEDIOS = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📲 Transferencia' };
  function renderReporte() {
    const vs = delDia();
    let ingreso = 0, costo = 0;
    const porMedio = {};
    vs.forEach((v) => {
      const t = v.items.reduce((s, l) => s + l.precio * l.cant, 0);
      porMedio[v.medio || 'efectivo'] = (porMedio[v.medio || 'efectivo'] || 0) + t;
      v.items.forEach((l) => { ingreso += l.precio * l.cant; costo += (l.costo || 0) * l.cant; });
    });
    $('k-ventas').textContent = vs.length;
    $('k-ingreso').textContent = money(ingreso);
    $('k-ganancia').textContent = money(ingreso - costo) + (ingreso ? ' (' + Math.round((ingreso - costo) / ingreso * 100) + '%)' : '');
    $('k-prom').textContent = money(vs.length ? ingreso / vs.length : 0);
    $('r-medios').innerHTML = Object.keys(MEDIOS).map((m) =>
      '<li><div class="grow">' + MEDIOS[m] + '</div><b>' + money(porMedio[m] || 0) + '</b></li>').join('');
    const top = {};
    vs.forEach((v) => v.items.forEach((l) => {
      const t = top[l.nombre] || (top[l.nombre] = { cant: 0, total: 0 });
      t.cant += l.cant; t.total += l.precio * l.cant;
    }));
    $('r-top').innerHTML = !pro ? '<li class="muted">Descubre qué productos te dejan más dinero con la versión Pro.</li>'
      : Object.entries(top).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([n, t], i) =>
        '<li><div class="grow"><b>' + (i + 1) + '. ' + Core.esc(n) + '</b><div class="muted">' + t.cant + ' vendidos</div></div><b>' +
        money(t.total) + '</b></li>').join('') || '<li class="empty">Sin ventas</li>';
    $('r-lista').innerHTML = vs.length ? vs.slice().reverse().map((v) =>
      '<li><div class="grow"><b>' + new Date(v.t).toLocaleString('es', rango === 'dia' ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'short', timeStyle: 'short' }) +
      ' · ' + (MEDIOS[v.medio || 'efectivo'] || '') + '</b>' +
      '<div class="muted">' + v.items.map((l) => l.cant + '× ' + Core.esc(l.nombre)).join(', ') + '</div></div>' +
      '<b>' + money(v.items.reduce((s, l) => s + l.precio * l.cant, 0)) + '</b>' +
      '<button class="small alt" data-comp="' + v.id + '" aria-label="Comprobante">🧾</button>' +
      '<button class="small danger" data-id="' + v.id + '" aria-label="Anular venta">✕</button></li>'
    ).join('') : '<li class="empty">Sin ventas en este período</li>';
  }
  $('r-lista').onclick = (e) => {
    const c = e.target.closest('[data-comp]');
    if (c) return comprobante(c.dataset.comp);
    const id = e.target.dataset.id;
    if (!id || !confirm('¿Anular esta venta?')) return;
    ventas = ventas.filter((v) => v.id !== id);
    db.set('ventas', ventas); renderReporte();
  };
  $('bCSV').onclick = () => {
    const rows = [['fecha', 'medio', 'producto', 'cantidad', 'precio', 'costo', 'total']];
    delDia().forEach((v) => v.items.forEach((l) => rows.push([
      new Date(v.t).toLocaleString('es'), v.medio || 'efectivo', l.nombre, l.cant, l.precio, l.costo || 0, l.precio * l.cant
    ])));
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    Core.download('ventas-' + $('r-dia').value + '.csv', '﻿' + csv, 'text/csv');
  };
  $('bBackup').onclick = () => Core.backup('caja:' + cuenta.id, 'caja');
  $('restore').onchange = (e) => { if (e.target.files[0]) Core.restore('caja:' + cuenta.id, e.target.files[0], () => location.reload()); };
  $('bNube').onclick = async () => {
    if (!pro) return soloPro('El respaldo en la nube');
    const sb = Cuenta.sb, path = cuenta.id + '/caja.json';
    if (confirm('Aceptar = guardar en la nube.\nCancelar = recuperar desde la nube.')) {
      const blob = new Blob([JSON.stringify({ datos: db.dump() })], { type: 'application/json' });
      const { error } = await sb.storage.from('respaldos').upload(path, blob, { upsert: true, contentType: 'application/json' });
      Core.toast(error ? 'No se pudo guardar: ' + error.message : '☁️ Respaldo guardado');
    } else {
      const { data, error } = await sb.storage.from('respaldos').download(path);
      if (error) return Core.toast('No hay respaldo en la nube');
      if (!confirm('¿Reemplazar los datos de este celular por los de la nube?')) return;
      db.load(JSON.parse(await data.text()).datos);
      location.reload();
    }
  };

  // Pro/Premium: respaldo automático en la nube una vez al día.
  async function respaldoAuto() {
    if (!pro || Date.now() - db.get('nubeAuto', 0) < 864e5) return;
    const blob = new Blob([JSON.stringify({ datos: db.dump() })], { type: 'application/json' });
    const { error } = await Cuenta.sb.storage.from('respaldos').upload(cuenta.id + '/caja.json', blob, { upsert: true, contentType: 'application/json' });
    if (!error) db.set('nubeAuto', Date.now());
  }

  // Una vez por celular: los productos creados con la versión antigua (que no publicaba
  // por defecto) se suben al catálogo para que los clientes los vean.
  async function publicarPendientes() {
    if (esCliente || db.get('catalogoV35')) return;
    const l = productos.filter((p) => !p.publicado || !p.sync35);
    let n = 0;
    for (const p of l) {
      try {
        await Cuenta.rpc('catalog_upsert', { p_key: p.id, p_nombre: p.nombre, p_precio: p.precio, p_premium: p.premium, p_categoria: p.categoria, p_vip: !!p.vip, p_descripcion: p.desc || '', p_opciones: p.ops || '' });
        p.publicado = true; p.sync35 = true; n++;
      } catch (e) {
        guardarProductos();
        if (!/Failed|conexión/i.test(e.message)) Core.toast('Catálogo: ' + e.message);
        return; // se reintenta la próxima vez que abras la Caja
      }
    }
    guardarProductos(); db.set('catalogoV35', true);
    if (n) { Core.toast('🛍️ ' + n + ' producto(s) publicados en tu catálogo: tus clientes ya los ven'); renderLista(); }
  }

  /* ---------- Finanzas (Pro / Premium) ---------- */
  let gastos = db.get('gastos', []);
  const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const totalVenta = (v) => v.items.reduce((s, l) => s + l.precio * l.cant, 0);
  const costoVenta = (v) => v.items.reduce((s, l) => s + (l.costo || 0) * l.cant, 0);
  function renderFinanzas() {
    $('finLock').classList.toggle('hidden', pro);
    $('finPro').classList.toggle('hidden', !pro);
    if (!pro) return;
    const m0 = inicioMes(), delMes = ventas.filter((v) => v.t >= m0);
    const ing = delMes.reduce((s, v) => s + totalVenta(v), 0), costo = delMes.reduce((s, v) => s + costoVenta(v), 0);
    const gMes = gastos.filter((g) => new Date(g.fecha + 'T12:00').getTime() >= m0).reduce((s, g) => s + g.monto, 0);
    $('f-ing').textContent = money(ing); $('f-costo').textContent = money(costo);
    $('f-gastos').textContent = money(gMes); $('f-gan').textContent = money(ing - costo - gMes);
    const meta = db.get('meta', 0);
    $('fMeta').value = meta || '';
    const pct = meta ? Math.min(100, Math.round(ing * 100 / meta)) : 0;
    $('fBarra').style.width = pct + '%';
    $('fMetaTxt').textContent = meta ? pct + '% de la meta (' + money(ing) + ' de ' + money(meta) + ')' + (pct >= 100 ? ' 🎉 ¡Meta cumplida!' : '') : 'Define una meta para ver tu avance.';
    // Semana: total, mejor producto y mejor día (últimos 28 días).
    const s7 = ventas.filter((v) => v.t >= Date.now() - 7 * 864e5);
    const porProd = {};
    s7.forEach((v) => v.items.forEach((l) => { porProd[l.nombre] = (porProd[l.nombre] || 0) + l.cant; }));
    const mejorProd = Object.entries(porProd).sort((a, b) => b[1] - a[1])[0];
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], porDia = [0, 0, 0, 0, 0, 0, 0];
    ventas.filter((v) => v.t >= Date.now() - 28 * 864e5).forEach((v) => { porDia[new Date(v.t).getDay()] += totalVenta(v); });
    const mejorDia = porDia.indexOf(Math.max(...porDia));
    $('fSemana').innerHTML = '<li><span class="grow">Vendiste en 7 días</span><b>' + money(s7.reduce((s, v) => s + totalVenta(v), 0)) + ' (' + s7.length + ' ventas)</b></li>' +
      '<li><span class="grow">Producto estrella</span><b>' + (mejorProd ? Core.esc(mejorProd[0]) + ' × ' + mejorProd[1] : '—') + '</b></li>' +
      '<li><span class="grow">Tu mejor día</span><b>' + (Math.max(...porDia) ? dias[mejorDia] : '—') + '</b></li>';
    const gl = gastos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 60);
    $('fGastos').innerHTML = gl.length ? gl.map((g) => '<li><div class="grow"><b>' + Core.esc(g.concepto) + '</b><div class="muted">' +
      new Date(g.fecha + 'T12:00').toLocaleDateString('es') + '</div></div><b>' + money(g.monto) + '</b>' +
      '<button class="small danger" data-g="' + g.id + '" aria-label="Eliminar">✕</button></li>').join('') : '<li class="empty">Sin gastos registrados</li>';
  }
  $('bMeta').onclick = () => { const m = num($('fMeta').value); db.set('meta', isNaN(m) ? 0 : m); renderFinanzas(); Core.toast('🎯 Meta guardada'); };
  $('gFecha').value = hoy();
  $('bGasto').onclick = () => {
    const monto = num($('gMonto').value), concepto = $('gConcepto').value.trim();
    if (!concepto || isNaN(monto) || monto <= 0) return Core.toast('Escribe el concepto y el monto');
    gastos.push({ id: Core.uid(), concepto, monto, fecha: $('gFecha').value || hoy() });
    db.set('gastos', gastos); $('gConcepto').value = ''; $('gMonto').value = '';
    renderFinanzas(); Core.toast('Gasto agregado');
  };
  $('fGastos').onclick = (e) => {
    const id = e.target.dataset.g;
    if (!id || !confirm('¿Eliminar este gasto?')) return;
    gastos = gastos.filter((g) => g.id !== id); db.set('gastos', gastos); renderFinanzas();
  };
  $('bFinCSV').onclick = () => {
    const m0 = inicioMes();
    const filas = [['tipo', 'fecha', 'detalle', 'monto']]
      .concat(ventas.filter((v) => v.t >= m0).map((v) => ['venta', new Date(v.t).toLocaleString('es'), v.items.map((l) => l.cant + 'x ' + l.nombre).join(' / '), totalVenta(v)]))
      .concat(gastos.filter((g) => new Date(g.fecha + 'T12:00').getTime() >= m0).map((g) => ['gasto', g.fecha, g.concepto, -g.monto]));
    const csv = filas.map((f) => f.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\n');
    Core.download('finanzas-' + hoy().slice(0, 7) + '.csv', new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  };

  if (esCliente) {
    $('tituloCaja').textContent = 'Mi Caja';
    ['rowPub', 'rowPrem', 'rowVipProd'].forEach((id) => $(id).classList.add('hidden'));
  }
  renderProds(); renderTicket();
  if (!equipo) { respaldoAuto(); publicarPendientes(); }
  enviarStock().then(traerStock);
  if (!vende || (location.hash === '#productos' && (!equipo || invEquipo))) show('productos');
})();
