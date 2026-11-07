/* CodeFix · Núcleo · Texto seguro para pantallas (A6). UNA sola función para todas las apps: no copiarla en cada archivo.
   CFX_ESC(texto)            → texto listo para meter en innerHTML (& < > " ' escapados).
   CFX_HTML`<b>${nombre}</b>` → plantilla que escapa cada valor (las listas se unen solas; CFX_HTML.crudo(html) deja pasar HTML ya armado).
   CFX_URL(link)             → el link solo si es http(s), mailto, tel, wa.me, imagen data: o relativo; si no, '#' (frena javascript:). */
(function () {
  const M = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => M[c]);
  function Crudo(h) { this.h = String(h); }
  Crudo.prototype.toString = function () { return this.h; };
  const val = (v) => v instanceof Crudo ? v.h : Array.isArray(v) ? v.map(val).join('') : esc(v);
  function html(partes) { let o = partes[0]; for (let i = 1; i < partes.length; i++) o += val(arguments[i]) + partes[i]; return new Crudo(o); }
  html.crudo = (h) => new Crudo(h == null ? '' : h);
  const url = (u) => { const t = String(u == null ? '' : u).trim(); return /^(https?:|mailto:|tel:|data:image\/(png|jpe?g|webp|gif);|[./#?]|[\w-]+(\/|\.html))/i.test(t) && !/^\/\//.test(t) ? t : '#'; };
  window.CFX_ESC = esc; window.CFX_HTML = html; window.CFX_URL = url;
})();
