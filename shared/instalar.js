/* CodeFix · Instalar la app y activar notificaciones (mismo archivo en todas las apps).
   Insiste con un aviso abajo de la pantalla, en este orden:
   0) Si la app YA está instalada y se abrió en el navegador (o dentro de WhatsApp, Instagram…) → "Abrir en la app"
      (salta directo a la app instalada; nada de elegir navegador).
   1) Si el link se abrió dentro de WhatsApp, Instagram, Facebook o TikTok y la app no está instalada → "Abrir en el navegador"
      (ahí no se puede instalar ni recibir notificaciones).
   2) Si la app no está instalada → "Instalar" (Android: instala con un toque; iPhone: Compartir → Agregar a inicio).
   3) Si hay sesión y las notificaciones no están activas → "Activar notificaciones" (usa la función de cada app).
   Nunca es obligatorio: siempre hay "Ahora no" y ✕.
   · "Ahora no" → no vuelve a salir hasta la próxima vez que abra la app, y como máximo 1 vez al día.
   · "Ya la instalé" → no se vuelve a preguntar nunca en ese equipo (tampoco si ya se abre como app instalada).
   · Notificaciones: una tarjeta chica arriba de la pantalla de inicio con "Activar" y ✕ (no una ventana encima cada minuto).
     ✕ la esconde por 3 días. */
(function () {
  'use strict';
  if (window.CodeFixInstalar || /legal|actualizar\.html/.test(location.pathname)) return;
  const CADA = 60 * 60 * 1000, ESPERA = 2500;
  const ua = navigator.userAgent || '';
  const esIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/.test(ua);
  const enApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\/|; wv\)/.test(ua);
  const instalada = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const pushPosible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const leer = (k) => { try { return Number(localStorage.getItem('cfx-inst:' + k)) || 0; } catch (e) { return 0; } };
  const guardar = (k, v) => { try { localStorage.setItem('cfx-inst:' + k, String(v)); } catch (e) { /* nada */ } };
  let promptInstalar = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; });
  addEventListener('appinstalled', () => { guardar('instalada', Date.now()); cerrar(); });
  // ¿Está instalada en este teléfono? (Chrome lo sabe gracias a related_applications del manifiesto)
  let yaInstalada = false;
  try { if (navigator.getInstalledRelatedApps) navigator.getInstalledRelatedApps().then((l) => { yaInstalada = !!(l && l.length); }).catch(() => {}); } catch (e) { /* nada */ }

  // Cómo se activan las notificaciones en cada app (cada una guarda la suscripción a su manera).
  function adaptador() {
    const w = window;
    if (w.LC && w.LC.suscribirPush) return { // Billetera
      sesion: async () => /\/(app|admin)\//.test(location.pathname) && !!(await w.LC.sb.auth.getSession()).data.session,
      activar: async () => { const c = await w.LC.rpc('config_publica'); const s = await w.LC.suscribirPush(c.vapid_public); await w.LC.rpc('guardar_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth }); } };
    if (w.U && w.U.activarPush && w.Api) return { sesion: async () => !!(w.Api.uid && w.Api.uid()), activar: w.U.activarPush }; // Estaciona
    if (w.Cuenta && w.Cuenta.enablePush) return { sesion: async () => !!w.Cuenta.account, activar: w.Cuenta.enablePush }; // CodeFix Apps
    if (w.Cuenta && w.Cuenta.activarPush) return { sesion: async () => !!w.Cuenta.cuenta, activar: w.Cuenta.activarPush }; // Barbería
    if (w.App && w.App.activarPush) return { sesion: async () => !!w.App.cuenta, activar: w.App.activarPush }; // Centro de Mando y BiciTaller
    return null;
  }
  async function pushActiva() {
    if (!pushPosible() || Notification.permission !== 'granted') return false;
    try { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.pushManager && await r.pushManager.getSubscription()); } catch (e) { return false; }
  }

  // ---------- Aviso (abajo de la pantalla, no bloquea la app) ----------
  const color = (document.querySelector('meta[name="theme-color"]') || {}).content || '#2563eb';
  const icono = (document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel="icon"]') || {}).href || '';
  // Nombre corto de la app (del manifiesto); mientras carga, el título de la página.
  let nombre = (document.title || 'la app').split(/\s[·|-]\s/)[0].trim();
  const man = document.querySelector('link[rel="manifest"]');
  if (man) fetch(man.href).then((r) => r.json()).then((j) => { nombre = j.short_name || j.name || nombre; }).catch(() => {});
  const css = document.createElement('style');
  css.textContent = '.cfx-hoja{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483000;max-width:460px;margin:0 auto;' +
    'background:#fff;color:#0f172a;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.28),0 0 0 1px rgba(15,23,42,.06);padding:16px;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
    'animation:cfxSube .3s ease}@keyframes cfxSube{from{transform:translateY(20px);opacity:0}}' +
    '.cfx-hoja .cfx-fila{display:flex;gap:12px;align-items:center}.cfx-hoja img{width:46px;height:46px;border-radius:12px;flex:none;object-fit:cover}' +
    '.cfx-hoja b{display:block;font-size:16px;margin-bottom:2px}.cfx-hoja p{margin:0;color:#475569;font-size:14px}' +
    '.cfx-hoja ol{margin:10px 0 0;padding-left:20px;color:#334155;font-size:14px}.cfx-hoja li{margin:4px 0}' +
    '.cfx-hoja .cfx-btns{display:flex;gap:8px;margin-top:14px}.cfx-hoja button{flex:1;min-height:46px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer}' +
    '.cfx-hoja .cfx-si{background:var(--cfx-color);color:#fff}.cfx-hoja .cfx-no{background:#f1f5f9;color:#334155;flex:.7}' +
    '.cfx-hoja svg{width:1.1em;height:1.1em;vertical-align:-.18em}' +
    '@media(prefers-color-scheme:dark){.cfx-hoja{background:#111827;color:#f1f5f9;box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}.cfx-hoja p,.cfx-hoja ol{color:#cbd5e1}.cfx-hoja .cfx-no{background:#1f2937;color:#e2e8f0}}' +
    '@media(min-width:900px){.cfx-hoja{bottom:24px}}' +
    '.cfx-hoja-velo{position:fixed;inset:0;z-index:2147482999;background:rgba(15,23,42,.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:cfxVelo .2s ease}@keyframes cfxVelo{from{opacity:0}}' +
    '.cfx-hoja .cfx-x{position:absolute;top:8px;right:8px;width:36px;height:36px;min-height:0;flex:none;padding:0;display:grid;place-items:center;border-radius:10px;background:transparent;color:#64748b}' +
    '.cfx-hoja{padding-right:44px}.cfx-hoja .cfx-btns{margin-right:-28px}' +
    '.cfx-av-tarj{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:12px 12px 12px 14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--cfx-color) 30%,var(--cfx-borde,#e2e7ec));' +
    'background:color-mix(in srgb,var(--cfx-color) 8%,var(--cfx-tarjeta,#fff));color:var(--cfx-texto,#0f172a);font:14px/1.35 var(--cfx-letra,system-ui,sans-serif);animation:cfxSube .3s ease}' +
    '.cfx-av-tarj .cfx-av-ic{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--cfx-color);color:#fff}.cfx-av-tarj .cfx-av-ic svg{width:18px;height:18px}' +
    '.cfx-av-tarj div{flex:1;min-width:0}.cfx-av-tarj b{display:block;font-size:14.5px}.cfx-av-tarj small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:12.5px}' +
    '.cfx-av-tarj .cfx-av-si{flex:none;min-height:40px;padding:0 14px;border-radius:12px;border:0;background:var(--cfx-color);color:#fff;font:700 14px/1 inherit;cursor:pointer}' +
    '.cfx-av-tarj .cfx-av-x{flex:none;width:36px;height:36px;min-height:0;padding:0;display:grid;place-items:center;border-radius:10px;border:0;background:transparent;color:var(--cfx-texto-2,#64748b);cursor:pointer}';
  document.head.appendChild(css);
  const SVG = {
    compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    puntos: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    campana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>'
  };
  let hoja = null;
  const DIA = 864e5;
  // "Ahora no" / ✕: hasta la próxima vez que abra la app y máximo 1 vez al día.
  const posponer = () => { guardar('pospuesto', Date.now()); try { sessionStorage.setItem('cfx-inst:no', '1'); } catch (e) { /* nada */ } };
  function cerrar() { if (hoja) { hoja.remove(); hoja = null; } }
  function mostrar(titulo, texto, extra, si, alSi, no) {
    cerrar();
    hoja = document.createElement('div'); hoja.className = 'cfx-hoja no-ico'; hoja.setAttribute('role', 'dialog'); hoja.style.setProperty('--cfx-color', color);
    hoja.innerHTML = '<button type="button" class="cfx-x" aria-label="Cerrar">' + SVG.x + '</button><div class="cfx-fila">' + (icono ? '<img alt="" src="' + icono + '">' : '') + '<div><b></b><p></p></div></div>' + (extra || '') +
      '<div class="cfx-btns"><button type="button" class="cfx-no"></button>' + (si ? '<button type="button" class="cfx-si"></button>' : '') + '</div>';
    hoja.querySelector('b').textContent = titulo; hoja.querySelector('p').textContent = texto;
    hoja.querySelector('.cfx-no').textContent = no || 'Ahora no';
    hoja.querySelector('.cfx-no').onclick = hoja.querySelector('.cfx-x').onclick = () => { posponer(); cerrar(); };
    if (si) { const b = hoja.querySelector('.cfx-si'); b.textContent = si; b.onclick = async () => { b.disabled = true; try { await alSi(); } finally { b.disabled = false; } }; }
    document.body.appendChild(hoja);
  }

  // ---------- Los avisos ----------
  // Android abre el link con la app instalada (sin "elegir navegador"); si no se pudo, queda la indicación del ícono.
  function abrirEnApp() {
    const u = location.host + location.pathname + location.search + location.hash;
    mostrar('Ábrela en la app', 'Ya tienes ' + nombre + ' instalada. Ahí te llegan los avisos y entras más rápido.', '',
      'Abrir la app', async () => {
        location.href = 'intent://' + u + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';
        setTimeout(() => { const p = hoja && hoja.querySelector('p'); if (p && !document.hidden) p.textContent = 'Si no se abrió, toca el ícono de ' + nombre + ' en tu pantalla de inicio.'; }, 1800);
      });
  }
  function abrirEnNavegador() {
    if (esAndroid) {
      const u = location.host + location.pathname + location.search;
      mostrar('Ábrela en tu navegador', 'Desde aquí no se puede instalar ni recibir avisos de tus pedidos. Ábrela en Chrome: es seguro y queda guardada.', '',
        'Abrir en Chrome', async () => { location.href = 'intent://' + u + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end'; });
    } else {
      mostrar('Ábrela en Safari', 'Desde aquí no se puede instalar ni recibir avisos de tus pedidos.',
        '<ol><li>Toca ' + SVG.puntos + ' o el botón de compartir de arriba o abajo.</li><li>Elige <b style="display:inline">Abrir en Safari</b> (o en el navegador).</li></ol>',
        'Copiar link', async () => { try { await navigator.clipboard.writeText(location.href); } catch (e) { /* nada */ } hoja.querySelector('.cfx-si').textContent = 'Link copiado ✓'; });
    }
  }
  function pedirInstalar() {
    if (promptInstalar) {
      return mostrar('Instala ' + nombre, 'Instálala en tu celular: abre más rápido, funciona mejor y te llegan los avisos. No es obligatorio.', '',
        'Instalar', async () => { const p = promptInstalar; promptInstalar = null; p.prompt(); const r = await p.userChoice.catch(() => ({})); if (r && r.outcome === 'accepted') { guardar('instalada', Date.now()); cerrar(); } else guardar('pospuesto', Date.now()); });
    }
    if (esIOS) {
      return mostrar('Instala ' + nombre + ' en tu iPhone', 'Instálala en tu celular: abre más rápido, funciona mejor y te llegan los avisos. No es obligatorio.',
        '<ol><li>Toca el botón Compartir ' + SVG.compartir + ' (abajo o arriba).</li><li>Elige <b style="display:inline">Agregar a inicio</b> ' + SVG.mas + '.</li><li>Abre la app desde el ícono nuevo.</li></ol>',
        'Ya la instalé', async () => { guardar('instalada', Date.now()); cerrar(); }, 'Ahora no');
    }
    return mostrar('Instala ' + nombre, 'Instálala en tu celular: abre más rápido, funciona mejor y te llegan los avisos. No es obligatorio. Toca ⋮ en el navegador y elige "Instalar aplicación".', '',
      'Ya la instalé', async () => { guardar('instalada', Date.now()); cerrar(); });
  }
  // Tarjeta chica arriba de la pantalla de inicio: "Activa los avisos" · Activar · ✕ (3 días). Si la app vuelve a dibujar, se repone.
  let tarj = null;
  function lugarTarjeta() {
    const vis = (e) => e && e.offsetParent !== null && e.getBoundingClientRect().height > 40;
    const L = [...document.querySelectorAll('main .view.on, main .view.activa, main .vista.on, main section.on, main > section:not([hidden]), main, #app, .app')].filter(vis);
    return L.find((e) => !e.closest('dialog, .cfx-hoja-m, header, nav')) || null;
  }
  function pedirAvisos(ad) {
    const bloq = Notification.permission === 'denied', donde = lugarTarjeta(); if (!donde) return;
    if (tarj && tarj.isConnected) return;
    tarj = document.createElement('div'); tarj.className = 'cfx-av-tarj no-ico'; tarj.setAttribute('role', 'region'); tarj.setAttribute('aria-label', 'Notificaciones'); tarj.style.setProperty('--cfx-color', color);
    tarj.innerHTML = '<span class="cfx-av-ic">' + SVG.campana + '</span><div><b></b><small></small></div>' + (bloq ? '' : '<button type="button" class="cfx-av-si">Activar</button>') + '<button type="button" class="cfx-av-x" aria-label="Ahora no">' + SVG.x + '</button>';
    tarj.querySelector('b').textContent = bloq ? 'Tus avisos están bloqueados' : 'Activa los avisos';
    tarj.querySelector('small').textContent = bloq ? 'Permítelos en el candado junto a la dirección o en Ajustes del celular.' : 'Te avisamos de pedidos, pagos y mensajes aunque la app esté cerrada.';
    tarj.querySelector('.cfx-av-x').onclick = () => { guardar('avisos-no', Date.now()); tarj.remove(); tarj = null; };
    const si = tarj.querySelector('.cfx-av-si');
    if (si) si.onclick = async () => {
      si.disabled = true; si.textContent = '…';
      try { await ad.activar(); guardar('avisos', Date.now()); tarj.remove(); tarj = null; }
      catch (e) {
        if (/administrador a[uú]n no activ/i.test((e && e.message) || '')) { guardar('sinclaves', Date.now()); tarj.remove(); tarj = null; return; }
        tarj.querySelector('small').textContent = (e && e.message) || 'No se pudo activar. Intenta de nuevo.'; si.disabled = false; si.textContent = 'Reintentar';
      }
    };
    donde.prepend(tarj);
  }

  async function revisar() {
    if (document.hidden || window.CFX_SIN_OBLIGAR) return;
    const ad = adaptador();
    let haySesion = false; try { haySesion = !!ad && await ad.sesion(); } catch (e) { /* sin sesión */ }
    // Notificaciones: tarjeta suave (no la ventana de abajo), salvo que la haya cerrado hace menos de 3 días o la app no tenga claves aún.
    if (haySesion && pushPosible() && !(Date.now() - leer('avisos-no') < 3 * DIA) && !(Date.now() - leer('sinclaves') < DIA) && !(await pushActiva())) pedirAvisos(ad);
    else if (tarj) { tarj.remove(); tarj = null; }
    // Ventana de abajo (instalar / abrir en la app): 1 vez por apertura, como máximo 1 vez al día si dijo "Ahora no", nunca si dijo "Ya la instalé".
    if (hoja || sessionStorage.getItem('cfx-inst:no') || sessionStorage.getItem('cfx-inst:visto')) return;
    if (document.querySelector('dialog[open], .velo, .modal.on, .modal-fondo, .cfx-hoja-m')) return; // no tapar otra ventana
    if (Date.now() - leer('pospuesto') < DIA) return;
    const movil = esIOS || esAndroid;
    if (esAndroid && !instalada() && (yaInstalada || (enApp && leer('instalada')))) { marcarVisto(); return abrirEnApp(); }
    if (enApp && movil) { marcarVisto(); return abrirEnNavegador(); }
    if (movil && !instalada() && !yaInstalada && !leer('instalada')) { marcarVisto(); return pedirInstalar(); }
  }
  const marcarVisto = () => { try { sessionStorage.setItem('cfx-inst:visto', '1'); } catch (e) { /* nada */ } };
  // Para el perfil común (ayuda.js): estado y activar las notificaciones con el adaptador de cada app.
  const activarPush = async () => { const ad = adaptador(); if (!ad || !pushPosible()) throw new Error('Este navegador no permite notificaciones'); await ad.activar(); };
  window.CodeFixInstalar = { revisar, cerrar, pushActiva, activarPush };
  const iniciar = () => { setTimeout(revisar, ESPERA); setInterval(revisar, 60 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(revisar, 1200); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
