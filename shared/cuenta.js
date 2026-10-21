/* Sesión de usuario: inicio de sesión, plan Free/Pro, notificaciones push.
   La verificación real la hace el servidor; aquí solo se guarda una copia
   para poder usar la app sin internet (máx. 7 días sin conectarse). */
(function (global) {
  'use strict';

  const cfg = global.CFX_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/^PEGA_/.test(cfg.SUPABASE_ANON_KEY));
  const sb = configured && global.supabase
    ? global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cfx-auth', detectSessionInUrl: true }
    })
    : null;

  const CACHE_KEY = 'cfx:cuenta';
  const OFFLINE_DAYS = 7;
  let account = readCache();

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch (e) { return null; }
  }
  function writeCache(a) {
    account = a;
    try {
      if (a) localStorage.setItem(CACHE_KEY, JSON.stringify(a)); else localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* sin espacio */ }
  }

  // Logo arriba, al lado del nombre: la empresa ve el suyo; el cliente, el de su tienda.
  function aplicarLogo(a) {
    const logo = a && (a.role === 'client' ? a.negocio_logo : a.logo);
    const ok = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(logo || '');
    document.documentElement.classList.toggle('con-logo', ok);
    if (ok) document.documentElement.style.setProperty('--logo', 'url("' + logo + '")');
  }
  aplicarLogo(account);
  if (global.Core && account) global.Core.tema.usar(account.id, account.role === 'client' ? account.negocio_color : null);

  function friendly(err) {
    const m = (err && (err.message || err.error_description || err)) + '';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
    if (/Email not confirmed/i.test(m)) return 'Primero confirma tu correo (revisa tu bandeja y spam)';
    if (/User already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
    if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con el servidor';
    return m.replace(/^\w*Error:\s*/, '') || 'Error';
  }

  async function refresh() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    if (!data.session) { writeCache(null); return null; }
    const { data: acc, error } = await sb.rpc('my_account');
    if (error) {
      // Sin internet: usamos la copia local si es reciente.
      if (account && account.id === data.session.user.id) {
        const age = (Date.now() - (account.checkedAt || 0)) / 864e5;
        if (age > OFFLINE_DAYS) account.is_pro = false;
        return account;
      }
      throw error;
    }
    if (!acc) { writeCache(null); return null; }
    acc.checkedAt = Date.now();
    writeCache(acc);
    aplicarLogo(acc);
    if (global.Core) global.Core.tema.usar(acc.id, acc.role === 'client' ? acc.negocio_color : null);
    actividad(acc.id);
    return acc;
  }

  // Última conexión (solo la ve el administrador). Máx. una vez cada 10 minutos, sin esperar respuesta.
  function actividad(uid) {
    try {
      const k = 'cfx:visto:' + uid, t = +localStorage.getItem(k) || 0;
      if (Date.now() - t < 6e5) return;
      localStorage.setItem(k, String(Date.now()));
    } catch (e) { /* sin espacio */ }
    sb.rpc('registrar_actividad').then(() => {}, () => {});
  }

  // Úsalo al abrir cada app: si no hay sesión, vuelve al inicio para ingresar.
  // Ajustes públicos del admin (link de pago, precios). Se guardan para usarlos sin internet.
  async function settings() {
    try {
      const s = await rpc('public_settings');
      localStorage.setItem('cfx:ajustes', JSON.stringify(s));
      return s;
    } catch (e) {
      try { return JSON.parse(localStorage.getItem('cfx:ajustes')) || {}; } catch (e2) { return {}; }
    }
  }

  async function require(rootPath, opts) {
    let a = null;
    try { a = await refresh(); } catch (e) { a = account; }
    if (!a) {
      location.replace(rootPath + '?volver=' + encodeURIComponent(location.pathname + location.search));
      return new Promise(() => {});
    }
    if (a.suspended) { alert('Tu cuenta está suspendida. Contacta a ' + (cfg.MARCA || 'soporte') + '.'); }
    if ((opts && opts.admin && !a.is_admin) || (opts && opts.empresa && a.role === 'client') || (opts && opts.dueno && a.role === 'equipo')) {
      location.replace(rootPath);
      return new Promise(() => {});
    }
    setTimeout(ofrecerPush, 1500);
    return a;
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendly(error));
    const acc = await refresh();
    syncPush();
    return acc;
  }

  // extra: { rol: 'client', negocio: '<id>' } para clientes de una empresa.
  async function signUp(email, password, empresa, extra) {
    const meta = Object.assign({ empresa: (empresa || '').trim(), acepta: 'si' }, extra || {});
    const { data, error } = await sb.auth.signUp({
      email: email.trim(), password,
      options: { data: meta, emailRedirectTo: rootUrl() }
    });
    if (error) throw new Error(friendly(error));
    if (data.session) return refresh();
    return null; // falta confirmar el correo
  }

  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: rootUrl() });
    if (error) throw new Error(friendly(error));
  }

  async function setPassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(friendly(error));
  }

  async function signOut() {
    // Este celular deja de recibir los avisos de la cuenta que sale.
    try {
      const sub = await suscripcionActual();
      if (sub) await sb.rpc('remove_my_push', { p_endpoint: sub.endpoint });
    } catch (e) { /* sin red */ }
    try { await sb.auth.signOut(); } catch (e) { /* sin red */ }
    writeCache(null);
  }

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw new Error(friendly(error));
    return data;
  }

  // Crea una cuenta desde el panel (admin: empresas y clientes; empresa: sus clientes).
  async function crearUsuario(d) {
    const { data, error } = await sb.functions.invoke('enviar', {
      body: { accion: 'crear_usuario', email: d.email, password: d.password, nombre: d.nombre, tipo: d.tipo, negocio: d.negocio || null }
    });
    if (error) throw new Error(await errorFuncion(error));
    if (!data || !data.ok) {
      if (data && data.processed !== undefined) throw new Error('La función "enviar" está desactualizada: pega el código nuevo en Supabase (guía, paso 2).');
      throw new Error((data && data.error) || 'No se pudo crear la cuenta');
    }
    return data;
  }

  // Traduce los errores de la función "enviar" a algo accionable.
  async function errorFuncion(error) {
    let status = 0, det = '';
    try {
      const r = error.context;
      if (r && typeof r.status === 'number') status = r.status;
      if (r && r.text) { const t = await r.text(); try { const j = JSON.parse(t); det = j.error || j.message || j.msg || t; } catch (e) { det = t; } }
    } catch (e) { /* sin detalle */ }
    det = String(det || '').slice(0, 160);
    if (error.name === 'FunctionsFetchError') return 'No se pudo conectar con la función "enviar": revisa que esté desplegada en Supabase (Edge Functions).';
    if (status === 404) return 'La función "enviar" no existe en Supabase. Créala con el código de la guía (paso 2).';
    if (status === 401) return 'Supabase rechazó la llamada (401). En la función "enviar" apaga "Verify JWT" o vuelve a iniciar sesión.';
    if (status >= 500) return 'La función "enviar" falló al iniciar' + (det ? ': ' + det : '') + '. Vuelve a pegar el código completo de la guía (paso 2).';
    return 'Error de la función "enviar"' + (status ? ' (' + status + ')' : '') + (det ? ': ' + det : '');
  }

  // Prueba la conexión con la función del servidor.
  async function probarServidor() {
    const { data, error } = await sb.functions.invoke('enviar', { body: { accion: 'ping' } });
    if (error) throw new Error(await errorFuncion(error));
    if (!data || !data.version) throw new Error('La función "enviar" responde, pero es una versión antigua. Pega el código nuevo (guía, paso 2).');
    return data;
  }

  // Contraseña fácil de dictar: 3 letras + 4 números + 2 letras.
  function claveAleatoria() {
    const L = 'abcdefghjkmnpqrstuvwxyz', r = crypto.getRandomValues(new Uint32Array(9));
    const l = (i) => L[r[i] % L.length], n = (i) => String(r[i] % 10);
    return l(0).toUpperCase() + l(1) + l(2) + n(3) + n(4) + n(5) + n(6) + l(7) + l(8);
  }

  // Mensaje con los datos de acceso para enviar por WhatsApp.
  function mensajeAcceso(d) {
    return 'Hola ' + d.nombre + ' 👋\nTe creamos tu cuenta en ' + (d.tienda || 'FichaPro') + '.\n\n' +
      '📲 Entra aquí e instala la app: ' + rootUrl() + '\n' +
      '👤 Correo: ' + d.email + '\n🔑 Contraseña: ' + d.password + '\n\n' +
      'Te recomendamos cambiar la contraseña en "Mi cuenta" la primera vez que entres.';
  }

  async function redeem(key) {
    const r = await rpc('redeem_license', { p_key: key });
    if (!r.ok) throw new Error(r.error);
    r.account.checkedAt = Date.now();
    writeCache(r.account);
    return r.account;
  }

  function rootUrl() {
    const s = document.querySelector('script[src*="shared/cuenta.js"]');
    return s ? s.src.replace(/shared\/cuenta\.js.*$/, '') : location.origin + '/';
  }

  /* ---------- Push ---------- */
  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
  }

  // Devuelve la suscripción push de este celular (pidiendo permiso si hace falta).
  async function pushSubscription() {
    if (!pushSupported()) {
      throw new Error(/iPhone|iPad/.test(navigator.userAgent)
        ? 'En iPhone primero instala la app: Compartir → Agregar a inicio, y ábrela desde ahí'
        : 'Este navegador no admite notificaciones push');
    }
    const cfgPub = await rpc('public_config');
    if (!cfgPub || !cfgPub.vapid_public) throw new Error('El administrador aún no activó las notificaciones');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Permiso de notificaciones denegado');
    const reg = await navigator.serviceWorker.ready;
    const key = b64ToBytes(cfgPub.vapid_public);
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options && sub.options.applicationServerKey
        ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (!cur || cur.length !== key.length || cur.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return sub.toJSON();
  }

  async function suscripcionActual() {
    if (!pushSupported() || Notification.permission !== 'granted') return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
  }

  // Si este celular ya tiene notificaciones activas, quedan a nombre de la cuenta que tiene la sesión.
  async function syncPush() {
    try {
      const sub = await suscripcionActual();
      if (!sub) return false;
      const s = sub.toJSON();
      await rpc('save_my_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
      return true;
    } catch (e) { return false; }
  }

  async function enablePush() {
    const s = await pushSubscription();
    await rpc('save_my_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
    return true;
  }

  /* ---------- Actualizaciones (con botón) ----------
     Aparece "Hay una versión nueva" cuando el admin la libera (el admin la ve antes para probarla). */
  const mayor = (a, b) => {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  };
  async function revisarActualizacion() {
    const actual = global.Core ? global.Core.version : '';
    let nueva = '';
    try { nueva = String((await (await fetch(rootUrl() + 'version.json', { cache: 'no-store' })).json()).version); } catch (e) { return null; }
    if (!nueva || !mayor(nueva, actual)) return null;
    const ajustes = await settings();
    const liberada = ajustes.version_liberada || '';
    const esAdmin = !!(account && account.is_admin);
    if (!esAdmin && (!liberada || mayor(nueva, liberada))) return null;
    mostrarAviso(actual, nueva, esAdmin && (!liberada || mayor(nueva, liberada)));
    return nueva;
  }
  function mostrarAviso(actual, nueva, soloAdmin) {
    if (document.getElementById('cfxUpd')) return;
    const d = document.createElement('div');
    d.id = 'cfxUpd'; d.className = 'actualizar';
    d.innerHTML = '<div class="grow"><b>🔄 Hay una versión nueva</b><br><span>Tienes la v' + actual + ' · Nueva: v' + nueva +
      (soloAdmin ? ' · al actualizar se libera para todos' : '') + '</span></div><button class="small" type="button">Actualizar</button>';
    d.querySelector('button').onclick = () => actualizarAhora(d.querySelector('button'), soloAdmin ? nueva : null);
    (document.querySelector('main') || document.body).prepend(d);
  }
  // liberar: el admin, al actualizar, deja la versión liberada para todos (y les llega el aviso).
  async function actualizarAhora(btn, liberar) {
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
    if (liberar && account && account.is_admin) {
      try {
        try { await rpc('admin_liberar_version', { p_version: liberar }); }
        catch (e) { await rpc('admin_set_setting', { p_key: 'version_liberada', p_value: liberar }); } // base de datos anterior a la 4.2
        sb.functions.invoke('enviar').catch(() => {});
      } catch (e) { /* sin red: se puede liberar después en Ajustes */ }
    }
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    const sw = reg && (reg.active || reg.waiting || reg.installing);
    if (sw) {
      await new Promise((ok) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = ok;
        sw.postMessage({ tipo: 'actualizar' }, [ch.port2]);
        setTimeout(ok, 30000);
      });
    }
    location.reload();
  }

  /* ---------- v5.0: barra de abajo por perfil y atajos del encabezado ---------- */
  const ICO = (n) => (global.Core && global.Core.ico ? global.Core.ico(n) : '');
  function nav(activo) {
    const a = account;
    if (!a || a.is_admin) return;
    const r = rootUrl();
    const items = a.role === 'client'
      ? [['tienda', 'bolsa', 'Tienda', 'apps/catalogo/'], ['pedidos', 'paquete', 'Pedidos', 'apps/catalogo/?v=pedidos'],
         ['chat', 'chat', 'Chat', 'apps/mensajes/'], ['contactos', 'contactos', 'Contactos', 'apps/contactos/'], ['cuenta', 'usuarios', 'Cuenta', '#cuenta']]
      : a.role === 'equipo'
        ? [['hoy', 'grafico', 'Hoy', ''], ['caja', 'caja', 'Caja', 'apps/caja/'], ['pedidos', 'paquete', 'Pedidos', 'apps/pedidos/'], ['chat', 'chat', 'Chat', 'apps/mensajes/']]
        : [['hoy', 'grafico', 'Hoy', ''], ['caja', 'caja', 'Caja', 'apps/caja/'], ['pedidos', 'paquete', 'Pedidos', 'apps/pedidos/'],
           ['fichas', 'paleta', 'Fichas', 'apps/fichas/'], ['mas', 'ajustes', 'Más', '#ajustes']];
    let n = document.querySelector('nav.tabs.abajo');
    if (!n) { n = document.createElement('nav'); n.className = 'tabs abajo'; document.body.appendChild(n); }
    document.body.classList.add('con-nav');
    n.innerHTML = items.map(([k, i, t, u]) => '<a href="' + r + u + '" data-k="' + k + '" class="' + (k === activo ? 'on' : '') + '">' + ICO(i) + t +
      (k === 'chat' || k === 'pedidos' ? '<span class="badge" hidden></span>' : '') + '</a>').join('');
    // Atajos arriba: mensajes (negocio) y avisos.
    const h = document.querySelector('header.top');
    if (h && !h.querySelector('.atajos')) {
      const d = document.createElement('div'); d.className = 'atajos';
      d.innerHTML = (a.role === 'client' ? '' : '<a href="' + r + 'apps/mensajes/" aria-label="Mensajes">💬<span class="badge" hidden id="atMsg"></span></a>') +
        '<a href="' + r + (a.role === 'client' ? '#cuenta' : '') + '#avisos" aria-label="Avisos">🔔</a>';
      h.appendChild(d);
    }
    contar();
  }
  async function contar() {
    if (!sb || !account) return;
    try {
      const { data } = await sb.rpc('chat_list');
      const m = (data || []).reduce((s, c) => s + (c.no_leidos || 0), 0);
      document.querySelectorAll('nav.tabs.abajo [data-k=chat] .badge, #atMsg').forEach((b) => { b.textContent = m; b.hidden = !m; });
    } catch (e) { /* sin red */ }
    if (account.role !== 'client') {
      try {
        const { data } = await sb.rpc('hoy_negocio');
        const p = data ? data.revisar + data.activos : 0;
        document.querySelectorAll('nav.tabs.abajo [data-k=pedidos] .badge').forEach((b) => { b.textContent = p; b.hidden = !p; });
      } catch (e) { /* base anterior */ }
    }
  }
  setInterval(() => { if (!document.hidden && document.querySelector('nav.tabs.abajo')) contar(); }, 60000);

  /* ---------- Pedir activar notificaciones hasta que estén activas:
     cada vez que se abre la app y, mientras sigue abierta, cada 1 hora. ---------- */
  const PUSH_CADA = 36e5; // 1 hora
  let pushTimer = null;
  async function ofrecerPush() {
    try {
      if (!pushSupported() || !account) return;
      if (!pushTimer) pushTimer = setInterval(() => { if (!document.hidden) ofrecerPush(); }, 6e4);
      if (Notification.permission === 'granted' && await suscripcionActual()) return;
      const k = 'cfx:pushPedido', t = +localStorage.getItem(k) || 0;
      // Al abrir la app (primera pantalla de esta sesión) se muestra siempre; después, una vez por hora.
      let inicio = false;
      try { inicio = !sessionStorage.getItem('cfx:pushSesion'); sessionStorage.setItem('cfx:pushSesion', '1'); } catch (e) { inicio = false; }
      if (!inicio && Date.now() - t < PUSH_CADA) return;
      if (document.getElementById('cfxPush')) return;
      localStorage.setItem(k, String(Date.now()));
      const d = document.createElement('div');
      d.className = 'hoja'; d.id = 'cfxPush';
      const negado = Notification.permission === 'denied';
      d.innerHTML = '<div><span style="font-size:28px">🔔</span><div class="grow"><b>Activa las notificaciones</b><br>' +
        (negado ? 'Están bloqueadas: actívalas en los ajustes del navegador (candado junto a la dirección).' : 'Es muy importante: así te enteras al tiro de pedidos, pagos y mensajes.') +
        '</div>' + (negado ? '' : '<button class="small" type="button">Activar</button>') + '<button class="small alt" type="button" aria-label="Ahora no">✕</button></div>';
      const bs = d.querySelectorAll('button');
      bs[bs.length - 1].onclick = () => d.remove();
      if (!negado) bs[0].onclick = async () => {
        try { await enablePush(); d.remove(); if (global.Core) global.Core.toast('✅ Notificaciones activadas'); }
        catch (e) { if (global.Core) global.Core.toast(e.message); }
      };
      document.body.appendChild(d);
    } catch (e) { /* sin soporte */ }
  }

  global.Cuenta = {
    nav, contar, ofrecerPush,
    configured, sb, refresh, require, settings, signIn, crearUsuario, probarServidor, claveAleatoria, mensajeAcceso, signUp, signOut, resetPassword, setPassword, redeem, rpc,
    enablePush, syncPush, pushSubscription, pushSupported, friendly, revisarActualizacion, actualizarAhora, aplicarLogo,
    get account() { return account; },
    isPro: () => !!(account && account.is_pro),
    isAdmin: () => !!(account && account.is_admin),
    isClient: () => !!(account && account.role === 'client'),
    uid: () => account && account.id
  };
})(window);
