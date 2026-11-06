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
})();
