(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sb = Cuenta.sb;
  Core.registerSW('../../');
  Core.marca();
  await Cuenta.require('../../', { admin: true });
  Cuenta.revisarActualizacion();
  // La dirección de la app (Cloudflare): la usa el aviso automático de versión nueva.
  Cuenta.rpc('admin_set_setting', { p_key: 'app_url', p_value: Core.rootUrl() }).catch(() => {});

  const fecha = (t) => t ? new Date(t).toLocaleDateString('es') : '';
  const fechaHora = (t) => t ? new Date(t).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(Cuenta.friendly(error));
    return data;
  }
  const fallo = (e) => Core.toast(e.message || String(e));
  let perfiles = {};
  const DB_VERSION = '5.1';

  /* ---------- Navegación (5 pestañas, como el Taller) ---------- */
  const loaders = { resumen: cargarResumen, negocios: cargarNegocios, clientes: cargarClientes, pagos: cargarPagos, ajustes: () => verAjuste(ajuste) };
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
    $('cBase').classList.toggle('hidden', r.version === DB_VERSION);
    $('baseTxt').textContent = 'La app es la ' + DB_VERSION + ' y la base de datos la ' + r.version + '. Corre el paso 3 de la guía (Supabase → SQL Editor).';
    $('tabPagos').textContent = r.pagos_por_revisar; $('tabPagos').classList.toggle('hidden', !r.pagos_por_revisar);
    $('cPagosAlerta').classList.toggle('hidden', !r.pagos_por_revisar);
    $('cPagosAlerta').innerHTML = '💰 Tienes <b>' + r.pagos_por_revisar + '</b> comprobante(s) de Pro/Premium por revisar ›';
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
  $('cPagosAlerta').onclick = (e) => { e.preventDefault(); show('pagos'); };

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
      cierres: ['Te toma 5 minutos: entra, sube una oferta y listo.', 'Hoy: 1 ficha nueva en FichaPro. Mañana: más pedidos.',
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
      ultimoAcceso = Cuenta.mensajeAcceso(Object.assign({ tienda: 'FichaPro' }, d));
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

  /* ---------- Pagos (comprobantes del Pro / Premium) ---------- */
  let pFiltro = 'en_revision', pagos = [];
  seg('pSeg', (b) => { pFiltro = b.dataset.f; cargarPagos().catch(fallo); });
  async function cargarPagos() {
    pagos = await Cuenta.rpc('admin_pagos', { p_estado: pFiltro });
    const E = { en_revision: '🧾 Por revisar', aprobado: '✅ Aprobado', rechazado: '❌ Rechazado' };
    $('pLista').innerHTML = pagos.length ? pagos.map((x) => '<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap">' +
      '<div class="grow" style="min-width:180px"><b>' + Core.esc(x.nombre) + '</b> <span class="pill">' + (x.rol === 'client' ? 'Cliente' : 'Negocio') + '</span>' +
      (x.anual ? ' <span class="pill pro">📅 Anual</span>' : '') +
      '<div class="muted">' + Core.esc(x.email) + ' · ' + fechaHora(x.fecha) + '</div>' +
      '<div class="muted">' + (x.monto ? Core.money(x.monto) + ' · ' : '') + (x.pro_until ? 'Pro hasta ' + fecha(x.pro_until) : 'Sin Pro') +
        (x.dias ? ' · ' + x.dias + ' días' : '') + (x.motivo ? ' · ' + Core.esc(x.motivo) : '') + '</div></div>' +
      '<span class="pill">' + E[x.estado] + '</span></div>' +
      '<div class="acc" style="margin-top:8px">' + (x.tiene_comprobante ? '<button class="alt" data-ver="' + x.id + '">🧾 Ver comprobante</button>' : '') +
      (x.estado === 'en_revision' ? '<button class="ok" data-ok="' + x.id + '" data-d="' + (x.anual ? 365 : 0) + '">✅ Aprobar ' + (x.anual ? '1 año' : '1 mes') + '</button>' +
        '<button class="alt" data-ok="' + x.id + '" data-d="' + (x.anual ? 30 : 365) + '">' + (x.anual ? 'Aprobar solo 30 días' : '📅 Aprobar 1 año') + '</button>' +
        '<button class="danger" data-no="' + x.id + '">Rechazar</button>' : '') + '</div>' +
      '<div data-img="' + x.id + '"></div></div>').join('') : '<p class="empty">' + (pFiltro === 'en_revision' ? 'Nada por revisar 🎉' : 'Sin pagos') + '</p>';
  }
  $('pLista').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.ver) {
        const img = await Cuenta.rpc('admin_pago_comprobante', { p_id: b.dataset.ver });
        const box = $('pLista').querySelector('[data-img="' + b.dataset.ver + '"]');
        box.innerHTML = img ? '<img class="comp" src="' + img + '" alt="Comprobante"><div class="btns"><button class="small alt" data-dl="' + b.dataset.ver + '">⬇️ Descargar</button></div>' : '<p class="muted">El comprobante ya se borró.</p>';
        box.querySelector('[data-dl]') && (box.querySelector('[data-dl]').onclick = () => fetch(img).then((r) => r.blob()).then((bl) => Core.download('comprobante.jpg', bl)));
      }
      if (b.dataset.ok) {
        const d = +b.dataset.d || null; // null = lo que pagó (anual: 365; mensual: días del plan en Ajustes → Planes)
        if (d === 365 && !confirm('¿Aprobar 1 año (365 días)? Revisa que haya pagado el plan anual.')) return;
        await Cuenta.rpc('admin_revisar_pago', { p_id: b.dataset.ok, p_aprobar: true, p_motivo: null, p_dias: d });
        sb.functions.invoke('enviar').catch(() => {}); Core.toast('✅ Aprobado: Pro activo' + (d === 365 ? ' por 1 año' : '')); cargarPagos().catch(fallo);
      }
      if (b.dataset.no) {
        const m = await Core.elegir('¿Por qué lo rechazas? (le llega a la persona)', ['📷 La foto no se ve clara', '💸 No vemos el pago en la cuenta',
          '🔢 El monto no coincide con el precio del plan', '📅 El comprobante es de otra fecha o persona'], 'Escribe el motivo:');
        if (m === null) return;
        await Cuenta.rpc('admin_revisar_pago', { p_id: b.dataset.no, p_aprobar: false, p_motivo: m });
        sb.functions.invoke('enviar').catch(() => {}); Core.toast('Rechazado'); cargarPagos().catch(fallo);
      }
    } catch (err) { fallo(err); }
  };

  /* ---------- Ajustes (sub-pestañas) ---------- */
  let ajuste = 'links';
  seg('aSeg', (b) => verAjuste(b.dataset.a));
  function verAjuste(a) {
    ajuste = a;
    document.querySelectorAll('.aj').forEach((x) => x.classList.toggle('hidden', x.id !== 'aj-' + a));
    const f = { links: cargarLinks, planes: cargarPlanes, reglas: cargarReglas, avisos: cargarAvisos, push: cargarAjustes, version: cargarAjustes, registro: cargarRegistro, cuenta: cargarAjustes }[a];
    return Promise.resolve(f()).catch(fallo);
  }
  async function cargarLinks() {
    const l = await Cuenta.rpc('mis_links_pago');
    $('linksAdmin').innerHTML = [['premium_negocio', '🏪 Pro de negocios (mensual)'], ['premium_cliente', '👤 Premium de clientes (mensual)'],
      ['anual_negocio', '📅 Pro de negocios: plan anual (ej. 12 meses al precio de 10)'], ['anual_cliente', '📅 Premium de clientes: plan anual']].map(([t, nom]) =>
      '<h2 style="margin-top:10px">' + nom + '</h2>' + [1, 2].map((n) => {
        const x = l.find((y) => y.tipo === t && y.slot === n) || {}, k = t + n;
        return '<div class="slotpago' + (x.activo ? ' on' : '') + '"><b>Espacio ' + n + (x.activo ? ' · ✅ Activo' : '') + '</b>' +
          '<div class="row" style="flex-wrap:wrap"><div style="min-width:120px"><label for="lp' + k + '">Precio ($)</label><input id="lp' + k + '" inputmode="numeric" value="' + (x.precio == null ? '' : x.precio) + '"></div>' +
          '<div style="min-width:160px;flex:2"><label for="lt' + k + '">Texto</label><input id="lt' + k + '" maxlength="80" value="' + Core.esc(x.titulo || '') + '" placeholder="' + (/^anual/.test(t) ? 'Pro anual: 12 meses al precio de 10' : 'Pro mensual') + '"></div></div>' +
          '<label for="lu' + k + '">Link de pago</label><input id="lu' + k + '" type="url" placeholder="https://mpago.la/…" value="' + Core.esc(x.url || '') + '">' +
          '<label class="chk"><input type="checkbox" id="la' + k + '"' + (x.activo ? ' checked' : '') + '> Activo</label>' +
          '<div class="btns"><button class="small" data-t="' + t + '" data-n="' + n + '">Guardar</button></div></div>';
      }).join('')).join('');
  }
  $('linksAdmin').onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const k = b.dataset.t + b.dataset.n, pr = $('lp' + k).value.replace(/\D/g, '');
    try {
      await Cuenta.rpc('set_link_pago', { p_tipo: b.dataset.t, p_slot: +b.dataset.n, p_titulo: $('lt' + k).value, p_url: $('lu' + k).value,
        p_precio: pr === '' ? null : +pr, p_activo: $('la' + k).checked });
      Core.toast('💳 Guardado'); cargarLinks().catch(fallo);
    } catch (err) { fallo(err); }
  };
  const ETIQ = { productos: 'Productos', clientes: 'Clientes con cuenta', fichas: 'Fichas publicadas', respuestas: 'Respuestas rápidas', equipo: 'Personas de equipo',
    pedidos_mes: 'Pedidos online al mes', contactos: 'Contactos', favoritos: 'Favoritos', mensajes_seguidos: 'Mensajes seguidos' };
  const NOMP = { negocio_free: '🏪 Negocio gratis', negocio_pro: '🏪⭐ Negocio Pro', cliente_free: '👤 Cliente gratis', cliente_pro: '👤⭐ Cliente Premium' };
  async function cargarPlanes() {
    const P = await Cuenta.rpc('planes_publicos');
    $('planesBody').innerHTML = Object.keys(NOMP).filter((c) => P[c]).map((c) => {
      const p = P[c];
      return '<div class="card" data-plan="' + c + '"><h2>' + NOMP[c] + '</h2>' +
        '<div class="row" style="flex-wrap:wrap"><div style="min-width:140px"><label>Nombre</label><input data-k="nombre" maxlength="40" value="' + Core.esc(p.nombre) + '"></div>' +
        '<div style="min-width:120px"><label>Duración del pago (días)</label><input data-k="duracion" inputmode="numeric" value="' + p.duracion_dias + '"></div></div>' +
        '<label>Descripción</label><input data-k="descripcion" maxlength="300" value="' + Core.esc(p.descripcion) + '">' +
        '<label>Beneficios (uno por línea)</label><textarea data-k="beneficios" rows="4">' + Core.esc((p.beneficios || []).join('\n')) + '</textarea>' +
        '<h2 style="margin-top:10px">Límites</h2><div class="row" style="flex-wrap:wrap">' + Object.keys(p.limites).map((k) =>
          '<div style="min-width:140px"><label>' + Core.esc(ETIQ[k] || k) + '</label><input data-l="' + k + '" inputmode="numeric" value="' + p.limites[k] + '"></div>').join('') + '</div>' +
        '<div class="btns"><button data-gp="' + c + '">💾 Guardar plan</button></div></div>';
    }).join('');
  }
  $('planesBody').onclick = async (e) => {
    const b = e.target.closest('[data-gp]');
    if (!b) return;
    const card = $('planesBody').querySelector('[data-plan="' + b.dataset.gp + '"]'), v = (k) => card.querySelector('[data-k="' + k + '"]').value;
    const lim = {};
    card.querySelectorAll('[data-l]').forEach((i) => { lim[i.dataset.l] = parseInt(i.value, 10) || 0; });
    try {
      await Cuenta.rpc('admin_plan_guardar', { p_codigo: b.dataset.gp, p_nombre: v('nombre'), p_descripcion: v('descripcion'),
        p_beneficios: v('beneficios').split('\n').map((x) => x.trim()).filter(Boolean), p_duracion: parseInt(v('duracion'), 10) || 30, p_limites: lim });
      Core.toast('⭐ Plan guardado');
    } catch (err) { fallo(err); }
  };
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
  async function cargarRegistro() {
    const l = await Cuenta.rpc('admin_auditoria');
    $('regLista').innerHTML = l.length ? l.map((x) => '<li><div class="grow"><b>' + Core.esc(x.accion) + '</b><div class="muted">' + Core.esc(x.detalle) + '</div></div><span class="muted">' + fechaHora(x.created_at) + '</span></li>').join('')
      : '<li class="empty">Sin cambios registrados</li>';
  }
  $('bWsp').onclick = async () => {
    try { await Cuenta.rpc('admin_set_setting', { p_key: 'contact_whatsapp', p_value: $('sWsp').value.replace(/\D/g, '') }); Core.toast('Guardado'); } catch (err) { fallo(err); }
  };
  $('bSalir').onclick = async () => { await Cuenta.signOut(); location.replace('../../'); };

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
    $('sWsp').value = v.contact_whatsapp || '';
    const s = await Cuenta.rpc('admin_secret_status');
    $('pushEstado').textContent = s.vapid_public && s.vapid_private ? '✅ Claves push configuradas' : '⚠️ Falta generar las claves push';
    $('bVapid').textContent = s.vapid_public ? 'Regenerar claves push' : 'Generar claves push';
    $('mailEstado').textContent = s.gmail_user && s.gmail_app_password ? '✅ Gmail configurado' : '⚠️ Falta configurar Gmail';
    // Versión publicada en GitHub vs. versión liberada para todos.
    let pub = '';
    try { pub = String((await (await fetch('../../version.json', { cache: 'no-store' })).json()).version); } catch (e) { pub = ''; }
    verPublicada = pub;
    $('verEstado').innerHTML = 'Tu celular: <b>v' + Core.version + '</b> · Publicada: <b>v' + (pub || '?') + '</b> · Liberada para todos: <b>' +
      (v.version_liberada ? 'v' + Core.esc(v.version_liberada) : 'ninguna aún') + '</b>';
    $('bLiberar').textContent = pub ? 'Liberar v' + pub + ' para todos' : 'Liberar para todos';
    $('bLiberar').disabled = !pub || v.version_liberada === pub;
  }
  let verPublicada = '';
  $('bLiberar').onclick = async () => {
    if (!verPublicada || !confirm('¿Liberar la v' + verPublicada + '? A todos les aparecerá el botón "Actualizar".')) return;
    try { await Cuenta.rpc('admin_set_setting', { p_key: 'version_liberada', p_value: verPublicada }); Core.toast('✅ v' + verPublicada + ' liberada para todos'); cargarAjustes(); }
    catch (err) { fallo(err); }
  };

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


  const V = ['resumen', 'negocios', 'clientes', 'pagos', 'ajustes'];
  const h = location.hash.slice(1);
  show(V.includes(h) ? h : 'resumen');
  addEventListener('hashchange', () => { const x = location.hash.slice(1); if (V.includes(x) && !$('v-' + x).classList.contains('on')) show(x); });
})();
