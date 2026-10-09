(function () {
  'use strict';
  const PRODUCT = 'FICHAPRO';
  const db = Core.store('fichas');
  const $ = (id) => document.getElementById(id);
  const W = 1080, H = 1350;

  Core.registerSW('../../');

  const DEFAULT = {
    plantilla: 'oferta', titulo: 'GRAN OFERTA', subtitulo: 'Solo por esta semana',
    precio: '19.99', antes: '29.99', cta: '¡Pide ya por WhatsApp!',
    color1: '#6d28d9', color2: '#f59e0b', foto: null
  };

  let ficha = db.get('borrador', Object.assign({}, DEFAULT));
  let fichas = db.get('fichas', []);
  let clientes = db.get('clientes', []);
  let campanas = db.get('campanas', []);
  let ajustes = db.get('ajustes', { negocio: 'Mi Negocio', tel: '', logo: null });
  let licencia = db.get('licencia', { owner: '', key: '' });
  let editId = null;

  const licensed = () => Core.checkLicense(PRODUCT, licencia.owner, licencia.key);
  const FREE_LIMIT = { fichas: 5, clientes: 30 };

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
    if (v === 'campanas') renderCampanas();
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
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = font('800', 36);
    ctx.fillText(ajustes.negocio || '', x, y + 50, W - x - 40);
    ctx.font = font('500', 30);
    ctx.fillText(ajustes.tel ? '📲 ' + ajustes.tel : '', x, y + 90, W - x - 40);
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
    (TEMPLATES[f.plantilla] || TEMPLATES.oferta).draw(f, foto, logo);
    if (!licensed()) {
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = font('700', 26); ctx.textAlign = 'right';
      ctx.fillText('Hecho con FichaPro · versión de prueba', W - 30, H - 125);
    }
  }

  /* ---------- Formulario ---------- */
  const fields = ['titulo', 'subtitulo', 'precio', 'antes', 'cta', 'color1', 'color2'];
  function fillForm() {
    fields.forEach((k) => { $('f-' + k).value = ficha[k] || ''; });
    $('tpls').innerHTML = Object.keys(TEMPLATES).map((k) =>
      '<button class="small ' + (ficha.plantilla === k ? 'on' : 'alt') + '" data-t="' + k + '">' + TEMPLATES[k].nombre + '</button>'
    ).join('');
  }
  $('tpls').onclick = (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    ficha.plantilla = t; changed(); fillForm();
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
      return '<li>' + (f ? '<img class="thumb" src="' + f.thumb + '" alt="">' : '') +
        '<div class="grow"><b>' + Core.esc(k.nombre) + '</b><div class="muted">' +
        new Date(k.fecha).toLocaleString('es') + ' · ' + enviados + '/' + dest.length + ' enviados</div></div>' +
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

  $('bAddCampana').onclick = async () => {
    const fichaId = $('k-ficha').value;
    const fecha = new Date($('k-fecha').value).getTime();
    if (!fichaId) return Core.toast('Guarda una ficha primero');
    if (!fecha) return Core.toast('Elige fecha y hora');
    campanas.push({
      id: Core.uid(), nombre: $('k-nombre').value.trim() || 'Campaña', fichaId,
      tag: $('k-tag').value, msg: $('k-msg').value, fecha, avisado: fecha <= Date.now(), enviados: []
    });
    db.set('campanas', campanas);
    $('k-nombre').value = '';
    renderCampanas();
    if (await Core.askNotify()) Core.toast('Te avisaré a la hora programada');
  };

  $('campanas').onclick = (e) => {
    const { a, id } = e.target.dataset;
    if (a === 'del' && confirm('¿Eliminar campaña?')) {
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
    $('l-owner').value = licencia.owner || '';
    $('l-key').value = licencia.key || '';
    const ok = licensed();
    $('licEstado').textContent = ok
      ? '✅ Licencia activa para ' + licencia.owner
      : 'Versión de prueba: marca de agua, ' + FREE_LIMIT.fichas + ' fichas y ' + FREE_LIMIT.clientes + ' clientes.';
    $('licTag').textContent = ok ? 'PRO' : 'Prueba';
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
  $('bActivar').onclick = () => {
    const l = { owner: $('l-owner').value.trim(), key: $('l-key').value.trim().toUpperCase() };
    if (Core.checkLicense(PRODUCT, l.owner, l.key)) {
      licencia = l; db.set('licencia', l); Core.toast('¡Licencia activada!');
    } else Core.toast('Clave no válida para ese titular');
    fillAjustes(); draw(ficha);
  };
  $('bBackup').onclick = () => Core.backup('fichas', 'fichapro');
  $('restore').onchange = (e) => {
    if (e.target.files[0]) Core.restore('fichas', e.target.files[0], () => location.reload());
  };

  /* ---------- Inicio ---------- */
  fillForm(); fillAjustes(); draw(ficha); revisar();
  const m = location.hash.match(/camp=([\w]+)/);
  if (m) { show('campanas'); abrirEnvio(m[1]); }
})();
