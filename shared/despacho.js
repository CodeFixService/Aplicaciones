/* CodeFix · Núcleo (módulo opcional, C17) · Despacho por comuna y al resto de Chile (2.58) (el costo lo calcula cfx_despacho_costo en la base).
   cfg.resto = { modo: 'no' | 'fijo' | 'por_pagar', precio }: comunas que no están en la lista (regiones) pagan ese precio o el envío "por pagar" al courier.
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
  const REGIONES = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble', 'Biobío',
    'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'];
  const OTRA = '__otra';
  const esc = (s) => window.CFX_ESC(s);  // shared/seguro.js (núcleo)
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  let C = {}, monto = () => 0;
  const $ = (id) => document.getElementById(id);
  const zonas = () => (C.zonas || []);
  const resto = () => { const m = C.resto && C.resto.modo; return m === 'fijo' || m === 'por_pagar' ? m : ''; };
  const otra = () => { const s = $('dComuna'); return !!s && s.value === OTRA; };
  const destino = () => otra() ? (($('dOtra') || {}).value || '').trim() : ($('dComuna') || {}).value;

  function costo() {
    const sel = $('dComuna'); if (!sel || !sel.value) return null;
    const gratis = C.gratis_desde > 0 && monto() >= C.gratis_desde;
    if (otra()) return resto() === 'por_pagar' ? 'por_pagar' : gratis ? 0 : Number(C.resto.precio) || 0;
    const z = zonas().find((x) => x.comuna === sel.value); if (!z) return null;
    return gratis ? 0 : Number(z.precio) || 0;
  }
  function pintarCosto() {
    const p = $('dCosto'); if (!p) return;
    const c = costo(), a = destino() || 'tu comuna';
    const fila = $('dOtraFila'); if (fila) fila.classList.toggle('hidden', !otra());
    p.innerHTML = c == null ? 'Elige tu comuna para ver el costo del despacho.' : c === 'por_pagar' ? '📦 Envío <b>por pagar</b>: lo pagas al recibir (courier). La tienda te manda el código de seguimiento.'
      : c === 0 ? '🚚 Despacho <b>gratis</b> a ' + esc(a) + '.' : '🚚 Despacho a ' + esc(a) + ': <b>' + pesos(c) + '</b> (se suma al total del pedido).';
    if (C.gratis_desde > 0 && c && c !== 'por_pagar') p.innerHTML += '<br>Gratis desde ' + pesos(C.gratis_desde) + '.';
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
    if ((!zonas().length && !resto()) || $('dComuna')) return;
    const aviso = fila.querySelector('.aviso, p.muted'); if (aviso) aviso.remove();
    dir.insertAdjacentHTML('beforebegin', '<label for="dComuna">Comuna</label><select id="dComuna"><option value="">Elige tu comuna…</option>' +
      zonas().map((z) => '<option>' + esc(z.comuna) + '</option>').join('') + (resto() ? '<option value="' + OTRA + '">📦 Otra comuna o región…</option>' : '') + '</select>' +
      (resto() ? '<div id="dOtraFila" class="hidden"><label for="dRegion">Región</label><select id="dRegion"><option value="">Elige tu región…</option>' +
        REGIONES.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select><label for="dOtra">Tu comuna</label><input id="dOtra" maxlength="40" placeholder="Ej: Temuco" autocomplete="address-level2"></div>' : '') +
      '<p class="muted" id="dCosto" style="font-size:13px;margin:6px 0"></p>');
    dir.placeholder = 'Calle, número y depto';
    const cambio = () => { pintarCosto(); if (o.alCambiar) o.alCambiar(); };
    $('dComuna').onchange = () => { cambio(); if (otra() && $('dRegion')) $('dRegion').focus(); };
    if ($('dOtra')) $('dOtra').oninput = cambio;
    pintarCosto();
  }
  // Devuelve la dirección con la comuna al final, o lanza un error si falta algo.
  function direccion(t) {
    t = String(t || '').trim();
    if (!zonas().length && !resto()) return t;
    const sel = $('dComuna');
    if (!sel || !sel.value) throw new Error('Elige tu comuna');
    if (!t) throw new Error('Escribe la dirección de despacho');
    if (otra()) {
      const r = ($('dRegion') || {}).value, c = destino().replace(/,/g, ' ').trim();
      if (!r) throw new Error('Elige tu región');
      if (c.length < 2) throw new Error('Escribe tu comuna');
      return t.replace(/,\s*$/, '') + ' · Región ' + r + ', ' + c;
    }
    return t.replace(/,\s*$/, '') + ', ' + sel.value;
  }

  function editor(el, rpc) {
    let d = { retiro: true, gratis_desde: 0, zonas: [], resto: { modo: 'no', precio: 0 } };
    const fila = (z, i) => '<div class="row" style="gap:6px;margin:6px 0"><input data-c="' + i + '" list="dComunas" placeholder="Comuna" value="' + esc(z.comuna) + '" style="flex:2">' +
      '<input data-p="' + i + '" type="number" inputmode="numeric" min="0" placeholder="$" value="' + (z.precio == null ? '' : z.precio) + '" style="flex:1">' +
      '<button type="button" class="alt small" data-q="' + i + '" aria-label="Quitar" style="flex:none">✕</button></div>';
    function pintar() {
      el.innerHTML = '<h2>🚚 Despacho y retiro</h2><p class="muted" style="margin-top:0">Tus clientes eligen su comuna y ven el costo antes de pedir. El pedido se paga completo (productos + despacho).</p>' +
        '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="dRet" style="width:auto"' + (d.retiro !== false ? ' checked' : '') + '> Tengo retiro en tienda</label>' +
        '<label for="dGratis">Despacho gratis desde (0 = nunca)</label><input id="dGratis" type="number" inputmode="numeric" min="0" value="' + (d.gratis_desde || 0) + '">' +
        '<label>Comunas a las que despachas y su precio</label><datalist id="dComunas">' + COMUNAS_RM.map((c) => '<option value="' + c + '">').join('') + '</datalist>' +
        '<div id="dZonas">' + (d.zonas.length ? d.zonas.map(fila).join('') : '<p class="muted">Sin comunas: el despacho se coordina por WhatsApp.</p>') + '</div>' +
        '<div class="btns"><button type="button" class="alt" id="dMas">+ Agregar comuna</button></div>' +
        '<label for="dResto">📦 Resto de Chile (regiones y otras comunas)</label><select id="dResto">' +
        [['no', 'No despacho'], ['fijo', 'Precio fijo'], ['por_pagar', 'Por pagar (courier: lo paga quien recibe)']].map(([v, n]) => '<option value="' + v + '"' + ((d.resto || {}).modo === v ? ' selected' : '') + '>' + n + '</option>').join('') +
        '</select><div id="dRestoP"' + ((d.resto || {}).modo === 'fijo' ? '' : ' class="hidden"') + '><label for="dRestoPrecio">Precio al resto de Chile</label><input id="dRestoPrecio" type="number" inputmode="numeric" min="0" placeholder="$" value="' + ((d.resto || {}).precio || '') + '"></div>' +
        '<p class="cfx-nota-btn">Starken, Chilexpress, Blue Express o Correos: al enviar, pega el código de seguimiento en el pedido.</p>' +
        '<div class="btns"><button type="button" id="dGuardar">Guardar</button></div>';
      el.querySelector('#dResto').onchange = (e) => el.querySelector('#dRestoP').classList.toggle('hidden', e.target.value !== 'fijo');
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
      d.resto = { modo: el.querySelector('#dResto').value, precio: Number(el.querySelector('#dRestoPrecio').value) || 0 };
    }
    el.innerHTML = '<p class="muted">Cargando despacho…</p>';
    rpc('mi_despacho').then((r) => { d = Object.assign({ retiro: true, gratis_desde: 0, zonas: [], resto: { modo: 'no', precio: 0 } }, r || {}); pintar(); }).catch((x) => { el.innerHTML = '<p class="muted">' + esc(x.message) + '</p>'; });
  }
  global.Despacho = { montar, direccion, costo, editor, COMUNAS_RM, REGIONES };
})(window);
