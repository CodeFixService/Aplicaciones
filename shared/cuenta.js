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
    if (global.Core) global.Core.tema.usar(acc.id);
    return acc;
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
    if ((opts && opts.admin && !a.is_admin) || (opts && opts.empresa && a.role === 'client')) {
      location.replace(rootPath);
      return new Promise(() => {});
    }
    return a;
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendly(error));
    return refresh();
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
    try { await sb.auth.signOut(); } catch (e) { /* sin red */ }
    writeCache(null);
  }

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw new Error(friendly(error));
    return data;
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

  async function enablePush() {
    const s = await pushSubscription();
    await rpc('save_my_push', { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth });
    return true;
  }

  global.Cuenta = {
    configured, sb, refresh, require, settings, signIn, signUp, signOut, resetPassword, setPassword, redeem, rpc,
    enablePush, pushSubscription, pushSupported, friendly,
    get account() { return account; },
    isPro: () => !!(account && account.is_pro),
    isAdmin: () => !!(account && account.is_admin),
    isClient: () => !!(account && account.role === 'client'),
    uid: () => account && account.id
  };
})(window);
