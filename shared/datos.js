/* CodeFix · Datos en bruto inteligentes (mismo archivo en cada repositorio).
   Cada campo de texto se reconoce solo (por data-tipo, name, id, placeholder, inputmode, autocomplete o su etiqueta):
   monto, telefono, rut, fecha, patente o correo. Le pone un ejemplo en gris si no tiene y, al terminar de escribir
   (change, Enter o envío del formulario), ordena lo escrito: "10 mil" → 10000, "9 1234 5678" → 56912345678,
   "123456785" → 12.345.678-5, "5/3/26" → 05-03-2026, "bb cd 12" → BBCD12, " Ana@Mail.CL" → ana@mail.cl.
   Solo cambia lo que entiende por completo: si no reconoce el formato, lo deja tal cual (nunca rompe un valor).
   Aprende el estilo de cada negocio (p. ej. si escribe "15 mil") y lo usa como ejemplo en ese campo.
   Para mostrar: CodeFixDatos.mostrar('telefono', v) o <span data-dato="monto">10000</span> → $10.000.
   Para que un campo quede fuera: data-tipo="no" o class="no-datos". */
(function () {
  'use strict';
  if (window.CodeFixDatos) return;

  const TIPOS = ['rut', 'telefono', 'monto', 'fecha', 'patente', 'correo'];
  const PISTAS = [
    ['rut', /\brut\b/],
    ['patente', /\b(patente|placa)\b/],
    ['correo', /\b(correo|e ?mail)\b/],
    ['telefono', /\b(tel|telefono|fono|celular|cel|movil|whatsapp|whats|wsp|wa)\b/],
    ['fecha', /\b(fecha|nacimiento|vence|vencimiento)\b/],
    ['monto', /\b(precio|monto|valor|costo|total|abono|sueldo|tarifa|cobro|pago|presupuesto|descuento)\b|\$/]
  ];
  const EJEMPLO = { monto: 'Ej: 10.000 o 10 mil', telefono: 'Ej: 9 1234 5678', rut: 'Ej: 12.345.678-5', fecha: 'Ej: 25-12-2026', patente: 'Ej: BBCD12', correo: 'Ej: nombre@correo.cl' };
  const SIN = /^(hidden|password|checkbox|radio|file|submit|button|reset|image|range|color|search|date|time|datetime-local|month|week)$/i;
  const BUSCA = /\b(buscar|busca|filtro|filtrar|q)\b/;

  // "fTel", "p-precio", "Teléfono:" → "f tel", "p precio", "telefono"
  const palabras = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[_\-.:]+/g, ' ');

  function etiqueta(el) {
    let t = '';
    if (el.id) { try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t += ' ' + l.textContent; } catch (e) { /* id raro */ } }
    const l2 = el.closest('label'); if (l2) t += ' ' + l2.textContent;
    return t;
  }
  function tipoDe(el) {
    if (el.dataset.cfxDato !== undefined) return el.dataset.cfxDato;
    let t = '';
    const dt = (el.dataset.tipo || '').toLowerCase();
    if (dt === 'no' || el.closest('.no-datos')) t = '';
    else if (TIPOS.includes(dt)) t = dt;
    else if (!SIN.test(el.type || 'text')) {
      const txt = palabras([el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), etiqueta(el)].join(' '));
      if (!BUSCA.test(txt)) {
        if (el.type === 'email') t = 'correo';
        else if (el.type === 'tel' || el.inputMode === 'tel') t = 'telefono';
        else for (const [k, rx] of PISTAS) if (rx.test(txt)) { t = k; break; }
        if (el.type === 'number' && t !== 'monto') t = ''; // un número no admite otro formato
      }
    }
    el.dataset.cfxDato = t;
    return t;
  }

  // ---------- Normalizadores: devuelven el valor ordenado, o null si no lo entienden ----------
  const MULT = { mil: 1e3, k: 1e3, luca: 1e3, lucas: 1e3, luka: 1e3, lukas: 1e3, millon: 1e6, millones: 1e6, mm: 1e6, palo: 1e6, palos: 1e6 };
  function monto(v) {
    const t = String(v).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
    let m = /^\$? ?(\d+(?:[.,]\d+)?) ?(mil|k|lucas?|lukas?|millon|millones|mm|palos?) ?(pesos|clp)?$/.exec(t);
    if (m) return String(Math.round(parseFloat(m[1].replace(',', '.')) * MULT[m[2]]));
    m = /^\$ ?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})? ?(pesos|clp)?$/.exec(t) || /^(\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})? ?(pesos|clp)?$/.exec(t) ||
      /^(\d+) ?(pesos|clp)$/.exec(t);
    if (m) return m[1].replace(/\./g, '');
    return null; // "10000" ya está bien; "9,99" u otro formato: se respeta
  }
  function telefono(v) {
    const s = String(v).trim();
    if (!/^[+\d\s().-]+$/.test(s)) return null;
    if (/^\+/.test(s) && !/^\+\s*56/.test(s)) return null; // otro país: se respeta
    let d = s.replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 9 && /^[29]/.test(d)) d = '56' + d;
    else if (d.length === 8) d = '569' + d;
    else if (!(d.length === 11 && /^56[29]/.test(d))) return null;
    return d; // mismo formato que ya usan las apps y wa.me: 56912345678
  }
  function dvRut(cuerpo) {
    let s = 0, m = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) { s += +cuerpo[i] * m; m = m === 7 ? 2 : m + 1; }
    const r = 11 - (s % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function rut(v) {
    const s = String(v).trim();
    if (!/^[\d.\s-]+[kK]?$/.test(s)) return null;
    const c = s.replace(/[^0-9kK]/g, '').toUpperCase();
    if (c.length < 8 || c.length > 9 || /K./.test(c)) return null;
    const cuerpo = c.slice(0, -1), dv = c.slice(-1);
    return { valor: cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv, ok: dvRut(cuerpo) === dv };
  }
  function fecha(v) {
    const m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})$/.exec(String(v).trim());
    if (!m) return null;
    const d = +m[1], me = +m[2], a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const f = new Date(a, me - 1, d);
    if (f.getMonth() !== me - 1 || f.getDate() !== d) return null;
    return String(d).padStart(2, '0') + '-' + String(me).padStart(2, '0') + '-' + a;
  }
  function patente(v) {
    const c = String(v).trim().toUpperCase().replace(/[\s.·-]/g, '');
    return /^[A-Z0-9]{5,8}$/.test(c) ? c : null;
  }
  function correo(v) {
    const c = String(v).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c : null;
  }

  // ---------- Aprende el estilo del negocio (por app y campo, en este equipo) ----------
  const LS = 'cfx-datos';
  let mem = {}; try { mem = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { mem = {}; }
  const claveCampo = (el) => location.pathname.replace(/index\.html$/, '') + '|' + (el.name || el.id || el.dataset.cfxDato);
  function estilo(tipo, crudo) {
    if (tipo === 'monto') return /mil|k\b|luca|luka/i.test(crudo) ? 'mil' : /\./.test(crudo) ? 'punto' : 'plano';
    if (tipo === 'telefono') return /^\s*\+/.test(crudo) ? 'mas' : 'plano';
    return '';
  }
  function aprender(el, tipo, crudo) {
    const e = estilo(tipo, crudo); if (!e) return;
    const k = claveCampo(el), c = mem[k] || (mem[k] = {});
    c[e] = (c[e] || 0) + 1;
    try { localStorage.setItem(LS, JSON.stringify(mem)); } catch (x) { /* sin espacio o modo privado */ }
  }
  function ejemplo(el, tipo) {
    const c = mem[claveCampo(el)];
    if (c) {
      const top = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
      if (tipo === 'monto' && top === 'mil') return 'Ej: 15 mil';
      if (tipo === 'monto' && top === 'punto') return 'Ej: 15.000';
      if (tipo === 'telefono' && top === 'mas') return 'Ej: +56 9 1234 5678';
    }
    return EJEMPLO[tipo];
  }

  // ---------- Campos ----------
  const ordenar = { monto, telefono, rut, fecha, patente, correo };
  function preparar(el) {
    if (el.dataset.cfxListo) return;
    el.dataset.cfxListo = '1';
    const t = tipoDe(el); if (!t) return;
    if (!el.placeholder && !el.readOnly && !el.disabled) el.placeholder = el.type === 'number' ? 'Ej: 10000' : ejemplo(el, t);
  }
  function normalizar(el) {
    if (!el || el.tagName !== 'INPUT' || el.readOnly || el.disabled) return;
    const t = tipoDe(el); if (!t || !el.value.trim()) return;
    const crudo = el.value, r = ordenar[t](crudo);
    if (t === 'rut') {
      el.classList.toggle('cfx-dato-mal', !!r && !r.ok);
      if (r && !r.ok) el.title = 'Revisa el RUT: el dígito verificador no calza'; else if (el.title.startsWith('Revisa el RUT')) el.title = '';
    }
    const nuevo = r && typeof r === 'object' ? r.valor : r;
    aprender(el, t, crudo);
    if (nuevo == null || nuevo === crudo || (el.maxLength > 0 && nuevo.length > el.maxLength)) return;
    el.value = nuevo;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------- Mostrar (para listas y fichas) ----------
  function mostrar(tipo, v) {
    if (v == null || v === '') return '';
    const s = String(v);
    if (tipo === 'monto') { const n = monto(s); const x = n != null ? +n : /^\d+$/.test(s.trim()) ? +s : NaN; return isNaN(x) ? s : '$' + x.toLocaleString('es-CL'); }
    if (tipo === 'telefono') { const d = telefono(s); return d ? '+56 ' + d.slice(2, 3) + ' ' + d.slice(3, 7) + ' ' + d.slice(7) : s; }
    if (tipo === 'rut') { const r = rut(s); return r ? r.valor : s; }
    if (tipo === 'fecha') { const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return iso ? iso[3] + '-' + iso[2] + '-' + iso[1] : fecha(s) || s; }
    if (tipo === 'patente') return patente(s) || s;
    if (tipo === 'correo') return correo(s) || s;
    return s;
  }
  function pintar(raiz) {
    (raiz || document).querySelectorAll('[data-dato]').forEach((e) => {
      const t = e.dataset.dato, crudo = e.dataset.datoCrudo != null ? e.dataset.datoCrudo : e.textContent;
      const txt = mostrar(t, crudo);
      if (e.textContent !== txt) { e.dataset.datoCrudo = crudo; e.textContent = txt; }
    });
  }

  function revisar(raiz) {
    const r = raiz && raiz.querySelectorAll ? raiz : document;
    r.querySelectorAll('input:not([data-cfx-listo])').forEach(preparar);
    pintar(r);
  }
  const css = document.createElement('style');
  css.textContent = 'input.cfx-dato-mal{outline:2px solid #d97706;outline-offset:1px}';
  document.head.appendChild(css);

  document.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT') preparar(e.target); }, true);
  document.addEventListener('change', (e) => normalizar(e.target), true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') normalizar(e.target); }, true);
  document.addEventListener('submit', (e) => e.target.querySelectorAll('input').forEach(normalizar), true);
  // Botón que guarda: ordena el campo enfocado antes de que la app lea el valor.
  document.addEventListener('pointerdown', (e) => { const a = document.activeElement; if (a && a.tagName === 'INPUT' && e.target !== a) normalizar(a); }, true);

  let prog = false;
  function iniciar() {
    revisar(document);
    new MutationObserver(() => { if (prog) return; prog = true; requestAnimationFrame(() => { prog = false; revisar(document); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  window.CodeFixDatos = { tipoDe, normalizar, mostrar, pintar, monto, telefono, rut, fecha, patente, correo };
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
