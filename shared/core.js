/* Núcleo compartido por todas las apps: almacenamiento local, avisos,
   notificaciones, copias de seguridad y licencias. Sin servidor. */
(function (global) {
  'use strict';

  const LICENSE_SALT = 'CFS-2026-cambia-esta-frase'; // cámbiala antes de vender

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
    navigator.serviceWorker.register(rootPath + 'sw.js', { scope: rootPath }).catch(() => {});
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

  // Licencias offline: la clave se deriva del nombre del cliente.
  // Es un freno para copias casuales, no una protección criptográfica.
  function hash53(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function licenseKey(product, owner) {
    const base = product.toUpperCase() + '|' + owner.trim().toUpperCase() + '|' + LICENSE_SALT;
    const raw = (hash53(base, 7).toString(36) + hash53(base, 13).toString(36)).toUpperCase();
    const k = raw.replace(/[^A-Z0-9]/g, '').padEnd(16, 'X').slice(0, 16);
    return k.match(/.{4}/g).join('-');
  }

  function checkLicense(product, owner, key) {
    return !!owner && !!key && licenseKey(product, owner) === key.trim().toUpperCase();
  }

  global.Core = {
    store, uid, money, esc, toast, registerSW, askNotify, notify, download,
    backup, restore, readImage, licenseKey, checkLicense, rootUrl
  };
})(window);
