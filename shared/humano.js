/* CodeFix · Núcleo · Verificación humana con Cloudflare Turnstile (mismo archivo en cada repositorio).
   Va en el <head>, antes que todo: así alcanza a revisar el ingreso y la creación de cuentas de cualquier app sin tocar su código.
   Si el administrador guardó la "site key" (Centro de Mando → Control → Humano), antes de entrar o crear una cuenta aparece
   "Confirma que no eres un robot" y el token viaja a Supabase (gotrue_meta_security.captcha_token). Sin site key no hace nada.
   Para que Supabase lo exija: Authentication → Attack Protection → CAPTCHA (Turnstile) con la "secret key". */
(function () {
  'use strict';
  if (window.CFX_HUMANO || !window.fetch) return;
  const original = window.fetch.bind(window), claves = {};
  // Site key de cada proyecto (se pregunta una vez por página a cfx_humano, función pública de la app).
  function siteKey(origen, apikey) {
    if (!claves[origen]) {
      claves[origen] = original(origen + '/rest/v1/rpc/cfx_humano', { method: 'POST', body: '{}',
        headers: { apikey: apikey || '', Authorization: 'Bearer ' + (apikey || ''), 'Content-Type': 'application/json' } })
        .then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.site_key) || '').catch(() => '');
    }
    return claves[origen];
  }
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
    if (url && /\/auth\/v1\/(token\?grant_type=password|signup)/.test(url) && init && typeof init.body === 'string') {
      const u = new URL(url, location.href), h = new Headers(init.headers || {});
      const clave = await siteKey(u.origin, h.get('apikey'));
      if (clave) {
        const b = JSON.parse(init.body);
        b.gotrue_meta_security = Object.assign({}, b.gotrue_meta_security, { captcha_token: await token(clave) });
        init = Object.assign({}, init, { body: JSON.stringify(b) });
      }
    }
    return original(entrada, init);
  };
  window.CFX_HUMANO = { token, siteKey };
})();
