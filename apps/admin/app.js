(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sb = Cuenta.sb;
  Core.registerSW('../../');
  Core.marca();
  await Cuenta.require('../../', { admin: true });
  Cuenta.revisarActualizacion();
  // La dirección de la app (Cloudflare): la usa el aviso automático de versión nueva.
  if (location.protocol === 'https:') Cuenta.rpc('admin_set_setting', { p_key: 'app_url', p_value: Core.rootUrl() }).catch(() => {});

  const fecha = (t) => t ? new Date(t).toLocaleDateString('es') : '';
  const fechaHora = (t) => t ? new Date(t).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(Cuenta.friendly(error));
    return data;
  }
  const fallo = (e) => Core.toast(e.message || String(e));
  // Arriba: tu logo en vez del escudo 🛡️ (si aún no lo subes, queda el escudo).
  const pintarLogoArriba = () => $('bInicio').classList.toggle('logo', !!Cuenta.aplicarLogo(Cuenta.account));
  pintarLogoArriba();
  let perfiles = {};
  const DB_VERSION = Core.dbVersion; // una sola fuente: shared/core.js

  /* ---------- Navegación (5 pestañas, como el Taller) ---------- */
  const loaders = { resumen: cargarResumen, negocios: cargarNegocios, clientes: cargarClientes, ajustes: () => verAjuste() };
  document.querySelectorAll('nav.tabs button').forEach((b) => { b.onclick = () => show(b.dataset.v); });
  function show(v, sinCargar) {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    history.replaceState(null, '', '#' + v);
    if (!sinCargar) { scrollTo(0, 0); Promise.resolve(loaders[v]()).catch(fallo); }
  }
  $('bInicio').onclick = (e) => { e.preventDefault(); show('resumen'); };
  const seg = (id, cb) => { $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.classList.toggle('alt', x !== b); }); cb(b); }; };

  /* ---------- Resumen ---------- */
  const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  async function cargarResumen() {
    const r = await Cuenta.rpc('admin_resumen');
    // Aviso solo si la base está MÁS VIEJA que la que espera la app (si es más nueva, la app es la que se pone al día).
    const num = (v) => String(v || '0').split('.').map(Number), vieja = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
    $('cBase').classList.toggle('hidden', !vieja(r.version, DB_VERSION));
    $('baseTxt').textContent = 'La app es la ' + DB_VERSION + ' y la base de datos la ' + r.version + '. Se actualiza sola en máximo 10 minutos (no borra datos).';
    const item = (t, v) => '<div class="card"><span class="muted">' + t + '</span><b>' + v + '</b></div>';
    $('stats').innerHTML = item('🏪 Negocios', r.negocios) + item('⭐ Negocios Pro', r.negocios_pro) + item('🟢 Activos 7 días', r.activos_7d) +
      item('⏳ Vencen en 7 días', r.por_vencer) + item('👥 Clientes', r.clientes) + item('⭐ Clientes Premium', r.clientes_pro) +
      item('🧑‍🍳 Equipo', r.equipo) + item('🛒 Pedidos del mes', r.pedidos_mes) + item('🛒 Pedidos hoy', r.pedidos_hoy) + item('💰 Ingresos del mes', Core.money(r.ingresos_mes));
    const u = r.uso, pct = Math.min(100, Math.round(u.db_bytes * 100 / u.db_limite));
    $('usoPill').textContent = pct >= 90 ? '🔴 ' + pct + '%' : pct >= 70 ? '🟡 ' + pct + '%' : '🟢 ' + pct + '%';
    $('usoBarras').innerHTML = '<div class="uso"><div class="row" style="justify-content:space-between"><span>Base de datos</span><b>' + MB(u.db_bytes) + ' de ' + MB(u.db_limite) +
      '</b></div><div class="barra"><div style="width:' + Math.max(pct, 2) + '%;background:' + (pct >= 90 ? 'var(--bad)' : pct >= 70 ? '#f59e0b' : 'var(--ok)') + '"></div></div></div>';
    $('usoTablas').innerHTML = Object.entries(u.tablas || {}).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([k, v]) => '<tr><td>' + Core.esc(k) + '</td><td class="r">' + MB(v) + '</td></tr>').join('');
    $('usoTxt').textContent = 'Comprobantes guardados: ' + u.comprobantes + ' (' + MB(u.comprobantes_bytes) + '). ' +
      (pct >= 90 ? 'Casi lleno: limpia o pasa a Supabase Pro.' : pct >= 70 ? 'Va subiendo: programa una limpieza.' : 'Todo bien.');
    await Promise.all([cargarPerfiles().then(cargarReportes), cargarIngresos(), cargarActividad()]);
  }
  $('cServidor').onclick = async (e) => {
    const b = e.target.closest('[data-l]');
    if (!b || !confirm(b.dataset.l === 'todo' ? '¿Limpiar todo lo antiguo ahora?' : '¿Limpiar ahora?')) return;
    try { const x = await Cuenta.rpc('admin_limpiar', { p_que: b.dataset.l }); Core.toast('🧹 Borrados: ' + x.comprobantes + ' comprobantes, ' + x.avisos + ' avisos, ' + x.mensajes + ' mensajes, ' + x.pedidos + ' pedidos'); cargarResumen().catch(fallo); }
    catch (err) { fallo(err); }
  };

  /* ---------- 📡 Actividad de empresas (solo el admin la ve) ---------- */
  const dias = (t) => t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null;
  function hace(t) {
    if (!t) return 'nunca';
    const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 6e4));
    return m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.floor(m / 1440) + ' d';
  }
  // 🟢 entró hoy o ayer · 🟡 2 a 7 días · 🔴 más de 7 días o nunca.
  const semaforo = (e) => { const d = dias(e.visto_at); return d == null || d > 7 ? 'rojo' : d >= 2 ? 'amarillo' : 'verde'; };
  const SEM = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };
  let actividad = [], actFiltro = '';
  async function cargarActividad() {
    let hoy;
    try { [actividad, hoy] = await Promise.all([Cuenta.rpc('admin_actividad'), Cuenta.rpc('admin_actividad_hoy')]); }
    catch (e) {
      $('actHoy').textContent = /admin_actividad/.test(e.message) ? '⚠️ Falta actualizar la base de datos a la 4.0 (paso 3 de la guía).' : '⚠️ ' + e.message;
      $('actLista').innerHTML = ''; return;
    }
    const n = { verde: 0, amarillo: 0, rojo: 0 };
    actividad.forEach((e) => { e.sem = semaforo(e); n[e.sem]++; });
    $('actPill').textContent = '🟢 ' + n.verde + ' · 🟡 ' + n.amarillo + ' · 🔴 ' + n.rojo;
    $('actHoy').innerHTML = '<b>Hoy:</b> ' + hoy.empresas + ' empresa(s) activa(s) · ' + hoy.clientes + ' cliente(s) · ' + hoy.productos + ' producto(s) nuevo(s) · ' +
      hoy.fichas + ' ficha(s) · ' + hoy.pedidos + ' pedido(s)';
    pintarActividad();
  }
  function pintarActividad() {
    const l = actividad.filter((e) => !actFiltro || e.sem === actFiltro);
    $('actLista').innerHTML = l.length ? l.map((e) =>
      '<li><span class="sem" title="' + e.sem + '">' + SEM[e.sem] + '</span><div class="grow"><b>' + Core.esc(e.empresa || e.email) + '</b> ' +
      (e.pro ? '<span class="pill pro">PRO</span>' : '<span class="pill">FREE</span>') +
      '<div class="muted">Entró ' + hace(e.visto_at) + ' · ' + (e.push ? '🔔 con notificaciones' : '🔕 sin notificaciones') +
        (e.motivado_at && dias(e.motivado_at) < 1 ? ' · 📣 motivada hoy' : '') + '</div>' +
      '<div class="muted">📦 Último producto: ' + hace(e.ultimo_producto) + ' · 🖼️ Ficha: ' + hace(e.ultima_ficha) + ' · 🛒 Pedido: ' + hace(e.ultimo_pedido) + '</div>' +
      '<div class="muted">' + e.productos + ' productos · ' + e.fichas + ' fichas · ' + e.clientes + ' clientes (' + e.clientes_activos + ' activos) · ' +
        e.pedidos_7d + ' pedidos y ' + e.entradas_7d + ' entradas en 7 días</div></div>' +
      '<div class="acc"><button class="alt" data-ver="' + e.id + '">👁️ Ver</button><button data-mot="' + e.id + '">📣 Motivar</button></div></li>').join('')
      : '<li class="empty">' + (actividad.length ? 'Ninguna en este grupo 🎉' : 'Aún no hay empresas') + '</li>';
  }
  $('actFiltros').onclick = (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    actFiltro = b.dataset.f;
    $('actFiltros').querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.classList.toggle('alt', x !== b); });
    pintarActividad();
  };
  $('actLista').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ver) verEmpresa(b.dataset.ver).catch(fallo);
    if (b.dataset.mot) abrirMotivar(b.dataset.mot);
  };
  $('bLimpiarAct').onclick = async () => {
    if (!confirm('¿Borrar el historial de conexiones? Se mantiene la última vez que entró cada uno.')) return;
    try { const n = await Cuenta.rpc('admin_limpiar_actividad'); Core.toast('🧹 Historial borrado (' + n + ' registros)'); cargarActividad(); }
    catch (err) { fallo(err); }
  };

  /* ---------- 📣 Motivar: texto automático según el tono (editable) ---------- */
  const TONOS = {
    motivador: {
      titulos: ['💪 ¡Tu tienda te espera, {n}!', '🚀 ¡Vamos con todo, {n}!', '🔥 Hoy es un buen día para vender'],
      inicios: ['¡Hola {n}! 💪', '¡{n}, vamos que se puede! 🚀', '¡Hola {n}! 🔥'],
      cierres: ['Cada publicación es una venta posible. ¡Tú puedes!', 'Los negocios que publican seguido venden más. ¡A darle!',
        'Tus clientes están a un toque de comprarte. ¡Vamos!']
    },
    amable: {
      titulos: ['😊 Te extrañamos, {n}', '🌷 Un saludo de CodeFix', '😊 ¿Cómo va todo, {n}?'],
      inicios: ['Hola {n}, ¿cómo estás? 😊', 'Hola {n} 🌷', '¡Hola {n}! Esperamos que estés muy bien 😊'],
      cierres: ['Si necesitas ayuda con algo, respóndenos aquí mismo. ¡Estamos para ayudarte!', 'Cualquier duda, escríbenos por este chat. 💙',
        'Cuando quieras te ayudamos a armar tu próxima oferta.']
    },
    directo: {
      titulos: ['🎯 {n}: tu tienda necesita movimiento', '🎯 Una idea rápida para vender más', '🎯 5 minutos para tu tienda'],
      inicios: ['Hola {n}.', '{n}, un dato rápido:', 'Hola {n}, vamos al grano:'],
      cierres: ['Te toma 5 minutos: entra, sube una oferta y listo.', 'Hoy: 1 ficha nueva en Órbita. Mañana: más pedidos.',
        'Entra hoy y publica algo, aunque sea chico.']
    },
    divertido: {
      titulos: ['😄 ¡Tu tienda bostezó, {n}!', '🦥 ¿{n} en modo siesta?', '🎉 ¡Hora de despertar la tienda!'],
      inicios: ['¡Hola {n}! 😄', '¡Toc toc, {n}! 🚪', '¡{n}! Tus productos preguntan por ti 🛍️'],
      cierres: ['Tus clientes ya están mirando el celular… ¡dales algo que ver! 📱', 'Una oferta nueva y la tienda vuelve a la vida. 🎉',
        'Sube algo hoy y que se arme el carrito. 🛒']
    }
  };
  function situacion(e) {
    const ult = [e.ultima_ficha, e.ultimo_producto].filter(Boolean).sort().pop();
    const dEntra = dias(e.visto_at), dPub = dias(ult);
    if (!e.productos && !e.fichas) return 'Aún no subes productos ni ofertas: sube los primeros y tus clientes ya podrán pedirte.';
    if (dEntra == null) return 'Todavía no entras a tu app: entra, revisa tu tienda y sube tu primera oferta.';
    if (dPub != null && dPub >= 7) return 'Hace ' + dPub + ' días que no publicas nada nuevo en tu tienda.';
    if (dEntra >= 3) return 'Hace ' + dEntra + ' días que no entras a tu app.';
    return '¡Vas muy bien! Sigue publicando para que tus clientes vuelvan seguido.';
  }
  let vuelta = 0;
  function textoMotivar(e, tono, n) {
    const t = TONOS[tono] || TONOS.motivador, k = (x) => x[n % x.length];
    const nom = (e.empresa || 'emprendedor').trim();
    const pon = (x) => x.replace(/\{n\}/g, nom);
    return {
      titulo: pon(k(t.titulos)).slice(0, 80),
      cuerpo: pon(k(t.inicios)) + ' ' + situacion(e) + '\n\n' + k(t.cierres) +
        (e.push ? '' : '\n\n🔔 Activa las notificaciones en ⚙️ Ajustes → Notificaciones para enterarte al tiro de tus pedidos y mensajes.')
    };
  }
  let motEmp = null, tono = 'motivador';
  async function abrirMotivar(id) {
    if (!actividad.length) await cargarActividad();
    motEmp = actividad.find((x) => x.id === id);
    if (!motEmp) return Core.toast('Empresa no encontrada');
    $('motTitulo').textContent = '📣 Motivar a ' + (motEmp.empresa || motEmp.email);
    $('motInfo').textContent = SEM[motEmp.sem] + ' Entró ' + hace(motEmp.visto_at) + ' · ' + (motEmp.push ? '🔔 Tiene notificaciones activas' : '🔕 No tiene notificaciones: el mensaje queda en su chat y le pide activarlas') +
      (motEmp.motivado_at && dias(motEmp.motivado_at) < 1 ? ' · ⚠️ Ya la motivaste hoy' : '');
    vuelta = Math.floor(Math.random() * 3);
    generar();
    if (!$('v-resumen').classList.contains('on')) show('resumen', true);
    $('cMotivar').classList.remove('hidden');
    $('cMotivar').scrollIntoView({ behavior: 'smooth' });
  }
  function generar() {
    const t = textoMotivar(motEmp, tono, vuelta);
    $('motTit').value = t.titulo; $('motTxt').value = t.cuerpo;
  }
  $('motTonos').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    tono = b.dataset.t;
    $('motTonos').querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.classList.toggle('alt', x !== b); });
    if (motEmp) generar();
  };
  $('bOtroTxt').onclick = () => { vuelta++; generar(); };
  $('bCerrarMot').onclick = () => $('cMotivar').classList.add('hidden');
  $('bEnviarMot').onclick = async () => {
    if (!motEmp) return;
    $('bEnviarMot').disabled = true;
    try {
      const r = await Cuenta.rpc('admin_motivar', { p_user: motEmp.id, p_titulo: $('motTit').value, p_cuerpo: $('motTxt').value });
      if (!r.ok) throw new Error(r.error);
      sb.functions.invoke('enviar').catch(() => {});
      Core.toast('📣 Enviado' + (r.push ? '' : ' (quedó en su chat: no tiene notificaciones activas)'));
      $('cMotivar').classList.add('hidden');
      cargarActividad();
    } catch (err) { fallo(err); } finally { $('bEnviarMot').disabled = false; }
  };
  $('bMotivarTodas').onclick = async () => {
    if (!actividad.length) await cargarActividad();
    const l = actividad.filter((e) => e.sem === 'rojo' && !(e.motivado_at && dias(e.motivado_at) < 1));
    if (!l.length) return Core.toast('No hay empresas dormidas por motivar hoy 🎉');
    const nombre = { motivador: '💪 motivador', amable: '😊 amable', directo: '🎯 directo', divertido: '😄 divertido' }[tono];
    if (!confirm('¿Enviar un mensaje ' + nombre + ' a ' + l.length + ' empresa(s) dormida(s)? Cada una recibe un texto con su nombre.')) return;
    $('bMotivarTodas').disabled = true;
    let ok = 0;
    for (const [i, e] of l.entries()) {
      const t = textoMotivar(e, tono, i);
      try { const r = await Cuenta.rpc('admin_motivar', { p_user: e.id, p_titulo: t.titulo, p_cuerpo: t.cuerpo }); if (r.ok) ok++; } catch (err) { /* sigue con la otra */ }
    }
    sb.functions.invoke('enviar').catch(() => {});
    $('bMotivarTodas').disabled = false;
    Core.toast('📣 Enviado a ' + ok + ' de ' + l.length + ' empresa(s)');
    cargarActividad();
  };

  /* ---------- Ingresos y vencimientos ---------- */
  async function cargarIngresos() {
    const r = await Cuenta.rpc('admin_ingresos');
    const item = (t, v) => '<div class="card"><span class="muted">' + t + '</span><b>' + v + '</b></div>';
    $('ingresos').innerHTML = item('Empresas Pro', r.empresas_pro) + item('Clientes Premium', r.clientes_premium) +
      item('Estimado mensual (empresas)', Core.money(r.estimado_mes)) + item('Keys vendidas este mes', Core.money(r.licencias_mes)) +
      item('Pedidos este mes', r.pedidos_mes);
    $('vencen').innerHTML = r.vencen.length ? r.vencen.map((u) => '<li><div class="grow"><b>' + Core.esc(u.nombre) + '</b><div class="muted">' +
      (u.role === 'client' ? 'Cliente Premium' : 'Empresa Pro') + ' · vence el ' + new Date(u.pro_until).toLocaleDateString('es') + '</div></div>' +
      '<button class="small" data-avisar="' + u.id + '">🔔 Avisar</button></li>').join('') : '<li class="empty">Nadie vence esta semana</li>';
  }
  $('vencen').onclick = async (e) => {
    const id = e.target.dataset.avisar;
    if (!id) return;
    try { await Cuenta.rpc('admin_avisar_vencimiento', { p_user: id }); sb.functions.invoke('enviar').catch(() => {}); Core.toast('🔔 Aviso enviado'); }
    catch (err) { fallo(err); }
  };

  /* ---------- Ver una empresa ---------- */
  async function verEmpresa(id) {
    const r = await Cuenta.rpc('admin_empresa', { p_id: id });
    const item = (t, v) => '<div class="card"><span class="muted">' + t + '</span><b>' + v + '</b></div>';
    $('empTitulo').textContent = '🏢 ' + (r.empresa || r.email);
    $('empStats').innerHTML = item('Plan', r.plan) + item('Clientes', r.clientes + ' (' + r.clientes_premium + ' Premium)') +
      item('Productos', r.productos) + item('Fichas publicadas', r.publicaciones) + item('Pedidos (30 días)', r.pedidos_30d) +
      item('Ventas entregadas (30 días)', Core.money(r.ventas_30d));
    $('empInfo').textContent = r.email + (r.telefono ? ' · WhatsApp +' + r.telefono : '') + (r.horario ? ' · 🕒 ' + r.horario : '') +
      (r.abierto === false ? ' · 🔴 Cerrada' : '') + ' · desde ' + new Date(r.creada).toLocaleDateString('es');
    empActual = id;
    $('bChatEmp').href = '../mensajes/?con=' + id;
    $('empAct').innerHTML = '';
    Cuenta.rpc('admin_empresa_actividad', { p_id: id }).then(pintarEmpAct).catch(() => {});
    $('empPubs').innerHTML = r.ultimas_publicaciones.length ? r.ultimas_publicaciones.map((x) => '<li><span class="grow">' + (x.vip ? '⭐ VIP · ' : '') +
      Core.esc(x.titulo) + '</span><span class="muted">' + new Date(x.updated_at).toLocaleDateString('es') + '</span></li>').join('') : '<li class="empty">Sin fichas publicadas</li>';
    show('resumen', true);
    $('cEmpresa').classList.remove('hidden');
    $('cEmpresa').scrollIntoView({ behavior: 'smooth' });
  }
  $('bCerrarEmp').onclick = () => $('cEmpresa').classList.add('hidden');
  let empActual = null;
  $('bMotivarEmp').onclick = () => { if (empActual) abrirMotivar(empActual); };
  // Actividad de la empresa: última vez, días activos, horario típico y últimos 14 días.
  function pintarEmpAct(a) {
    const max = (l) => Math.max(1, ...l);
    const hs = a.horas || [], mh = max(hs), ds = a.dias || [], md = max(ds.map((d) => d.entradas));
    const item = (t, v) => '<div class="card"><span class="muted">' + t + '</span><b>' + v + '</b></div>';
    const pico = hs.some((x) => x) ? hs.indexOf(Math.max(...hs)) : -1;
    $('empAct').innerHTML = '<div class="stats">' + item('Última conexión', hace(a.visto_at)) + item('Días activos (30 d)', a.dias_30 + ' de 30') +
      item('Entradas (30 d)', a.entradas_30) + item('Clientes activos (7 d)', a.clientes_activos) +
      item('Notificaciones', a.push ? '🔔 Activas' : '🔕 No') + item('Último producto', hace(a.ultimo_producto)) + '</div>' +
      '<h2 style="margin-top:12px">🕒 A qué hora se conecta (30 días)' + (pico >= 0 ? ' <span class="pill">más a las ' + pico + ':00</span>' : '') + '</h2>' +
      '<div class="barras' + (pico < 0 ? ' vacia' : '') + '">' + hs.map((x, i) => '<div title="' + i + ':00 · ' + x + '" style="height:' + Math.round(x * 100 / mh) + '%"></div>').join('') + '</div>' +
      '<div class="ejes"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>' +
      '<h2 style="margin-top:12px">📅 Últimos 14 días</h2>' +
      '<div class="barras">' + ds.map((d) => '<div title="' + new Date(d.dia + 'T12:00').toLocaleDateString('es') + ' · ' + d.entradas + '" style="height:' +
        Math.round(d.entradas * 100 / md) + '%"></div>').join('') + '</div>' +
      '<div class="ejes"><span>hace 2 semanas</span><span>hoy</span></div>';
  }

  /* ---------- Nombres de las cuentas (para los reportes) ---------- */
  async function cargarPerfiles() {
    const users = await q(sb.from('profiles').select('id,email,empresa,role'));
    perfiles = Object.fromEntries(users.map((u) => [u.id, u]));
  }

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
    try { await Cuenta.rpc('admin_resolve_report', { p_id: id, p_suspend: a === 'susp' }); Core.toast('Listo'); cargarResumen().catch(fallo); }
    catch (err) { fallo(err); }
  };

  /* ---------- Negocios ---------- */
  let negocios = [], nFiltro = '';
  async function cargarNegocios() { negocios = await Cuenta.rpc('admin_negocios'); pintarNegocios(); }
  // 🧹 Cuentas que no se usan: primero se buscan y se revisan; después se borran (el servidor vuelve a comprobar cada una).
  let inactivas = [];
  $('bInBuscar').onclick = async () => {
    const d = parseInt($('inDias').value, 10) || 0;
    try {
      inactivas = await Cuenta.rpc('admin_cuentas_inactivas', { p_dias: d });
      $('inLista').innerHTML = inactivas.length ? inactivas.map((x) => '<li><div class="grow"><b>' + Core.esc(x.empresa || x.email) + '</b>' +
        (x.autoregistro ? ' <span class="pill ok">🆕 Se registró solo</span>' : '') + '<div class="muted">' + Core.esc(x.email) + (x.rubro ? ' · ' + Core.esc(x.rubro) : '') +
        ' · creada el ' + fecha(x.creado) + ' · entró ' + hace(x.visto_at) + '</div></div></li>').join('') : '<li class="empty">Ninguna cuenta sin uso 🎉</li>';
      $('inBtns').classList.toggle('hidden', !inactivas.length);
      $('bInBorrar').textContent = 'Borrar estas ' + inactivas.length + ' cuenta(s)';
    } catch (err) { fallo(err); }
  };
  $('bInBorrar').onclick = async () => {
    if (!inactivas.length || !confirm('¿Borrar ' + inactivas.length + ' cuenta(s) sin uso? No se puede deshacer.')) return;
    try {
      const n = await Cuenta.rpc('admin_borrar_inactivas', { p_ids: inactivas.map((x) => x.id), p_dias: parseInt($('inDias').value, 10) || 0 });
      Core.toast('🧹 Cuentas borradas: ' + n); inactivas = []; $('inLista').innerHTML = ''; $('inBtns').classList.add('hidden'); cargarNegocios().catch(fallo);
    } catch (err) { fallo(err); }
  };

  // 📲 Link y QR del registro abierto de negocios (página n/).
  const regLink = Core.rootUrl() + 'n/';
  $('regLink').value = regLink; $('regVer').href = regLink;
  function qrReg(px) {
    const qr = qrcode(0, 'M'); qr.addData(regLink); qr.make();
    const n = qr.getModuleCount(), m = 4, c = document.createElement('canvas'), k = Math.max(1, Math.floor(px / (n + 2 * m)));
    c.width = c.height = k * (n + 2 * m);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let j = 0; j < n; j++) if (qr.isDark(r, j)) g.fillRect((j + m) * k, (r + m) * k, k, k);
    return c;
  }
  $('regQR').onclick = () => { $('regQRimg').src = qrReg(440).toDataURL(); $('regQRbox').classList.toggle('hidden'); };
  $('regQRdl').onclick = () => qrReg(1200).toBlob((b) => Core.download('qr-crea-tu-tienda.png', b));
  $('regCopiar').onclick = () => Core.copiar(regLink, '📋 Link copiado');
  $('regShare').onclick = async () => {
    const txt = '🏪 ¿Tienes un negocio o emprendimiento? Crea tu tienda online gratis (link, QR, pedidos y caja): ' + regLink;
    if (navigator.share) { try { await navigator.share({ title: 'Crea tu tienda gratis', text: txt }); return; } catch (e) { return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  };
  $('nBuscar').oninput = () => pintarNegocios();
  seg('nSeg', (b) => { nFiltro = b.dataset.f; pintarNegocios(); });
  function pintarNegocios() {
    const t = $('nBuscar').value.trim().toLowerCase(), semana = Date.now() - 7 * 864e5, siete = Date.now() + 7 * 864e5;
    const l = negocios.filter((n) => (!t || (n.empresa + ' ' + n.email).toLowerCase().includes(t)) && (!nFiltro ||
      (nFiltro === 'pro' && n.pro) || (nFiltro === 'free' && !n.pro) || (nFiltro === 'susp' && n.suspendido) || (nFiltro === 'solos' && n.autoregistro) ||
      (nFiltro === 'vence' && n.pro && n.pro_until && new Date(n.pro_until) < siete) || (nFiltro === 'inactivos' && (!n.visto_at || new Date(n.visto_at) < semana))));
    $('nCuenta').textContent = l.length + ' negocio(s)';
    const app = Core.rootUrl();
    $('nLista').innerHTML = l.length ? l.map((n) => {
      const lg = /^data:image/.test(n.logo || '') ? 'background-image:url(\'' + n.logo + '\');' : '';
      return '<div class="card"><div class="neg"><div class="lg" style="background-color:' + Core.esc(n.color || '#2563eb') + ';' + lg + '">' + (lg ? '' : Core.esc((n.empresa || '?').charAt(0).toUpperCase())) + '</div>' +
        '<div class="grow" style="min-width:0"><b>' + Core.esc(n.empresa || n.email) + '</b> ' + (n.pro ? '<span class="pill pro">PRO</span>' : '<span class="pill">GRATIS</span>') +
        (n.suspendido ? ' <span class="pill bad">Suspendido</span>' : '') + (n.pago_revision ? ' <span class="pill warn">🧾 Pago por revisar</span>' : '') +
        (n.link_pago ? '' : ' <span class="pill warn">Sin link de pago</span>') + (n.autoregistro ? ' <span class="pill ok">🆕 Se registró solo</span>' : '') +
        (n.rubro ? '<div class="muted">🏷️ ' + Core.esc(n.rubro) + '</div>' : '') +
        '<div class="muted">' + Core.esc(n.email) + (n.telefono ? ' · +' + Core.esc(n.telefono) : '') + '</div>' +
        '<div class="muted">' + (n.pro ? '⭐ Pro hasta ' + (n.pro_until ? fecha(n.pro_until) : 'siempre') : n.pro_until ? 'Pro venció el ' + fecha(n.pro_until) : 'Nunca fue Pro') +
        ' · 🟢 entró ' + hace(n.visto_at) + '</div>' +
        '<div class="muted">👥 ' + n.clientes + ' clientes · 🧑‍🍳 ' + n.equipo + ' equipo · 🛍️ ' + n.productos + ' productos · 🛒 ' + n.pedidos_mes + ' pedidos este mes' +
        (n.estrellas ? ' · ★ ' + n.estrellas : '') + '</div></div></div>' +
        '<div class="acc"><select data-acc="' + n.id + '" aria-label="Acciones"><option value="">Acción…</option><option value="30">⭐ Dar Pro 1 mes</option><option value="7">⭐ +7 días</option>' +
        '<option value="365">⭐ +1 año</option><option value="0">Quitar Pro</option><option value="' + (n.suspendido ? 'react' : 'susp') + '">' + (n.suspendido ? '✅ Reactivar' : '⛔ Inhabilitar') + '</option>' +
        '<option value="del">🗑️ Eliminar cuenta</option></select>' +
        '<button class="alt" data-ver="' + n.id + '">👁️ Ver</button><button class="alt" data-mot="' + n.id + '">📣 Motivar</button>' +
        (n.slug ? '<a class="btn small alt" target="_blank" rel="noopener" href="' + app + 't/?s=' + encodeURIComponent(n.slug) + '">🔗 Tienda</a>' : '') +
        '<a class="btn small alt" href="../mensajes/?con=' + n.id + '">💬</a></div></div>';
    }).join('') : '<p class="empty">Sin negocios en este filtro</p>';
  }
  async function accionCuenta(id, a, nombre, recargar) {
    try {
      if (a === 'susp' || a === 'react') await Cuenta.rpc('admin_suspender', { p_user: id, p_suspender: a === 'susp' });
      else if (a === 'del') {
        if (prompt('Se borra la cuenta de ' + nombre + ' y todos sus datos. Escribe ELIMINAR para confirmar.') !== 'ELIMINAR') return;
        await Cuenta.rpc('admin_eliminar_cuenta', { p_user: id });
      } else await Cuenta.rpc('admin_premium', { p_user: id, p_dias: +a });
      sb.functions.invoke('enviar').catch(() => {});
      Core.toast('Listo'); recargar();
    } catch (err) { fallo(err); }
  }
  $('nLista').onchange = (e) => {
    const id = e.target.dataset.acc, a = e.target.value;
    if (!id || !a) return;
    e.target.value = '';
    const n = negocios.find((x) => x.id === id);
    accionCuenta(id, a, n ? n.empresa : '', () => cargarNegocios().catch(fallo));
  };
  $('nLista').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ver) verEmpresa(b.dataset.ver).catch(fallo);
    if (b.dataset.mot) abrirMotivar(b.dataset.mot);
  };
  $('nGen').onclick = () => { $('nClave').value = Cuenta.claveAleatoria(); };
  let ultimoAcceso = '';
  $('bNuevo').onclick = async () => {
    $('nErr').textContent = '';
    if (!$('nClave').value) $('nClave').value = Cuenta.claveAleatoria();
    const d = { tipo: 'user', nombre: $('nNombre').value.trim(), email: $('nEmail').value.trim(), password: $('nClave').value };
    if (!d.nombre || !d.email) { $('nErr').textContent = 'Escribe el nombre y el correo'; return; }
    $('bNuevo').disabled = true;
    try {
      await Cuenta.crearUsuario(d);
      ultimoAcceso = Cuenta.mensajeAcceso(Object.assign({ tienda: 'Órbita' }, d));
      $('nCred').textContent = ultimoAcceso;
      $('nCred').classList.remove('hidden'); $('nCredBtns').classList.remove('hidden');
      $('nNombre').value = ''; $('nEmail').value = ''; $('nClave').value = '';
      Core.toast('✅ Negocio creado'); cargarNegocios().catch(fallo);
    } catch (err) { $('nErr').textContent = err.message; } finally { $('bNuevo').disabled = false; }
  };
  $('nWsp').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(ultimoAcceso), '_blank');
  $('nCopiar').onclick = () => navigator.clipboard.writeText(ultimoAcceso).then(() => Core.toast('Copiado'));

  /* ---------- Clientes ---------- */
  let clientes = [], cFiltro = '';
  async function cargarClientes() {
    clientes = await Cuenta.rpc('admin_clientes');
    if (!negocios.length) negocios = await Cuenta.rpc('admin_negocios');
    const sel = $('cNeg').value;
    $('cNeg').innerHTML = '<option value="">Todos los negocios</option>' + negocios.map((n) => '<option value="' + n.id + '"' + (n.id === sel ? ' selected' : '') + '>' +
      Core.esc(n.empresa || n.email) + ' (' + n.clientes + ')</option>').join('');
    pintarClientes();
  }
  $('cBuscar').oninput = () => pintarClientes();
  $('cNeg').onchange = () => pintarClientes();
  seg('cSeg', (b) => { cFiltro = b.dataset.f; pintarClientes(); });
  function pintarClientes() {
    const t = $('cBuscar').value.trim().toLowerCase(), neg = $('cNeg').value;
    const l = clientes.filter((c) => (!t || (c.nombre + ' ' + c.email).toLowerCase().includes(t)) && (!neg || c.negocio_id === neg) &&
      (cFiltro === 'equipo' ? c.rol === 'equipo' : c.rol === 'client') && (!cFiltro || cFiltro === 'equipo' || (cFiltro === 'pro' && c.pro) || (cFiltro === 'susp' && c.suspendido)));
    $('cCuenta').textContent = l.length + ' cuenta(s)';
    $('cLista').innerHTML = l.length ? l.map((c) => '<li style="flex-wrap:wrap"><div class="grow" style="min-width:200px"><b>' + Core.esc(c.nombre || c.email) + '</b> ' +
      (c.rol === 'equipo' ? '<span class="pill">Equipo</span>' : c.pro ? '<span class="pill pro">PREMIUM</span>' : '<span class="pill">FREE</span>') +
      (c.suspendido ? ' <span class="pill bad">Suspendido</span>' : '') + '<div class="muted">' + Core.esc(c.email) + ' · ' + Core.esc(c.negocio || 'sin negocio') +
      ' · entró ' + hace(c.visto_at) + ' · ' + c.pedidos + ' pedidos</div></div>' +
      '<select data-acc="' + c.id + '" style="width:auto" aria-label="Acciones"><option value="">Acción…</option>' + (c.rol === 'client' ? '<option value="30">⭐ Premium 1 mes</option><option value="0">Quitar Premium</option>' : '') +
      '<option value="' + (c.suspendido ? 'react' : 'susp') + '">' + (c.suspendido ? '✅ Reactivar' : '⛔ Inhabilitar') + '</option><option value="del">🗑️ Eliminar cuenta</option></select></li>').join('')
      : '<li class="empty">Sin cuentas en este filtro</li>';
  }
  $('cLista').onchange = (e) => {
    const id = e.target.dataset.acc, a = e.target.value;
    if (!id || !a) return;
    e.target.value = '';
    const c = clientes.find((x) => x.id === id);
    accionCuenta(id, a, c ? c.nombre : '', () => cargarClientes().catch(fallo));
  };

  /* ---------- Ajustes: cuadrícula del núcleo con lo propio de Órbita ----------
     Precios, links, planes, avisos a todos, pagos y versiones se manejan en el Centro de Mando. */
  const nodo = (id) => $('aj-' + id);
  let AJ = null;
  function verAjuste(k) {
    AJ = AJ || window.CFX_AJUSTES.montar($('v-ajustes'), [
      { k: 'reglas', ico: '⚖️', t: 'Reglas', d: 'Días, límites y tiempos', nodo: nodo('reglas'), abrir: () => cargarReglas().catch(fallo) },
      { k: 'push', ico: '🔔', t: 'Notificaciones', d: 'Servidor, push y correo', nodo: nodo('push'), abrir: () => cargarAjustes().catch(fallo) },
      { k: 'registro', ico: '📜', t: 'Registro de cambios', d: 'Lo que se hizo en el panel', nodo: nodo('registro'), abrir: () => cargarRegistro().catch(fallo) },
      { k: 'cuenta', ico: '👤', t: 'Mi cuenta y marca', d: 'Logo, nombre, color y WhatsApp', nodo: nodo('cuenta'), abrir: () => cargarAjustes().catch(fallo) }
    ], { arriba: '<p class="muted" style="margin:0 0 10px">Precios, planes, avisos a todos, pagos y versiones se manejan en el Centro de Mando.</p>' });
    if (k) AJ.abrir(k); else AJ.grilla();
  }
  const REGLAS = [['retencion_min', 'Minutos que el pedido queda apartado esperando el pago'], ['cancel_min', 'Minutos para cancelar con devolución (desde que paga)'],
    ['comprobantes_dias', 'Días que se guardan los comprobantes'], ['aviso1_dias', 'Primer aviso de vencimiento (días antes)'],
    ['aviso2_dias', 'Segundo aviso de vencimiento (días antes)'], ['dias_regalo', 'Días de Pro gratis para cada negocio nuevo (0 = sin prueba)'],
    ['max_rechazos', 'Comprobantes que se pueden rechazar por pedido antes de cerrarlo (el cliente sube otro mientras tanto)'],
    ['registro_negocios', 'Registro abierto de negocios (1 = cualquiera crea su cuenta Gratis con el link/QR; 0 = solo tú los creas)']];
  async function cargarReglas() {
    const r = await Cuenta.rpc('reglas');
    $('reglasBody').innerHTML = REGLAS.map(([k, t]) => '<label for="rg' + k + '">' + t + '</label><input id="rg' + k + '" inputmode="numeric" value="' + r[k] + '">').join('');
  }
  $('bReglas').onclick = async () => {
    try {
      for (const [k] of REGLAS) await Cuenta.rpc('admin_set_regla', { p_k: k, p_v: parseInt($('rg' + k).value, 10) || 0 });
      Core.toast('⚖️ Reglas guardadas');
    } catch (err) { fallo(err); }
  };
  async function limpiarRegistro(dias) {
    if (!confirm(dias ? '¿Borrar los cambios de hace más de ' + dias + ' días?' : '¿Borrar todo el registro de cambios?')) return;
    try { const n = await Cuenta.rpc('admin_limpiar_auditoria', { p_dias: dias }); Core.toast('🧹 Borrados: ' + n); cargarRegistro().catch(fallo); }
    catch (err) { fallo(err); }
  }
  $('bRegViejo').onclick = () => limpiarRegistro(30);
  $('bRegTodo').onclick = () => limpiarRegistro(0);
  async function cargarRegistro() {
    const l = await Cuenta.rpc('admin_auditoria');
    $('regLista').innerHTML = l.length ? l.map((x) => '<li><div class="grow"><b>' + Core.esc(x.accion) + '</b><div class="muted">' + Core.esc(x.detalle) + '</div></div><span class="muted">' + fechaHora(x.created_at) + '</span></li>').join('')
      : '<li class="empty">Sin cambios registrados</li>';
  }
  $('bWsp').onclick = async () => {
    try { await Cuenta.rpc('admin_set_setting', { p_key: 'contact_whatsapp', p_value: $('sWsp').value.replace(/\D/g, '') }); Core.toast('Guardado'); } catch (err) { fallo(err); }
  };
  $('bSalir').onclick = async () => { await Cuenta.signOut(); location.replace('../../'); };

  /* ---------- 🎨 Mi marca: logo, nombre y color del administrador ---------- */
  function pintarMarca() {
    const a = Cuenta.account || {};
    const ok = Cuenta.esLogo(a.logo);
    $('mLogoVer').style.backgroundImage = ok ? 'url("' + a.logo + '")' : '';
    $('mLogoVer').textContent = ok ? '' : '🛡️';
    $('mNombre').value = a.empresa || '';
    const actual = Core.tema.get(a.id).toLowerCase();
    $('mColores').innerHTML = Core.tema.colores.map(([n, c]) => '<button type="button" class="' + (c === actual ? 'on' : '') + '" data-c="' + c +
      '" title="' + n + '" aria-label="' + n + '" style="background:' + c + '"></button>').join('');
    $('mColor').value = actual;
    pintarLogoArriba();
  }
  async function guardarMarca(fn, args, aviso) {
    try { const acc = await Cuenta.rpc(fn, args); if (acc) Object.assign(Cuenta.account, acc); localStorage.setItem('cfx:cuenta', JSON.stringify(Cuenta.account)); pintarMarca(); Core.toast(aviso); }
    catch (err) { fallo(err); }
  }
  $('mLogo').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) guardarMarca('set_mi_logo', { p_logo: await Core.logoChico(f) }, '✅ Logo guardado');
  };
  $('bQuitarMLogo').onclick = () => guardarMarca('set_mi_logo', { p_logo: null }, 'Logo quitado');
  $('bMNombre').onclick = () => guardarMarca('update_my_company', { p_empresa: $('mNombre').value }, '✅ Nombre guardado');
  const ponerColor = (c) => { Core.tema.set(Cuenta.uid(), c); guardarMarca('set_mi_color', { p_color: c }, '🎨 Color guardado'); };
  $('mColores').onclick = (e) => { const c = e.target.dataset.c; if (c) ponerColor(c); };
  $('mColor').oninput = (e) => Core.tema.aplicar(e.target.value);
  $('mColor').onchange = (e) => ponerColor(e.target.value);

  /* ---------- Ajustes ---------- */
  async function cargarAjustes() {
    pintarMarca();
    const v = await Cuenta.rpc('public_settings');
    $('sWsp').value = v.contact_whatsapp || '';
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


  const V = ['resumen', 'negocios', 'clientes', 'ajustes'];
  const h = location.hash.slice(1);
  show(V.includes(h) ? h : 'resumen');
  addEventListener('hashchange', () => { const x = location.hash.slice(1); if (V.includes(x) && !$('v-' + x).classList.contains('on')) show(x); });
})();
