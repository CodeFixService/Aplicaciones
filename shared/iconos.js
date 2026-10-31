/* CodeFix · Íconos modernos para todas las apps (mismo archivo en cada repositorio).
   Cambia el emoji del inicio de menús, botones, títulos, etiquetas y avisos por un ícono de línea (SVG),
   también en lo que se dibuja después (pantallas que cambian). Los emojis que son contenido no se tocan:
   selector de íconos o avatares, logos del negocio, mensajes de chat, campos de texto y avisos emergentes.
   Para que un elemento conserve su emoji: class="no-ico" o data-emoji. */
(function () {
  'use strict';
  if (window.CodeFixIconos) return;

  const P = {
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
    no: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    prohibido: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    alerta: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12z"/>',
    campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
    campanaNo: '<path d="M8.7 3.6A6 6 0 0 1 18 8c0 3 .6 5 1.3 6.4M17 17H3s3-2 3-9c0-.8.1-1.5.4-2.2M10 21a2 2 0 0 0 4 0M3 3l18 18"/>',
    recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
    tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    tijeras: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1L20 20M8.1 15.9L20 4"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c2 .6 3.5 2.3 3.5 5.3"/>',
    celular: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
    arena: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    portapapeles: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    megafono: '<path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
    etiqueta: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    abierto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    refrescar: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    repetir: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
    bici: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8l2 8M14 5h3"/>',
    basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    billete: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    regalo: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6.5 4 6.5 6.5S10 8 12 8zM12 8c2-4 5.5-4 5.5-1.5S14 8 12 8z"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    conexion: '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    carro: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.6 12h11l2-8H7"/>',
    guardar: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    paleta: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.3-1-1.5-1-2.7 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    tienda: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
    enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    escoba: '<path d="M14 3l-4 9M7 12h8l2 9H5z"/><path d="M9 16v5M13 16v5"/>',
    subir: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    bajar: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    chispa: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    herramienta: '<path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    fuego: '<path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.4-5.6-4-8-.5 2-1.8 3-3 3 0-3-1.5-5-3-6-.5 4-4 6.5-4 11 0 4.2 3 7 7 7z"/>',
    banco: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    tendencia: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    baja: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    cohete: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-7 7-5-5zM9 11l-3-1-2 2 4 1M13 15l1 3-2 2-1-4"/>',
    ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    diana: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    ojo: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    diamante: '<path d="M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 6 3-6M12 21L9 9M12 21l3-12"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    balanza: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    casa: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    camion: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    puerta: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4"/>',
    ampolleta: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    documento: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    libro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13"/>',
    corazon: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    brujula: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    trofeo: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6"/>',
    bandera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    imagen: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    pulso: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    auto: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v1M17 19v1M7 13h1M16 13h1"/>',
    infinito: '<path d="M6 9a3 3 0 1 0 0 6c3 0 9-6 12-6a3 3 0 1 1 0 6c-3 0-9-6-12-6z"/>',
    clip: '<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
    nube: '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    carnet: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2M14 10h4M14 13.5h4"/>',
    luna: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    contraste: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    mundo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
    salvavidas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
    servidor: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    corona: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
    calculadora: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    impresora: '<path d="M7 9V3h10v6M7 18H4v-7h16v7h-3M7 14h10v7H7z"/>',
    telefono: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    flecha: '<path d="M7 17L17 7M8 7h9v9"/>',
    mano: '<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v6M16 11V8a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.5L7 14"/>',
    musculo: '<path d="M4 15c2-6 5-10 9-11l1 3-3 1 1 3c3-1 6 0 7 3 1 4-3 6-8 6-4 0-6-2-7-5z"/>',
    punto: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
    cara: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5v.01M15 9.5v.01"/>',
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    cerebro: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 5 3.5 3.5 0 0 0 4 5.5A3 3 0 0 0 12 20zM12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 5 3.5 3.5 0 0 1-4 5.5A3 3 0 0 1 12 20zM12 5v15"/>'
  };
  // emoji (sin variante) → [ícono, color]
  const M = {};
  const asignar = (lista, ic, color) => lista.split(' ').forEach((e) => { M[e] = [ic, color || '']; });
  asignar('⭐ 🌟', 'estrella', 'oro'); asignar('✅ ✔', 'ok', 'verde'); asignar('❌ ✖', 'no', 'rojo'); asignar('⛔ 🚫 🛑 📵', 'prohibido', 'rojo');
  asignar('⚠', 'alerta', 'ambar'); asignar('💬 🗨 📨', 'chat'); asignar('🔔', 'campana'); asignar('🔕', 'campanaNo'); asignar('🧾', 'recibo');
  asignar('💳', 'tarjeta'); asignar('💈 ✂ 🪒', 'tijeras'); asignar('📅 📆 🗓', 'calendario'); asignar('👤 🧑 🙍', 'usuario'); asignar('👥 🧑‍🍳 👨‍🍳 👩‍🍳', 'usuarios');
  asignar('📲 📱', 'celular'); asignar('⏳ ⌛', 'arena'); asignar('📋', 'portapapeles'); asignar('📣 📢', 'megafono'); asignar('🏷 🎟 🎫', 'etiqueta');
  asignar('🔒 🔐', 'candado'); asignar('🔓', 'abierto'); asignar('📷 📸', 'camara'); asignar('🔄', 'refrescar'); asignar('🔁 ♻', 'repetir');
  asignar('🚲 🚴 🚵', 'bici'); asignar('🗑', 'basura'); asignar('💸 💵 💰 🪙', 'billete'); asignar('🎁', 'regalo'); asignar('✏ 📝 ✍ 🖊', 'lapiz');
  asignar('🤝', 'conexion'); asignar('🔑 🗝', 'llave'); asignar('🛒 🛍', 'carro'); asignar('💾', 'guardar'); asignar('🎨', 'paleta');
  asignar('🏪 🏢 🏬', 'tienda'); asignar('🔗', 'enlace'); asignar('🧹', 'escoba'); asignar('📤 ⬆', 'subir'); asignar('📥 ⬇', 'bajar');
  asignar('🎉 ✨ 🎊', 'chispa'); asignar('🔧 🛠 🔩', 'herramienta'); asignar('🔥', 'fuego'); asignar('🏦', 'banco'); asignar('📊', 'grafico');
  asignar('📈', 'tendencia'); asignar('📉', 'baja'); asignar('➕', 'mas'); asignar('🚀', 'cohete'); asignar('⚙', 'ajustes'); asignar('⚡', 'rayo');
  asignar('🕐 🕒 ⏰ ⏱ 🕑 🕓 🕔 🕕', 'reloj'); asignar('🎯', 'diana'); asignar('👁 👀', 'ojo'); asignar('💎', 'diamante'); asignar('📍', 'pin');
  asignar('🔳', 'qr'); asignar('⚖', 'balanza'); asignar('🏠 🏡', 'casa'); asignar('🚚', 'camion'); asignar('📦', 'caja'); asignar('🚪', 'puerta');
  asignar('💡', 'ampolleta'); asignar('🔎 🔍', 'lupa'); asignar('📜 📄 📃 📑', 'documento'); asignar('📒 📗 📚 📖 📓', 'libro'); asignar('❤ 💚 🤍', 'corazon', 'rojo');
  asignar('🗺', 'mapa'); asignar('🧭', 'brujula'); asignar('🛡', 'escudo'); asignar('🏆 🥇', 'trofeo', 'oro'); asignar('🚩 🏁', 'bandera');
  asignar('🖼', 'imagen'); asignar('🩺', 'pulso'); asignar('🚗 🚙 🚕 🛻 🏍 🛵', 'auto'); asignar('♾', 'infinito'); asignar('📎', 'clip');
  asignar('☁', 'nube'); asignar('📧 ✉ 📩', 'correo'); asignar('🪪 📇', 'carnet'); asignar('🌙', 'luna'); asignar('☀', 'sol'); asignar('🌓', 'contraste');
  asignar('⏸', 'pausa'); asignar('🌐 📡 🛰', 'mundo'); asignar('❓', 'ayuda'); asignar('🛟', 'salvavidas'); asignar('🗄 💻', 'servidor');
  asignar('🖥', 'pantalla'); asignar('👑', 'corona', 'oro'); asignar('🧮', 'calculadora'); asignar('🖨', 'impresora'); asignar('📞 ☎', 'telefono');
  asignar('↗', 'flecha'); asignar('👋', 'mano'); asignar('💪', 'musculo'); asignar('🟢', 'punto', 'verde'); asignar('🔴', 'punto', 'rojo');
  asignar('🟡 🟠', 'punto', 'ambar'); asignar('🔵', 'punto', 'azul'); asignar('⚪', 'punto', 'gris');
  asignar('🙂 😊 😀 😃 🥰 😌', 'cara'); asignar('🧩 🔲', 'apps'); asignar('🧠', 'cerebro');

  const SEL = 'nav a, nav button, button, a.btn, .btn, a.item, .item, .chip, summary, h1, h2, h3, h4, .tag, .pill, .banda, .banner, .aviso, .alerta, th, .kpi .t, .sec, li, .stats span, .titulo, label, a[class]';
  const FUERA = '.no-ico, [data-emoji], textarea, input, select, [contenteditable], .logo-mini, .logo, .avatar, .app-ico, .emoji, .chat, .mensajes, .burbuja, .msg, .lp-tel, #toast, .toast, svg, script, style';
  const RX = /^(\s*)(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)️?(\s*)/u;
  const css = document.createElement('style');
  css.textContent = '.ic-e{display:inline-flex;align-items:center;justify-content:center;vertical-align:-.17em;margin-right:.4em;flex:none;line-height:1}' +
    '.ic-e.solo{margin-right:0}.ic-e svg{width:1.12em;height:1.12em;display:block}.ic-e.verde{color:#16a34a}.ic-e.rojo{color:#dc2626}' +
    '.ic-e.ambar{color:#d97706}.ic-e.oro{color:#f59e0b}.ic-e.azul{color:#2563eb}.ic-e.gris{color:#94a3b8}';
  document.head.appendChild(css);

  function svg(n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';
  }
  // Un grupo de botones que son solo un emoji (selector de íconos o avatares) es contenido: se deja igual.
  function esSelector(el) {
    const p = el.parentElement; if (!p) return false;
    if (p.dataset.esSel !== undefined) return p.dataset.esSel === '1';
    let n = 0; for (const h of p.children) if (/^\s*\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*$/u.test(h.textContent)) n++;
    p.dataset.esSel = n >= 6 ? '1' : '0';
    return n >= 6;
  }
  function convertir(el) {
    if (el.closest(FUERA)) return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let t; while ((t = w.nextNode()) && !t.data.trim()) { /* busca el primer texto */ }
    if (!t || (t.parentElement && t.parentElement.closest(FUERA))) return;
    const m = RX.exec(t.data); if (!m) return;
    const clave = m[2].replace(/️/g, ''), d = M[clave]; if (!d) return;
    // ¿Queda texto después del emoji? (también el que viene en otra etiqueta: "🔄 <b>Hay que…</b>")
    const queda = el.textContent.replace(m[0], '').trim();
    const resto = t.data.slice(m[0].length);
    if (!queda && el.matches('button, .btn') && esSelector(el)) return;
    const s = document.createElement('span');
    s.className = 'ic-e' + (d[1] ? ' ' + d[1] : '') + (queda ? '' : ' solo');
    s.innerHTML = svg(d[0]);
    t.parentNode.insertBefore(s, t);
    t.data = resto;
  }
  let pendiente = new Set(), programado = false, obs = null;
  function procesar(raiz) {
    if (!raiz || raiz.nodeType !== 1) return;
    if (raiz.matches && raiz.matches(SEL)) convertir(raiz);
    raiz.querySelectorAll(SEL).forEach(convertir);
  }
  function correr() {
    programado = false;
    const lista = Array.from(pendiente); pendiente = new Set();
    if (obs) obs.disconnect();
    lista.forEach((n) => { if (n.isConnected) procesar(n.nodeType === 1 ? n : n.parentElement); });
    if (obs) obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function anotar(n) {
    if (!n) return;
    const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return;
    pendiente.add(e.closest(SEL) || e);
    if (!programado) { programado = true; requestAnimationFrame(correr); }
  }
  function iniciar() {
    procesar(document.body);
    obs = new MutationObserver((ms) => ms.forEach((m) => { if (m.type === 'characterData') anotar(m.target); else m.addedNodes.forEach(anotar); }));
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  // Para el núcleo: svg('usuario') dibuja un ícono por nombre; deEmoji('👤') da el nombre del ícono de ese emoji (o null).
  const deEmoji = (e) => { const m = RX.exec(String(e || '')); const d = m && M[m[2].replace(/️/g, '')]; return d ? d[0] : null; };
  window.CodeFixIconos = { procesar, iconos: Object.keys(P), svg: (n) => (P[n] ? svg(n) : ''), deEmoji };
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
