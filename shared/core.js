/* Núcleo compartido por todas las apps: almacenamiento local, avisos,
   notificaciones, copias de seguridad y marca. */
(function (global) {
  'use strict';

  function store(ns) {
    const key = (k) => ns + ':' + k;
    return {
      get(k, def) {
        try {
          const v = localStorage.getItem(key(k));
          return v === null ? def : JSON.parse(v);
        } catch (e) { return def; }
      },
      set(k, v) {
        try { localStorage.setItem(key(k), JSON.stringify(v)); return true; }
        catch (e) { toast('Memoria llena: exporta una copia y borra datos viejos'); return false; }
      },
      dump() {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith(ns + ':')) out[k] = localStorage.getItem(k);
        }
        return out;
      },
      load(obj) {
        Object.keys(obj).forEach((k) => {
          if (k.startsWith(ns + ':')) localStorage.setItem(k, obj[k]);
        });
      }
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function money(n) {
    return '$' + Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function registerSW(rootPath) {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    // La app no se actualiza sola: ver Cuenta.revisarActualizacion() (botón "Actualizar").
    navigator.serviceWorker.register(rootPath + 'sw.js', { scope: rootPath, updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  }

  async function askNotify() {
    if (!('Notification' in global)) { toast('Este navegador no permite notificaciones'); return false; }
    if (Notification.permission === 'granted') return true;
    const p = await Notification.requestPermission();
    return p === 'granted';
  }

  // En Android las notificaciones solo funcionan a través del service worker.
  async function notify(title, opts) {
    opts = Object.assign({ icon: rootUrl() + 'icons/icon-192.png', badge: rootUrl() + 'icons/badge.png' }, opts || {});
    if (!('Notification' in global) || Notification.permission !== 'granted') {
      toast(title + (opts.body ? ' — ' + opts.body : ''));
      return;
    }
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) return reg.showNotification(title, opts);
      new Notification(title, opts);
    } catch (e) {
      toast(title);
    }
  }

  function rootUrl() {
    const s = document.querySelector('script[src*="shared/core.js"]');
    return s ? s.src.replace(/shared\/core\.js.*$/, '') : './';
  }

  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function backup(ns, label) {
    const data = { app: ns, fecha: new Date().toISOString(), datos: store(ns).dump() };
    download(label + '-respaldo-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data));
  }

  function restore(ns, file, done) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (data.app !== ns) throw new Error('otra app');
        store(ns).load(data.datos);
        toast('Respaldo restaurado');
        if (done) done();
      } catch (e) { toast('Archivo de respaldo no válido'); }
    };
    r.readAsText(file);
  }

  // Íconos de línea (estilo Lucide, licencia ISC/MIT), dibujados en SVG: nítidos y sin internet.
  const ICONOS = {
    paleta: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    carro: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    paquete: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    tendencia: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    megafono: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bolsa: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    caja: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    ojo: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    llave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    compartir: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4M12 2v13"/>',
    descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    nueva: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    contactos: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    estrella: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'
  };
  const ico = (n) => '<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + (ICONOS[n] || '') + '</svg>';
  // <span data-ico="paleta"></span> → ícono (se aplica solo al cargar cada pantalla).
  function ponerIconos(raiz) { (raiz || document).querySelectorAll('[data-ico]').forEach((e) => { e.innerHTML = ico(e.dataset.ico); e.removeAttribute('data-ico'); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ponerIconos()); else ponerIconos();

  // Logo chico (128 px, fondo blanco) para la barra de arriba: pesa ~6 KB. Acepta archivo o imagen en base64.
  function logoChico(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 128 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    });
  }

  // Calidad de fotos según su uso: viene del núcleo (fotos.js); estos valores son el respaldo.
  const FOTO = (k) => (global.CFX_FOTO && global.CFX_FOTO[k]) || { comprobante: { lado: 1000, calidad: 0.6, kb: 110 }, documento: { lado: 1400, calidad: 0.72, kb: 300 }, vitrina: { lado: 1080, calidad: 0.8, kb: 220 }, portada: { lado: 1280, calidad: 0.8, kb: 300 }, perfil: { lado: 400, calidad: 0.8, kb: 45 }, logo: { lado: 256, calidad: 0.85, kb: 30 } }[k];
  // Foto de producto (vitrina): tamaño y calidad del núcleo (fotos.js) para que se vea bien en el teléfono.
  function fotoChica(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const V = FOTO('vitrina'), k = Math.min(1, V.lado / Math.max(img.width, img.height)); // vitrina: que no se pixele en el teléfono
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        let q = V.calidad, d = c.toDataURL('image/jpeg', q);
        while (d.length > V.kb * 1400 && q > 0.4) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
        resolve(d);
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    });
  }

  // Foto de comprobante: legible pero liviana (máx. 1000 px, JPEG, ~120 KB). Si aún pesa, baja calidad y luego tamaño.
  function comprobante(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'), g = c.getContext('2d');
        let lado = FOTO('comprobante').lado, d = '';
        for (let vuelta = 0; vuelta < 4; vuelta++, lado = Math.round(lado * 0.8)) {
          const k = Math.min(1, lado / Math.max(img.width, img.height));
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          let q = 0.7;
          d = c.toDataURL('image/jpeg', q);
          while (d.length > FOTO('comprobante').kb * 1400 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
          if (d.length <= FOTO('comprobante').kb * 1400) break;
        }
        resolve(d);
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    });
  }

  // Elegir con un toque (ej. motivo del rechazo). Devuelve el texto elegido, o null si cierra.
  // "✏️ Otro…" pide escribirlo. opciones: lista de textos.
  function elegir(titulo, opciones, otro) {
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.className = 'elegir';
      d.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '"><b>' + esc(titulo) + '</b>' +
        opciones.map((o, i) => '<button type="button" class="alt" data-i="' + i + '">' + esc(o) + '</button>').join('') +
        (otro ? '<button type="button" class="alt" data-otro="1">✏️ Otro…</button>' : '') +
        '<button type="button" class="small" data-x="1">Cancelar</button></div>';
      const fin = (v) => { d.remove(); resolve(v); };
      d.onclick = (e) => {
        const b = e.target.closest('button');
        if (e.target === d || (b && b.dataset.x)) return fin(null);
        if (!b) return;
        if (b.dataset.otro) { const t = prompt(otro, ''); return fin(t && t.trim() ? t.trim() : null); }
        fin(opciones[+b.dataset.i]);
      };
      document.body.appendChild(d);
    });
  }

  // Copiar al portapapeles (con respaldo para celulares antiguos).
  function copiar(texto, aviso) {
    const ok = () => toast(aviso || '📋 Copiado');
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(String(texto)).then(ok).catch(() => copiarViejo(texto, ok));
    copiarViejo(texto, ok);
    return Promise.resolve();
  }
  function copiarViejo(texto, ok) {
    const t = document.createElement('textarea');
    t.value = String(texto); t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); ok(); } catch (e) { toast(String(texto)); }
    t.remove();
  }

  function readImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------- Color de marca de cada empresa ---------- */
  const COLORES = [
    ['Azul', '#2563eb'], ['Índigo', '#4f46e5'], ['Violeta', '#7c3aed'], ['Rosa', '#db2777'],
    ['Rojo', '#dc2626'], ['Naranja', '#ea580c'], ['Ámbar', '#d97706'], ['Verde', '#16a34a'],
    ['Esmeralda', '#059669'], ['Turquesa', '#0891b2'], ['Grafito', '#334155'], ['Negro', '#111827']
  ];
  const TEMA_KEY = 'cfx:tema';

  // Texto blanco o negro según lo claro que sea el color elegido.
  function tinta(hex) {
    const n = parseInt(hex.slice(1), 16);
    const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.62 ? '#0f172a' : '#ffffff';
  }

  function aplicarTema(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    const r = document.documentElement.style;
    r.setProperty('--brand', color);
    r.setProperty('--brand-ink', tinta(color));
    let m = document.querySelector('meta[name=theme-color]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = color;
  }

  const tema = {
    colores: COLORES,
    get(uid) {
      try { return localStorage.getItem(TEMA_KEY + (uid ? ':' + uid : '')) || localStorage.getItem(TEMA_KEY) || COLORES[0][1]; }
      catch (e) { return COLORES[0][1]; }
    },
    set(uid, color) {
      try { localStorage.setItem(TEMA_KEY + ':' + uid, color); localStorage.setItem(TEMA_KEY, color); } catch (e) { /* sin espacio */ }
      aplicarTema(color);
    },
    propio(uid) { try { return !!localStorage.getItem(TEMA_KEY + ':' + uid); } catch (e) { return false; } },
    aplicar: aplicarTema,
    // Al iniciar sesión: aplica el color guardado de ese usuario. Si no eligió uno, el de su tienda (respaldo).
    usar(uid, respaldo) {
      if (respaldo && /^#[0-9a-f]{6}$/i.test(respaldo) && !this.propio(uid)) { aplicarTema(respaldo); return; }
      aplicarTema(this.get(uid));
    }
  };
  aplicarTema(tema.get()); // antes de pintar, sin parpadeo

  // Pie de página con la marca (solo "CodeFix") en todas las pantallas.
  // Versión visible al pie de cada pantalla (para saber si el celular ya se actualizó).
  const APP_VERSION = '5.28';

  function marca() {
    const cfg = global.CFX_CONFIG || {};
    const el = document.createElement('footer');
    el.className = 'marca';
    el.innerHTML = '© ' + new Date().getFullYear() + ' <b>' + esc(cfg.MARCA || 'CodeFix') + '</b>. Todos los derechos reservados. Prohibida su reventa. <span class="ver">v' + APP_VERSION + '</span>';
    (document.querySelector('main') || document.body).appendChild(el);
  }

  // Rubros para el registro de negocios: cada uno trae ejemplos para guiar la primera carga.
  const RUBROS = [
    ['🍰', 'Comida y repostería', 'Torta de chocolate · $15.000'], ['🍔', 'Restaurante y delivery', 'Completo italiano · $3.500'],
    ['🛒', 'Almacén y minimarket', 'Pan amasado (kg) · $2.200'], ['👗', 'Ropa y accesorios', 'Polerón con capucha (S, M, L) · $18.990'],
    ['💅', 'Belleza y estética', 'Manicure semipermanente · $12.000'], ['💪', 'Salud y deporte', 'Clase de yoga · $6.000'],
    ['🔧', 'Servicios y oficios', 'Visita técnica · $20.000'], ['💻', 'Tecnología', 'Cambio de pantalla · $35.000'],
    ['🎨', 'Artesanía y regalos', 'Taza personalizada · $7.990'], ['🐾', 'Mascotas', 'Baño y corte · $14.000'],
    ['🏠', 'Hogar y decoración', 'Cojín decorativo · $9.990'], ['🌱', 'Plantas y jardín', 'Suculenta en macetero · $4.500'],
    ['📚', 'Clases y cursos', 'Clase particular (1 h) · $10.000'], ['✨', 'Otro', 'Tu producto o servicio · $10.000']
  ];

  global.Core = {
    RUBROS,
    store, uid, money, esc, toast, registerSW, askNotify, notify, download,
    backup, restore, readImage, logoChico, fotoChica, comprobante, elegir, copiar, rootUrl, marca, tema, ico, ponerIconos, version: APP_VERSION
  };
})(window);
