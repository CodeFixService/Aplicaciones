/* CodeFix · Núcleo · Ayuda (mismo archivo en cada repositorio).
   CFX_AYUDA.iniciar({ rpc, app })  → al entrar con sesión: botón 🛟 abajo a la izquierda con
       · Guía para partir: lo que le falta configurar al negocio (cfx_guia). No se marca como listo hasta que lo hace de verdad,
         y se le recuerda cada vez que entra (y cada 1 hora con la app abierta) mientras falte algo.
       · Chat con soporte: escribe y le respondes desde el Centro de Mando → Mensajes (cfx_chat_*). El globo muestra lo no leído.
       · Términos y condiciones según el tipo de negocio (ley chilena: 19.496 del consumidor y 19.628 / 21.719 de datos personales).
   CFX_AYUDA.chat({ rpc }) · CFX_AYUDA.terminos(app) · CFX_AYUDA.guia()  (también se pueden abrir sueltos). */
(function () {
  'use strict';
  if (window.CFX_AYUDA) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yo = document.currentScript && document.currentScript.src;
  const RAIZ = yo ? yo.replace(/(shared|js)\/ayuda\.js.*$/, '') : location.origin + '/';
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || (document.querySelector('meta[name="theme-color"]') || {}).content || '#2563eb';
  const CADA = 60 * 60 * 1000;
  const css = document.createElement('style');
  css.textContent =
    '.cfx-boya{position:fixed;left:10px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147481000;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;' +
    'background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);box-shadow:0 6px 18px rgba(15,23,42,.25),0 0 0 1px rgba(15,23,42,.06);font-size:20px;display:flex;align-items:center;justify-content:center;opacity:.92}' +
    '.cfx-boya i{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#dc2626;color:#fff;font:700 11px/18px system-ui,sans-serif;font-style:normal;padding:0 4px;box-sizing:border-box}' +
    '@media(min-width:900px){.cfx-boya{bottom:24px}}' +
    'dialog.cfx-ayuda{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:2147483100;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
    'dialog.cfx-ayuda::backdrop{background:transparent}@media(min-width:600px){dialog.cfx-ayuda{align-items:center}}' +
    '.cfx-ayuda>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;border-radius:20px 20px 0 0;box-sizing:border-box;padding:16px 16px calc(14px + env(safe-area-inset-bottom))}' +
    '@media(min-width:600px){.cfx-ayuda>div{border-radius:20px}}.cfx-ayuda h2{margin:0 0 6px;font-size:19px}.cfx-ayuda h3{font-size:15px;margin:14px 0 4px}.cfx-ayuda p,.cfx-ayuda li{font-size:14px;line-height:1.45;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-ayuda .ca-cuerpo{overflow:auto;flex:1;min-height:0}.cfx-ayuda button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;padding:0 12px;background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto,#111827)}' +
    '.cfx-ayuda button.ca-si{background:var(--ca-color);color:#fff}.cfx-ayuda .ca-op{display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:6px 0;background:var(--cfx-campo,#f3f5f8)}.cfx-ayuda .ca-op b{flex:1}' +
    '.cfx-ayuda .ca-op i{font-style:normal;background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px}' +
    '.cfx-ayuda .ca-it{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--cfx-borde,#e2e7ec)}.cfx-ayuda .ca-it:first-child{border-top:0}.cfx-ayuda .ca-it span{font-size:20px;line-height:1}' +
    '.cfx-ayuda .ca-it div{flex:1}.cfx-ayuda .ca-it b{display:block;font-size:14.5px}.cfx-ayuda .ca-it p{margin:2px 0 0;font-size:13px}.cfx-ayuda .ca-it button{min-height:36px;font-size:13px;flex:none}' +
    '.cfx-ayuda .ca-it.ok b{text-decoration:line-through;opacity:.6}.cfx-ayuda .ca-barra{height:8px;border-radius:4px;background:var(--cfx-campo,#eef2f6);overflow:hidden;margin:6px 0 10px}.cfx-ayuda .ca-barra>div{height:100%;background:var(--ca-color)}' +
    '.cfx-ayuda .ca-msjs{display:flex;flex-direction:column;gap:6px;padding:6px 0}.cfx-ayuda .ca-m{max-width:82%;padding:8px 11px;border-radius:14px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-break:break-word}' +
    '.cfx-ayuda .ca-m.yo{align-self:flex-end;background:var(--ca-color);color:#fff;border-bottom-right-radius:4px}.cfx-ayuda .ca-m.el{align-self:flex-start;background:var(--cfx-campo,#eef2f6);border-bottom-left-radius:4px}' +
    '.cfx-ayuda .ca-m small{display:block;opacity:.7;font-size:11px;margin-top:2px}.cfx-ayuda .ca-escribir{display:flex;gap:8px;padding-top:8px}.cfx-ayuda textarea{flex:1;min-height:44px;max-height:120px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:10px 12px;resize:none;box-sizing:border-box}' +
    '.cfx-ayuda .ca-pie{display:flex;gap:8px;margin-top:10px}.cfx-ayuda .ca-pie button{flex:1}';
  document.head.appendChild(css);

  let R = null, APP = '', estado = { items: [], sin_leer: 0 }, boya = null, abierta = null;
  const pend = () => estado.items.filter((x) => !x.ok);

  function dialogo(html, alCerrar) {
    cerrar();
    const d = document.createElement('dialog'); d.className = 'cfx-ayuda'; d.style.setProperty('--ca-color', color());
    d.innerHTML = '<div>' + html + '</div>';
    document.body.appendChild(d); abierta = d;
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-cerrar]')) cerrar(); });
    d.addEventListener('close', () => { if (alCerrar) alCerrar(); d.remove(); if (abierta === d) abierta = null; });
    return d.firstChild;
  }
  function cerrar() { if (abierta) { try { abierta.close(); } catch (e) { abierta.remove(); } abierta = null; } }

  // ---------- Botón 🛟 ----------
  function pintarBoya() {
    if (!R) return;
    if (!boya) {
      boya = document.createElement('button'); boya.type = 'button'; boya.className = 'cfx-boya no-ico'; boya.setAttribute('aria-label', 'Ayuda y soporte');
      boya.onclick = menu; document.body.appendChild(boya);
    }
    const n = pend().length + (estado.sin_leer || 0);
    boya.innerHTML = '🛟' + (n ? '<i>' + n + '</i>' : '');
  }
  function menu() {
    const p = pend().length, caja = dialogo('<h2>🛟 Ayuda</h2><div class="ca-cuerpo">' +
      (estado.items.length ? '<button type="button" class="ca-op" data-a="guia"><span>🧭</span><b>Guía para partir</b>' + (p ? '<i>' + p + ' pendiente' + (p > 1 ? 's' : '') + '</i>' : '✅') + '</button>' : '') +
      '<button type="button" class="ca-op" data-a="chat"><span>💬</span><b>Chat con soporte</b>' + (estado.sin_leer ? '<i>' + estado.sin_leer + '</i>' : '') + '</button>' +
      '<button type="button" class="ca-op" data-a="terminos"><span>📄</span><b>Términos y condiciones</b></button>' +
      (window.CFX_PAGOS ? '<button type="button" class="ca-op" data-a="premium"><span>⭐</span><b>Premium y pagos</b></button>' : '') +
      '</div><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>');
    caja.onclick = (ev) => {
      const b = ev.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'guia') guia(); else if (a === 'chat') chat({ rpc: R }); else if (a === 'terminos') terminos(); else { cerrar(); window.CFX_PAGOS.abrir({ rpc: R }); }
    };
  }

  // ---------- Guía ----------
  function ir(dest) {
    cerrar();
    if (dest === 'verificar' && window.CFX_VERIFICAR) return window.CFX_VERIFICAR.abrir({ rpc: R });
    if (dest === 'pagar' && window.CFX_PAGOS) return window.CFX_PAGOS.abrir({ rpc: R });
    const u = new URL(dest, RAIZ);
    if (u.pathname === location.pathname && u.hash) { if (location.hash === u.hash) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = u.hash; }
    else location.href = u.href;
  }
  function guia() {
    const L = estado.items, ok = L.filter((x) => x.ok).length;
    const caja = dialogo('<h2>🧭 Guía para partir</h2><p>' + (ok === L.length ? '¡Todo listo! Tu negocio está configurado.' : 'Te faltan ' + (L.length - ok) + ' de ' + L.length + ' pasos. Cada uno se marca solo cuando lo haces.') + '</p>' +
      '<div class="ca-barra"><div style="width:' + Math.round(ok * 100 / Math.max(1, L.length)) + '%"></div></div><div class="ca-cuerpo">' +
      L.map((x, i) => '<div class="ca-it' + (x.ok ? ' ok' : '') + '"><span>' + (x.ok ? '✅' : '⬜') + '</span><div><b>' + esc(x.t) + '</b>' + (x.d && !x.ok ? '<p>' + esc(x.d) + '</p>' : '') + '</div>' +
        (!x.ok && x.ir ? '<button type="button" class="ca-si" data-i="' + i + '">Hacerlo</button>' : '') + '</div>').join('') +
      '</div><div class="ca-pie"><button type="button" data-cerrar>' + (ok === L.length ? 'Cerrar' : 'Después') + '</button></div>');
    caja.onclick = (ev) => { const b = ev.target.closest('[data-i]'); if (b) ir(L[+b.dataset.i].ir); };
  }
  function recordar() {
    if (window.CFX_SIN_HOLA || !pend().length || document.hidden || document.querySelector('dialog[open], .cfx-hoja')) return;  // CFX_SIN_HOLA: pruebas
    let ult = 0; try { ult = Number(sessionStorage.getItem('cfx-guia-vista')) || 0; } catch (e) { /* nada */ }
    if (ult && Date.now() - ult < CADA) return;
    try { sessionStorage.setItem('cfx-guia-vista', String(Date.now())); } catch (e) { /* nada */ }
    guia();
  }

  // ---------- Chat ----------
  async function chat(o) {
    const rpc = (o && o.rpc) || R; if (!rpc) return;
    let vigia = null;
    const caja = dialogo('<h2>💬 Soporte</h2><p style="margin:0 0 4px">Escríbenos lo que necesites. Te avisamos cuando respondamos.</p><div class="ca-cuerpo"><div class="ca-msjs"><p>Cargando…</p></div></div>' +
      '<div class="ca-escribir"><textarea maxlength="1000" rows="1" placeholder="Escribe tu mensaje…"></textarea><button type="button" class="ca-si" data-enviar>Enviar</button></div>' +
      '<p class="ca-err" style="color:#dc2626;margin:4px 0 0;min-height:1em"></p><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>', () => clearInterval(vigia));
    const lista = caja.querySelector('.ca-msjs'), cuerpo = caja.querySelector('.ca-cuerpo'), ta = caja.querySelector('textarea'), err = caja.querySelector('.ca-err');
    async function cargar() {
      try {
        const m = await rpc('cfx_chat_mio');
        lista.innerHTML = m.length ? m.map((x) => '<div class="ca-m ' + (x.de === 'persona' ? 'yo' : 'el') + '">' + esc(x.texto) + '<small>' + new Date(x.creado).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>').join('')
          : '<p>Aún no hay mensajes. ¡Cuéntanos en qué te ayudamos!</p>';
        cuerpo.scrollTop = cuerpo.scrollHeight;
        if (estado.sin_leer) { estado.sin_leer = 0; pintarBoya(); }
      } catch (x) { lista.innerHTML = '<p>' + esc(x.message || x) + '</p>'; }
    }
    caja.querySelector('[data-enviar]').onclick = async (ev) => {
      const t = ta.value.trim(); if (!t) return;
      ev.target.disabled = true; err.textContent = '';
      try { await rpc('cfx_chat_enviar', { p_texto: t }); ta.value = ''; await cargar(); } catch (x) { err.textContent = (x && x.message) || String(x); }
      ev.target.disabled = false;
    };
    await cargar();
    vigia = setInterval(() => { if (!document.hidden) cargar(); }, 10000);
    ta.focus();
  }

  // ---------- Términos y condiciones ----------
  function detectar() {
    if (APP) return APP;
    const w = window, t = document.title || '';
    if (w.LC) return 'billetera';
    if (w.Api && w.U) return 'estaciona';
    if (/BiciTaller/i.test(t)) return 'taller';
    if (/Barber/i.test(t)) return 'barberia';
    if (/Órbita|Orbita/i.test(t)) return 'orbita';
    if (/Mando/i.test(t)) return 'mando';
    return '';
  }
  const NOMBRE = { billetera: 'Libreta de Cobros', orbita: 'Órbita', barberia: 'Barbería', taller: 'BiciTaller', estaciona: 'Estaciona', mando: 'Centro de Mando' };
  // Lo propio de cada tipo de negocio (va como sección 5).
  const PROPIO = {
    barberia: ['Reservas y abono previo',
      'Las horas se reservan en la app. Cada barbería puede pedir un abono previo para confirmar la hora; el monto y su política de cancelación se muestran antes de pagar. ' +
      'Si cancelas con la anticipación que indica la barbería, el abono se te devuelve o se abona a tu próxima hora. Si no llegas sin avisar, la barbería puede quedarse con el abono como compensación. ' +
      'El abono se descuenta del precio final del servicio. Los precios los fija cada barbería y deben incluir IVA cuando corresponda.'],
    taller: ['Reservas, abono previo y reparaciones',
      'Reservas tu hora en la app y el taller puede pedir un abono previo para confirmarla (el monto y la política de cancelación se muestran antes de pagar); el abono se descuenta del total. ' +
      'Antes de reparar, el taller te informa el presupuesto y no puede cobrar trabajos que no aprobaste. Las reparaciones tienen la garantía legal de 3 meses desde la entrega (art. 41 de la Ley 19.496). ' +
      'Si no retiras tu bicicleta dentro del plazo informado por el taller, este puede cobrar bodegaje según lo publicado.'],
    orbita: ['Compras en tiendas: pago, despacho, retracto y garantía',
      'Cada tienda publica sus productos y precios (con IVA incluido cuando corresponda). El pedido se paga completo antes del despacho; el costo de despacho depende de tu comuna y se muestra antes de pagar. ' +
      'En compras a distancia tienes derecho a retracto dentro de 10 días desde que recibes el producto, salvo que la tienda lo haya excluido de forma visible antes de la compra (art. 3 bis de la Ley 19.496). ' +
      'Los productos tienen garantía legal de 6 meses por fallas (cambio, reparación o devolución del dinero, a tu elección). La tienda entrega la boleta o factura.'],
    billetera: ['Fiado, cuotas y cobranza',
      'La Libreta registra ventas al fiado, cuotas y abonos entre un negocio y sus clientes; no es un banco ni presta dinero. Los intereses, si se pactan, no pueden superar el máximo convencional (Ley 18.010). ' +
      'Los recordatorios de cobro deben respetar la ley: sin amenazas, sin avisar a terceros (familia, trabajo), en días hábiles y horario razonable, y sin cobrar gastos de cobranza no permitidos (art. 37 de la Ley 19.496). ' +
      'El cliente puede ver su saldo y pedir corrección de cualquier error.'],
    estaciona: ['Arriendo de estacionamientos entre personas',
      'Estaciona conecta a quienes publican un estacionamiento con quienes lo arriendan. El precio, las reglas del lugar y la forma de pago las define quien publica, y se muestran antes de arrendar. ' +
      'Quien publica declara tener derecho a arrendar ese espacio (dueño o autorizado por la comunidad). Quien arrienda usa el espacio según lo acordado y responde por los daños que cause. ' +
      'Estaciona no custodia vehículos ni responde por robos o daños dentro del estacionamiento. Pedimos verificar identidad para dar más seguridad.'],
    mando: ['Uso personal',
      'El Centro de Mando organiza tus tareas, metas, ideas y descanso. Lo que anotas es privado y solo tú lo ves.']
  };
  function terminos(app) {
    const a = app || detectar(), n = NOMBRE[a] || 'esta app', p = PROPIO[a];
    const S = [
      ['1. Quiénes somos', n + ' es una aplicación de CodeFix (Chile). Puedes escribirnos desde el chat de soporte de la app. Estos términos siguen la Ley 19.496 sobre Protección de los Derechos de los Consumidores y las leyes de datos personales 19.628 y 21.719.'],
      ['2. Tu cuenta', 'Para crear una cuenta de negocio debes ser mayor de 18 años y dar datos verdaderos. Cuida tu contraseña: lo que se haga con tu cuenta es tu responsabilidad. Puedes borrar tu cuenta cuando quieras desde la app o pidiéndolo por el chat.'],
      ['3. Planes y pagos', 'Hay una versión gratis y una Premium (mensual, por varios meses o anual), con precios en pesos chilenos publicados en la app. ' +
        'Por transferencia pagas el precio exacto. Con link de pago o tarjeta se suma un cargo por pago online que se muestra en una línea aparte antes de pagar. ' +
        'El Premium se activa al validar tu comprobante (normalmente en 5 a 10 minutos en horario hábil) y dura los días comprados (30 por mes, 365 por año). No hay cobros automáticos: nada se renueva sin que pagues de nuevo. ' +
        'Si eres un negocio nuevo, el primer pago activa tu cuenta; al terminar ese período sigues en la versión gratis si no renuevas.'],
      ['4. Retracto y devoluciones', 'Puedes retractarte dentro de 10 días desde tu pago si aún no usaste las funciones Premium, y te devolvemos el monto por transferencia. ' +
        'Si el servicio falla por causa nuestra y no lo solucionamos, te devolvemos la parte proporcional de los días no usados.'],
      p ? ['5. ' + p[0], p[1]] : null,
      [(p ? '6' : '5') + '. Responsabilidad de cada negocio', 'Cada negocio que usa la app es el proveedor frente a sus propios clientes: fija sus precios, cobra con sus propios medios de pago (los abonos y pagos de sus clientes le llegan directo a él, no a CodeFix), entrega boleta y responde por sus productos y servicios según la ley. CodeFix entrega la herramienta.'],
      [(p ? '7' : '6') + '. Tus datos', 'Usamos tus datos solo para que la app funcione: cuenta, reservas o pedidos, avisos y soporte. No los vendemos. Los guardamos en servidores seguros (Supabase). ' +
        'Las fotos de comprobantes y de identidad se borran apenas se revisan. Las fotos que solo ves tú quedan en tu teléfono. Puedes pedir acceso, corrección, borrado o copia de tus datos, u oponerte a su uso, escribiendo al chat de soporte.'],
      [(p ? '8' : '7') + '. Buen uso', 'No está permitido publicar contenido falso, ilegal u ofensivo, suplantar a otras personas ni usar la app para estafas. Podemos suspender cuentas que lo hagan, avisándote el motivo.'],
      [(p ? '9' : '8') + '. Disponibilidad', 'Trabajamos para que la app esté siempre disponible y respaldamos la información, pero pueden ocurrir cortes por mantención o fallas de terceros (internet, servidores). Te recomendamos descargar tus respaldos.'],
      [(p ? '10' : '9') + '. Cambios', 'Si cambiamos estos términos o los precios, te avisamos en la app con al menos 15 días de anticipación. Los días Premium que ya pagaste se respetan.'],
      [(p ? '11' : '10') + '. Reclamos', 'Escríbenos primero por el chat: respondemos lo antes posible. Siempre puedes acudir al SERNAC (sernac.cl) o al Juzgado de Policía Local de tu comuna. Se aplica la ley chilena.']
    ].filter(Boolean);
    dialogo('<h2>📄 Términos y condiciones</h2><p style="margin:0">' + esc(n) + ' · vigentes desde octubre de 2026</p><div class="ca-cuerpo">' +
      S.map((x) => '<h3>' + esc(x[0]) + '</h3><p>' + esc(x[1]) + '</p>').join('') + '</div><div class="ca-pie"><button type="button" data-cerrar>Entendido</button></div>');
  }

  // ---------- Inicio ----------
  async function revisar() {
    if (!R) return;
    try { estado = await R('cfx_guia') || estado; } catch (e) { return; }
    estado.items = estado.items || [];
    pintarBoya();
    setTimeout(recordar, 4000);
  }
  function iniciar(o) {
    if (!o || !o.rpc) return;
    const primera = !R;
    R = o.rpc; APP = o.app || APP;
    revisar();
    if (primera) {
      setInterval(revisar, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    }
  }
  window.CFX_AYUDA = { iniciar, chat, terminos, guia, revisar };
  // La app pudo pedirlo antes de que este archivo cargara (CFX_AYUDA_PEND = { rpc, app }).
  if (window.CFX_AYUDA_PEND) iniciar(window.CFX_AYUDA_PEND);
})();
