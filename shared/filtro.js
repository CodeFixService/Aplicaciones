/* CodeFix · Núcleo · 🔎 Buscar y filtrar (G157). Mismo archivo en cada repositorio.
   Una barra igual en todas las apps, solo donde hay algo que buscar: busca SOLO en esa pantalla.
     - 🔎 Buscar: texto libre (sin tildes ni mayúsculas) sobre lo que se ve en cada elemento.
     - Filtros universales: por fecha (Hoy · 7 días · 30 días · Este mes), por tipo (o cualquier grupo: app, estado…) y orden (Recientes · Antiguos · A–Z).
   Modo pantalla (lo más fácil): la barra esconde/ordena los elementos que ya están dibujados.
     CFX_FILTRO.montar(nodo, {
       en: contenedor,            // dónde están los elementos (obligatorio en este modo)
       items: '[data-f]',         // cuáles son (por defecto: hijos directos)
       buscar: 'Buscar falla…',   // texto del campo (false = sin campo)
       grupos: [{ k: 'app', t: 'App' }, { k: 'estado', t: 'Estado', op: [['nuevo', 'Nuevo'], …] }],  // op 'auto' (o sin op) = sale de los elementos
       tipos: [['a', 'A'], …],    // atajo de grupos: [{ k: 'tipo', t: 'Tipo', op }]
       fecha: true, orden: true,  // filtros universales
       clave: 'cm-fallas',        // recuerda lo elegido mientras la pestaña siga abierta
       vacio: 'Nada coincide',
     })
     Cada elemento: data-cfx-<k> (ej. data-cfx-app="despega"; data-cfx-tipo), data-cfx-fecha (ISO o ms), data-cfx-nombre (para A–Z),
     data-cfx-buscar (texto extra para la búsqueda, ej. el correo). Si no trae nombre, usa su texto.
   Modo datos: sin `en`, con alCambiar(estado) → la app pinta CFX_FILTRO.aplicar(lista, estado, { texto, nombre, fecha, <k> }).
   Devuelve { estado, aplicar(), limpiar(), contar() }. Clases con prefijo cfx-fx. */
(function () {
  'use strict';
  if (window.CFX_FILTRO) return;
  const d = document;
  const css = d.createElement('style');
  css.textContent =
    '.cfx-fx{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px}' +
    '.cfx-fx-fila{display:flex;gap:8px;align-items:center;min-width:0}' +
    '.cfx-fx-caja{position:relative;flex:1;min-width:0;display:flex;align-items:center}' +
    '.cfx-fx-caja>svg{position:absolute;left:12px;width:18px;height:18px;opacity:.6;pointer-events:none;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-fx input.cfx-fx-q{width:100%;min-width:0;height:44px;margin:0!important;padding:0 40px 0 40px!important;border-radius:var(--cfx-radio,14px)!important;' +
    'border:1.5px solid var(--cfx-borde,#dce3ea)!important;background:var(--cfx-campo,#f7f9fb)!important;color:var(--cfx-texto,#111827)!important;font:inherit;font-size:15px;box-shadow:none!important;-webkit-appearance:none;appearance:none}' +
    '.cfx-fx input.cfx-fx-q:focus{outline:none;border-color:var(--brand,var(--marca,#2563eb))!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 18%,transparent)!important}' +
    '.cfx-fx input.cfx-fx-q::-webkit-search-cancel-button{display:none}' +
    '.cfx-fx-x{position:absolute;right:6px;width:32px;height:32px;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;border-radius:50%!important;' +
    'background:transparent!important;color:var(--cfx-texto-2,#5b6472)!important;display:grid;place-items:center;cursor:pointer;box-shadow:none!important}.cfx-fx-x[hidden]{display:none}' +
    '.cfx-fx-btn{flex:none;height:44px;min-height:0!important;margin:0!important;padding:0 14px!important;display:inline-flex;align-items:center;gap:6px;border-radius:var(--cfx-radio,14px)!important;' +
    'border:1.5px solid var(--cfx-borde,#dce3ea)!important;background:var(--cfx-tarjeta,#fff)!important;color:var(--cfx-texto,#111827)!important;font:inherit;font-size:14px;font-weight:600;cursor:pointer;box-shadow:none!important;white-space:nowrap}' +
    '.cfx-fx-btn svg{width:18px;height:18px}.cfx-fx-btn[aria-expanded=true]{border-color:var(--brand,var(--marca,#2563eb))!important;color:var(--brand,var(--marca,#2563eb))!important}' +
    '.cfx-fx-n{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--brand,var(--marca,#2563eb));color:#fff;font-size:12px;font-weight:700;display:inline-grid;place-items:center;line-height:1}.cfx-fx-n[hidden]{display:none}' +
    '.cfx-fx-pan{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:var(--cfx-radio,14px);background:var(--cfx-campo,#f7f9fb);border:1px solid var(--cfx-borde,#dce3ea)}.cfx-fx-pan[hidden]{display:none}' +
    '.cfx-fx-g{display:flex;flex-direction:column;gap:6px;min-width:0}.cfx-fx-gt{font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-fx-chips{display:flex;flex-wrap:wrap;gap:6px}' +
    '.cfx-fx-chip{min-height:36px!important;height:auto;margin:0!important;padding:6px 12px!important;border-radius:999px!important;border:1.5px solid var(--cfx-borde,#dce3ea)!important;background:var(--cfx-tarjeta,#fff)!important;' +
    'color:var(--cfx-texto,#111827)!important;font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:none!important;white-space:nowrap;-webkit-tap-highlight-color:transparent}' +
    '.cfx-fx-chip[aria-pressed=true]{background:var(--brand,var(--marca,#2563eb))!important;border-color:var(--brand,var(--marca,#2563eb))!important;color:#fff!important}' +
    '.cfx-fx-pie[hidden]{display:none}.cfx-fx-pie{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;font-size:13px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-fx-lim{margin:0!important;padding:4px 2px!important;min-height:0!important;border:0!important;background:none!important;color:var(--brand,var(--marca,#2563eb))!important;font:inherit;font-weight:700;cursor:pointer;box-shadow:none!important}.cfx-fx-lim[hidden]{display:none}' +
    '.cfx-fx-no{display:none!important}' +
    '.cfx-fx-vacio{padding:18px 12px;text-align:center;color:var(--cfx-texto-2,#5b6472);font-size:14px}';
  (d.head || d.documentElement).appendChild(css);

  const SVG = {
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>'
  };
  const FECHAS = [['', 'Todo'], ['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes']];
  const ORDENES = [['', 'Recientes'], ['antiguo', 'Antiguos'], ['az', 'A–Z']];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const ms = (v) => { if (v == null || v === '') return NaN; if (v instanceof Date) return +v; const n = +v; return isNaN(n) ? Date.parse(v) : n; };
  const memoria = {};
  const leer = (k) => { if (!k) return null; if (memoria[k]) return memoria[k]; try { return JSON.parse(sessionStorage.getItem('cfx-fx:' + k)); } catch (e) { return null; } };
  const guardar = (k, e) => { if (!k) return; memoria[k] = e; try { sessionStorage.setItem('cfx-fx:' + k, JSON.stringify(e)); } catch (x) { /* modo privado */ } };

  // ¿La fecha cae en el rango elegido?
  function enFecha(t, f) {
    if (!f) return true; if (isNaN(t)) return false;
    const h = new Date(); h.setHours(0, 0, 0, 0);
    if (f === 'hoy') return t >= +h;
    if (f === 'mes') return t >= +new Date(h.getFullYear(), h.getMonth(), 1);
    return t >= +h - (+f - 1) * 864e5;
  }
  // Modo datos: filtra y ordena una lista con las mismas reglas.
  function aplicar(lista, e, acc) {
    acc = acc || {}; e = e || {};
    const q = norm(e.q), pal = q ? q.split(' ') : [], g = e.g || {};
    const txt = acc.texto || ((x) => Object.values(x || {}).filter((v) => typeof v !== 'object').join(' '));
    const fec = acc.fecha ? (x) => ms(acc.fecha(x)) : () => NaN;
    const nom = acc.nombre || txt;
    let r = (lista || []).filter((x) => {
      if (pal.length) { const t = norm(txt(x)); if (!pal.every((p) => t.includes(p))) return false; }
      for (const k in g) if (g[k] && (acc[k] ? String(acc[k](x)) : String((x || {})[k])) !== g[k]) return false;
      return enFecha(fec(x), e.f);
    });
    if (e.o === 'az') r = r.slice().sort((a, b) => norm(nom(a)).localeCompare(norm(nom(b)), 'es'));
    else if (acc.fecha && (e.o === 'antiguo' || e.o === 'reciente')) r = r.slice().sort((a, b) => (e.o === 'antiguo' ? 1 : -1) * ((fec(a) || 0) - (fec(b) || 0)));
    return r;
  }

  function montar(nodo, cfg) {
    if (!nodo) return null;
    cfg = Object.assign({ buscar: 'Buscar…', vacio: 'Nada coincide con tu búsqueda' }, cfg || {});
    const grupos = (cfg.grupos || []).slice();
    if (cfg.tipos) grupos.unshift({ k: 'tipo', t: 'Tipo', op: cfg.tipos });
    const items = () => !cfg.en ? [] : cfg.items ? [...cfg.en.querySelectorAll(cfg.items)] : [...cfg.en.children].filter((x) => !x.classList.contains('cfx-fx-vacio'));
    // Opciones 'auto': salen de los elementos (data-cfx-<k> + data-cfx-<k>-t para el nombre visible).
    const opciones = (gr) => {
      if (Array.isArray(gr.op)) return gr.op;
      const m = new Map(); items().forEach((x) => { const v = x.getAttribute('data-cfx-' + gr.k); if (v && !m.has(v)) m.set(v, x.getAttribute('data-cfx-' + gr.k + '-t') || v); });
      return [...m];
    };
    const e = Object.assign({ q: '', f: '', o: '', g: {} }, leer(cfg.clave) || {});
    e.g = Object.assign({}, e.g);
    const conPanel = grupos.length || cfg.fecha || cfg.orden;
    const chips = (k, ops, val) => '<div class="cfx-fx-chips" role="group">' + ops.map(([v, t]) => '<button type="button" class="cfx-fx-chip no-ico" data-fx-k="' + esc(k) + '" data-fx-v="' + esc(v) + '" aria-pressed="' + (String(val || '') === String(v)) + '">' + esc(t) + '</button>').join('') + '</div>';
    nodo.classList.add('cfx-fx');
    const pintar = () => {
      const abierto = nodo.querySelector('.cfx-fx-pan') && !nodo.querySelector('.cfx-fx-pan').hidden;
      const gs = grupos.map((gr) => { const ops = opciones(gr); return ops.length > 1 || e.g[gr.k] ? '<div class="cfx-fx-g"><span class="cfx-fx-gt">' + esc(gr.t || gr.k) + '</span>' + chips('g:' + gr.k, [['', 'Todos']].concat(ops), e.g[gr.k]) + '</div>' : ''; }).join('');
      nodo.innerHTML = '<div class="cfx-fx-fila">' +
        (cfg.buscar !== false ? '<label class="cfx-fx-caja">' + SVG.lupa + '<input class="cfx-fx-q cfx-nativo" type="search" data-sin-voz data-tipo="no" enterkeyhint="search" autocomplete="off" maxlength="80" placeholder="' + esc(cfg.buscar) + '" aria-label="' + esc(cfg.buscar) + '" value="' + esc(e.q) + '">' +
          '<button type="button" class="cfx-fx-x no-ico" aria-label="Borrar búsqueda"' + (e.q ? '' : ' hidden') + '>' + SVG.x + '</button></label>' : '<span style="flex:1"></span>') +
        (conPanel ? '<button type="button" class="cfx-fx-btn no-ico" aria-expanded="' + !!abierto + '">' + SVG.filtro + 'Filtros<span class="cfx-fx-n" hidden></span></button>' : '') + '</div>' +
        (conPanel ? '<div class="cfx-fx-pan"' + (abierto ? '' : ' hidden') + '>' + gs +
          (cfg.fecha ? '<div class="cfx-fx-g"><span class="cfx-fx-gt">Fecha</span>' + chips('f', FECHAS, e.f) + '</div>' : '') +
          (cfg.orden ? '<div class="cfx-fx-g"><span class="cfx-fx-gt">Orden</span>' + chips('o', ORDENES, e.o) + '</div>' : '') + '</div>' : '') +
        '<div class="cfx-fx-pie" aria-live="polite"><span class="cfx-fx-cuenta"></span><button type="button" class="cfx-fx-lim no-ico" hidden>Limpiar filtros</button></div>';
    };
    const activos = () => Object.values(e.g).filter(Boolean).length + (e.f ? 1 : 0) + (e.o ? 1 : 0);
    let vacio = null;
    const filtrarPantalla = () => {
      const L = items(); if (!L.length && !cfg.en) return { ver: 0, tot: 0 };
      const pal = norm(e.q) ? norm(e.q).split(' ') : [];
      let ver = 0;
      L.forEach((x, i) => {
        if (x.dataset.cfxFxI == null) x.dataset.cfxFxI = i;
        let ok = true;
        if (pal.length) { const t = norm(x.textContent + ' ' + (x.getAttribute('data-cfx-buscar') || '')); ok = pal.every((p) => t.includes(p)); }
        for (const k in e.g) if (ok && e.g[k] && x.getAttribute('data-cfx-' + k) !== e.g[k]) ok = false;
        if (ok && e.f) ok = enFecha(ms(x.getAttribute('data-cfx-fecha')), e.f);
        x.classList.toggle('cfx-fx-no', !ok); if (ok) ver++;
      });
      // Orden: se reacomodan dentro de su mismo padre (Recientes = como vinieron).
      const pad = L.length && L[0].parentNode;
      if (pad && L.every((x) => x.parentNode === pad)) {
        const f = (x) => ms(x.getAttribute('data-cfx-fecha')) || 0, n = (x) => norm(x.getAttribute('data-cfx-nombre') || x.textContent);
        const s = L.slice().sort((a, b) => e.o === 'az' ? n(a).localeCompare(n(b), 'es') : e.o === 'antiguo' && L.some((x) => x.hasAttribute('data-cfx-fecha')) ? f(a) - f(b) : a.dataset.cfxFxI - b.dataset.cfxFxI);
        const ancla = L[L.length - 1].nextSibling;
        s.forEach((x) => pad.insertBefore(x, ancla));
      }
      if (cfg.en) {
        if (!vacio || !vacio.isConnected) { vacio = d.createElement('p'); vacio.className = 'cfx-fx-vacio'; }
        vacio.textContent = cfg.vacio;
        if (L.length && !ver) { (pad || cfg.en).insertBefore(vacio, L[L.length - 1].nextSibling); vacio.hidden = false; } else vacio.remove();
      }
      return { ver, tot: L.length };
    };
    const ctl = {
      estado: e,
      aplicar() {
        guardar(cfg.clave, e);
        const r = cfg.en ? filtrarPantalla() : null;
        const n = activos(), b = nodo.querySelector('.cfx-fx-n'), lim = nodo.querySelector('.cfx-fx-lim'), c = nodo.querySelector('.cfx-fx-cuenta'), x = nodo.querySelector('.cfx-fx-x');
        if (b) { b.hidden = !n; b.textContent = n; }
        if (lim) lim.hidden = !(n || e.q);
        if (x) x.hidden = !e.q;
        if (c) c.textContent = r && r.tot && (n || e.q) ? (r.ver === 1 ? '1 de ' + r.tot : r.ver + ' de ' + r.tot) : '';
        const pie = nodo.querySelector('.cfx-fx-pie'); if (pie) pie.hidden = !(c && c.textContent) && !(n || e.q);
        if (cfg.alCambiar) try { cfg.alCambiar(e); } catch (er) { console.error(er); }
        return r;
      },
      limpiar() { e.q = ''; e.f = ''; e.o = ''; e.g = {}; ctl.estado = e; pintar(); ctl.aplicar(); },
      contar: () => activos() + (e.q ? 1 : 0),
      // Si la lista se volvió a dibujar (mismo contenedor), recalcula opciones 'auto' y vuelve a filtrar.
      refrescar() { pintar(); return ctl.aplicar(); }
    };
    pintar();
    let t = null;
    nodo.addEventListener('input', (ev) => { if (!ev.target.classList.contains('cfx-fx-q')) return; e.q = ev.target.value; clearTimeout(t); t = setTimeout(ctl.aplicar, 120); });
    nodo.addEventListener('keydown', (ev) => { if (ev.target.classList.contains('cfx-fx-q') && ev.key === 'Escape' && e.q) { ev.preventDefault(); ev.stopPropagation(); ev.target.value = ''; e.q = ''; ctl.aplicar(); } });
    nodo.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b || !nodo.contains(b)) return;
      ev.stopPropagation();
      if (b.classList.contains('cfx-fx-btn')) { const p = nodo.querySelector('.cfx-fx-pan'); p.hidden = !p.hidden; b.setAttribute('aria-expanded', !p.hidden); return; }
      if (b.classList.contains('cfx-fx-x')) { const i = nodo.querySelector('.cfx-fx-q'); i.value = ''; e.q = ''; ctl.aplicar(); i.focus(); return; }
      if (b.classList.contains('cfx-fx-lim')) { ctl.limpiar(); return; }
      const k = b.dataset.fxK; if (k == null) return;
      const v = b.dataset.fxV;
      if (k === 'f') e.f = v; else if (k === 'o') e.o = v; else if (k.startsWith('g:')) { if (v) e.g[k.slice(2)] = v; else delete e.g[k.slice(2)]; }
      b.parentNode.querySelectorAll('.cfx-fx-chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
      ctl.aplicar();
    });
    ctl.aplicar();
    return ctl;
  }
  window.CFX_FILTRO = { montar, aplicar, norm };
})();
