(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  Core.registerSW('../../');
  Core.marca();
  const cuenta = await Cuenta.require('../../');
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

  let productos = db.get('productos', []);
  let ventas = db.get('ventas', []);
  let ticket = [];
  let editId = null;

  document.querySelectorAll('nav.tabs button').forEach((b) => { b.onclick = () => show(b.dataset.v); });
  function show(v) {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    if (v === 'productos') renderLista();
    if (v === 'reporte') renderReporte();
  }

  /* ---------- Vender ---------- */
  function renderProds() {
    $('prods').innerHTML = productos.length ? productos.map((p) =>
      '<button class="prod' + (p.stock !== '' && p.stock <= 3 ? ' low' : '') + '" data-id="' + p.id + '">' +
      '<b>' + Core.esc(p.nombre) + '</b><span>' + Core.money(p.precio) + '</span>' +
      '<span class="muted">' + (p.stock === '' ? '' : 'Stock: ' + p.stock) + '</span></button>'
    ).join('') : '<p class="empty" style="grid-column:1/-1">Agrega productos en la pestaña 📦</p>';
  }
  $('prods').onclick = (e) => {
    const b = e.target.closest('.prod');
    if (!b) return;
    const p = productos.find((x) => x.id === b.dataset.id);
    const line = ticket.find((l) => l.id === p.id);
    if (line) line.cant++; else ticket.push({ id: p.id, nombre: p.nombre, precio: +p.precio, costo: +p.costo || 0, cant: 1 });
    if (navigator.vibrate) navigator.vibrate(15);
    renderTicket();
  };

  function renderTicket() {
    const total = ticket.reduce((s, l) => s + l.precio * l.cant, 0);
    $('ticketTotal').textContent = Core.money(total);
    $('ticket').innerHTML = ticket.map((l, i) =>
      '<li><div class="grow">' + l.cant + ' × ' + Core.esc(l.nombre) + '</div><b>' + Core.money(l.precio * l.cant) + '</b>' +
      '<button class="small alt" data-i="' + i + '">−</button></li>'
    ).join('');
  }
  $('ticket').onclick = (e) => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    if (--ticket[i].cant <= 0) ticket.splice(i, 1);
    renderTicket();
  };
  $('bLimpiar').onclick = () => { ticket = []; renderTicket(); };
  $('bCobrar').onclick = () => {
    if (!ticket.length) return;
    ventas.push({ id: Core.uid(), t: Date.now(), items: ticket });
    ticket.forEach((l) => {
      const p = productos.find((x) => x.id === l.id);
      if (p && p.stock !== '') p.stock = Math.max(0, p.stock - l.cant);
    });
    db.set('ventas', ventas); db.set('productos', productos);
    const low = productos.filter((p) => p.stock !== '' && p.stock <= 3);
    if (low.length) Core.notify('Stock bajo', { body: low.map((p) => p.nombre + ' (' + p.stock + ')').join(', ') });
    Core.toast('Venta registrada: ' + $('ticketTotal').textContent);
    ticket = []; renderTicket(); renderProds();
  };

  /* ---------- Productos ---------- */
  function renderLista() {
    $('listaProds').innerHTML = productos.length ? productos.map((p) =>
      '<li><div class="grow"><b>' + Core.esc(p.nombre) + '</b><div class="muted">' + Core.money(p.precio) +
      (p.stock === '' ? '' : ' · stock ' + p.stock) + '</div></div>' +
      '<button class="small alt" data-a="edit" data-id="' + p.id + '">Editar</button>' +
      '<button class="small danger" data-a="del" data-id="' + p.id + '">✕</button></li>'
    ).join('') : '<li class="empty">Sin productos</li>';
  }
  function limpiarForm() { editId = null; ['nombre', 'precio', 'costo', 'stock'].forEach((k) => { $('p-' + k).value = ''; }); }
  $('bCancelarProd').onclick = limpiarForm;
  $('bGuardarProd').onclick = () => {
    const p = {
      nombre: $('p-nombre').value.trim(),
      precio: parseFloat($('p-precio').value.replace(',', '.')),
      costo: parseFloat($('p-costo').value.replace(',', '.')) || 0,
      stock: $('p-stock').value === '' ? '' : parseInt($('p-stock').value, 10)
    };
    if (!p.nombre || isNaN(p.precio)) return Core.toast('Nombre y precio son obligatorios');
    if (editId) productos = productos.map((x) => x.id === editId ? Object.assign(x, p) : x);
    else if (!pro && productos.length >= FREE_PRODUCTOS) return soloPro('Tener más de ' + FREE_PRODUCTOS + ' productos');
    else productos.push(Object.assign({ id: Core.uid() }, p));
    db.set('productos', productos); limpiarForm(); renderLista(); renderProds();
  };
  $('listaProds').onclick = (e) => {
    const { a, id } = e.target.dataset;
    const p = productos.find((x) => x.id === id);
    if (a === 'edit') {
      editId = id;
      ['nombre', 'precio', 'costo', 'stock'].forEach((k) => { $('p-' + k).value = p[k]; });
      scrollTo(0, 0);
    }
    if (a === 'del' && confirm('¿Eliminar ' + p.nombre + '?')) {
      productos = productos.filter((x) => x.id !== id);
      db.set('productos', productos); renderLista(); renderProds();
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
  function renderReporte() {
    const vs = delDia();
    let ingreso = 0, costo = 0;
    vs.forEach((v) => v.items.forEach((l) => { ingreso += l.precio * l.cant; costo += l.costo * l.cant; }));
    $('k-ventas').textContent = vs.length;
    $('k-ingreso').textContent = Core.money(ingreso);
    $('k-ganancia').textContent = Core.money(ingreso - costo) + (ingreso ? ' (' + Math.round((ingreso - costo) / ingreso * 100) + '%)' : '');
    const top = {};
    vs.forEach((v) => v.items.forEach((l) => {
      const t = top[l.nombre] || (top[l.nombre] = { cant: 0, total: 0 });
      t.cant += l.cant; t.total += l.precio * l.cant;
    }));
    $('r-top').innerHTML = !pro ? '<li class="muted">Descubre qué productos te dejan más dinero con la versión Pro.</li>'
      : Object.entries(top).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([n, t], i) =>
        '<li><div class="grow"><b>' + (i + 1) + '. ' + Core.esc(n) + '</b><div class="muted">' + t.cant + ' vendidos</div></div><b>' +
        Core.money(t.total) + '</b></li>').join('') || '<li class="empty">Sin ventas</li>';
    $('r-lista').innerHTML = vs.length ? vs.slice().reverse().map((v) =>
      '<li><div class="grow"><b>' + new Date(v.t).toLocaleString('es', rango === 'dia' ? { hour: '2-digit', minute: '2-digit' } : { dateStyle: 'short', timeStyle: 'short' }) + '</b>' +
      '<div class="muted">' + v.items.map((l) => l.cant + '× ' + Core.esc(l.nombre)).join(', ') + '</div></div>' +
      '<b>' + Core.money(v.items.reduce((s, l) => s + l.precio * l.cant, 0)) + '</b>' +
      '<button class="small danger" data-id="' + v.id + '">✕</button></li>'
    ).join('') : '<li class="empty">Sin ventas este día</li>';
  }
  $('r-lista').onclick = (e) => {
    const id = e.target.dataset.id;
    if (!id || !confirm('¿Anular esta venta?')) return;
    ventas = ventas.filter((v) => v.id !== id);
    db.set('ventas', ventas); renderReporte();
  };
  $('bCSV').onclick = () => {
    const rows = [['fecha', 'producto', 'cantidad', 'precio', 'costo', 'total']];
    delDia().forEach((v) => v.items.forEach((l) => rows.push([
      new Date(v.t).toLocaleString('es'), l.nombre, l.cant, l.precio, l.costo, l.precio * l.cant
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
