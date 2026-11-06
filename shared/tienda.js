// Tienda (catálogo del cliente y página pública): tarjetas estilo tienda, vista de 1, 2 o 3 columnas con un botón,
// y las opciones (colores, tallas) como botones. No cambia cómo se arma el pedido: el <select> sigue guardando la opción.
(function () {
  const d = document, grid = d.getElementById('grid');
  if (!grid || window.CFX_TIENDA) return;
  window.CFX_TIENDA = true;
  const C = { negro: '#111', blanco: '#fff', rojo: '#e11d48', azul: '#2563eb', verde: '#16a34a', amarillo: '#facc15', rosado: '#f472b6', rosa: '#f472b6',
    morado: '#7c3aed', lila: '#c4b5fd', naranjo: '#f97316', naranja: '#f97316', gris: '#9ca3af', cafe: '#7c4a2d', café: '#7c4a2d', beige: '#e7d7b9',
    celeste: '#7dd3fc', burdeo: '#7f1d1d', dorado: '#d4a017', plateado: '#cbd5e1', crema: '#f5ecd7', turquesa: '#14b8a6', fucsia: '#d946ef' };
  window.colorDe = (o) => C[String(o).toLowerCase().trim()] || (/^#[0-9a-f]{3,6}$/i.test(String(o).trim()) ? String(o).trim() : '');
  const B = 'var(--brand, #2563eb)';
  const css = d.createElement('style');
  css.textContent = `
  .t-vistas{display:flex;justify-content:flex-end;gap:6px;margin:0 0 10px}
  .t-vistas button{width:38px;height:38px;min-height:0;padding:0;border-radius:12px;display:grid;place-items:center;background:var(--field);color:var(--muted);box-shadow:none;border:1.5px solid transparent;transition:transform .15s,border-color .2s,color .2s}
  .t-vistas button.on{border-color:${B};color:${B};background:color-mix(in srgb,${B} 12%,var(--card))}
  .t-vistas button:active{transform:scale(.9)} .t-vistas svg{width:18px;height:18px}
  #grid.v1{grid-template-columns:1fr!important} #grid.v2{grid-template-columns:repeat(2,minmax(0,1fr))!important} #grid.v3{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
  #grid .item{padding:0 0 12px!important;overflow:hidden;border-radius:18px;gap:5px;position:relative;
    border:1px solid color-mix(in srgb,${B} 22%,var(--line));background:linear-gradient(180deg,color-mix(in srgb,${B} 6%,var(--card)),var(--card) 40%);
    box-shadow:0 1px 2px rgba(15,10,40,.06),0 8px 22px -12px color-mix(in srgb,${B} 45%,transparent);
    transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s;animation:tItem .45s cubic-bezier(.2,.8,.2,1) both}
  #grid .item>:not(.foto):not(.fav):not(.cinta):not(.acc){margin-left:12px;margin-right:12px}
  #grid .item .acc{padding:4px 12px 0;display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
  #grid .item .acc .btn,#grid .item .acc button{flex:1 1 100%;white-space:nowrap;min-height:40px;border-radius:12px}
  #grid .item:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,10,40,.06),0 14px 30px -12px color-mix(in srgb,${B} 60%,transparent)}
  #grid .item:active{transform:scale(.985)}
  #grid .item:nth-child(2){animation-delay:.04s}#grid .item:nth-child(3){animation-delay:.08s}#grid .item:nth-child(4){animation-delay:.12s}#grid .item:nth-child(n+5){animation-delay:.16s}
  @keyframes tItem{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  #grid .item .foto{width:100%!important;max-width:none;margin:0 0 6px!important;aspect-ratio:1;object-fit:cover;display:block;border-radius:0!important;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
  #grid .item:hover .foto{transform:scale(1.04)}
  #grid .item:not(:has(.foto)){padding-top:12px!important}
  #grid .item .p{color:${B};font-size:19px;font-weight:800}
  #grid .item .p.tachado{color:var(--muted)}
  #grid .item select{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
  #grid .item .cfx-sel-btn{display:none!important}
  .opc-chips{display:flex;flex-wrap:wrap;gap:6px}
  .opc-ch{min-height:30px;min-width:30px;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:600;box-shadow:none;background:var(--field);color:var(--text);border:1.5px solid transparent;transition:transform .15s,border-color .2s,background .2s;position:relative}
  .opc-ch:active{transform:scale(.92)}
  .opc-ch.on{border-color:${B};background:color-mix(in srgb,${B} 14%,var(--card))}
  .opc-ch.sw{padding:3px;width:30px}
  .opc-ch.sw i{display:block;width:100%;aspect-ratio:1;border-radius:50%;background:var(--sw);box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
  .opc-ch .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .opc-falta{animation:opcFalta .4s}@keyframes opcFalta{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  #grid.v3 .item{border-radius:14px;padding-bottom:8px!important;gap:3px}
  #grid.v3 .item>:not(.foto):not(.fav):not(.cinta):not(.acc){margin-left:8px;margin-right:8px}
  #grid.v3 .item .desc,#grid.v3 .item .cat,#grid.v3 .item .prem,#grid.v3 .item .nuevo,#grid.v3 .item .cinta{display:none}
  #grid.v3 .item b{font-size:12px;font-weight:700;line-height:1.3;padding-right:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}
  #grid.v3 .item:not(:has(.foto)) b{padding-right:24px}
  #grid.v3 .item .p{font-size:14px} #grid.v3 .item .p.tachado{font-size:11px}
  #grid.v3 .opc-chips{gap:4px} #grid.v3 .opc-ch{min-height:22px;min-width:22px;font-size:10.5px;padding:1px 6px} #grid.v3 .opc-ch.sw{width:22px;height:22px;padding:2px}
  #grid.v3 .item .acc{padding:2px 8px 0;gap:4px} #grid.v3 .item .acc .btn,#grid.v3 .item .acc button{min-height:32px;font-size:0;padding:0;border-radius:10px}
  #grid.v3 .item .acc>:first-child::before{content:"＋ Agregar";font-size:12px;font-weight:700}#grid.v3 .item .acc>[disabled]:first-child::before{content:"Agotado"}
  #grid.v3 .item .acc>:not(:first-child){display:none} #grid.v3 .fav{width:28px;height:28px;font-size:14px;top:5px;right:5px}
  @media (max-width:340px){#grid.v3{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  #grid.v1 .item .foto{aspect-ratio:4/3}
  .opc-ch.agot{opacity:.4;text-decoration:line-through} .opc-ch.agot.sw i{background:repeating-linear-gradient(135deg,var(--sw) 0 5px,transparent 5px 8px)}
  #grid .item .foto,#grid .item>b{cursor:pointer}
  .t-ficha{display:flex;flex-direction:column;gap:10px;padding-bottom:84px}
  .t-ficha img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:16px;background:var(--field)}
  .t-ficha h3{margin:0;font-size:20px} .t-ficha .t-p{color:${B};font-size:24px;font-weight:800}
  .t-ficha .t-d{color:var(--muted);white-space:pre-line;margin:0} .t-ficha .opc-ch{min-height:38px;font-size:14px;padding:6px 14px} .t-ficha .opc-ch.sw{width:38px;padding:4px}
  .t-ficha .t-q{display:flex;align-items:center;gap:12px} .t-ficha .t-q button{width:42px;height:42px;min-height:0;padding:0;border-radius:12px;font-size:20px}
  .t-ficha .t-q b{min-width:28px;text-align:center;font-size:18px}
  .t-barra{position:sticky;bottom:0;margin:0 -16px -16px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);box-shadow:0 -6px 18px rgba(0,0,0,.08);display:flex}
  .t-mas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px} .t-mas button{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;min-height:0;border-radius:14px;background:var(--field);color:inherit;box-shadow:none;text-align:left;font-weight:600;font-size:13px}
  .t-mas img,.t-mas i{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:var(--card);display:grid;place-items:center;font-style:normal;font-size:28px} .t-mas span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .t-mas small{color:${B};font-weight:800}
  .t-barra button{flex:1;min-height:50px;font-size:16px;font-weight:800;border-radius:14px}
  @media (prefers-reduced-motion:reduce){#grid .item,#grid .item .foto,.opc-ch{animation:none!important;transition:none!important}}`;
  d.head.appendChild(css);

  // Botones de vista (se recuerda en este equipo)
  const ICO = { 1: '<rect x="4" y="4" width="16" height="16" rx="3"/>', 2: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    3: [0, 1, 2].map((y) => [0, 1, 2].map((x) => '<rect x="' + (3 + x * 6.5) + '" y="' + (3 + y * 6.5) + '" width="5" height="5" rx="1"/>').join('')).join('') };
  let v = '2'; try { v = localStorage.getItem('cfx-vista') || '2'; } catch (e) { /* nada */ }
  const bar = d.createElement('div'); bar.className = 't-vistas'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Cómo ver los productos');
  bar.innerHTML = ['1', '2', '3'].map((n) => '<button type="button" data-v="' + n + '" aria-label="' + n + ' por fila"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + ICO[n] + '</svg></button>').join('');
  const poner = (n) => { v = n; grid.classList.remove('v1', 'v2', 'v3'); grid.classList.add('v' + n); bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === n)); try { localStorage.setItem('cfx-vista', n); } catch (e) { /* nada */ } };
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) poner(b.dataset.v); });
  grid.before(bar); poner(v);

  // Opciones como botones (si la pantalla aún no los dibujó)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chips = () => grid.querySelectorAll('.item select').forEach((s) => {
    if (s.closest('.item').querySelector('.opc-chips')) return;
    const ops = [...s.options].filter((o) => o.value).map((o) => o.value); if (!ops.length) return;
    const w = d.createElement('div'); w.className = 'opc-chips'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Opciones');
    w.innerHTML = ops.map((o) => { const c = window.colorDe(o); return '<button type="button" class="opc-ch' + (c ? ' sw' : '') + '" data-opc-v="' + esc(o) + '" title="' + esc(o) + '"' + (c ? ' style="--sw:' + c + '"' : '') + '>' + (c ? '<i></i><span class="sr">' + esc(o) + '</span>' : esc(o)) + '</button>'; }).join('');
    (s.nextElementSibling && s.nextElementSibling.classList.contains('cfx-sel-btn') ? s.nextElementSibling : s).after(w);
  });
  new MutationObserver(chips).observe(grid, { childList: true }); chips();
  // ---------- Variantes (precio y stock por opción) y ficha del producto con barra "Agregar" ----------
  // La página llama CFX_FICHA.cargar(idTienda, rpc) y usa CFX_FICHA.con(item, opcion) para el precio en el carrito.
  const V = {};  // clave → { opción en minúscula: { precio, disponible } }
  const varDe = (k, o) => (V[k] && o ? V[k][String(o).toLowerCase()] : null) || null;
  const plata = (n) => (window.Core && Core.money ? Core.money(n) : '$' + n);
  const marcar = () => grid.querySelectorAll('.item select[data-opc]').forEach((s) => {
    s.closest('.item').querySelectorAll('[data-opc-v]').forEach((b) => { const x = varDe(s.dataset.opc, b.dataset.opcV); const ag = !!x && x.disponible === 0;
      b.classList.toggle('agot', ag); b.title = b.dataset.opcV + (ag ? ' · agotado' : x && x.precio != null ? ' · ' + plata(x.precio) : ''); });
  });
  new MutationObserver(marcar).observe(grid, { childList: true });
  window.CFX_FICHA = {
    async cargar(negocio, rpc) {
      try { (await rpc('variantes_de', { p_negocio: negocio })).forEach((x) => { (V[x.clave] = V[x.clave] || {})[x.nombre.toLowerCase()] = { precio: x.precio == null ? null : Number(x.precio), disponible: x.disponible }; }); } catch (e) { /* base anterior */ }
      marcar();
    },
    con(i, op) { const x = i && varDe(i.clave, op); return x && x.precio != null ? Object.assign({}, i, { precio: x.precio, precio_premium: null }) : i; },
    agotada: (k, op) => { const x = varDe(k, op); return !!x && x.disponible === 0; }
  };
  // El precio de la tarjeta cambia con la opción elegida.
  d.addEventListener('change', (e) => {
    const s = e.target.closest('#grid .item select[data-opc]'); if (!s) return;
    const p = [...s.closest('.item').querySelectorAll('.p:not(.tachado)')].pop(); if (!p) return;
    if (p.dataset.base === undefined) p.dataset.base = p.textContent;
    const x = varDe(s.dataset.opc, s.value); p.textContent = x && x.precio != null ? plata(x.precio) : p.dataset.base;
  });
  // Ficha: tocar la foto o el nombre abre el producto en grande con sus opciones, cantidad y una barra fija "Agregar".
  // "Te puede gustar": hasta 4 productos con stock, primero los de la misma categoría.
  const cat = (x) => ((x.querySelector('.cat') || {}).textContent || '').trim();
  const sugeridos = (it) => [...grid.querySelectorAll('.item:not(.gris)')].filter((x) => x !== it && x.querySelector(':scope>b') && !x.querySelector('[data-avisa],.pill.bad,.acc button[disabled]'))
    .map((x, i) => ({ x, s: (cat(x) && cat(x) === cat(it) ? 4 : 0) + (x.querySelector('.foto') ? 2 : 0) + ((i * 7 + (it.textContent.length % 5)) % 5) / 5 }))
    .sort((a, b) => b.s - a.s).slice(0, 4).map((o) => o.x);
  function ficha(it, H) {
    const s = it.querySelector('select[data-opc]'), add = it.querySelector('[data-add]');
    if (!window.CFX_MENU || !it.querySelector('.acc')) return false;
    const k = s ? s.dataset.opc : '', ops = s ? [...s.options].filter((o) => o.value).map((o) => o.value) : [];
    const foto = it.querySelector('.foto'), pb = [...it.querySelectorAll('.p:not(.tachado)')].pop(), base = pb ? (pb.dataset.base || pb.textContent) : '';
    const nombre = (it.querySelector(':scope>b') || {}).textContent || '', desc = it.querySelector('.desc');
    let op = s ? s.value : '', n = 1;
    if (H) { H.d.querySelector('h2').textContent = nombre; H.zona.scrollTop = 0; } else H = CFX_MENU.hoja(esc(nombre));
    const z = H.zona, mas = sugeridos(it), avisa = it.querySelector('[data-avisa]');
    const pintar = () => {
      const x = varDe(k, op), ag = !add || add.disabled || CFX_FICHA.agotada(k, op), pre = x && x.precio != null ? plata(x.precio) : base;
      z.innerHTML = '<div class="t-ficha">' + (foto ? '<img src="' + esc(foto.src) + '" alt="">' : '') + '<h3>' + esc(nombre) + '</h3><div class="t-p">' + esc(pre) + '</div>' +
        (desc ? '<p class="t-d">' + esc(desc.textContent) + '</p>' : '') +
        (ops.length ? '<b>Elige una opción</b><div class="opc-chips" role="group" aria-label="Opciones">' + ops.map((o) => { const c = window.colorDe(o), a = CFX_FICHA.agotada(k, o);
          return '<button type="button" class="opc-ch' + (c ? ' sw' : '') + (o === op ? ' on' : '') + (a ? ' agot' : '') + '" data-f-op="' + esc(o) + '" title="' + esc(o) + '"' + (c ? ' style="--sw:' + c + '"' : '') + '>' + (c ? '<i></i><span class="sr">' + esc(o) + '</span>' : esc(o)) + '</button>'; }).join('') + '</div>' + (c0(op) ? '<small class="muted">' + esc(op) + '</small>' : '') : '') +
        (ag ? '' : '<div class="t-q"><button type="button" class="alt" data-f-n="-1" aria-label="Uno menos">−</button><b>' + n + '</b><button type="button" class="alt" data-f-n="1" aria-label="Uno más">+</button></div>') +
        (mas.length ? '<b>Te puede gustar</b><div class="t-mas">' + mas.map((x, i) => { const f = x.querySelector('.foto'), p = [...x.querySelectorAll('.p:not(.tachado)')].pop();
          return '<button type="button" data-f-mas="' + i + '">' + (f ? '<img src="' + esc(f.src) + '" alt="" loading="lazy">' : '<i>🛍️</i>') + '<span>' + esc(x.querySelector(':scope>b').textContent) + '</span><small>' + esc(p ? p.dataset.base || p.textContent : '') + '</small></button>'; }).join('') + '</div>' : '') +
        '<div class="t-barra">' + (ag && avisa ? '<button type="button" class="alt" data-f-avisa>' + esc(avisa.textContent) + '</button>' : '<button type="button" class="ok" data-f-add' + (ag ? ' disabled' : '') + '>' + (ag ? 'Agotado' : '➕ Agregar' + (pre ? ' · ' + esc(n > 1 ? plata((x && x.precio != null ? x.precio : (window.Core && Core.precioNum ? Core.precioNum(base) : 0)) * n) : pre) : '')) + '</button>') + '</div></div>';
    };
    const c0 = (o) => o && window.colorDe(o);
    z.onclick = (e) => {
      const b = e.target.closest('[data-f-op],[data-f-n],[data-f-add],[data-f-mas],[data-f-avisa]'); if (!b) return;
      if (b.dataset.fMas !== undefined) return ficha(mas[+b.dataset.fMas], H);
      if (b.dataset.fAvisa !== undefined) { avisa.click(); return H.cerrar(); }
      if (b.dataset.fOp !== undefined) { op = b.dataset.fOp; return pintar(); }
      if (!add) return;
      if (b.dataset.fN) { n = Math.min(99, Math.max(1, n + +b.dataset.fN)); return pintar(); }
      if (ops.length && !op) { const ch = z.querySelector('.opc-chips'); ch.classList.remove('opc-falta'); void ch.offsetWidth; ch.classList.add('opc-falta'); return; }
      if (s) { s.value = op; s.dispatchEvent(new Event('change', { bubbles: true })); it.querySelectorAll('.opc-ch').forEach((x) => x.classList.toggle('on', x.dataset.opcV === op)); }
      for (let i = 0; i < n; i++) add.click();
      H.cerrar();
    };
    pintar();
    return true;
  }
  d.addEventListener('click', (e) => {
    const t = e.target.closest('#grid .item .foto, #grid .item>b'); if (!t) return;
    if (ficha(t.closest('.item'))) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opc-v]');
    if (b) { const it = b.closest('.item'), s = it && it.querySelector('select'); if (!s) return; s.value = b.dataset.opcV; s.dispatchEvent(new Event('change', { bubbles: true })); it.querySelectorAll('.opc-ch').forEach((x) => x.classList.toggle('on', x === b)); return; }
    // Agregar sin elegir opción: la fila tiembla un poquito
    const it = e.target.closest('#grid .item'); const s = it && it.querySelector('select');
    if (s && s.value && window.CFX_FICHA.agotada(s.dataset.opc, s.value) && e.target.closest('.acc>:first-child')) { e.stopPropagation(); e.preventDefault(); if (window.Core) Core.toast('😕 "' + s.value + '" está agotado: elige otra opción'); return; }
    if (s && !s.value && e.target.closest('.acc button,.acc .btn')) { const ch = it.querySelector('.opc-chips'); if (ch) { ch.classList.remove('opc-falta'); void ch.offsetWidth; ch.classList.add('opc-falta'); } }
  }, true);
})();
