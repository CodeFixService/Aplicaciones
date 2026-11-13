// CodeFix · Núcleo · G32 d · 🔑 Entrar con QR (no editar en cada app: se copia de saas/nucleo con sincronizar.py).
// Computador sin sesión: muestra un QR y un código de 6 letras. El celular con sesión lo escanea (o escribe el código),
// confirma "¿Entrar en el computador?" → Sí, y el computador entra solo. La clave de servidor queda en la Edge Function.
// La app llama:
//   CFX_QR.iniciar({ sb, funcion: 'enviar', qrLib: 'shared/vendor/qrcode.js', alEntrar })  // una vez
//   CFX_QR.pc(el)        → en la pantalla de ingreso (solo se ve en computador)
//   CFX_QR.revisar()     → con sesión: si la dirección trae ?qr=, pregunta "¿Entrar en el computador?"
//   CFX_QR.celular()     → menú "💻 Entrar en un computador" (escanear o escribir el código)
(function () {
  'use strict';
  let O = null, vuelta = 0;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rpc = async (f, a) => { const { data, error } = await O.sb.rpc(f, a || {}); if (error) throw new Error(error.message); return data; };
  const esPC = () => matchMedia('(pointer:fine) and (min-width:700px)').matches;
  const formato = (c) => String(c || '').replace(/^(...)(...)$/, '$1-$2');

  function css() {
    if (document.getElementById('cfx-qr-css')) return;
    const s = document.createElement('style'); s.id = 'cfx-qr-css';
    s.textContent = '.cfx-qr{text-align:center;border:1px solid var(--cfx-borde,#e2e7ec);border-radius:14px;padding:14px;margin:0 0 14px;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#0f172a)}' +
      '.cfx-qr h3{margin:0 0 4px;font-size:16px}.cfx-qr p{margin:4px 0;font-size:14px;color:var(--cfx-texto-2,#5b6472)}' +
      '.cfx-qr canvas{width:180px;height:180px;max-width:100%;border-radius:10px;background:#fff;margin:8px auto 4px;display:block}' +
      '.cfx-qr .cq-cod{font:700 20px/1.2 ui-monospace,monospace;letter-spacing:3px;color:var(--cfx-texto,#0f172a)}' +
      '.cfx-qr .cq-ok{color:#16a34a;font-weight:700}.cfx-qr button{margin-top:8px}' +
      'dialog.cfx-qrd{border:0;border-radius:16px;padding:0;max-width:min(380px,calc(100vw - 32px));width:100%;background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#0f172a);box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
      'dialog.cfx-qrd::backdrop{background:rgba(15,23,42,.55)}dialog.cfx-qrd>div{padding:18px}dialog.cfx-qrd h2{margin:0 0 8px;font-size:19px}' +
      'dialog.cfx-qrd p{margin:6px 0;font-size:14.5px;color:var(--cfx-texto-2,#5b6472)}dialog.cfx-qrd .cq-eq{font-weight:700;color:var(--cfx-texto,#0f172a)}' +
      'dialog.cfx-qrd input{width:100%;box-sizing:border-box;font:700 22px ui-monospace,monospace;letter-spacing:4px;text-transform:uppercase;text-align:center;padding:10px;border:1px solid var(--cfx-borde,#cbd5e1);border-radius:10px;background:var(--cfx-campo,#fff);color:inherit}' +
      'dialog.cfx-qrd video{width:100%;border-radius:10px;background:#000;margin-top:8px}dialog.cfx-qrd .cq-err{color:var(--cfx-mal,#dc2626);min-height:1em}' +
      'dialog.cfx-qrd .cq-pie{display:flex;gap:8px;margin-top:14px}dialog.cfx-qrd .cq-pie button{flex:1}';
    document.head.appendChild(s);
  }
  function dialogo(html) {
    css();
    const d = document.createElement('dialog'); d.className = 'cfx-qrd'; d.innerHTML = '<div>' + html + '</div>';
    document.body.appendChild(d);
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-cerrar]')) d.close(); });
    d.addEventListener('close', () => d.remove());
    return d;
  }
  function equipo() {
    const u = navigator.userAgent;
    const nav = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Navegador';
    const so = /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /CrOS/.test(u) ? 'Chromebook' : /Linux/.test(u) ? 'Linux' : 'computador';
    return nav + ' en ' + so;
  }
  async function libreria() {
    if (window.qrcode) return;
    await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = O.qrLib; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el QR')); document.head.appendChild(s); });
  }
  function lienzo(texto) {
    const q = window.qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 3, k = 6, c = document.createElement('canvas');
    c.width = c.height = k * (n + 2 * m);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) if (q.isDark(r, j)) g.fillRect((j + m) * k, (r + m) * k, k, k);
    return c;
  }
  const enlace = (token) => { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('qr', token); return u.toString(); };

  // ---------- Computador ----------
  async function pc(el) {
    if (!el || !O) return;
    if (!esPC()) {  // celular sin sesión: si llegó por el QR, se le explica qué hacer; si no, nada
      const q = new URLSearchParams(location.search).get('qr');
      el.hidden = !q; if (q) { css(); el.className = 'cfx-qr'; el.innerHTML = '<p>💻 Inicia sesión aquí para dejar entrar al computador.</p>'; }
      return;
    }
    css(); el.hidden = false; el.className = 'cfx-qr';
    const yo = ++vuelta;
    const fin = (html, boton) => {
      el.innerHTML = html + (boton ? '<button type="button" class="alt small" data-cq-otro>🔄 Otro código</button>' : '');
      const b = el.querySelector('[data-cq-otro]'); if (b) b.onclick = () => pc(el);
    };
    el.innerHTML = '<p>Preparando el código…</p>';
    let r;
    try { await libreria(); r = await rpc('cfx_qr_crear', { p_equipo: equipo() }); } catch (e) { return fin('<p>No se pudo crear el código QR. Entra con tu correo y contraseña.</p>', true); }
    if (!r || !r.ok) return fin('<p>' + esc((r && r.error) || 'No se pudo crear el código QR.') + '</p>', true);
    el.innerHTML = '<h3>📱 Entra con tu celular</h3><p>Abre la cámara del celular (con tu sesión iniciada) y apunta aquí.</p>' +
      '<div data-cq-lienzo></div><p>o en el celular: menú → <b>Entrar en un computador</b> y escribe</p><div class="cq-cod">' + esc(formato(r.codigo)) + '</div>' +
      '<p data-cq-t>Vence en 2:00</p>';
    el.querySelector('[data-cq-lienzo]').appendChild(lienzo(enlace(r.token)));
    const hasta = Date.now() + (r.vence || 120) * 1000;
    while (yo === vuelta && el.isConnected) {
      await new Promise((ok) => setTimeout(ok, 2000));
      if (yo !== vuelta || !el.isConnected) return;
      const s = Math.max(0, Math.round((hasta - Date.now()) / 1000)), t = el.querySelector('[data-cq-t]');
      if (t) t.textContent = 'Vence en ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (document.hidden && s > 0) continue;  // pestaña escondida: no gasta consultas
      let e; try { e = await rpc('cfx_qr_estado', { p_token: r.token, p_secreto: r.secreto }); } catch (x) { continue; }
      if (e === 'aprobado') {
        el.innerHTML = '<p class="cq-ok">✅ Aprobado en el celular. Entrando…</p>';
        try {
          const { data, error } = await O.sb.functions.invoke(O.funcion, { body: { accion: 'qr_entrar', token: r.token, secreto: r.secreto } });
          if (error || !data || !data.ok) throw new Error((data && data.error) || 'No se pudo entrar');
          const v = await O.sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
          if (v.error) throw new Error(v.error.message);
          vuelta++;
          if (O.alEntrar) O.alEntrar();
        } catch (x) { fin('<p>' + esc(x.message) + '. Entra con tu correo y contraseña o pide otro código.</p>', true); }
        return;
      }
      if (e === 'vencido' || s === 0) return fin('<p>⌛ El código venció.</p>', true);
    }
  }

  // ---------- Celular ----------
  async function confirmar(codigo) {
    let v;
    try { v = await rpc('cfx_qr_ver', { p: codigo }); } catch (e) { v = { ok: false, error: e.message }; }
    if (!v || !v.ok) { dialogo('<h2>💻 Entrar en un computador</h2><p class="cq-err">' + esc((v && v.error) || 'No se pudo revisar el código.') + '</p><div class="cq-pie"><button type="button" data-cerrar>Entendido</button></div>'); return false; }
    return new Promise((listo) => {
      const d = dialogo('<h2>¿Entrar en el computador?</h2><p>Se abrirá tu cuenta en <span class="cq-eq">' + esc(v.equipo) + '</span>.</p>' +
        '<p>⚠️ Solo si ese computador está frente a ti. Si alguien te mandó este código, toca <b>No</b>.</p><p class="cq-err"></p>' +
        '<div class="cq-pie"><button type="button" class="alt" data-cerrar>No</button><button type="button" data-si>Sí, entrar</button></div>');
      let ok = false;
      d.addEventListener('close', () => listo(ok));
      d.querySelector('[data-si]').onclick = async (ev) => {
        ev.target.disabled = true;
        let r; try { r = await rpc('cfx_qr_aprobar', { p: codigo }); } catch (e) { r = { ok: false, error: e.message }; }
        if (!r || !r.ok) { d.querySelector('.cq-err').textContent = (r && r.error) || 'No se pudo aprobar.'; ev.target.disabled = false; return; }
        ok = true;
        d.firstChild.innerHTML = '<h2>✅ Listo</h2><p>El computador está entrando a tu cuenta. Para salir de ahí, usa Cerrar sesión en el computador.</p><div class="cq-pie"><button type="button" data-cerrar>Entendido</button></div>';
      };
    });
  }
  // Con sesión: ?qr=<token> en la dirección (el celular escaneó el QR con la cámara).
  async function revisar() {
    const u = new URL(location.href), t = u.searchParams.get('qr');
    if (!t || !O) return false;
    u.searchParams.delete('qr'); history.replaceState(null, '', u.pathname + u.search + u.hash);
    return confirmar(t);
  }
  function celular() {
    const cam = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const d = dialogo('<h2>💻 Entrar en un computador</h2><p>1. En el computador abre esta app: verás un QR y un código.</p>' +
      '<p>2. Escanea el QR con la cámara del celular, o escribe aquí el código:</p>' +
      '<input data-cod maxlength="7" autocomplete="off" autocapitalize="characters" placeholder="ABC-123" aria-label="Código del computador">' +
      (cam ? '<button type="button" class="alt" data-cam style="width:100%;margin-top:8px">📷 Escanear el QR</button><video data-vid playsinline muted hidden></video>' : '') +
      '<p class="cq-err"></p><div class="cq-pie"><button type="button" class="alt" data-cerrar>Cancelar</button><button type="button" data-seguir>Continuar</button></div>');
    let flujo = null;
    const parar = () => { if (flujo) flujo.getTracks().forEach((x) => x.stop()); flujo = null; };
    d.addEventListener('close', parar);
    const seguir = (c) => { parar(); d.close(); confirmar(c); };
    d.querySelector('[data-seguir]').onclick = () => {
      const c = d.querySelector('[data-cod]').value.replace(/[^A-Za-z0-9]/g, '');
      if (c.length !== 6) { d.querySelector('.cq-err').textContent = 'El código tiene 6 letras o números.'; return; }
      seguir(c);
    };
    d.querySelector('[data-cod]').onkeydown = (e) => { if (e.key === 'Enter') d.querySelector('[data-seguir]').click(); };
    const b = d.querySelector('[data-cam]');
    if (b) b.onclick = async () => {
      const vid = d.querySelector('[data-vid]');
      try { flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { d.querySelector('.cq-err').textContent = 'Sin permiso para la cámara. Escribe el código.'; return; }
      vid.hidden = false; vid.srcObject = flujo; await vid.play().catch(() => {});
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      while (flujo && d.open) {
        try {
          const [x] = await det.detect(vid);
          const t = x && /[?&]qr=([a-f0-9]{20,60})/.exec(x.rawValue || '');
          if (t) return seguir(t[1]);
        } catch (e) { /* cuadro sin QR */ }
        await new Promise((ok) => setTimeout(ok, 300));
      }
    };
  }

  window.CFX_QR = {
    iniciar(o) { O = Object.assign({ funcion: 'enviar', qrLib: 'shared/vendor/qrcode.js' }, o); },
    listo: () => !!O, pc, revisar, celular, confirmar
  };
})();
