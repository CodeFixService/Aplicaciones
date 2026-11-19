/* CodeFix · Núcleo · Calidad de las fotos según para qué son (mismo archivo en cada repositorio).
   Se cambia aquí y aplica en las 7 apps. Las fotos se achican en el celular antes de subirlas (WebP o JPEG: CFX_ACHICAR).
   · comprobante: voucher o captura de pago. Basta con que se lea: liviano.
   · documento:   carnet o documentos para verificar identidad. Que se lean bien los números.
   · vitrina:     productos, servicios, ofertas, fotos de trabajo y de estacionamientos: calidad mínima para que no se pixele en un teléfono.
   · portada:     imagen grande de la tienda o negocio.
   · perfil / logo: chicas. */
(function () {
  'use strict';
  window.CFX_FOTO = window.CFX_FOTO || {
    comprobante: { lado: 1000, calidad: 0.6, kb: 110 },
    documento: { lado: 1400, calidad: 0.72, kb: 300 },
    vitrina: { lado: 1080, calidad: 0.8, kb: 220 },
    portada: { lado: 1280, calidad: 0.8, kb: 300 },
    perfil: { lado: 400, calidad: 0.8, kb: 45 },
    logo: { lado: 256, calidad: 0.85, kb: 30 }
  };
  // Para las apps: CFX_FOTO_DE('vitrina') devuelve siempre algo (aunque este archivo no haya cargado aún).
  window.CFX_FOTO_DE = (k) => window.CFX_FOTO[k] || window.CFX_FOTO.comprobante;
  // Mejor formato que soporte el teléfono: WebP (~30% más liviano) y, si no puede (iPhone antiguo), JPEG.
  window.CFX_FOTO_URL = (c, q) => { const w = c.toDataURL('image/webp', q); return w.indexOf('data:image/webp') === 0 ? w : c.toDataURL('image/jpeg', q); };
  // Achica una foto (archivo o data URL) según su uso: lado máximo, fondo blanco, y baja calidad y luego tamaño hasta pesar ~kb.
  // Uso: await CFX_ACHICAR(archivo, 'vitrina') → 'data:image/webp;base64,...'
  window.CFX_ACHICAR = (src, tipo) => new Promise((ok, mal) => {
    const q = window.CFX_FOTO_DE(tipo), img = new Image(), u = typeof src === 'string' ? src : URL.createObjectURL(src), tope = q.kb * 1400;
    img.onload = () => {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      let lado = q.lado, d = '';
      for (let v = 0; v < 4; v++, lado = Math.round(lado * 0.8)) {
        const k = Math.min(1, lado / Math.max(img.width, img.height));
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        let cal = q.calidad; d = window.CFX_FOTO_URL(c, cal);
        while (d.length > tope && cal > 0.45) { cal -= 0.1; d = window.CFX_FOTO_URL(c, cal); }
        if (d.length <= tope) break;
      }
      if (u !== src) URL.revokeObjectURL(u);
      ok(d);
    };
    img.onerror = () => { if (u !== src) URL.revokeObjectURL(u); mal(new Error('No se pudo leer la foto. Usa una imagen JPG o PNG.')); };
    img.src = u;
  });

  /* G122 🖼️ Fotos a Storage (bucket público 'vitrina' de cada app; ruta <mi id>/<uuid>.webp). Solo fotos que se muestran (vitrina,
     portada, catálogo): comprobantes, carnet y fotos privadas siguen en la base. Lo viejo (base64) se sigue viendo igual.
     · La app deja su cliente: window.CFX_NUBE_SB = sb.
     · await CFX_NUBE.subir(dato) → URL pública (o el mismo dato si no se pudo: nada se pierde).
     · CFX_NUBE.es(url) → ¿es una foto de la nube? (para mostrarla con fondo()).
     · CFX_NUBE.pasarViejas(rpc) → pasa a Storage, de a poco, las fotos viejas del dueño (cfx_fotos_viejas / cfx_foto_pasar de cada app).
     · CFX_NUBE.limpiar(rpc) → borra de Storage MIS fotos que ya nadie usa (G122 b). */
  const NUBE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/vitrina\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/;
  const cli = (sb) => sb || window.CFX_NUBE_SB || null;
  const blobDe = (d) => {
    const i = d.indexOf(','), type = d.slice(5, d.indexOf(';')), bin = atob(d.slice(i + 1)), u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return new Blob([u], { type });
  };
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  async function miId(c) { try { const { data } = await c.auth.getSession(); return (data && data.session && data.session.user && data.session.user.id) || ''; } catch (e) { return ''; } }
  async function subir(dato, sb) {
    const c = cli(sb);
    if (typeof dato !== 'string' || !/^data:image\/(webp|jpeg|png);base64,/.test(dato) || !c || !c.storage) return dato;
    try {
      const uid = await miId(c); if (!uid) return dato;
      const b = blobDe(dato), ruta = uid + '/' + uuid() + '.' + (b.type === 'image/png' ? 'png' : b.type === 'image/jpeg' ? 'jpg' : 'webp');
      const { error } = await c.storage.from('vitrina').upload(ruta, b, { contentType: b.type, cacheControl: '31536000', upsert: false });
      if (error) return dato;
      const url = c.storage.from('vitrina').getPublicUrl(ruta).data.publicUrl;
      return NUBE.test(url) ? url : dato;
    } catch (e) { return dato; }
  }
  // Borra de Storage una foto propia que se reemplazó o quitó (si no es de la nube o no es mía, no hace nada).
  async function borrar(url, sb) {
    const c = cli(sb); if (!c || !NUBE.test(url || '')) return;
    try { const uid = await miId(c), r = url.split('/vitrina/')[1]; if (uid && r.indexOf(uid + '/') === 0) await c.storage.from('vitrina').remove([r]); } catch (e) { /* queda en Storage */ }
  }
  // Fotos viejas (base64) del dueño → Storage, 10 por visita, una vez por sesión. Si algo falla, la foto queda como estaba.
  async function pasarViejas(rpc, sb) {
    const c = cli(sb); if (!c || !rpc) return 0;
    try { if (sessionStorage.getItem('cfx-nube-pasadas')) return 0; sessionStorage.setItem('cfx-nube-pasadas', '1'); } catch (e) { /* sigue */ }
    let n = 0, l;
    try { l = await rpc('cfx_fotos_viejas'); } catch (e) { return 0; }
    for (const x of (Array.isArray(l) ? l : [])) {
      const url = await subir(x.foto, c); if (url === x.foto) break;  // sin Storage: se intenta otro día
      try { if (await rpc('cfx_foto_pasar', { p_t: x.t, p_id: String(x.id), p_i: x.i == null ? -1 : x.i, p_largo: x.foto.length, p_nueva: url })) n++; else await borrar(url, c); } catch (e) { await borrar(url, c); }
    }
    return n;
  }
  /* G122 b 🧹 Fotos huérfanas (producto, servicio, oferta, portafolio o bici borrados): 1 vez por semana revisa MI carpeta y borra
     solo las fotos de más de 7 días que el servidor confirma que no están en NINGUNA tabla (cfx_fotos_libres). Ante la duda, no borra. */
  const DIAS = 7;
  async function limpiar(rpc, sb) {
    const c = cli(sb); if (!c || !c.storage || !rpc) return 0;
    const uid = await miId(c); if (!uid) return 0;
    const k = 'cfx-nube-limpia-' + uid;
    try { const v = +localStorage.getItem(k) || 0; if (Date.now() - v < DIAS * 864e5) return 0; localStorage.setItem(k, String(Date.now())); } catch (e) { return 0; }
    try {
      const { data, error } = await c.storage.from('vitrina').list(uid, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (error || !Array.isArray(data)) return 0;
      const viejo = Date.now() - DIAS * 864e5;
      const cand = data.filter((o) => o && o.id && /^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(o.name || '') && o.created_at && Date.parse(o.created_at) < viejo).map((o) => o.name);
      if (!cand.length) return 0;
      const libres = await rpc('cfx_fotos_libres', { p_nombres: cand });
      const borrar = (Array.isArray(libres) ? libres : []).filter((n) => cand.includes(n)).map((n) => uid + '/' + n);
      for (let i = 0; i < borrar.length; i += 100) await c.storage.from('vitrina').remove(borrar.slice(i, i + 100));
      return borrar.length;
    } catch (e) { return 0; }
  }
  window.CFX_NUBE = { subir, borrar, pasarViejas, limpiar, es: (u) => NUBE.test(u || '') };
})();
