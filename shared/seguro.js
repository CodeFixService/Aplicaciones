/* CodeFix · Núcleo · Texto seguro para pantallas (A6). UNA sola función para todas las apps: no copiarla en cada archivo.
   CFX_ESC(texto)            → texto listo para meter en innerHTML (& < > " ' escapados).
   CFX_HTML`<b>${nombre}</b>` → plantilla que escapa cada valor (las listas se unen solas; CFX_HTML.crudo(html) deja pasar HTML ya armado).
   CFX_URL(link)             → el link solo si es http(s), mailto, tel, wa.me, imagen data: o relativo; si no, '#' (frena javascript:).
   CFX_TAPAR.correo/tel/rut/texto(x) → datos tapados (G42d): j•••@gmail.com · +56 9 ••••12 · ••.•••.456-0. */
(function () {
  const M = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => M[c]);
  function Crudo(h) { this.h = String(h); }
  Crudo.prototype.toString = function () { return this.h; };
  const val = (v) => v instanceof Crudo ? v.h : Array.isArray(v) ? v.map(val).join('') : esc(v);
  function html(partes) { let o = partes[0]; for (let i = 1; i < partes.length; i++) o += val(arguments[i]) + partes[i]; return new Crudo(o); }
  html.crudo = (h) => new Crudo(h == null ? '' : h);
  const url = (u) => { const t = String(u == null ? '' : u).trim(); return /^(https?:|mailto:|tel:|data:image\/(png|jpe?g|webp|gif);|[./#?]|[\w-]+(\/|\.html))/i.test(t) && !/^\/\//.test(t) ? t : '#'; };
  // G42d 🔐 Datos tapados para avisos y pantallas donde quien mira no debe verlos enteros:
  //   correo → j•••@gmail.com · teléfono → +56 9 ••••12 · RUT → ••.•••.456-0 · texto → tapa todo lo que encuentre.
  const P = '•';
  const correo = (c) => { const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(c || '').trim()); return m ? m[1][0] + P.repeat(3) + '@' + m[2] : ''; };
  const tel = (t) => {
    const d = String(t || '').replace(/\D/g, ''); if (d.length < 6) return d ? P.repeat(d.length) : '';
    const cl = /^569\d{8}$/.test(d) || /^9\d{8}$/.test(d), fin = d.slice(-2);
    return cl ? '+56 9 ' + P.repeat(4) + fin : (String(t).trim()[0] === '+' ? '+' : '') + P.repeat(Math.max(4, d.length - 2)) + fin;
  };
  const rut = (r) => { const m = /^\s*[\d.]*?(\d{1,3})\.?(\d{3})?\s*-\s*([\dkK])\s*$/.exec(String(r || '')); if (!m) return ''; const c = String(r).replace(/[^\dkK]/g, ''); return '••.•••.' + c.slice(-4, -1) + '-' + c.slice(-1).toUpperCase(); };
  const texto = (s) => String(s == null ? '' : s)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, correo)
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, rut)
    .replace(/(\+?56\s?)?9[\s-]?\d{4}[\s-]?\d{4}\b/g, tel);
  window.CFX_ESC = esc; window.CFX_HTML = html; window.CFX_URL = url;
  window.CFX_TAPAR = { correo, tel, rut, texto };
})();
