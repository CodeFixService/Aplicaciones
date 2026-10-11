(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sb = Cuenta.sb;
  Core.registerSW('../../');
  Core.marca();
  await Cuenta.require('../../', { admin: true });

  const fecha = (t) => t ? new Date(t).toLocaleDateString('es') : '';
  const fechaHora = (t) => t ? new Date(t).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(Cuenta.friendly(error));
    return data;
  }
  const fallo = (e) => Core.toast(e.message || String(e));

  /* ---------- Navegación ---------- */
  const loaders = { resumen: cargarResumen, licencias: cargarLicencias, usuarios: cargarUsuarios, avisos: cargarAvisos, ajustes: cargarAjustes };
  document.querySelectorAll('nav.tabs button').forEach((b) => { b.onclick = () => show(b.dataset.v); });
  function show(v) {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    scrollTo(0, 0);
    loaders[v]().catch(fallo);
  }

  /* ---------- Resumen ---------- */
  async function cargarResumen() {
    const s = await Cuenta.rpc('admin_stats');
    const item = (t, v) => '<div class="card"><span class="muted">' + t + '</span><b>' + v + '</b></div>';
    $('stats').innerHTML = item('Empresas', s.empresas) + item('Clientes', s.clientes) + item('Pro / Premium activos', s.pro) +
      item('Solicitudes pendientes', s.pendientes) + item('Reportes abiertos', s.reportes) +
      item('Keys canjeadas', s.canjeadas + ' / ' + s.licencias) + item('Ingresos por keys', Core.money(s.ingresos)) +
      item('Suscriptores por enlace', s.suscriptores) + item('Celulares con push', s.dispositivos);
    await Promise.all([cargarSolicitudes(), cargarReportes()]);
  }

  /* ---------- Solicitudes (prueba 7 días / pago) ---------- */
  let solicitudes = [];
  async function cargarSolicitudes() {
    const [reqs, users] = await Promise.all([
      q(sb.from('requests').select('*').eq('status', 'pending').order('created_at', { ascending: true })),
      q(sb.from('profiles').select('id,email,empresa,role'))
    ]);
    solicitudes = reqs;
    perfiles = Object.fromEntries(users.map((u) => [u.id, u]));
    $('nSol').textContent = reqs.length;
    $('solicitudes').innerHTML = reqs.length ? reqs.map((r) => {
      const u = perfiles[r.user_id] || {};
      const tipo = r.kind === 'trial' ? '🎁 Prueba 7 días' : '💰 Avisa que pagó';
      return '<li><div class="grow"><b>' + Core.esc(u.empresa || u.email || '') + '</b> <span class="pill">' + (u.role === 'client' ? 'Cliente' : 'Empresa') + '</span>' +
        '<div>' + tipo + '</div><div class="muted">' + Core.esc(u.email || '') + ' · ' + fechaHora(r.created_at) + '</div></div>' +
        '<div class="acc">' + (r.kind === 'trial'
          ? '<button class="ok" data-a="si" data-id="' + r.id + '" data-d="7">Dar 7 días</button>'
          : '<select data-a="pago" data-id="' + r.id + '" aria-label="Activar plan"><option value="">Activar…</option>' +
            '<option value="30">1 mes</option><option value="90">3 meses</option><option value="365">1 año</option><option value="0">Permanente</option></select>') +
        '<button class="danger" data-a="no" data-id="' + r.id + '">Rechazar</button></div></li>';
    }).join('') : '<li class="empty">Nada pendiente 🎉</li>';
  }
  async function resolver(id, aprobar, dias) {
    try {
      await Cuenta.rpc('admin_resolve_request', { p_id: id, p_approve: aprobar, p_days: dias });
      Core.toast(aprobar ? '✅ Activado. Le llegará un aviso.' : 'Solicitud rechazada');
      sb.functions.invoke('enviar').catch(() => {});
      cargarResumen();
    } catch (err) { fallo(err); }
  }
  $('solicitudes').onclick = (e) => {
    const { a, id, d } = e.target.dataset;
    if (a === 'si') resolver(id, true, +d);
    if (a === 'no' && confirm('¿Rechazar esta solicitud?')) resolver(id, false, null);
  };
  $('solicitudes').onchange = (e) => {
    const { a, id } = e.target.dataset;
    if (a !== 'pago' || e.target.value === '') return;
    const dias = +e.target.value;
    resolver(id, true, dias === 0 ? null : dias);
  };

  /* ---------- Reportes ---------- */
  async function cargarReportes() {
    const reps = await q(sb.from('reports').select('*').eq('resolved', false).order('created_at', { ascending: false }));
    $('nRep').textContent = reps.length;
    $('cReportes').classList.toggle('hidden', !reps.length);
    $('reportes').innerHTML = reps.map((r) => {
      const de = perfiles[r.reporter] || {}, a = perfiles[r.reported] || {};
      return '<li><div class="grow"><b>' + Core.esc(a.empresa || a.email || 'Usuario') + '</b> reportado por ' + Core.esc(de.empresa || de.email || '') +
        '<div class="muted">Motivo: ' + Core.esc(r.reason) + '</div><div class="muted">“' + Core.esc(r.excerpt || '') + '”</div></div>' +
        '<div class="acc"><button class="alt" data-a="ok" data-id="' + r.id + '">Descartar</button>' +
        '<button class="danger" data-a="susp" data-id="' + r.id + '">Suspender</button></div></li>';
    }).join('');
  }
  $('reportes').onclick = async (e) => {
    const { a, id } = e.target.dataset;
    if (!a) return;
    if (a === 'susp' && !confirm('¿Suspender la cuenta reportada?')) return;
    try { await Cuenta.rpc('admin_resolve_report', { p_id: id, p_suspend: a === 'susp' }); Core.toast('Listo'); cargarResumen(); }
    catch (err) { fallo(err); }
  };

  /* ---------- Invitar ---------- */
  const appLink = Core.rootUrl();
  const invitacion = '📲 Te invito a la app de ' + (window.CFX_CONFIG.MARCA || 'CodeFix') + ' (FichaPro y Caja Rápida).\n\n' +
    '1. Abre este enlace en Chrome (Android) o Safari (iPhone):\n' + appLink + '\n' +
    '2. Toca "Instalar" (en iPhone: Compartir → Agregar a inicio).\n' +
    '3. Ingresa con el correo y la contraseña que te enviamos, y activa las notificaciones.';
  function qrGrande(text, px) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 4, c = document.createElement('canvas'), k = Math.floor(px / (n + 2 * m));
    c.width = c.height = k * (n + 2 * m);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) if (q.isDark(r, j)) g.fillRect((j + m) * k, (r + m) * k, k, k);
    return c;
  }
  $('appLink').value = appLink;
  $('appQr').src = qrGrande(appLink, 400).toDataURL();
  $('bInvWA').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(invitacion), '_blank');
  $('bInvShare').onclick = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'App CodeFix', text: invitacion }); } catch (e) { /* cancelado */ } }
    else $('bInvWA').onclick();
  };
  $('bInvQr').onclick = () => qrGrande(appLink, 1000).toBlob((b) => Core.download('qr-app-codefix.png', b));
  $('bInvCopy').onclick = () => navigator.clipboard.writeText(invitacion).then(() => Core.toast('Mensaje copiado'));

  /* ---------- Licencias ---------- */
  let licencias = [], perfiles = {};
  async function cargarLicencias() {
    const [lic, users] = await Promise.all([
      q(sb.from('licenses').select('*').order('created_at', { ascending: false })),
      q(sb.from('profiles').select('id,email,empresa'))
    ]);
    licencias = lic;
    perfiles = Object.fromEntries(users.map((u) => [u.id, u]));
    pintarLicencias();
  }
  $('lBuscar').oninput = pintarLicencias;
  function pintarLicencias() {
    const t = $('lBuscar').value.toLowerCase();
    const list = licencias.filter((l) => !t || (l.empresa + l.key + (l.note || '')).toLowerCase().includes(t));
    $('licencias').innerHTML = list.length ? list.map((l) => {
      const u = l.redeemed_by && perfiles[l.redeemed_by];
      const estado = l.revoked ? '<span class="pill st-failed">Revocada</span>'
        : l.redeemed_by ? '<span class="pill st-sent">Canjeada</span>' : '<span class="pill st-scheduled">Libre</span>';
      return '<li><div class="grow"><b>' + Core.esc(l.empresa) + '</b> ' + estado +
        '<div class="muted"><code>' + l.key + '</code></div>' +
        '<div class="muted">' + (l.months ? l.months + ' mes(es)' : 'Permanente') +
        (l.price != null ? ' · ' + Core.money(l.price) : '') + ' · ' + fecha(l.created_at) +
        (u ? ' · ' + Core.esc(u.email) : '') + (l.note ? ' · ' + Core.esc(l.note) : '') + '</div></div>' +
        (l.revoked ? '' : '<button class="small alt" data-a="share" data-id="' + l.id + '">Enviar</button>' +
          '<button class="small danger" data-a="rev" data-id="' + l.id + '">Revocar</button>') + '</li>';
    }).join('') : '<li class="empty">Sin keys todavía</li>';
  }
  $('licencias').onclick = async (e) => {
    const { a, id } = e.target.dataset;
    const l = licencias.find((x) => x.id === id);
    if (!a || !l) return;
    if (a === 'share') mostrarNueva(l);
    if (a === 'rev' && confirm('¿Revocar la key de ' + l.empresa + '? Si ya la usó, su cuenta vuelve a Free.')) {
      try { await Cuenta.rpc('admin_revoke_license', { p_id: id }); Core.toast('Key revocada'); cargarLicencias(); }
      catch (err) { fallo(err); }
    }
  };

  $('bCrear').onclick = async () => {
    const empresa = $('lEmpresa').value.trim();
    if (!empresa) return Core.toast('Escribe la empresa');
    $('bCrear').disabled = true;
    try {
      const lic = await Cuenta.rpc('admin_create_license', {
        p_empresa: empresa,
        p_months: $('lMeses').value ? parseInt($('lMeses').value, 10) : null,
        p_price: parseFloat(($('lPrecio').value || '').replace(',', '.')) || null,
        p_note: $('lNota').value.trim() || null
      });
      mostrarNueva(lic);
      $('lEmpresa').value = ''; $('lPrecio').value = ''; $('lNota').value = '';
      cargarLicencias();
    } catch (err) { fallo(err); } finally { $('bCrear').disabled = false; }
  };

  let nueva;
  function mensajeKey(l) {
    const app = Core.rootUrl();
    return 'Hola 👋 Gracias por comprar la versión Pro de ' + (window.CFX_CONFIG.MARCA || 'CodeFix') + '.\n\n' +
      '1. Entra a ' + app + ' e inicia sesión (o crea tu cuenta).\n' +
      '2. En "Activar versión Pro" pega esta key:\n\n' + l.key + '\n\n' +
      (l.months ? 'Válida por ' + l.months + ' mes(es) desde que la actives.' : 'Licencia permanente.') +
      '\nEs personal: solo funciona en una cuenta.';
  }
  function mostrarNueva(l) {
    nueva = l;
    $('lnEmpresa').textContent = l.empresa;
    $('lnKey').textContent = l.key;
    $('lNueva').classList.remove('hidden');
    show('licencias');
    $('lNueva').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('lnWA').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(mensajeKey(nueva)), '_blank');
  $('lnMail').onclick = () => {
    location.href = 'mailto:?subject=' + encodeURIComponent('Tu key Pro') + '&body=' + encodeURIComponent(mensajeKey(nueva));
  };
  $('lnCopy').onclick = () => navigator.clipboard.writeText(mensajeKey(nueva)).then(() => Core.toast('Copiado'));

  /* ---------- Crear usuario ---------- */
  $('nTipo').onchange = () => {
    const cli = $('nTipo').value === 'client';
    $('rowNEmp').classList.toggle('hidden', !cli);
    $('lblNNombre').textContent = cli ? 'Nombre del cliente' : 'Nombre de la empresa';
    if (cli) llenarEmpresas();
  };
  async function llenarEmpresas() {
    if (!usuarios.length) usuarios = await q(sb.from('profiles').select('*').order('created_at', { ascending: false }));
    const emp = usuarios.filter((u) => u.role === 'user');
    $('nEmpresa').innerHTML = emp.length ? emp.map((u) => '<option value="' + u.id + '">' + Core.esc(u.empresa || u.email) + '</option>').join('')
      : '<option value="">Primero crea una empresa</option>';
  }
  $('nGen').onclick = () => { $('nClave').value = Cuenta.claveAleatoria(); };
  let ultimoAcceso = '';
  $('bNuevo').onclick = async () => {
    $('nErr').textContent = '';
    if (!$('nClave').value) $('nClave').value = Cuenta.claveAleatoria();
    const tipo = $('nTipo').value;
    const d = { tipo, nombre: $('nNombre').value.trim(), email: $('nEmail').value.trim(), password: $('nClave').value,
      negocio: tipo === 'client' ? $('nEmpresa').value : null };
    if (!d.nombre || !d.email) { $('nErr').textContent = 'Escribe el nombre y el correo'; return; }
    $('bNuevo').disabled = true;
    try {
      await Cuenta.crearUsuario(d);
      const emp = tipo === 'client' ? usuarios.find((u) => u.id === d.negocio) : null;
      ultimoAcceso = Cuenta.mensajeAcceso(Object.assign({ tienda: emp ? (emp.empresa || 'tu tienda') : 'CodeFix Apps' }, d));
      $('nCred').textContent = ultimoAcceso;
      $('nCred').classList.remove('hidden'); $('nCredBtns').classList.remove('hidden');
      $('nNombre').value = ''; $('nEmail').value = ''; $('nClave').value = '';
      Core.toast('✅ Cuenta creada');
      cargarUsuarios();
    } catch (err) { $('nErr').textContent = err.message; } finally { $('bNuevo').disabled = false; }
  };
  $('nWsp').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(ultimoAcceso), '_blank');
  $('nCopiar').onclick = () => navigator.clipboard.writeText(ultimoAcceso).then(() => Core.toast('Copiado'));

  /* ---------- Usuarios ---------- */
  let usuarios = [];
  async function cargarUsuarios() {
    usuarios = await q(sb.from('profiles').select('*').order('created_at', { ascending: false }));
    pintarUsuarios();
  }
  $('uBuscar').oninput = pintarUsuarios;
  $('uTipo').onchange = pintarUsuarios;
  $('uEmpresa').onchange = () => { if ($('uEmpresa').value) $('uTipo').value = 'client'; pintarUsuarios(); };
  const proActivo = (u) => u.role === 'admin' || (u.plan === 'pro' && (!u.pro_until || new Date(u.pro_until) > new Date()));
  function pintarUsuarios() {
    const t = $('uBuscar').value.toLowerCase(), tipo = $('uTipo').value, emp = $('uEmpresa').value;
    const empresas = usuarios.filter((u) => u.role === 'user');
    const sel = $('uEmpresa').value;
    $('uEmpresa').innerHTML = '<option value="">Todas las empresas</option>' + empresas.map((u) =>
      '<option value="' + u.id + '"' + (u.id === sel ? ' selected' : '') + '>' + Core.esc(u.empresa || u.email) + ' (' +
      usuarios.filter((c) => c.negocio_id === u.id).length + ')</option>').join('');
    const nombreDe = (id) => { const x = usuarios.find((u) => u.id === id); return x ? (x.empresa || x.email) : '—'; };
    const list = usuarios.filter((u) => (!t || (u.email + u.empresa).toLowerCase().includes(t)) &&
      (!tipo || u.role === tipo || (tipo === 'user' && u.role === 'admin')) && (!emp || u.negocio_id === emp));
    $('uCuenta').textContent = list.length + ' cuenta(s)';
    $('usuarios').innerHTML = list.length ? list.map((u) => {
      const pro = proActivo(u);
      const pill = (u.role === 'client' ? '<span class="pill">Cliente</span> ' : '') + (u.role === 'admin' ? '<span class="pill admin">ADMIN</span>'
        : u.suspended ? '<span class="pill st-failed">Suspendido</span>'
        : pro ? '<span class="pill pro">' + (u.role === 'client' ? 'PREMIUM' : 'PRO') + '</span>' : '<span class="pill">FREE</span>');
      const acciones = u.role === 'admin' ? '' :
        '<select class="small" data-id="' + u.id + '" style="width:auto">' +
        '<option value="">Acción…</option>' + (u.role === 'client' ? '' : '<option value="msg">💬 Enviar mensaje</option>') + '<option value="pro7">Dar Pro 7 días</option>' +
        '<option value="pro1">Dar Pro 1 mes</option><option value="pro12">Dar Pro 1 año</option>' +
        '<option value="proinf">Dar Pro permanente</option><option value="free">Pasar a Free</option>' +
        '<option value="' + (u.suspended ? 'unsusp">Reactivar' : 'susp">Suspender') + '</option></select>';
      return '<li><div class="grow"><b>' + Core.esc(u.empresa || '(sin empresa)') + '</b> ' + pill +
        '<div class="muted">' + Core.esc(u.email) + (u.role === 'client' ? ' · cliente de ' + Core.esc(nombreDe(u.negocio_id)) : '') +
        '</div><div class="muted">Desde ' + fecha(u.created_at) +
        (pro && u.pro_until ? ' · Pro hasta ' + fecha(u.pro_until) : '') + '</div></div>' + acciones + '</li>';
    }).join('') : '<li class="empty">Sin usuarios</li>';
  }
  $('usuarios').onchange = async (e) => {
    const id = e.target.dataset.id, acc = e.target.value;
    const u = usuarios.find((x) => x.id === id);
    if (!u || !acc) return;
    if (acc === 'msg') { location.href = '../mensajes/?con=' + id; return; }
    const meses = (m) => { const d = new Date(Math.max(Date.now(), u.pro_until ? +new Date(u.pro_until) : 0)); d.setMonth(d.getMonth() + m); return d.toISOString(); };
    const dias = (n) => new Date(Math.max(Date.now(), u.pro_until ? +new Date(u.pro_until) : 0) + n * 864e5).toISOString();
    const p = { pro7: ['pro', dias(7), u.suspended], pro1: ['pro', meses(1), u.suspended], pro12: ['pro', meses(12), u.suspended], proinf: ['pro', null, u.suspended],
      free: ['free', null, u.suspended], susp: [u.plan, u.pro_until, true], unsusp: [u.plan, u.pro_until, false] }[acc];
    try {
      await Cuenta.rpc('admin_set_plan', { p_user: id, p_plan: p[0], p_until: p[1], p_suspended: p[2] });
      Core.toast('Actualizado');
      cargarUsuarios();
    } catch (err) { fallo(err); e.target.value = ''; }
  };

  /* ---------- Avisos ---------- */
  const PARA = { all_users: 'Todos', all_businesses: 'Empresas', pro_users: 'Empresas Pro', free_users: 'Empresas Free',
    all_clients: 'Clientes', self: 'Prueba', my_subscribers: 'Clientes de la empresa', direct: 'Directo' };
  const ESTADO = { scheduled: 'Programado', sending: 'Enviando', sent: 'Enviado', failed: 'Falló', cancelled: 'Cancelado' };
  $('aCuando').onchange = () => $('aFecha').classList.toggle('hidden', $('aCuando').value !== 'luego');

  $('bAviso').onclick = async () => {
    $('aErr').textContent = '';
    const canales = [$('aPush').checked && 'push', $('aMail').checked && 'email'].filter(Boolean);
    const cuando = $('aCuando').value === 'luego' ? new Date($('aFecha').value) : new Date();
    if (isNaN(cuando)) { $('aErr').textContent = 'Elige fecha y hora'; return; }
    const para = $('aPara').value;
    if (para !== 'self' && !confirm('¿Enviar "' + $('aTitulo').value + '" a ' + PARA[para].toLowerCase() + '?')) return;
    $('bAviso').disabled = true;
    try {
      await Cuenta.rpc('schedule_notification', {
        p_title: $('aTitulo').value, p_body: $('aCuerpo').value, p_url: $('aUrl').value, p_image: null,
        p_audience: para, p_channels: canales, p_send_at: cuando.toISOString()
      });
      $('aTitulo').value = ''; $('aCuerpo').value = ''; $('aUrl').value = '';
      if ($('aCuando').value === 'ya') {
        Core.toast('Enviando…');
        await sb.functions.invoke('enviar').catch(() => {}); // si falla, el envío automático lo hará en 1 minuto
      } else Core.toast('Programado');
      cargarAvisos();
    } catch (err) { $('aErr').textContent = err.message; } finally { $('bAviso').disabled = false; }
  };

  let avisos = [];
  async function cargarAvisos() {
    const [list, users] = await Promise.all([
      q(sb.from('notifications').select('*').neq('audience', 'direct').order('created_at', { ascending: false }).limit(100)),
      q(sb.from('profiles').select('id,email,empresa'))
    ]);
    avisos = list;
    perfiles = Object.fromEntries(users.map((u) => [u.id, u]));
    let vistos = {};
    try {
      const v = await Cuenta.rpc('notification_views', { p_ids: list.filter((n) => n.status === 'sent').map((n) => n.id) });
      vistos = Object.fromEntries(v.map((x) => [x.id, x.vistos]));
    } catch (e) { /* sin red */ }
    $('avisos').innerHTML = list.length ? list.map((n) => {
      const quien = perfiles[n.owner_id];
      const det = n.status === 'sent' || n.status === 'failed'
        ? ' · 🔔 ' + n.push_sent + (n.push_failed ? ' (' + n.push_failed + ' fallidos)' : '') + ' · ✉️ ' + n.email_sent +
          ' · 👁 ' + (vistos[n.id] || 0) + ' vistos' : '';
      return '<li><div class="grow"><b>' + Core.esc(n.title) + '</b> <span class="pill st-' + n.status + '">' + ESTADO[n.status] + '</span>' +
        '<div class="muted">' + PARA[n.audience] + (n.audience === 'my_subscribers' && quien ? ' de ' + Core.esc(quien.empresa || quien.email) : '') +
        ' · ' + n.channels.join('+') + ' · ' + fechaHora(n.sent_at || n.send_at) + det + '</div>' +
        (n.error ? '<div class="err">' + Core.esc(n.error) + '</div>' : '') + '</div>' +
        (n.status === 'scheduled' ? '<button class="small alt" data-id="' + n.id + '">Cancelar</button>' : '') + '</li>';
    }).join('') : '<li class="empty">Sin avisos</li>';
  }
  $('avisos').onclick = async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    try { await Cuenta.rpc('cancel_notification', { p_id: id }); cargarAvisos(); } catch (err) { fallo(err); }
  };

  /* ---------- Ajustes ---------- */
  async function cargarAjustes() {
    const v = await Cuenta.rpc('public_settings');
    $('sLink').value = v.payment_link || ''; $('sPrecioE').value = v.price_business || '';
    $('sPrecioC').value = v.price_client || ''; $('sWsp').value = v.contact_whatsapp || '';
    $('sProbar').classList.toggle('hidden', !v.payment_link);
    if (v.payment_link) $('sProbar').href = v.payment_link;
    const s = await Cuenta.rpc('admin_secret_status');
    $('pushEstado').textContent = s.vapid_public && s.vapid_private ? '✅ Claves push configuradas' : '⚠️ Falta generar las claves push';
    $('bVapid').textContent = s.vapid_public ? 'Regenerar claves push' : 'Generar claves push';
    $('mailEstado').textContent = s.gmail_user && s.gmail_app_password ? '✅ Gmail configurado' : '⚠️ Falta configurar Gmail';
  }

  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  $('bVapid').onclick = async () => {
    const s = await Cuenta.rpc('admin_secret_status').catch(() => ({}));
    if (s.vapid_public && !confirm('Ya hay claves. Si las regeneras, todos deberán reactivar las notificaciones. ¿Seguir?')) return;
    try {
      // Par de claves P-256 generado en tu celular; la privada viaja solo al servidor.
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
      const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
      await Cuenta.rpc('admin_set_secret', { p_name: 'vapid_private', p_value: priv });
      await Cuenta.rpc('admin_set_secret', { p_name: 'vapid_public', p_value: pub });
      Core.toast('Claves push listas');
      cargarAjustes();
    } catch (err) { fallo(err); }
  };

  $('bPing').onclick = async () => {
    $('pingRes').textContent = 'Probando…';
    try {
      const r = await Cuenta.probarServidor();
      $('pingRes').textContent = '✅ Conectado. Versión ' + r.version + (r.servicio ? '' : ' · ⚠️ falta la clave de servidor');
    } catch (err) { $('pingRes').textContent = '❌ ' + err.message; }
  };

  $('bVenta').onclick = async () => {
    try {
      const datos = { payment_link: $('sLink').value.trim(), price_business: $('sPrecioE').value.replace(/\D/g, ''),
        price_client: $('sPrecioC').value.replace(/\D/g, ''), contact_whatsapp: $('sWsp').value.replace(/\D/g, '') };
      for (const k of Object.keys(datos)) await Cuenta.rpc('admin_set_setting', { p_key: k, p_value: datos[k] });
      Core.toast('✅ Guardado: ya se ve en la app de todos');
      cargarAjustes();
    } catch (err) { fallo(err); }
  };

  $('bGmail').onclick = async () => {
    const user = $('gUser').value.trim(), pass = $('gPass').value.replace(/\s/g, ''), nombre = $('gNombre').value.trim();
    if (!/@/.test(user) || pass.length < 16) return Core.toast('Revisa el correo y la contraseña de aplicación (16 letras)');
    try {
      await Cuenta.rpc('admin_set_secret', { p_name: 'gmail_user', p_value: user });
      await Cuenta.rpc('admin_set_secret', { p_name: 'gmail_app_password', p_value: pass });
      if (nombre) await Cuenta.rpc('admin_set_secret', { p_name: 'mail_from_name', p_value: nombre });
      $('gPass').value = '';
      Core.toast('Gmail guardado');
      cargarAjustes();
    } catch (err) { fallo(err); }
  };

  cargarResumen().then(() => {
    if (location.hash === '#solicitudes') $('cSolicitudes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }).catch(fallo);
})();
