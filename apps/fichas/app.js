(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const W = 1080, H = 1350;

  Core.registerSW('../../');
  Core.marca();
  const cuenta = await Cuenta.require('../../');
  const sb = Cuenta.sb;
  // Datos separados por usuario en este celular.
  const db = Core.store('fichas:' + cuenta.id);
  migrarDatosViejos();

  function migrarDatosViejos() {
    if (localStorage.getItem('fichas:migrado')) return;
    const viejo = Core.store('fichas').dump();
    Object.keys(viejo).forEach((k) => localStorage.setItem(k.replace(/^fichas:/, 'fichas:' + cuenta.id + ':'), viejo[k]));
    Object.keys(viejo).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('fichas:migrado', '1');
  }

  const DEFAULT = {
    plantilla: 'oferta', titulo: 'GRAN OFERTA', subtitulo: 'Solo por esta semana',
    precio: '19.99', antes: '29.99', cta: '¡Pide ya por WhatsApp!',
    color1: Core.tema.get(cuenta.id), color2: '#f59e0b', foto: null, lista: '', qr: false
  };

  let ficha = db.get('borrador', Object.assign({}, DEFAULT));
  let fichas = db.get('fichas', []);
  let clientes = db.get('clientes', []);
  let campanas = db.get('campanas', []);
  let ajustes = db.get('ajustes', { negocio: 'Mi Negocio', tel: '', logo: null });
  let editId = null;

  const licensed = () => Cuenta.isPro();
  const FREE_LIMIT = { fichas: 5, clientes: 30 };
  const FREE_TEMPLATES = ['oferta', 'nuevo'];
  const soloPro = (que) => Core.toast('⭐ ' + que + ' es de la versión Pro. Actívala en Ajustes.');

  /* ---------- Navegación ---------- */
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    b.onclick = () => show(b.dataset.v);
  });
  function show(v) {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    document.querySelectorAll('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
    scrollTo(0, 0);
    if (v === 'galeria') renderGaleria();
    if (v === 'clientes') renderClientes();
    if (v === 'campanas') { renderCampanas(); cargarAuto(); renderSubs(); }
  }

  /* ---------- Dibujo de la ficha ---------- */
  const cv = $('lienzo'), ctx = cv.getContext('2d');
  const imgCache = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgCache[src]) return Promise.resolve(imgCache[src]);
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => { imgCache[src] = i; res(i); };
      i.onerror = () => res(null);
      i.src = src;
    });
  }

  function wrap(text, x, y, maxW, lineH, maxLines, align) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    const out = lines.slice(0, maxLines || 9);
    ctx.textAlign = align || 'center';
    out.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return out.length * lineH;
  }

  function cover(img, x, y, w, h) {
    const k = Math.max(w / img.width, h / img.height);
    const sw = w / k, sh = h / k;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const font = (w, s) => w + ' ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fmtPrice = (p) => (p === '' || p == null) ? '' : (isNaN(+p) ? String(p) : Core.money(p));

  function priceBadge(f, cx, cy, r) {
    if (!f.precio) return;
    ctx.fillStyle = f.color2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1830';
    if (f.antes) {
      ctx.font = font('600', r * 0.26);
      ctx.textAlign = 'center';
      const t = fmtPrice(f.antes);
      ctx.fillText(t, cx, cy - r * 0.28);
      const tw = ctx.measureText(t).width;
      ctx.fillRect(cx - tw / 2, cy - r * 0.36, tw, 5);
    }
    ctx.font = font('900', r * 0.42);
    ctx.textAlign = 'center';
    ctx.fillText(fmtPrice(f.precio), cx, cy + r * (f.antes ? 0.25 : 0.15), r * 1.8);
  }

  function footer(f, logo, dark) {
    const y = H - 110;
    ctx.fillStyle = dark ? 'rgba(0,0,0,.55)' : f.color1;
    ctx.fillRect(0, y, W, 110);
    let x = 40;
    if (logo) {
      ctx.save(); rounded(x, y + 15, 80, 80, 16); ctx.clip(); cover(logo, x, y + 15, 80, 80); ctx.restore();
      x += 100;
    }
    const qr = f.qr && licensed() && ajustes.tel ? qrCanvas('https://wa.me/' + ajustes.tel.replace(/[^\d]/g, ''), 96) : null;
    const maxW = W - x - 40 - (qr ? 120 : 0);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = font('800', 36);
    ctx.fillText(ajustes.negocio || '', x, y + 50, maxW);
    ctx.font = font('500', 30);
    ctx.fillText(ajustes.tel ? '📲 ' + ajustes.tel : '', x, y + 90, maxW);
    if (qr) {
      ctx.fillStyle = '#fff'; ctx.fillRect(W - 40 - 104, y + 3, 104, 104);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr, W - 40 - 100, y + 7, 96, 96);
      ctx.imageSmoothingEnabled = true;
    }
  }

  function qrCanvas(text, size) {
    const q = qrcode(0, 'M');
    q.addData(text); q.make();
    const n = q.getModuleCount(), c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(k, r, 1, 1);
    return c;
  }

  const TEMPLATES = {
    oferta: { nombre: 'Oferta', draw(f, foto, logo) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, f.color1); g.addColorStop(1, shade(f.color1, -45));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = font('900', 110);
      const th = wrap(f.titulo.toUpperCase(), W / 2, 160, W - 100, 115, 2);
      ctx.font = font('500', 46);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      wrap(f.subtitulo, W / 2, 160 + th + 10, W - 120, 54, 2);
      if (foto) {
        ctx.save(); rounded(110, 470, W - 220, 560, 40); ctx.clip(); cover(foto, 110, 470, W - 220, 560); ctx.restore();
      }
      priceBadge(f, W - 180, 910, 140);
      if (f.cta) {
        ctx.fillStyle = f.color2; rounded(110, 1080, W - 220, 110, 55); ctx.fill();
        ctx.fillStyle = '#1c1830'; ctx.font = font('800', 46); ctx.textAlign = 'center';
        ctx.fillText(f.cta, W / 2, 1152, W - 280);
      }
      footer(f, logo, true);
    } },
    nuevo: { nombre: 'Producto', draw(f, foto, logo) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      if (foto) cover(foto, 0, 0, W, 700); else { ctx.fillStyle = shade(f.color1, 70); ctx.fillRect(0, 0, W, 700); }
      ctx.fillStyle = f.color2; ctx.fillRect(0, 700, W, 14);
      ctx.fillStyle = f.color1; ctx.font = font('900', 92);
      const th = wrap(f.titulo, W / 2, 830, W - 100, 98, 2);
      ctx.fillStyle = '#444'; ctx.font = font('500', 44);
      wrap(f.subtitulo, W / 2, 830 + th + 4, W - 120, 52, 2);
      priceBadge(f, W - 170, 560, 130);
      if (f.cta) {
        ctx.fillStyle = f.color1; ctx.font = font('800', 44); ctx.textAlign = 'center';
        ctx.fillText('👉 ' + f.cta, W / 2, 1180, W - 100);
      }
      footer(f, logo, false);
    } },
    evento: { nombre: 'Evento', draw(f, foto, logo) {
      ctx.fillStyle = shade(f.color1, -70); ctx.fillRect(0, 0, W, H);
      if (foto) { ctx.globalAlpha = 0.35; cover(foto, 0, 0, W, H); ctx.globalAlpha = 1; }
      ctx.strokeStyle = f.color2; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 210);
      ctx.fillStyle = f.color2; ctx.font = font('700', 40); ctx.textAlign = 'center';
      ctx.fillText('★ ★ ★', W / 2, 170);
      ctx.fillStyle = '#fff'; ctx.font = font('900', 120);
      const th = wrap(f.titulo.toUpperCase(), W / 2, 330, W - 160, 125, 3);
      ctx.fillStyle = f.color2; ctx.font = font('600', 52);
      wrap(f.subtitulo, W / 2, 330 + th + 30, W - 180, 60, 3);
      if (f.precio) {
        ctx.fillStyle = '#fff'; ctx.font = font('900', 90);
        ctx.fillText(fmtPrice(f.precio), W / 2, 1010);
      }
      if (f.cta) { ctx.fillStyle = '#fff'; ctx.font = font('700', 44); ctx.fillText(f.cta, W / 2, 1110, W - 180); }
      footer(f, logo, true);
    } },
    foto: { nombre: 'Foto completa', draw(f, foto, logo) {
      if (foto) cover(foto, 0, 0, W, H); else { ctx.fillStyle = f.color1; ctx.fillRect(0, 0, W, H); }
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = font('900', 96);
      ctx.textAlign = 'left';
      const lines = 2, top = 860;
      const th = wrap(f.titulo, 60, top, W - 120, 100, lines, 'left');
      ctx.fillStyle = f.color2; ctx.font = font('600', 46);
      wrap(f.subtitulo, 60, top + th + 6, W - 120, 54, 2, 'left');
      priceBadge(f, W - 170, 170, 125);
      if (f.cta) {
        ctx.fillStyle = f.color2; rounded(60, 1110, 600, 90, 45); ctx.fill();
        ctx.fillStyle = '#1c1830'; ctx.font = font('800', 38); ctx.textAlign = 'center';
        ctx.fillText(f.cta, 360, 1168, 560);
      }
      footer(f, logo, true);
    } },
    lista: { nombre: 'Menú / Precios', draw(f, foto, logo) {
      ctx.fillStyle = '#fffaf2'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = f.color1; ctx.fillRect(0, 0, W, 300);
      if (foto) { ctx.save(); ctx.globalAlpha = 0.3; cover(foto, 0, 0, W, 300); ctx.restore(); }
      ctx.fillStyle = '#fff'; ctx.font = font('900', 90);
      wrap(f.titulo.toUpperCase(), W / 2, 150, W - 100, 92, 1);
      ctx.font = font('500', 42); ctx.fillStyle = 'rgba(255,255,255,.9)';
      wrap(f.subtitulo, W / 2, 230, W - 120, 48, 1);
      const items = String(f.lista || '').split(/\n/).map((l) => l.split(/=|:|\t/)).filter((p) => p[0] && p[0].trim()).slice(0, 9);
      const top = 380, step = Math.min(90, 640 / Math.max(items.length, 1));
      items.forEach((p, i) => {
        const y = top + i * step;
        const nombre = p[0].trim(), precio = (p[1] || '').trim();
        ctx.font = font('700', 44); ctx.fillStyle = '#1c1830'; ctx.textAlign = 'left';
        ctx.fillText(nombre, 70, y, 640);
        if (precio) {
          ctx.textAlign = 'right'; ctx.fillStyle = f.color1; ctx.font = font('900', 46);
          ctx.fillText(fmtPrice(precio), W - 70, y);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(70, y + 22); ctx.lineTo(W - 70, y + 22); ctx.stroke(); ctx.setLineDash([]);
      });
      if (!items.length) {
        ctx.font = font('500', 40); ctx.fillStyle = '#999'; ctx.textAlign = 'center';
        ctx.fillText('Escribe tus productos y precios', W / 2, 600);
      }
      if (f.cta) {
        ctx.fillStyle = f.color2; rounded(110, 1090, W - 220, 100, 50); ctx.fill();
        ctx.fillStyle = '#1c1830'; ctx.font = font('800', 42); ctx.textAlign = 'center';
        ctx.fillText(f.cta, W / 2, 1155, W - 280);
      }
      footer(f, logo, false);
    } }
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return '#' + ((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0');
  }

  let drawToken = 0;
  async function draw(f) {
    const token = ++drawToken;
    const [foto, logo] = await Promise.all([loadImg(f.foto), loadImg(ajustes.logo)]);
    if (token !== drawToken) return;
    ctx.clearRect(0, 0, W, H);
    const tpl = licensed() || FREE_TEMPLATES.includes(f.plantilla) ? f.plantilla : 'oferta';
    (TEMPLATES[tpl] || TEMPLATES.oferta).draw(f, foto, logo);
    if (!licensed()) {
      ctx.save();
      ctx.font = font('700', 26); ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillText('Hecho con FichaPro · CodeFix · versión Free', W - 28, H - 123);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText('Hecho con FichaPro · CodeFix · versión Free', W - 30, H - 125);
      ctx.restore();
    }
  }

  /* ---------- Formulario ---------- */
  const fields = ['titulo', 'subtitulo', 'precio', 'antes', 'cta', 'color1', 'color2', 'lista'];
  function fillForm() {
    fields.forEach((k) => { $('f-' + k).value = ficha[k] || ''; });
    $('f-qr').checked = !!ficha.qr && licensed();
    $('rowLista').classList.toggle('hidden', ficha.plantilla !== 'lista');
    $('tpls').innerHTML = Object.keys(TEMPLATES).map((k) => {
      const lock = !licensed() && !FREE_TEMPLATES.includes(k);
      return '<button class="small ' + (ficha.plantilla === k ? 'on' : 'alt') + (lock ? ' lock' : '') + '" data-t="' + k + '">' +
        TEMPLATES[k].nombre + '</button>';
    }).join('');
  }
  $('tpls').onclick = (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    if (!licensed() && !FREE_TEMPLATES.includes(t)) return soloPro('La plantilla ' + TEMPLATES[t].nombre);
    ficha.plantilla = t; changed(); fillForm();
  };
  $('f-qr').onchange = (e) => {
    if (e.target.checked && !licensed()) { e.target.checked = false; return soloPro('El código QR'); }
    if (e.target.checked && !ajustes.tel) { e.target.checked = false; return Core.toast('Primero escribe tu WhatsApp en Ajustes'); }
    ficha.qr = e.target.checked; changed();
  };
  fields.forEach((k) => { $('f-' + k).addEventListener('input', (e) => { ficha[k] = e.target.value; changed(); }); });
  $('f-foto').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    ficha.foto = await Core.readImage(file, 1080);
    e.target.value = '';
    changed();
  };
  $('bQuitarFoto').onclick = () => { ficha.foto = null; changed(); };

  let saveT;
  function changed() {
    draw(ficha);
    clearTimeout(saveT);
    saveT = setTimeout(() => db.set('borrador', ficha), 400);
  }

  function canvasBlob() {
    return new Promise((r) => cv.toBlob(r, 'image/png'));
  }

  $('bGuardar').onclick = async () => {
    if (!editId && !licensed() && fichas.length >= FREE_LIMIT.fichas) {
      return Core.toast('La prueba guarda hasta ' + FREE_LIMIT.fichas + ' fichas. Activa tu licencia.');
    }
    await draw(ficha);
    const thumb = thumbnail();
    const data = Object.assign({}, ficha, { thumb, fecha: Date.now() });
    if (editId) {
      fichas = fichas.map((x) => x.id === editId ? Object.assign(data, { id: editId }) : x);
    } else {
      editId = Core.uid();
      fichas.unshift(Object.assign(data, { id: editId }));
    }
    if (db.set('fichas', fichas)) Core.toast('Ficha guardada en la galería');
  };

  function thumbnail() {
    const c = document.createElement('canvas');
    c.width = 270; c.height = 338;
    c.getContext('2d').drawImage(cv, 0, 0, 270, 338);
    return c.toDataURL('image/jpeg', 0.7);
  }

  $('bDescargar').onclick = async () => {
    await draw(ficha);
    Core.download(slug(ficha.titulo) + '.png', await canvasBlob());
  };

  $('bCompartir').onclick = async () => {
    await draw(ficha);
    shareImage(await canvasBlob(), ficha.titulo, '');
  };

  $('bNueva').onclick = () => {
    ficha = Object.assign({}, DEFAULT, { color1: ficha.color1, color2: ficha.color2, plantilla: ficha.plantilla });
    editId = null; fillForm(); changed();
  };

  const slug = (s) => (s || 'ficha').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ficha';

  async function shareImage(blob, title, text) {
    const file = new File([blob], slug(title) + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    Core.download(file.name, blob);
    if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    Core.toast('Imagen descargada' + (text ? ' y mensaje copiado' : '') + '. Adjúntala en WhatsApp.');
    return true;
  }

  /* ---------- Galería ---------- */
  function renderGaleria() {
    const g = $('gal');
    if (!fichas.length) { g.innerHTML = '<p class="empty">Aún no guardas fichas. Diseña una y toca 💾.</p>'; return; }
    g.innerHTML = fichas.map((f) =>
      '<figure><img src="' + f.thumb + '" alt=""><figcaption><b style="flex-basis:100%">' + Core.esc(f.titulo) + '</b>' +
      '<button class="small" data-a="edit" data-id="' + f.id + '">Editar</button>' +
      '<button class="small alt" data-a="dup" data-id="' + f.id + '">Copiar</button>' +
      '<button class="small danger" data-a="del" data-id="' + f.id + '">✕</button></figcaption></figure>'
    ).join('');
  }
  $('gal').onclick = (e) => {
    const { a, id } = e.target.dataset;
    if (!a) return;
    const f = fichas.find((x) => x.id === id);
    if (a === 'edit' || a === 'dup') {
      ficha = Object.assign({}, f); delete ficha.thumb; delete ficha.id; delete ficha.fecha;
      editId = a === 'edit' ? id : null;
      fillForm(); changed(); show('disenar');
    }
    if (a === 'del' && confirm('¿Eliminar esta ficha?')) {
      fichas = fichas.filter((x) => x.id !== id);
      if (editId === id) editId = null;
      db.set('fichas', fichas); renderGaleria();
    }
  };

  /* ---------- Clientes ---------- */
  const normTel = (t) => String(t || '').replace(/[^\d]/g, '');
  function tags() { return [...new Set(clientes.map((c) => c.tag).filter(Boolean))].sort(); }

  function addCliente(nombre, tel, tag) {
    nombre = (nombre || '').trim(); tel = normTel(tel);
    if (!nombre || tel.length < 7) return false;
    if (clientes.some((c) => c.tel === tel)) return false;
    if (!licensed() && clientes.length >= FREE_LIMIT.clientes) {
      Core.toast('La prueba admite ' + FREE_LIMIT.clientes + ' clientes. Activa tu licencia.');
      return false;
    }
    clientes.push({ id: Core.uid(), nombre, tel, tag: (tag || '').trim().toLowerCase() });
    return true;
  }

  $('bAddCliente').onclick = () => {
    if (addCliente($('c-nombre').value, $('c-tel').value, $('c-tag').value)) {
      db.set('clientes', clientes);
      $('c-nombre').value = ''; $('c-tel').value = '';
      renderClientes(); Core.toast('Cliente agregado');
    } else Core.toast('Revisa nombre y teléfono (o ya existe)');
  };

  if ('contacts' in navigator && 'select' in navigator.contacts) {
    $('bContactos').hidden = false;
    $('bContactos').onclick = async () => {
      try {
        const list = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        let n = 0;
        list.forEach((c) => { if (addCliente((c.name || [])[0], (c.tel || [])[0], $('c-tag').value)) n++; });
        db.set('clientes', clientes); renderClientes(); Core.toast(n + ' contactos importados');
      } catch (e) { /* cancelado */ }
    };
  }

  $('c-csv').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let n = 0;
      r.result.split(/\r?\n/).forEach((line) => {
        const [nom, tel, tag] = line.split(/[,;\t]/);
        if (addCliente(nom, tel, tag)) n++;
      });
      db.set('clientes', clientes); renderClientes(); Core.toast(n + ' clientes importados');
    };
    r.readAsText(file);
    e.target.value = '';
  };

  $('c-buscar').oninput = renderClientes;
  function renderClientes() {
    $('tagsList').innerHTML = tags().map((t) => '<option value="' + Core.esc(t) + '">').join('');
    const q = $('c-buscar').value.toLowerCase();
    const list = clientes.filter((c) => !q || (c.nombre + c.tel + c.tag).toLowerCase().includes(q));
    $('clientes').innerHTML = list.length ? list.map((c) =>
      '<li><div class="grow"><b>' + Core.esc(c.nombre) + '</b><div class="muted">+' + c.tel + '</div></div>' +
      (c.tag ? '<span class="pill">' + Core.esc(c.tag) + '</span>' : '') +
      '<button class="small danger" data-id="' + c.id + '">✕</button></li>'
    ).join('') : '<li class="empty">Sin clientes todavía</li>';
  }
  $('clientes').onclick = (e) => {
    const id = e.target.dataset.id;
    if (!id || !confirm('¿Eliminar cliente?')) return;
    clientes = clientes.filter((c) => c.id !== id);
    db.set('clientes', clientes); renderClientes();
  };

  /* ---------- Campañas ---------- */
  function renderCampanas() {
    $('k-ficha').innerHTML = fichas.length
      ? fichas.map((f) => '<option value="' + f.id + '">' + Core.esc(f.titulo) + '</option>').join('')
      : '<option value="">Primero guarda una ficha</option>';
    $('k-tag').innerHTML = '<option value="">Todos los clientes (' + clientes.length + ')</option>' +
      tags().map((t) => '<option value="' + Core.esc(t) + '">Etiqueta: ' + Core.esc(t) + ' (' +
        clientes.filter((c) => c.tag === t).length + ')</option>').join('');
    if (!$('k-fecha').value) $('k-fecha').value = localInput(Date.now() + 3600e3);

    const sorted = campanas.slice().sort((a, b) => a.fecha - b.fecha);
    $('campanas').innerHTML = sorted.length ? sorted.map((k) => {
      const dest = destinatarios(k);
      const enviados = dest.filter((c) => k.enviados.includes(c.id)).length;
      const f = fichas.find((x) => x.id === k.fichaId);
      const n = k.notifId && estadoAuto[k.notifId];
      const auto = k.notifId ? '<div class="muted">' + (k.canales || []).map((c) => c === 'push' ? '🔔' : '✉️').join('') + ' ' +
        (!n ? 'Automática' : n.status === 'sent' ? 'Enviada: ' + n.push_sent + ' notificaciones, ' + n.email_sent + ' correos'
          : n.status === 'failed' ? 'Falló: ' + Core.esc(n.error || '') : n.status === 'cancelled' ? 'Cancelada' : 'Programada') + '</div>' : '';
      return '<li>' + (f ? '<img class="thumb" src="' + f.thumb + '" alt="">' : '') +
        '<div class="grow"><b>' + Core.esc(k.nombre) + '</b><div class="muted">' +
        new Date(k.fecha).toLocaleString('es') + ' · WhatsApp ' + enviados + '/' + dest.length + '</div>' + auto + '</div>' +
        '<button class="small ok" data-a="send" data-id="' + k.id + '">Enviar</button>' +
        '<button class="small danger" data-a="del" data-id="' + k.id + '">✕</button></li>';
    }).join('') : '<li class="empty">No hay campañas programadas</li>';
  }

  const localInput = (t) => {
    const d = new Date(t);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const destinatarios = (k) => clientes.filter((c) => !k.tag || c.tag === k.tag);

  ['k-push', 'k-mail'].forEach((id) => {
    $(id).onchange = (e) => { if (e.target.checked && !licensed()) { e.target.checked = false; soloPro('El envío automático'); } };
  });

  $('bAddCampana').onclick = async () => {
    const fichaId = $('k-ficha').value;
    const fecha = new Date($('k-fecha').value).getTime();
    if (!fichaId) return Core.toast('Guarda una ficha primero');
    if (!fecha) return Core.toast('Elige fecha y hora');
    const canales = [$('k-push').checked && 'push', $('k-mail').checked && 'email'].filter(Boolean);
    const k = {
      id: Core.uid(), nombre: $('k-nombre').value.trim() || 'Campaña', fichaId,
      tag: $('k-tag').value, msg: $('k-msg').value, fecha, avisado: fecha <= Date.now(), enviados: [], canales
    };
    $('bAddCampana').disabled = true;
    try {
      if (canales.length) {
        Core.toast('Subiendo la ficha…');
        k.notifId = await programarAutomatico(k);
        k.avisado = true; // el servidor la envía solo; no hace falta recordatorio
      }
      campanas.push(k);
      db.set('campanas', campanas);
      $('k-nombre').value = ''; $('k-push').checked = false; $('k-mail').checked = false;
      renderCampanas();
      if (canales.length) Core.toast('✅ Programada: se enviará sola a tus suscriptores');
      else if (await Core.askNotify()) Core.toast('Te avisaré a la hora programada');
    } catch (err) {
      Core.toast(err.message);
    } finally { $('bAddCampana').disabled = false; }
  };

  // Sube la imagen de la ficha y deja la notificación programada en el servidor.
  async function programarAutomatico(k) {
    const f = fichas.find((x) => x.id === k.fichaId);
    await draw(f);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    await draw(ficha);
    const path = cuenta.id + '/' + k.id + '.jpg';
    const up = await sb.storage.from('fichas').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw new Error('No se pudo subir la imagen: ' + up.error.message);
    const image = sb.storage.from('fichas').getPublicUrl(path).data.publicUrl;
    const n = await Cuenta.rpc('schedule_notification', {
      p_title: f.titulo + (f.precio ? ' · ' + fmtPrice(f.precio) : ''),
      p_body: k.msg.replace(/\{nombre\}\s*/g, ''), p_image: image,
      p_url: ajustes.tel ? 'https://wa.me/' + ajustes.tel.replace(/[^\d]/g, '') + '?text=' + encodeURIComponent('Hola, vi su oferta: ' + f.titulo) : image,
      p_audience: 'my_subscribers', p_channels: k.canales, p_send_at: new Date(k.fecha).toISOString()
    });
    return n.id;
  }

  $('campanas').onclick = (e) => {
    const { a, id } = e.target.dataset;
    if (a === 'del' && confirm('¿Eliminar campaña?')) {
      const k = campanas.find((x) => x.id === id);
      if (k && k.notifId) Cuenta.rpc('cancel_notification', { p_id: k.notifId }).catch(() => {});
      campanas = campanas.filter((k) => k.id !== id);
      db.set('campanas', campanas); $('envio').hidden = true; renderCampanas();
    }
    if (a === 'send') abrirEnvio(id);
  };

  let envioId = null, envioBlob = null;
  async function abrirEnvio(id) {
    const k = campanas.find((x) => x.id === id);
    if (!k) return;
    envioId = id;
    const f = fichas.find((x) => x.id === k.fichaId);
    envioBlob = null;
    if (f) {
      // Dibuja la ficha de la campaña en el lienzo, toma la imagen y vuelve al borrador.
      await draw(f);
      envioBlob = await canvasBlob();
      await draw(ficha);
    }
    $('envio').hidden = false;
    $('envioTitulo').textContent = '📤 ' + k.nombre;
    renderEnvio();
    $('envio').scrollIntoView({ behavior: 'smooth' });
  }

  function renderEnvio() {
    const k = campanas.find((x) => x.id === envioId);
    if (!k) return;
    const dest = destinatarios(k);
    $('envioLista').innerHTML = dest.length ? dest.map((c) => {
      const done = k.enviados.includes(c.id);
      return '<li class="' + (done ? 'sent' : '') + '"><div class="grow"><b>' + Core.esc(c.nombre) + '</b>' +
        '<div class="muted">+' + c.tel + '</div></div>' +
        '<button class="small warn" data-a="img" data-id="' + c.id + '">📷</button>' +
        '<button class="small ok" data-a="wa" data-id="' + c.id + '">💬</button></li>';
    }).join('') + '<li><button class="alt small" data-a="estado">Compartir en mi Estado / grupos</button></li>'
      : '<li class="empty">No hay clientes para esta campaña</li>';
  }

  $('envioLista').onclick = async (e) => {
    const { a, id } = e.target.dataset;
    const k = campanas.find((x) => x.id === envioId);
    if (!a || !k) return;
    if (a === 'estado') { if (envioBlob) shareImage(envioBlob, k.nombre, k.msg.replace(/\{nombre\}/g, '')); return; }
    const c = clientes.find((x) => x.id === id);
    const text = k.msg.replace(/\{nombre\}/g, c.nombre.split(' ')[0]);
    let ok = true;
    if (a === 'wa') window.open('https://wa.me/' + c.tel + '?text=' + encodeURIComponent(text), '_blank');
    if (a === 'img') ok = envioBlob ? await shareImage(envioBlob, k.nombre, text) : false;
    if (ok && !k.enviados.includes(c.id)) {
      k.enviados.push(c.id);
      db.set('campanas', campanas);
    }
    renderEnvio(); renderCampanas();
  };

  /* ---------- Recordatorios ---------- */
  function revisar() {
    const now = Date.now();
    let cambio = false;
    campanas.forEach((k) => {
      if (!k.avisado && k.fecha <= now) {
        k.avisado = true; cambio = true;
        Core.notify('Hora de enviar: ' + k.nombre, {
          body: destinatarios(k).length + ' clientes esperan tu ficha',
          tag: 'camp-' + k.id,
          data: { url: location.href.split('#')[0] + '#camp=' + k.id }
        });
      }
    });
    if (cambio) db.set('campanas', campanas);
    const pend = campanas.filter((k) => k.avisado && k.enviados.length < destinatarios(k).length);
    $('pendientes').innerHTML = pend.length
      ? '<div class="banner">⏰ Tienes ' + pend.length + ' campaña(s) por enviar. <a href="#" id="verPend">Ver</a></div>' : '';
    const v = $('verPend');
    if (v) v.onclick = (e) => { e.preventDefault(); show('campanas'); abrirEnvio(pend[0].id); };
  }
  setInterval(revisar, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

  /* ---------- Ajustes ---------- */
  function fillAjustes() {
    $('a-negocio').value = ajustes.negocio || '';
    $('a-tel').value = ajustes.tel || '';
    const ok = licensed(), a = Cuenta.account;
    $('licEstado').textContent = ok
      ? '⭐ Versión Pro' + (a.is_admin ? ' (administrador)' : a.pro_until ? ' hasta el ' + new Date(a.pro_until).toLocaleDateString('es') : ' permanente') + ' · ' + a.email
      : 'Versión Free: marca de agua, ' + FREE_TEMPLATES.length + ' plantillas, ' + FREE_LIMIT.fichas + ' fichas y ' +
        FREE_LIMIT.clientes + ' clientes. Pide tu key Pro para desbloquear todo.';
    $('rowKey').classList.toggle('hidden', ok);
    $('licTag').textContent = ok ? 'PRO' : 'FREE';
    $('licTag').classList.toggle('pro', ok);
  }
  $('bGuardarAjustes').onclick = () => {
    ajustes.negocio = $('a-negocio').value.trim();
    ajustes.tel = $('a-tel').value.trim();
    db.set('ajustes', ajustes); draw(ficha); Core.toast('Guardado');
  };
  $('a-logo').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    ajustes.logo = await Core.readImage(file, 256);
    db.set('ajustes', ajustes); draw(ficha); e.target.value = '';
  };
  $('bQuitarLogo').onclick = () => { ajustes.logo = null; db.set('ajustes', ajustes); draw(ficha); };
  $('bNotif').onclick = async () => Core.toast(await Core.askNotify() ? 'Notificaciones activadas' : 'Permiso denegado');
  $('bProbar').onclick = () => Core.notify('FichaPro', { body: 'Así te avisaré de tus campañas 📣' });
  $('bActivar').onclick = async () => {
    try {
      await Cuenta.redeem($('l-key').value);
      Core.toast('🎉 ¡Versión Pro activada!');
      fillAjustes(); fillForm(); draw(ficha);
    } catch (err) { Core.toast(err.message); }
  };

  /* ---------- Suscriptores (Pro) ---------- */
  const linkSubs = Core.rootUrl() + 'apps/suscribirse/?n=' + cuenta.id;
  async function renderSubs() {
    const pro = licensed();
    $('subsPro').classList.toggle('hidden', !pro);
    $('subsFree').classList.toggle('hidden', pro);
    if (!pro) return;
    $('subsLink').value = linkSubs;
    if (!$('subsQr').src) $('subsQr').src = qrCanvas(linkSubs).toDataURL();
    try {
      const { data, error } = await sb.from('subscribers').select('id,nombre,email,endpoint,created_at').order('created_at', { ascending: false });
      if (error) throw error;
      $('subsLista').innerHTML = '<li class="muted">' + data.length + ' suscriptor(es) · 🔔 ' +
        data.filter((x) => x.endpoint).length + ' con notificaciones · ✉️ ' + data.filter((x) => x.email).length + ' con correo</li>' +
        data.slice(0, 50).map((x) => '<li><div class="grow"><b>' + Core.esc(x.nombre || 'Sin nombre') + '</b><div class="muted">' +
          (x.endpoint ? '🔔 ' : '') + Core.esc(x.email || '') + '</div></div>' +
          '<button class="small danger" data-id="' + x.id + '">✕</button></li>').join('');
    } catch (e) { $('subsLista').innerHTML = '<li class="empty">Sin conexión</li>'; }
  }
  $('subsLista').onclick = async (e) => {
    const id = e.target.dataset.id;
    if (!id || !confirm('¿Quitar este suscriptor?')) return;
    await sb.from('subscribers').delete().eq('id', id);
    renderSubs();
  };
  $('bSubsShare').onclick = async () => {
    const text = '🔔 Recibe nuestras ofertas exclusivas de ' + (ajustes.negocio || cuenta.empresa || 'nuestro negocio') + ' aquí: ' + linkSubs;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };
  $('bSubsQr').onclick = () => {
    const c = qrCanvas(linkSubs), big = document.createElement('canvas');
    big.width = big.height = 800;
    const g = big.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 800); g.imageSmoothingEnabled = false;
    g.drawImage(c, 40, 40, 720, 720);
    big.toBlob((b) => Core.download('qr-suscripcion.png', b));
  };

  let estadoAuto = {};
  async function cargarAuto() {
    const ids = campanas.filter((k) => k.notifId).map((k) => k.notifId);
    if (!ids.length) return;
    const { data } = await sb.from('notifications').select('id,status,push_sent,email_sent,error').in('id', ids);
    (data || []).forEach((n) => { estadoAuto[n.id] = n; });
    renderCampanas();
  }

  /* ---------- Respaldo en la nube (Pro) ---------- */
  const nubePath = cuenta.id + '/fichapro.json';
  $('bNubeSubir').onclick = async () => {
    if (!licensed()) return soloPro('El respaldo en la nube');
    const blob = new Blob([JSON.stringify({ app: 'fichas', fecha: new Date().toISOString(), datos: db.dump() })], { type: 'application/json' });
    const { error } = await sb.storage.from('respaldos').upload(nubePath, blob, { upsert: true, contentType: 'application/json' });
    Core.toast(error ? 'No se pudo guardar: ' + error.message : '☁️ Respaldo guardado en la nube');
    if (!error) $('nubeEstado').textContent = 'Último respaldo: ' + new Date().toLocaleString('es');
  };
  $('bNubeBajar').onclick = async () => {
    if (!licensed()) return soloPro('El respaldo en la nube');
    if (!confirm('Esto reemplaza los datos de este celular por los de la nube. ¿Seguir?')) return;
    const { data, error } = await sb.storage.from('respaldos').download(nubePath);
    if (error) return Core.toast('No hay respaldo en la nube todavía');
    const obj = JSON.parse(await data.text());
    db.load(obj.datos);
    location.reload();
  };
  $('bBackup').onclick = () => Core.backup('fichas:' + cuenta.id, 'fichapro');
  $('restore').onchange = (e) => {
    if (e.target.files[0]) Core.restore('fichas:' + cuenta.id, e.target.files[0], () => location.reload());
  };

  /* ---------- Inicio ---------- */
  fillForm(); fillAjustes(); draw(ficha); revisar();
  const m = location.hash.match(/camp=([\w]+)/);
  if (m) { show('campanas'); abrirEnvio(m[1]); }
})();
