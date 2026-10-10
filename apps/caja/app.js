(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  Core.registerSW('../../');
  Core.marca();
  const cuenta = await Cuenta.require('../../', { empresa: true });
  const db = Core.store('caja:' + cuenta.id);
  if (!localStorage.getItem('caja:migrado')) {
    const viejo = Core.store('caja').dump();
    Object.keys(viejo).forEach((k) => { localStorage.setItem(k.replace(/^caja:/, 'caja:' + cuenta.id + ':'), viejo[k]); localStorage.removeItem(k); });
    localStorage.setItem('caja:migrado', '1');
  }
  const pro = Cuenta.isPro();
  const FREE_PRODUCTOS = 15;
  const soloPro = (que) => Core.toast('⭐ ' + que + ' es de la versión Pro');
  $('planTag').textContent = pro ? 'PRO' : 'FREE';
  $('planTag').classList.toggle('pro', pro);

  // Montos en pesos: sin decimales cuando son enteros.
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  // "1.500" = mil quinientos (punto de miles); "2,5" o "2.5" = dos coma cinco.
  const num = (v) => {
    let t = String(v == null ? '' : v).trim().replace(/[$\s]/g, '');
    t = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? NaN : n;
  };

  let productos = db.get('productos', []).map((p) => Object.assign({ categoria: '', publicado: false, premium: null }, p));
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
    if (v === 'productos') renderLista();
    if (v === 'reporte') renderReporte();
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
    const q = $('q').value.trim().toLowerCase();
    const l = productos.filter((p) => (!cat || p.categoria === cat) && (!q || p.nombre.toLowerCase().includes(q)));
    $('prods').innerHTML = '<button class="prod otro" id="bOtro"><b>➕ Otro</b><small>sin registrar</small></button>' +
      l.map((p) => '<button class="prod' + (p.stock !== '' && p.stock <= 3 ? ' low' : '') + '" data-id="' + p.id + '">' +
        '<b>' + Core.esc(p.nombre) + '</b><span>' + money(p.precio) + '</span>' +
        '<small>' + (p.stock === '' ? Core.esc(p.categoria || '') : 'Stock: ' + p.stock) + '</small></button>').join('') +
      (!productos.length ? '<p class="empty" style="grid-column:1/-1">Agrega tus productos en 📦 o usa ➕ Otro para vender algo al tiro.</p>' : '');
  }
  $('prods').onclick = (e) => {
    const b = e.target.closest('.prod');
    if (!b) return;
    if (b.id === 'bOtro') return abrirOtro();
    const p = productos.find((x) => x.id === b.dataset.id);
    agregar({ id: p.id, nombre: p.nombre, precio: +p.precio, costo: +p.costo || 0 });
  };

  function agregar(item) {
    const line = ticket.find((l) => l.id === item.id && l.precio === item.precio);
    if (line) line.cant++; else ticket.push(Object.assign({ cant: 1 }, item));
    if (navigator.vibrate) navigator.vibrate(12);
    renderTicket();
  }

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
      if (!pro && productos.length >= FREE_PRODUCTOS) soloPro('Tener más de ' + FREE_PRODUCTOS + ' productos');
      else {
        const p = { id: Core.uid(), nombre, precio, costo: 0, stock: '', categoria: $('oCat').value.trim(), publicado: false, premium: null };
        productos.push(p); guardarProductos(); id = p.id;
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
  $('bCobrar').onclick = () => {
    if (!ticket.length) return Core.toast('La venta está vacía');
    ventas.push({ id: Core.uid(), t: Date.now(), medio, items: ticket.map((l) => Object.assign({}, l)) });
    ticket.forEach((l) => {
      const p = productos.find((x) => x.id === l.id);
      if (p && p.stock !== '') p.stock = Math.max(0, p.stock - l.cant);
    });
    db.set('ventas', ventas); guardarProductos();
    const low = productos.filter((p) => p.stock !== '' && p.stock <= 3);
    if (low.length) Core.notify('Stock bajo', { body: low.map((p) => p.nombre + ' (' + p.stock + ')').join(', ') });
    Core.toast('✅ Venta registrada: ' + $('ticketTotal').textContent);
    ticket = []; $('recibido').value = '';
    renderTicket(); renderProds();
  };

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
        (p.stock === '' ? '' : ' · stock ' + p.stock) + (p.publicado ? ' · 🛍️ en catálogo' : '') + '</div></div>' +
        '<button class="small alt" data-a="edit" data-id="' + p.id + '">Editar</button>' +
        '<button class="small danger" data-a="del" data-id="' + p.id + '" aria-label="Eliminar">✕</button></div>';
    }).join('') : '<p class="empty">Sin productos</p>';
    $('formTitulo').textContent = editId ? 'Editar producto' : 'Nuevo producto (' + productos.length + (pro ? '' : '/' + FREE_PRODUCTOS) + ')';
  }
  $('p-pub').onchange = (e) => $('rowPrem').classList.toggle('hidden', !e.target.checked);
  function limpiarForm() {
    editId = null;
    ['nombre', 'precio', 'costo', 'stock', 'cat', 'prem'].forEach((k) => { $('p-' + k).value = ''; });
    $('p-pub').checked = false; $('rowPrem').classList.add('hidden');
    renderLista();
  }
  $('bCancelarProd').onclick = limpiarForm;

  async function sincronizar(p, borrar) {
    try {
      if (borrar || !p.publicado) await Cuenta.rpc('catalog_delete', { p_key: p.id });
      else await Cuenta.rpc('catalog_upsert', { p_key: p.id, p_nombre: p.nombre, p_precio: p.precio, p_premium: p.premium, p_categoria: p.categoria });
      return true;
    } catch (e) {
      Core.toast('Catálogo: ' + e.message);
      return false;
    }
  }

  $('bGuardarProd').onclick = async () => {
    const prem = num($('p-prem').value);
    const p = {
      nombre: $('p-nombre').value.trim(),
      precio: num($('p-precio').value),
      costo: num($('p-costo').value) || 0,
      stock: $('p-stock').value === '' ? '' : parseInt($('p-stock').value, 10),
      categoria: $('p-cat').value.trim(),
      publicado: $('p-pub').checked,
      premium: $('p-pub').checked && !isNaN(prem) ? prem : null
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
      if (!pro && productos.length >= FREE_PRODUCTOS) return soloPro('Tener más de ' + FREE_PRODUCTOS + ' productos');
      prod = Object.assign({ id: Core.uid() }, p);
      productos.push(prod);
      if (p.publicado && !(await sincronizar(prod))) prod.publicado = false;
    }
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
      $('rowPrem').classList.toggle('hidden', !p.publicado);
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
      '<button class="small danger" data-id="' + v.id + '" aria-label="Anular venta">✕</button></li>'
    ).join('') : '<li class="empty">Sin ventas en este período</li>';
  }
  $('r-lista').onclick = (e) => {
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

  renderProds(); renderTicket();
})();
