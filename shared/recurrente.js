/* CodeFix · Núcleo · 🔁 Compras recurrentes (G162 · módulo 'suscripciones' de las 5 apps con negocio; SQL: sql/recurrente.sql).
   El dueño arma lo que su cliente compra fijo y cada 7…365 días: 🔔 aviso X días antes · el día que toca se crea solo · 💳 cobro
   (⚡ automático con tarjeta, link de pago del día o ✅ pagado a mano). 📊 Resumen: $ al mes, cobrado, por cobrar y próximas fechas.
   Uso (lo carga ayuda.js la primera vez):
     CFX_RECURRENTE.montar(zona, { rpc, probar, clientes?: async () => [{ cuenta?, nombre, whatsapp?, correo? }],
                                   productos?: async () => [{ clave, nombre, precio, tipo? }], conClave?: true (solo del catálogo), despacho?: true })
     CFX_RECURRENTE.mias(zona, { rpc })  → el cliente con cuenta (sin ninguna: la zona queda oculta). */
(function () {
  'use strict';
  const esc = window.CFX_ESC || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const D = () => window.CFX_DIALOGO || { avisar: async () => {}, confirmar: async () => false, pedir: async () => null };
  const aviso = (t) => (window.CFX_AVISO ? window.CFX_AVISO(t) : D().avisar(t));
  const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const fecha = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '';
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const wa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '56' + d; else if (d.length === 8) d = '569' + d; return /^\d{10,15}$/.test(d) ? d : ''; };
  const CADA = [7, 14, 15, 30, 60, 90, 180, 365];
  const cadaTxt = (n) => n === 7 ? 'cada semana' : n === 14 ? 'cada 2 semanas' : n === 30 ? 'cada mes' : n === 365 ? 'cada año' : 'cada ' + n + ' días';
  const TIPO = (t) => (window.CFX_TIPO && CFX_TIPO.TIPOS[t] ? CFX_TIPO.TIPOS[t].ico : '');
  const CSS = '.cfx-rc{display:grid;gap:10px}.cfx-rc p{margin:2px 0}.cfx-rc h3{margin:8px 0 2px}.cfx-rc-k{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
    '.cfx-rc-k>div{background:var(--cfx-campo);border-radius:var(--cfx-radio-chico,10px);padding:8px}.cfx-rc-k b{display:block;font-size:18px}' +
    '.cfx-rc-c{border:1px solid var(--cfx-borde);border-radius:var(--cfx-radio,14px);padding:10px;display:grid;gap:4px;overflow-wrap:anywhere}' +
    '.cfx-rc-b{display:flex;gap:6px;flex-wrap:wrap}.cfx-rc-b button{flex:0 1 auto}.cfx-rc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.cfx-rc-row>*{flex:1 1 120px;min-width:0}' +
    '.cfx-rc-l{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.cfx-rc-l>.n{flex:2 1 150px;min-width:0}.cfx-rc-l>.p{flex:1 1 90px;min-width:0}.cfx-rc-l>.c{flex:0 0 64px;width:64px}' +
    '.cfx-rc-mal{color:var(--cfx-mal)}.cfx-rc-ok{color:var(--cfx-ok)}.cfx-rc-sut{color:var(--cfx-texto-2);font-size:13px}.cfx-rc-f{display:grid;gap:6px;border:1px dashed var(--cfx-borde);border-radius:var(--cfx-radio,14px);padding:10px}' +
    '.cfx-rc-f label{font-weight:600;font-size:14px}.cfx-rc-f input,.cfx-rc-f select{width:100%;box-sizing:border-box}.cfx-rc details summary{cursor:pointer;font-weight:600}';
  function estilo() { if (!document.getElementById('cfx-rc-css')) { const s = document.createElement('style'); s.id = 'cfx-rc-css'; s.textContent = CSS; document.head.appendChild(s); } }
  const lineas = (x) => (x.items || []).map((l) => (l.cant > 1 ? l.cant + ' × ' : '') + TIPO(l.tipo) + ' ' + l.nombre).join(', ');
  const volver = (id) => { try { const u = new URL(location.href); u.searchParams.set('cfx_rec', id); return u.toString(); } catch (e) { return null; } };
  const r1 = async (rpc, f, a) => { const r = await rpc(f, a); if (r && r.ok === false) throw new Error(r.error || 'No se pudo'); return r; };

  // ═══ El dueño ═══
  async function montar(z, o) {
    o = o || {}; estilo(); const rpc = o.rpc;
    z.innerHTML = '<p class="cfx-rc-sut">Cargando…</p>';
    let d, cli = [], prods = [];
    try { [d, cli, prods] = await Promise.all([r1(rpc, 'cfx_recurrente_lista'), o.clientes ? o.clientes().catch(() => []) : [], o.productos ? o.productos().catch(() => []) : []]); }
    catch (e) { z.innerHTML = '<p class="cfx-rc-mal">⚠️ ' + esc(e.message || e) + '</p>'; return; }
    cli = cli || []; prods = (prods || []).filter((p) => p && p.nombre);
    try { const id = new URL(location.href).searchParams.get('cfx_rec'); if (id) await rpc('cfx_recurrente_revisar', { p_id: id }); } catch (e) { /* sin red */ }
    const L = d.items || [], R = d.resumen || {};
    const sinMod = !d.puede;
    const resumen = '<div class="cfx-rc-k"><div>💰 Al mes<b>' + plata(R.al_mes) + '</b></div><div>🔁 Activas<b>' + (R.activas || 0) + '</b></div>' +
      '<div>✅ Cobrado este mes<b>' + plata(R.cobrado_mes) + '</b></div><div>⏳ Por cobrar<b>' + plata(R.por_cobrar) + '</b></div></div>' +
      ((R.proximas || []).length ? '<details open><summary>📅 Próximas (30 días)</summary>' + R.proximas.map((p) => '<p>' + esc(fecha(p.fecha)) + ' · ' + esc(p.nombre) + ' · ' + plata(p.total) + '</p>').join('') + '</details>' : '');
    const tarjeta = (x) => {
      const pe = x.pendiente;
      return '<div class="cfx-rc-c" data-id="' + esc(x.id) + '"><b>' + esc(x.nombre) + ' · ' + plata(x.total) + '</b>' +
        '<span class="cfx-rc-sut">' + esc(lineas(x)) + '</span>' +
        '<span>' + (x.activa ? '📅 ' + esc(cadaTxt(x.cada)) + ' · próximo ' + esc(fecha(x.proxima)) + (x.aviso ? ' · 🔔 ' + x.aviso + ' d antes' : '') : '⏸️ Pausada · ' + esc(cadaTxt(x.cada))) +
        (x.auto ? ' · <b class="cfx-rc-ok">⚡ Automático</b>' : '') + (x.entrega === 'despacho' ? ' · 🚚' : '') + '</span>' +
        (pe ? '<span>⏳ Por cobrar ' + plata(pe.monto) + ' (' + esc(fecha(pe.fecha)) + ')' + (pe.ref ? ' · en su pedido' : '') + '</span>' : '') +
        (x.error ? '<span class="cfx-rc-mal">⚠️ ' + esc(x.error) + '</span>' : '') +
        '<div class="cfx-rc-b">' +
        (pe && !pe.ref ? '<button type="button" class="small" data-a="cobrar">📲 Cobrar</button><button type="button" class="small alt" data-a="pagado">✅ Pagado</button>' : '') +
        (!sinMod ? '<button type="button" class="small alt" data-a="estado">' + (x.activa ? '⏸️ Pausar' : '▶️ Seguir') + '</button><button type="button" class="small alt" data-a="editar">✏️ Editar</button>' : '') +
        (!sinMod && d.mp && x.activa && !x.auto ? '<button type="button" class="small alt" data-a="auto">⚡ Cobro automático</button>' : '') +
        '<button type="button" class="small alt" data-a="borrar" aria-label="Borrar">🗑️</button></div>' +
        ((x.historial || []).length ? '<details><summary>🧾 Historial (' + x.veces + ')</summary>' + x.historial.map((h) => '<p class="cfx-rc-sut">' + esc(fecha(h.fecha)) + ' · ' + plata(h.monto) + ' · ' +
          (h.estado === 'pagado' ? '✅ ' + (h.medio === 'auto' ? '⚡ automático' : h.medio === 'manual' ? 'a mano' : h.medio === 'flow' ? '💳 Webpay' : '⚡ Mercado Pago') : h.estado === 'fallo' ? '⚠️ no se pudo' : '⏳ pendiente') + '</p>').join('') + '</details>' : '') + '</div>';
    };
    z.innerHTML = '<div class="cfx-rc"><p class="cfx-rc-sut">Lo que tu cliente compra fijo (productos, servicios o accesos): le avisamos antes, el día que toca se crea solo y se cobra.</p>' +
      (sinMod ? '<p>🧩 Es un módulo: pruébalo gratis o actívalo.' + (L.length ? ' Tus compras recurrentes siguen aquí, en pausa hasta activarlo.' : '') + '</p><button type="button" class="ok" data-a="probar">▶️ Probar módulo</button>' : '') +
      (L.length ? resumen : '') +
      (!sinMod ? '<button type="button" class="ok" data-a="nueva" style="width:100%">➕ Nueva compra recurrente</button><div data-form hidden></div>' : '') +
      '<h3>Tus compras recurrentes</h3>' + (L.length ? L.map(tarjeta).join('') : '<p class="cfx-rc-sut">Aún no tienes. Ej.: 1 kg de café cada 15 días, un corte cada mes, la mantención cada 6 meses.</p>') + '</div>';
    const caja = z.firstChild, form = caja.querySelector('[data-form]');
    const recargar = () => montar(z, o);

    function abrirForm(x) {
      x = x || {}; form.hidden = false;
      const optC = cli.length ? '<label for="rcCli">Cliente</label><select id="rcCli" name="cliente"><option value="">✍️ Escribir nombre…</option>' +
        cli.map((c, i) => '<option value="' + i + '"' + (x.cuenta && c.cuenta === x.cuenta ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select>' : '';
      const optP = '<option value="">' + (o.conClave ? 'Elige…' : '✍️ Escribir…') + '</option>' + prods.map((p, i) => '<option value="' + i + '">' + esc(p.nombre) + ' · ' + plata(p.precio) + '</option>').join('');
      const linea = (l) => { l = l || {}; const i = l.clave != null ? prods.findIndex((p) => String(p.clave) === String(l.clave)) : -1;
        return '<div class="cfx-rc-l" data-l>' + (prods.length ? '<select class="n" name="producto" aria-label="Producto">' + optP.replace('value="' + i + '"', 'value="' + i + '" selected') + '</select>' : '') +
          (o.conClave ? '' : '<input class="n" data-nom maxlength="80" placeholder="Qué (ej. Corte de pelo)" aria-label="Qué" value="' + esc(i >= 0 ? '' : l.nombre || '') + '"' + (i >= 0 ? ' hidden' : '') + '>' +
            '<input class="p" data-pre type="number" min="0" inputmode="numeric" placeholder="Precio" aria-label="Precio" value="' + (i >= 0 || l.precio == null ? '' : l.precio) + '"' + (i >= 0 ? ' hidden' : '') + '>') +
          '<input class="c" data-cant type="number" min="1" max="99" value="' + (l.cant || 1) + '" aria-label="Cantidad"></div>'; };
      const cada = x.cada || 30, otro = !CADA.includes(cada);
      form.innerHTML = '<div class="cfx-rc-f"><b>' + (x.id ? '✏️ Editar' : '➕ Nueva') + ' compra recurrente</b>' + optC +
        '<div class="cfx-rc-row"><div data-libre><label for="rcNom">Nombre del cliente</label><input id="rcNom" maxlength="80" value="' + esc(x.nombre || '') + '"></div>' +
        '<div><label for="rcWa">WhatsApp</label><input id="rcWa" inputmode="tel" maxlength="16" placeholder="+56 9…" value="' + esc(x.whatsapp || '') + '"></div></div>' +
        '<label>¿Qué compra?</label><div data-ls>' + ((x.items || []).length ? x.items.map(linea).join('') : linea()) + '</div>' +
        '<button type="button" class="small alt" data-a="linea">Agregar otro</button>' +
        '<div class="cfx-rc-row"><div><label for="rcCada">Cada</label><select id="rcCada" name="cada">' + CADA.map((n) => '<option value="' + n + '"' + (n === cada ? ' selected' : '') + '>' + esc(cadaTxt(n)) + '</option>').join('') +
        '<option value="otro"' + (otro ? ' selected' : '') + '>Otro…</option></select><input id="rcDias" type="number" min="7" max="365" placeholder="Días (7 a 365)" aria-label="Días" value="' + (otro ? cada : '') + '"' + (otro ? '' : ' hidden') + '></div>' +
        '<div><label for="rcDesde">Primera vez</label><input id="rcDesde" type="date" min="' + hoy() + '" value="' + esc(x.proxima && x.proxima >= hoy() ? x.proxima : hoy()) + '"></div>' +
        '<div><label for="rcAv">🔔 Avisar</label><select id="rcAv" name="aviso">' + [[0, 'Sin aviso'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [7, '1 semana antes']].map(([v, t]) =>
          '<option value="' + v + '"' + (v === (x.aviso == null ? 1 : x.aviso) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>' +
        (o.despacho ? '<div data-env><label for="rcEnt">Entrega</label><select id="rcEnt" name="entrega"><option value="retiro">🏪 Retiro en tienda</option><option value="despacho"' + (x.entrega === 'despacho' ? ' selected' : '') + '>🚚 Despacho</option></select>' +
          '<input id="rcDir" maxlength="200" placeholder="Dirección y comuna" aria-label="Dirección de despacho" value="' + esc(x.direccion || '') + '"' + (x.entrega === 'despacho' ? '' : ' hidden') + '></div>' : '') +
        '<p class="cfx-rc-sut" data-nota></p><p data-tot></p>' +
        '<div class="cfx-rc-b"><button type="button" class="ok" data-a="guardar" data-id="' + esc(x.id || '') + '">🔁 Guardar</button><button type="button" class="alt" data-a="cerrar">Cancelar</button></div></div>';
      form.cfxLinea = linea; pintarForm(); form.scrollIntoView({ block: 'nearest' });
    }
    const leerItems = () => [...form.querySelectorAll('[data-l]')].map((l) => {
      const s = l.querySelector('select[name=producto]'), p = s && s.value !== '' ? prods[+s.value] : null, cant = +(l.querySelector('[data-cant]').value) || 1;
      if (p) return { clave: p.clave, nombre: p.nombre, precio: p.precio, tipo: p.tipo || (window.CFX_TIPO ? CFX_TIPO.de(p) : null), cant };
      const n = l.querySelector('[data-nom]'); if (!n || !n.value.trim()) return null;
      const t = window.CFX_TIPO ? CFX_TIPO.adivinar({ nombre: n.value }) : null;
      return { nombre: n.value.trim(), precio: +(l.querySelector('[data-pre]').value) || 0, tipo: t, cant };
    }).filter(Boolean);
    function pintarForm() {
      const sc = form.querySelector('#rcCli'); const libre = form.querySelector('[data-libre]');
      if (sc && libre) libre.hidden = sc.value !== '';
      form.querySelectorAll('[data-l]').forEach((l) => { const s = l.querySelector('select[name=producto]'), elegido = s && s.value !== '';
        l.querySelectorAll('[data-nom],[data-pre]').forEach((i) => { i.hidden = elegido; }); });
      const its = leerItems(), tot = its.reduce((a, i) => a + (Number(i.precio) || 0) * i.cant, 0);
      const e = window.CFX_TIPO ? CFX_TIPO.entregas(its.map((i) => i.tipo || 'producto')) : { envio: true, nota: '' };
      const env = form.querySelector('[data-env]'); if (env) env.hidden = its.length > 0 && !e.envio;
      const ent = form.querySelector('#rcEnt'), dir = form.querySelector('#rcDir'); if (ent && dir) dir.hidden = ent.value !== 'despacho' || (env && env.hidden);
      form.querySelector('[data-nota]').textContent = its.length ? e.nota : '';
      form.querySelector('[data-tot]').innerHTML = its.length ? 'Total <b>' + plata(tot) + '</b>' + (o.conClave ? ' <span class="cfx-rc-sut">(con los precios del día que toca)</span>' : '') : '';
      const c = form.querySelector('#rcCada'), dd = form.querySelector('#rcDias'); dd.hidden = c.value !== 'otro';
    }
    form && form.addEventListener('input', pintarForm);
    form && form.addEventListener('change', (e) => { if (e.target.id === 'rcCli') { const c = cli[+e.target.value], w = form.querySelector('#rcWa'); if (c && w) w.value = c.whatsapp || ''; } pintarForm(); });

    caja.onclick = async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a, card = b.closest('[data-id]'), x = card && L.find((y) => y.id === card.dataset.id);
      if (a === 'probar') return o.probar && o.probar('suscripciones');
      if (a === 'nueva') return abrirForm();
      if (a === 'cerrar') { form.hidden = true; form.innerHTML = ''; return; }
      if (a === 'linea') { form.querySelector('[data-ls]').insertAdjacentHTML('beforeend', form.cfxLinea()); pintarForm(); return; }
      if (a === 'editar' && x) return abrirForm(x);
      b.disabled = true;
      try {
        if (a === 'guardar') {
          const sc = form.querySelector('#rcCli'), c = sc && sc.value !== '' ? cli[+sc.value] : null, cs = form.querySelector('#rcCada');
          const ent = form.querySelector('#rcEnt'), env = form.querySelector('[data-env]');
          await r1(rpc, 'cfx_recurrente_guardar', { p: { id: b.dataset.id || null, cuenta: c ? c.cuenta || null : null, nombre: c ? c.nombre : form.querySelector('#rcNom').value,
            whatsapp: form.querySelector('#rcWa').value || (c && c.whatsapp) || '', correo: (c && c.correo) || (x && x.correo) || '', items: leerItems(),
            cada: cs.value === 'otro' ? +form.querySelector('#rcDias').value : +cs.value, aviso: +form.querySelector('#rcAv').value,
            entrega: ent && !(env && env.hidden) ? ent.value : 'retiro', direccion: (form.querySelector('#rcDir') || {}).value || '', proxima: form.querySelector('#rcDesde').value } });
          aviso('🔁 Compra recurrente guardada'); return recargar();
        }
        if (!x) return;
        if (a === 'estado') { await r1(rpc, 'cfx_recurrente_estado', { p_id: x.id, p_activa: !x.activa }); return recargar(); }
        if (a === 'borrar') {
          if (!(await D().confirmar('¿Borrar la compra recurrente de ' + x.nombre + '? Lo ya cobrado queda en tus números.', { si: 'Borrar' }))) return;
          await r1(rpc, 'cfx_recurrente_borrar', { p_id: x.id }); return recargar();
        }
        if (a === 'pagado') {
          if (!(await D().confirmar('¿' + x.nombre + ' ya te pagó ' + plata(x.pendiente.monto) + '? (transferencia, efectivo…)', { si: '✅ Sí, pagó' }))) return;
          await r1(rpc, 'cfx_recurrente_pagado', { p_cobro: x.pendiente.id }); aviso('✅ Marcado como pagado'); return recargar();
        }
        if (a === 'cobrar') {
          let url = x.pendiente.url || '';
          if (!url && d.cobro) { const r = await rpc('cfx_recurrente_pagar', { p_cobro: x.pendiente.id }); if (r && r.pagado) { aviso('✅ Ya estaba pagado'); return recargar(); } url = (r && r.ok && r.url) || ''; }
          const t = 'Hola ' + x.nombre + ' 👋 Hoy toca tu compra de ' + (x.tienda || '') + ': ' + lineas(x) + ' · ' + plata(x.pendiente.monto) + '.' + (url ? ' Págala aquí: ' + url : ' Puedes pagarme por transferencia.');
          window.open('https://wa.me/' + wa(x.whatsapp) + '?text=' + encodeURIComponent(t), '_blank', 'noopener'); return;
        }
        if (a === 'auto') {
          const m = await D().pedir('⚡ Cobro automático: ' + x.nombre + ' autoriza su tarjeta 1 vez en Mercado Pago y se cobra solo ' + cadaTxt(x.cada) + '. Correo de Mercado Pago de ' + x.nombre + ':', x.correo || '', { si: 'Crear link' });
          if (!m) return;
          const r = await r1(rpc, 'cfx_recurrente_auto', { p_id: x.id, p_correo: m, p_volver: volver(x.id) });
          window.open('https://wa.me/' + wa(x.whatsapp) + '?text=' + encodeURIComponent('Hola ' + x.nombre + ' 👋 Para que tu compra de ' + (x.tienda || '') + ' (' + plata(x.total) + ', ' + cadaTxt(x.cada) + ') se pague sola, autoriza tu tarjeta aquí: ' + r.url), '_blank', 'noopener');
          aviso('📲 Link enviado: queda ⚡ cuando lo autorice'); return;
        }
      } catch (e) { D().avisar('⚠️ ' + (e.message || e)); } finally { b.disabled = false; }
    };
  }

  // ═══ El cliente (con cuenta) ═══
  async function mias(z, o) {
    o = o || {}; estilo(); const rpc = o.rpc; let L;
    try { const id = new URL(location.href).searchParams.get('cfx_rec'); if (id) await rpc('cfx_recurrente_revisar', { p_id: id }); } catch (e) { /* nada */ }
    try { L = await rpc('cfx_recurrente_mias'); } catch (e) { L = []; }
    L = Array.isArray(L) ? L : [];
    if (!L.length) { z.innerHTML = ''; z.hidden = true; return; }
    z.hidden = false;
    z.innerHTML = '<div class="cfx-rc"><h2>🔁 Tus compras recurrentes</h2>' + L.map((x) => '<div class="cfx-rc-c" data-id="' + esc(x.id) + '"><b>' + esc(x.tienda) + ' · ' + plata(x.total) + '</b>' +
      '<span class="cfx-rc-sut">' + esc(lineas(x)) + '</span><span>' + (x.activa ? '📅 ' + esc(cadaTxt(x.cada)) + ' · próximo ' + esc(fecha(x.proxima)) : '⏸️ Pausada · ' + esc(cadaTxt(x.cada))) + (x.auto ? ' · <b class="cfx-rc-ok">⚡ se paga solo</b>' : '') + '</span>' +
      (x.pendiente && !x.pendiente.ref ? '<span>⏳ Por pagar ' + plata(x.pendiente.monto) + '</span>' : '') +
      '<div class="cfx-rc-b">' + (x.pendiente && !x.pendiente.ref ? '<button type="button" class="small" data-a="pagar">💳 Pagar</button>' : '') +
      '<button type="button" class="small alt" data-a="estado">' + (x.activa ? '⏸️ Pausar' : '▶️ Seguir') + '</button>' +
      (x.mp && x.activa && !x.auto ? '<button type="button" class="small alt" data-a="auto">⚡ Pago automático</button>' : '') + '</div></div>').join('') + '</div>';
    z.firstChild.onclick = async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b) return; const x = L.find((y) => y.id === b.closest('[data-id]').dataset.id); if (!x) return;
      b.disabled = true;
      try {
        if (b.dataset.a === 'estado') { await r1(rpc, 'cfx_recurrente_estado', { p_id: x.id, p_activa: !x.activa }); aviso(x.activa ? '⏸️ Pausada' : '▶️ Retomada'); return mias(z, o); }
        if (b.dataset.a === 'pagar') { const r = await r1(rpc, 'cfx_recurrente_pagar', { p_cobro: x.pendiente.id, p_volver: volver(x.id) }); if (r.pagado) { aviso('✅ Ya está pagado'); return mias(z, o); } location.href = r.url; return; }
        if (b.dataset.a === 'auto') {
          const m = await D().pedir('⚡ Pago automático: autorizas tu tarjeta 1 vez en Mercado Pago y se cobra sola ' + cadaTxt(x.cada) + ' (' + plata(x.total) + '). Lo puedes pausar aquí cuando quieras. Tu correo de Mercado Pago:', x.correo || '', { si: 'Ir a Mercado Pago' });
          if (!m) return; const r = await r1(rpc, 'cfx_recurrente_auto', { p_id: x.id, p_correo: m, p_volver: volver(x.id) }); location.href = r.url; return;
        }
      } catch (e) { D().avisar('⚠️ ' + (e.message || e)); } finally { b.disabled = false; }
    };
  }
  window.CFX_RECURRENTE = { montar, mias };
})();
