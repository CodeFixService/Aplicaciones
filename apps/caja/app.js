(function () {
  'use strict';
  const db = Core.store('caja');
  const $ = (id) => document.getElementById(id);
  Core.registerSW('../../');

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
  function delDia() {
    const [y, m, d] = $('r-dia').value.split('-').map(Number);
    const ini = new Date(y, m - 1, d).getTime(), fin = ini + 864e5;
    return ventas.filter((v) => v.t >= ini && v.t < fin);
  }
  function renderReporte() {
    const vs = delDia();
    let ingreso = 0, costo = 0;
    vs.forEach((v) => v.items.forEach((l) => { ingreso += l.precio * l.cant; costo += l.costo * l.cant; }));
    $('k-ventas').textContent = vs.length;
    $('k-ingreso').textContent = Core.money(ingreso);
    $('k-ganancia').textContent = Core.money(ingreso - costo);
    $('r-lista').innerHTML = vs.length ? vs.slice().reverse().map((v) =>
      '<li><div class="grow"><b>' + new Date(v.t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + '</b>' +
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
    const rows = [['hora', 'producto', 'cantidad', 'precio', 'total']];
    delDia().forEach((v) => v.items.forEach((l) => rows.push([
      new Date(v.t).toLocaleTimeString('es'), l.nombre, l.cant, l.precio, l.precio * l.cant
    ])));
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    Core.download('ventas-' + $('r-dia').value + '.csv', '﻿' + csv, 'text/csv');
  };
  $('bBackup').onclick = () => Core.backup('caja', 'caja');
  $('restore').onchange = (e) => { if (e.target.files[0]) Core.restore('caja', e.target.files[0], () => location.reload()); };

  renderProds(); renderTicket();
})();
