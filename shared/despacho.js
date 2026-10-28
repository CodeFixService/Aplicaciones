/* Órbita · Despacho por comuna.
   Despacho.montar({ cfg, monto })  → en el carrito: elige comuna, muestra el costo antes de pedir y oculta el retiro si la tienda no lo tiene.
   Despacho.direccion(texto)        → "calle 123, Ñuñoa" (la comuna va al final: el servidor calcula el costo con ella).
   Despacho.editor(el, rpc)          → en Ajustes de la tienda: retiro sí/no, despacho gratis desde, y precio por comuna. */
(function (global) {
  'use strict';
  const COMUNAS_RM = ['Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja',
    'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia',
    'Pudahuel', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Santiago', 'Vitacura', 'Puente Alto', 'Pirque',
    'San José de Maipo', 'Colina', 'Lampa', 'Tiltil', 'San Bernardo', 'Buin', 'Calera de Tango', 'Paine', 'Melipilla', 'Talagante', 'Peñaflor', 'Padre Hurtado',
    'Isla de Maipo', 'El Monte', 'Curacaví', 'María Pinto', 'Alhué', 'San Pedro'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  let C = {}, monto = () => 0;
  const $ = (id) => document.getElementById(id);
  const zonas = () => (C.zonas || []);

  function costo() {
    const sel = $('dComuna'); if (!sel || !sel.value) return null;
    const z = zonas().find((x) => x.comuna === sel.value); if (!z) return null;
    return C.gratis_desde > 0 && monto() >= C.gratis_desde ? 0 : Number(z.precio) || 0;
  }
  function pintarCosto() {
    const p = $('dCosto'); if (!p) return;
    const c = costo();
    p.innerHTML = c == null ? 'Elige tu comuna para ver el costo del despacho.' : c === 0 ? '🚚 Despacho <b>gratis</b> a ' + esc($('dComuna').value) + '.'
      : '🚚 Despacho a ' + esc($('dComuna').value) + ': <b>' + pesos(c) + '</b> (se suma al total del pedido).';
    if (C.gratis_desde > 0 && c) p.innerHTML += '<br>Gratis desde ' + pesos(C.gratis_desde) + '.';
  }
  function montar(o) {
    C = (o && o.cfg) || {}; monto = (o && o.monto) || monto;
    const fila = $('rowDir'), dir = $('dir'), ent = $('entrega');
    if (!fila || !dir) return;
    if (C.retiro === false && ent) {
      const r = ent.querySelector('[data-e="retiro"]'), d = ent.querySelector('[data-e="despacho"]');
      if (r) r.classList.add('hidden');
      if (d) setTimeout(() => d.click(), 0);
    }
    if (!zonas().length || $('dComuna')) return;
    const aviso = fila.querySelector('.aviso, p.muted'); if (aviso) aviso.remove();
    dir.insertAdjacentHTML('beforebegin', '<label for="dComuna">Comuna</label><select id="dComuna"><option value="">Elige tu comuna…</option>' +
      zonas().map((z) => '<option>' + esc(z.comuna) + '</option>').join('') + '</select><p class="muted" id="dCosto" style="font-size:13px;margin:6px 0"></p>');
    dir.placeholder = 'Calle, número y depto';
    $('dComuna').onchange = () => { pintarCosto(); if (o.alCambiar) o.alCambiar(); };
    pintarCosto();
  }
  // Devuelve la dirección con la comuna al final, o lanza un error si falta algo.
  function direccion(t) {
    t = String(t || '').trim();
    if (!zonas().length) return t;
    const sel = $('dComuna');
    if (!sel || !sel.value) throw new Error('Elige tu comuna');
    if (!t) throw new Error('Escribe la dirección de despacho');
    return t.replace(/,\s*$/, '') + ', ' + sel.value;
  }

  function editor(el, rpc) {
    let d = { retiro: true, gratis_desde: 0, zonas: [] };
    const fila = (z, i) => '<div class="row" style="gap:6px;margin:6px 0"><input data-c="' + i + '" list="dComunas" placeholder="Comuna" value="' + esc(z.comuna) + '" style="flex:2">' +
      '<input data-p="' + i + '" type="number" inputmode="numeric" min="0" placeholder="$" value="' + (z.precio == null ? '' : z.precio) + '" style="flex:1">' +
      '<button type="button" class="alt small" data-q="' + i + '" aria-label="Quitar" style="flex:none">✕</button></div>';
    function pintar() {
      el.innerHTML = '<h2>🚚 Despacho y retiro</h2><p class="muted" style="margin-top:0">Tus clientes eligen su comuna y ven el costo antes de pedir. El pedido se paga completo (productos + despacho).</p>' +
        '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="dRet" style="width:auto"' + (d.retiro !== false ? ' checked' : '') + '> Tengo retiro en tienda</label>' +
        '<label for="dGratis">Despacho gratis desde (0 = nunca)</label><input id="dGratis" type="number" inputmode="numeric" min="0" value="' + (d.gratis_desde || 0) + '">' +
        '<label>Comunas a las que despachas y su precio</label><datalist id="dComunas">' + COMUNAS_RM.map((c) => '<option value="' + c + '">').join('') + '</datalist>' +
        '<div id="dZonas">' + (d.zonas.length ? d.zonas.map(fila).join('') : '<p class="muted">Sin comunas: el despacho se coordina por WhatsApp.</p>') + '</div>' +
        '<div class="btns"><button type="button" class="alt" id="dMas">+ Agregar comuna</button><button type="button" id="dGuardar">Guardar</button></div>';
      el.querySelector('#dMas').onclick = () => { leer(); d.zonas.push({ comuna: '', precio: '' }); pintar(); const l = el.querySelectorAll('[data-c]'); l[l.length - 1].focus(); };
      el.querySelector('#dZonas').onclick = (e) => { const q = e.target.closest('[data-q]'); if (q) { leer(); d.zonas.splice(+q.dataset.q, 1); pintar(); } };
      el.querySelector('#dGuardar').onclick = async (e) => {
        leer(); e.target.disabled = true;
        try { d = await rpc('guardar_despacho', { p: d }); pintar(); (global.Core && global.Core.toast ? global.Core.toast : alert)('✅ Despacho guardado'); if (global.CFX_AYUDA) global.CFX_AYUDA.revisar(); }
        catch (x) { (global.Core && global.Core.toast ? global.Core.toast : alert)(x.message); e.target.disabled = false; }
      };
    }
    function leer() {
      d.retiro = el.querySelector('#dRet').checked;
      d.gratis_desde = Number(el.querySelector('#dGratis').value) || 0;
      d.zonas = d.zonas.map((z, i) => ({ comuna: (el.querySelector('[data-c="' + i + '"]') || {}).value || '', precio: Number((el.querySelector('[data-p="' + i + '"]') || {}).value) || 0 }));
    }
    el.innerHTML = '<p class="muted">Cargando despacho…</p>';
    rpc('mi_despacho').then((r) => { d = Object.assign({ retiro: true, gratis_desde: 0, zonas: [] }, r || {}); pintar(); }).catch((x) => { el.innerHTML = '<p class="muted">' + esc(x.message) + '</p>'; });
  }
  global.Despacho = { montar, direccion, costo, editor, COMUNAS_RM };
})(window);
