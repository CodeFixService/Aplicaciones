/* CodeFix · Núcleo · G164 📱 Equipos por cuenta (mismo archivo en cada repositorio; va en el <head>, antes de que la app cree su conexión).
   Mira las llamadas de la app a Supabase: la primera vez que ve una sesión (session_id del token) le avisa al servidor qué equipo es
   (id al azar guardado en este equipo + "Chrome · Android") con cfx_equipo_registrar (núcleo sql/equipos.sql). El servidor responde:
   · ok       → nada.
   · cerrada  → este equipo se cerró desde otro: se borra la sesión guardada y vuelve al ingreso.
   · exceso   → ya hay tantos equipos abiertos como el tope: ventana "elige cuál cerrar" (no se puede saltar; sin elegir, el servidor la corta a los 10 min).
   Se vuelve a revisar al volver a la app después de 5 minutos. Ver y cerrar equipos: ⚙️ Mi cuenta → Avanzado → 📱 Mis equipos (ayuda.js).
   API: CFX_EQUIPOS.dispositivo() · CFX_EQUIPOS.nombre() · CFX_EQUIPOS.revisar() */
(function () {
  'use strict';
  if (window.CFX_EQUIPOS || !window.fetch) return;
  const orig = window.fetch.bind(window), vistos = {};
  let ultimo = null, cuando = 0, abierta = null;
  const leerJwt = (t) => { try { return JSON.parse(decodeURIComponent(escape(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; } };
  function dispositivo() {
    try {
      let v = localStorage.getItem('cfx-equipo');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(v || '')) { v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14); localStorage.setItem('cfx-equipo', v); }
      return v;
    } catch (e) { return 'sin-guardar-' + (navigator.userAgent.length * 7919).toString(36) + '00'; }
  }
  function nombre() {
    const u = navigator.userAgent || '';
    const nav = /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Navegador';
    const so = /iPad/.test(u) ? 'iPad' : /iPhone|iPod/.test(u) ? 'iPhone' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android' : 'Tablet Android') : /Windows/.test(u) ? 'Windows' : /Macintosh|Mac OS X/.test(u) ? 'Mac' : /CrOS/.test(u) ? 'Chromebook' : /Linux/.test(u) ? 'Linux' : 'Equipo';
    return nav + ' · ' + so;
  }
  const leerCab = (h, k) => { if (!h) return ''; if (typeof h.get === 'function') return h.get(k) || ''; if (Array.isArray(h)) { const p = h.find((x) => String(x[0]).toLowerCase() === k); return p ? p[1] : ''; }
    for (const n in h) if (n.toLowerCase() === k) return h[n]; return ''; };
  function mirar(entrada, op) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada || '');
    const m = /^(https?:\/\/[^/]+)\/(rest|functions|storage)\/v1\//.exec(url); if (!m) return;
    const cab = (op && op.headers) || (entrada && entrada.headers);
    const tok = String(leerCab(cab, 'authorization') || '').replace(/^Bearer\s+/i, ''), apikey = leerCab(cab, 'apikey') || '';
    if (!tok || tok === apikey) return;
    const j = leerJwt(tok); if (!j || j.role !== 'authenticated' || !j.session_id) return;
    ultimo = { origen: m[1], apikey, tok, sid: String(j.session_id) };
    const k = m[1] + '|' + j.session_id; if (vistos[k]) return;
    vistos[k] = 1; setTimeout(revisar, 0);
  }
  window.fetch = function (entrada, op) { try { mirar(entrada, op); } catch (e) { /* nunca frena a la app */ } return orig(entrada, op); };

  async function rpc(c, fn, args) {
    const r = await orig(c.origen + '/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}),
      headers: { apikey: c.apikey, Authorization: 'Bearer ' + c.tok, 'Content-Type': 'application/json' } });
    if (!r.ok) return null;  // la app todavía no tiene el SQL del G164: sigue como antes
    try { return await r.json(); } catch (e) { return null; }
  }
  async function revisar() {
    const c = ultimo; if (!c || abierta) return;
    cuando = Date.now();
    let j = null; try { j = await rpc(c, 'cfx_equipo_registrar', { p_dispositivo: dispositivo(), p_nombre: nombre() }); } catch (e) { return; }
    if (!j) return;
    if (j.cerrada) return salir('📱 Esta sesión se cerró desde otro equipo. Vuelve a entrar con tu correo y contraseña.');
    if (j.exceso) elegir(c, j);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ultimo && Date.now() - cuando > 300000) revisar(); });

  // Borra la sesión guardada de esta app y vuelve al ingreso. Se borra AL RECARGAR (este archivo corre antes de que la app cree su conexión):
  // así la app no alcanza a pedir datos sin sesión mientras se va.
  const borrarSesion = () => { try { for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k) || ''; if (/access_token|refresh_token/.test(v) && /auth/i.test(k)) localStorage.removeItem(k); } } catch (e) { /* nada */ } };
  function salir(msg) {
    try { if (msg) sessionStorage.setItem('cfx-equipo-msg', msg); sessionStorage.setItem('cfx-equipo-salir', '1'); } catch (e) { borrarSesion(); }
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) { /* nada */ }
    location.reload();
  }
  try { if (sessionStorage.getItem('cfx-equipo-salir')) { sessionStorage.removeItem('cfx-equipo-salir'); borrarSesion(); } } catch (e) { /* nada */ }
  function msgPendiente() {
    let m = ''; try { m = sessionStorage.getItem('cfx-equipo-msg') || ''; sessionStorage.removeItem('cfx-equipo-msg'); } catch (e) { /* nada */ }
    if (!m) return;
    const ver = () => (window.CFX_DIALOGO ? window.CFX_DIALOGO.avisar(m) : null);
    if (document.readyState === 'complete') setTimeout(ver, 300); else addEventListener('load', () => setTimeout(ver, 300));
  }
  msgPendiente();

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  function hace(f) {
    const s = Math.max(0, (Date.now() - new Date(f).getTime()) / 1000);
    return s < 120 ? 'recién' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : s < 86400 ? 'hace ' + Math.round(s / 3600) + ' h' : 'hace ' + Math.round(s / 86400) + ' d';
  }
  function estilo() {
    if (document.getElementById('cfx-eq-css')) return;
    const s = document.createElement('style'); s.id = 'cfx-eq-css';
    s.textContent = 'dialog.cfx-eq{position:fixed;inset:0;z-index:2147483100;border:0;margin:0;padding:0;width:100%;height:100%;max-width:none;max-height:none;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,12,24,.6);color:inherit;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
      'dialog.cfx-eq::backdrop{background:transparent}.cfx-eq-c{box-sizing:border-box;width:100%;max-width:520px;max-height:90vh;overflow:auto;padding:18px 16px 16px;border-radius:20px 20px 0 0;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);border:1px solid var(--cfx-borde,#dce3ea)}' +
      '.cfx-eq-c h2{margin:0 0 6px;font-size:18px}.cfx-eq-c p{margin:0 0 12px;font-size:14px;line-height:1.45;opacity:.85}.cfx-eq-l{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:8px}' +
      '.cfx-eq-l li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--cfx-campo,#f1f4f7);border:1px solid var(--cfx-borde,#dce3ea)}.cfx-eq-l li div{flex:1;min-width:0}' +
      '.cfx-eq-l b{display:block;font-size:15px;overflow-wrap:anywhere}.cfx-eq-l small{font-size:12.5px;opacity:.75}.cfx-eq button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer}' +
      '.cfx-eq-l button{flex:none;padding:0 14px;background:var(--cfx-rojo,#dc2626);color:#fff}.cfx-eq-no{width:100%;background:var(--cfx-campo,#f1f4f7);color:var(--cfx-texto,#111827);border:1px solid var(--cfx-borde,#dce3ea)!important}' +
      '.cfx-eq-e{color:var(--cfx-rojo,#dc2626);font-size:13px;min-height:1em;margin:0 0 8px}@media (min-width:700px){dialog.cfx-eq{align-items:center}.cfx-eq-c{border-radius:20px}}';
    (document.head || document.documentElement).appendChild(s);
  }
  // "Tienes 3 equipos abiertos: elige cuál cerrar". No se cierra con Esc ni tocando afuera.
  function elegir(c, j) {
    const montar = () => {
      estilo();
      if (abierta) abierta.remove();
      const v = document.createElement('dialog'); v.className = 'cfx-eq'; abierta = v;
      v.addEventListener('cancel', (e) => e.preventDefault());
      const otros = (j.equipos || []).filter((x) => !x.este);
      v.innerHTML = '<div class="cfx-eq-c" role="alertdialog" aria-modal="true" aria-labelledby="cfxEqT"><h2 id="cfxEqT">📱 Tienes ' + otros.length + ' equipos abiertos</h2>' +
        '<p>Tu cuenta se puede usar en ' + esc(j.tope) + ' equipos a la vez. Elige cuál cerrar para entrar en este (' + esc(nombre()) + ').</p><ul class="cfx-eq-l">' +
        otros.map((x) => '<li><div><b>' + esc(x.nombre) + '</b><small>Último uso: ' + esc(hace(x.visto)) + '</small></div><button type="button" data-eq="' + esc(x.sesion) + '">Cerrar</button></li>').join('') +
        '</ul><p class="cfx-eq-e" role="status"></p><button type="button" class="cfx-eq-no" data-eq-no>No entrar en este equipo</button></div>';
      v.onclick = async (ev) => {
        const b = ev.target.closest('[data-eq], [data-eq-no]'); if (!b) return;
        v.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        const err = (t) => { v.querySelector('.cfx-eq-e').textContent = t; v.querySelectorAll('button').forEach((x) => { x.disabled = false; }); };
        try {
          if (b.dataset.eqNo !== undefined) { await rpc(c, 'cfx_equipo_cerrar', { p_sesion: c.sid }).catch(() => {}); return salir(''); }
          const r = await rpc(c, 'cfx_equipo_cerrar', { p_sesion: b.dataset.eq });
          if (!r || r.error) return err('⚠️ ' + ((r && r.error) || 'No se pudo cerrar. Revisa tu conexión.'));
          const n = await rpc(c, 'cfx_equipo_registrar', { p_dispositivo: dispositivo(), p_nombre: nombre() });
          if (n && n.exceso) { j = n; return montar(); }
          v.remove(); abierta = null;
          if (n && n.cerrada) return salir('📱 Esta sesión se cerró. Vuelve a entrar.');
          if (window.CFX_DIALOGO) window.CFX_DIALOGO.avisar('✅ Listo: cerramos ese equipo y ya entraste en este.');
        } catch (e) { err('⚠️ No se pudo cerrar. Revisa tu conexión.'); }
      };
      document.body.appendChild(v);
      try { v.showModal(); } catch (e) { v.setAttribute('open', ''); }
    };
    if (document.body) montar(); else addEventListener('DOMContentLoaded', montar);
  }
  window.CFX_EQUIPOS = { dispositivo, nombre, revisar, hace };
})();
