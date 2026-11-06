/* CodeFix · Núcleo · Verificación humana con Cloudflare Turnstile (mismo archivo en cada repositorio).
   Va en el <head>, antes que todo: así alcanza a revisar el ingreso y la creación de cuentas de cualquier app sin tocar su código.
   Si el administrador guardó la "site key" (Centro de Mando → Control → Humano), antes de entrar, crear una cuenta, recuperar la contraseña
   o pedir un enlace aparece "Confirma que no eres un robot" y el token viaja a Supabase (gotrue_meta_security.captcha_token).
   Si además guardó la secret key, las compras sin cuenta (INVITADO) llevan el token en p_humano y la base lo revisa con Cloudflare.
   Sin site key no hace nada.
   Para que Supabase lo exija: Authentication → Attack Protection → CAPTCHA (Turnstile) con la "secret key". */
// Sesión vinculada: el Centro de Mando abre el panel de esta app con ?cfx-entrar=… (una sesión propia, de un solo uso)
// y queda iniciada sin escribir la contraseña. Se guarda antes de que la app cree su conexión y se borra de la dirección.
(function () {
  try {
    const q = new URLSearchParams(location.search), v = q.get('cfx-entrar');
    if (!v) return;
    q.delete('cfx-entrar');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    const d = JSON.parse(decodeURIComponent(escape(atob(v.replace(/-/g, '+').replace(/_/g, '/')))));
    if (!/^[a-z]{2,6}-auth$/.test(d.k) || !d.rt) return;
    localStorage.setItem(d.k, JSON.stringify({ access_token: d.at || 'x', refresh_token: d.rt, token_type: 'bearer', expires_in: 0, expires_at: 1, user: d.u || null }));
  } catch (e) { /* link dañado: entra normal */ }
})();
(function () {
  'use strict';
  if (window.CFX_HUMANO || !window.fetch) return;
  const original = window.fetch.bind(window), claves = {};
  // Funciones sin cuenta que reciben p_humano (la app debe aceptarlo en su SQL antes de sumarla aquí).
  const INVITADO = /\/rest\/v1\/rpc\/(crear_pedido_invitado)$/;
  const AUTH = /\/auth\/v1\/(token\?grant_type=password|signup|recover|otp|resend)/;
  // Site key de cada proyecto (se pregunta una vez por página a cfx_humano, función pública de la app).
  function config(origen, apikey) {
    if (!claves[origen]) {
      claves[origen] = original(origen + '/rest/v1/rpc/cfx_humano', { method: 'POST', body: '{}',
        headers: { apikey: apikey || '', Authorization: 'Bearer ' + (apikey || ''), 'Content-Type': 'application/json' } })
        .then((r) => (r.ok ? r.json() : null)).then((j) => j || {}).catch(() => ({}));
    }
    return claves[origen];
  }
  const siteKey = (origen, apikey) => config(origen, apikey).then((j) => j.site_key || '');
  function cargar() {
    if (window.turnstile) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
      s.onload = () => ok(); s.onerror = () => mal(new Error('No se pudo cargar la verificación. Revisa tu internet.'));
      document.head.appendChild(s);
    });
  }
  async function token(clave) {
    await cargar();
    return new Promise((ok, mal) => {
      const d = document.createElement('dialog');
      d.className = 'cfx-pago';
      d.innerHTML = '<div style="text-align:center"><h2>Verificación rápida</h2><p>Confirma que no eres un robot.</p><div data-ts style="display:flex;justify-content:center;min-height:70px"></div>' +
        '<button type="button" data-x style="width:100%;margin-top:10px">Cancelar</button></div>';
      document.body.appendChild(d); d.showModal();
      const fin = (f, v) => { try { d.close(); } catch (e) { /* nada */ } d.remove(); f(v); };
      d.querySelector('[data-x]').onclick = () => fin(mal, new Error('Verificación cancelada'));
      window.turnstile.render(d.querySelector('[data-ts]'), {
        sitekey: clave, language: 'es',
        callback: (t) => fin(ok, t),
        'error-callback': () => fin(mal, new Error('No pudimos verificar. Intenta de nuevo.'))
      });
    });
  }
  window.fetch = async function (entrada, init) {
    const url = typeof entrada === 'string' ? entrada : entrada && entrada.url;
    const auth = url && AUTH.test(url), inv = url && !auth && INVITADO.test(url.split('?')[0]);
    if ((auth || inv) && init && typeof init.body === 'string') {
      const u = new URL(url, location.href), h = new Headers(init.headers || {});
      const c = await config(u.origin, h.get('apikey'));
      if (c.site_key && (auth || c.invitados)) {
        const b = JSON.parse(init.body), t = await token(c.site_key);
        if (auth) b.gotrue_meta_security = Object.assign({}, b.gotrue_meta_security, { captcha_token: t });
        else b.p_humano = t;
        init = Object.assign({}, init, { body: JSON.stringify(b) });
      }
    }
    return original(entrada, init);
  };
  window.CFX_HUMANO = { token, siteKey };
})();
