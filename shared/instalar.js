/* CodeFix · Instalar la app y activar notificaciones (mismo archivo en todas las apps).
   Insiste con un aviso abajo de la pantalla, en este orden:
   0) Si la app YA está instalada y se abrió en el navegador (o dentro de WhatsApp, Instagram…) → "Abrir en la app"
      (salta directo a la app instalada; nada de elegir navegador).
   1) Si el link se abrió dentro de WhatsApp, Instagram, Facebook o TikTok y la app no está instalada → "Abrir en el navegador"
      (ahí no se puede instalar ni recibir notificaciones).
   2) Si la app no está instalada → "Instalar" (Android: instala con un toque; iPhone: Compartir → Agregar a inicio).
   3) Si hay sesión y las notificaciones no están activas → "Activar notificaciones" (usa la función de cada app).
   Si la persona toca "Ahora no", vuelve a aparecer al abrir la app otra vez y cada 1 hora mientras esté abierta.
   Con sesión las notificaciones son OBLIGATORIAS: el aviso tapa la app y no tiene "Ahora no" (en iPhone primero hay que
   instalarla, porque Safari no recibe avisos). Solo si activarlas falla aparece "Seguir sin avisos por ahora". */
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
    '.cfx-hoja.cfx-oblig .cfx-no{display:none}.cfx-hoja .cfx-luego{display:block;margin:10px auto 0;background:none;border:0;min-height:0;color:#64748b;font-size:13px;font-weight:600;text-decoration:underline}';
  document.head.appendChild(css);
  const SVG = {
    compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    puntos: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
  };
  let hoja = null, velo = null, obligar = false;
  function cerrar() { if (hoja) { hoja.remove(); hoja = null; } if (velo) { velo.remove(); velo = null; } }
  function mostrar(titulo, texto, extra, si, alSi, no) {
    cerrar();
    hoja = document.createElement('div'); hoja.className = 'cfx-hoja no-ico' + (obligar ? ' cfx-oblig' : ''); hoja.setAttribute('role', 'dialog'); hoja.style.setProperty('--cfx-color', color);
    if (obligar) { hoja.setAttribute('aria-modal', 'true'); velo = document.createElement('div'); velo.className = 'cfx-hoja-velo'; document.body.appendChild(velo); }
    hoja.innerHTML = '<div class="cfx-fila">' + (icono ? '<img alt="" src="' + icono + '">' : '') + '<div><b></b><p></p></div></div>' + (extra || '') +
      '<div class="cfx-btns"><button type="button" class="cfx-no"></button>' + (si ? '<button type="button" class="cfx-si"></button>' : '') + '</div>';
    hoja.querySelector('b').textContent = titulo; hoja.querySelector('p').textContent = texto;
    hoja.querySelector('.cfx-no').textContent = no || 'Ahora no';
    hoja.querySelector('.cfx-no').onclick = () => { guardar('pospuesto', Date.now()); cerrar(); };
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
      return mostrar('Instala ' + nombre, 'Queda como una app en tu celular: entras con un toque, más rápido y seguro, y te llegan los avisos.', '',
        'Instalar', async () => { const p = promptInstalar; promptInstalar = null; p.prompt(); const r = await p.userChoice.catch(() => ({})); if (r && r.outcome === 'accepted') { guardar('instalada', Date.now()); cerrar(); } else guardar('pospuesto', Date.now()); });
    }
    if (esIOS) {
      return mostrar('Instala ' + nombre + ' en tu iPhone', 'Así entras con un toque y te llegan los avisos de tus pedidos.',
        '<ol><li>Toca el botón Compartir ' + SVG.compartir + ' (abajo o arriba).</li><li>Elige <b style="display:inline">Agregar a inicio</b> ' + SVG.mas + '.</li><li>Abre la app desde el ícono nuevo.</li></ol>',
        'Ya la agregué', async () => { guardar('instalada', Date.now()); cerrar(); }, 'Ahora no');
    }
    return mostrar('Instala ' + nombre, '¿Ya la tienes? Ábrela desde el ícono de tu pantalla de inicio. Si no, toca ⋮ en el navegador y elige "Instalar aplicación" o "Agregar a pantalla de inicio".', '',
      'Ya la tengo', async () => { guardar('instalada', Date.now()); cerrar(); });
  }
  function pedirAvisos(ad) {
    const bloqueadas = Notification.permission === 'denied';
    if (bloqueadas) {
      return mostrar('Tus notificaciones están bloqueadas', 'Son obligatorias para enterarte al tiro de todo lo que pasa. Desbloquéalas:',
        '<ol><li>Toca el candado o ' + SVG.puntos + ' junto a la dirección (o Ajustes del celular → esta app).</li><li>Notificaciones → <b style="display:inline">Permitir</b>.</li><li>Vuelve y recarga la página.</li></ol>',
        'Ya las permití', async () => { location.reload(); });
    }
    mostrar('Activa las notificaciones', 'Son obligatorias: te avisamos al tiro de todo (pedidos, pagos, mensajes y cambios), aunque tengas la app cerrada.', '',
      'Activar', async () => {
        try { await ad.activar(); cerrar(); guardar('avisos', Date.now()); }
        catch (e) {
          // La app aún no tiene sus claves push (se crean en CM → Control → 🔔 Notificaciones): no se muestra el error y se vuelve a ofrecer en 1 día.
          if (/administrador a[uú]n no activ/i.test((e && e.message) || '')) { guardar('sinclaves', Date.now()); return cerrar(); }
          const p = hoja && hoja.querySelector('p'); if (p) p.textContent = (e && e.message) || 'No se pudo activar. Intenta de nuevo.';
          if (hoja && !hoja.querySelector('.cfx-luego')) { const l = document.createElement('button'); l.type = 'button'; l.className = 'cfx-luego'; l.textContent = 'Seguir sin avisos por ahora'; l.onclick = () => { guardar('fallo', Date.now()); cerrar(); }; hoja.appendChild(l); }
        }
      });
  }

  async function revisar() {
    if (hoja || document.hidden) return;
    if (document.querySelector('dialog[open], .velo, .modal.on, .modal-fondo')) return; // no tapar otra ventana
    const ad = adaptador();
    let haySesion = false; try { haySesion = !!ad && await ad.sesion(); } catch (e) { /* sin sesión */ }
    // Obligatorio: hay sesión, la app ya tiene claves push y activarlas no falló en las últimas 24 h.
    const falta = haySesion && !window.CFX_SIN_OBLIGAR && !(Date.now() - (leer('sinclaves') || 0) < 864e5) && !(Date.now() - (leer('fallo') || 0) < 864e5) && !(await pushActiva());
    const pos = leer('pospuesto');
    if (!falta && pos && Date.now() - pos < CADA && sessionStorage.getItem('cfx-inst:visto')) return;
    try { sessionStorage.setItem('cfx-inst:visto', '1'); } catch (e) { /* nada */ }
    if (hoja) return;
    const movil = esIOS || esAndroid;
    obligar = false;
    if (esAndroid && !instalada() && (yaInstalada || (enApp && leer('instalada')))) return abrirEnApp();
    if (enApp && movil) return abrirEnNavegador();
    // iPhone: Safari no recibe avisos, así que con sesión instalarla también es obligatorio.
    obligar = falta && esIOS && !pushPosible();
    if (movil && !instalada() && !yaInstalada && (obligar || !(leer('instalada') && !promptInstalar && Date.now() - leer('instalada') < 7 * 864e5))) return pedirInstalar();
    obligar = false;
    if (!falta || !pushPosible()) return;
    obligar = true;
    pedirAvisos(ad);
  }
  window.CodeFixInstalar = { revisar, cerrar };
  const iniciar = () => { setTimeout(revisar, ESPERA); setInterval(revisar, 60 * 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(revisar, 1200); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
