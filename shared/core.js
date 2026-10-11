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
    // Si se publica una versión nueva, la app se recarga sola una vez para mostrarla.
    const habia = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (habia && !recargado) { recargado = true; location.reload(); }
    });
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
    opts = Object.assign({ icon: rootUrl() + 'icons/icon-192.png', badge: rootUrl() + 'icons/icon-192.png' }, opts || {});
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
    // Al iniciar sesión: aplica el color guardado de ese usuario.
    usar(uid) { aplicarTema(this.get(uid)); }
  };
  aplicarTema(tema.get()); // antes de pintar, sin parpadeo

  // Pie de página con la marca del autor en todas las pantallas.
  // Versión visible al pie de cada pantalla (para saber si el celular ya se actualizó).
  const APP_VERSION = '3.5';

  function marca() {
    const cfg = global.CFX_CONFIG || {};
    const el = document.createElement('footer');
    el.className = 'marca';
    el.innerHTML = '© ' + new Date().getFullYear() + ' <b>' + esc(cfg.MARCA || 'CodeFix') + '</b> · ' +
      esc(cfg.AUTOR || '') + '. Todos los derechos reservados. Prohibida su reventa. <span class="ver">v' + APP_VERSION + '</span>';
    (document.querySelector('main') || document.body).appendChild(el);
  }

  global.Core = {
    store, uid, money, esc, toast, registerSW, askNotify, notify, download,
    backup, restore, readImage, rootUrl, marca, tema, version: APP_VERSION
  };
})(window);
