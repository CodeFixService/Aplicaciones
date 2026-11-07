/* Recorrido guiado (tour): ilumina partes de la pantalla y explica cada una en 1 línea.
   CFX_TOUR.iniciar(pasos, { clave, forzar })  · pasos = [{ el: '#id', t: 'Título', x: 'Texto' }]
   - Salta los pasos cuyo elemento no está o está oculto.
   - Con `clave` se muestra una sola vez (localStorage); `forzar` lo muestra igual (botón Ayuda).
   - Espera a que no haya otra ventana abierta (términos, guía, elegir…). */
(function () {
  const MODAL = '.cfx-ayuda, .elegir, .cfx-hoja, .cfx-hoja-m, .cfx-pin, dialog[open]';
  const visto = (k) => { try { return !!localStorage.getItem('cfx:tour:' + k); } catch (e) { return false; } };
  const marcar = (k) => { try { localStorage.setItem('cfx:tour:' + k, '1'); } catch (e) { /* sin almacenamiento */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ve = (e) => e && e.offsetParent !== null && e.getClientRects().length;
  let abierto = false;

  function iniciar(pasos, o) {
    o = o || {};
    if (abierto || (o.clave && !o.forzar && visto(o.clave))) return false;
    const lista = pasos.filter((p) => ve(document.querySelector(p.el)));
    if (!lista.length) return false;
    if (!o.forzar && document.querySelector(MODAL)) { setTimeout(() => iniciar(pasos, o), 1500); return true; }
    abierto = true;
    const capa = document.createElement('div'), luz = document.createElement('div'), caja = document.createElement('div');
    capa.className = 'cfx-tour'; luz.className = 'cfx-tour-luz'; caja.className = 'cfx-tour-caja';
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-live', 'polite');
    capa.append(luz, caja); document.body.appendChild(capa);
    let i = 0;
    const fin = () => { abierto = false; capa.remove(); removeEventListener('resize', ubicar); removeEventListener('scroll', ubicar, true); if (o.clave) marcar(o.clave); if (o.alTerminar) o.alTerminar(); };
    function ubicar() {
      const e = document.querySelector(lista[i].el); if (!e) return;
      const r = e.getBoundingClientRect(), m = 6;
      Object.assign(luz.style, { top: r.top - m + 'px', left: r.left - m + 'px', width: r.width + 2 * m + 'px', height: r.height + 2 * m + 'px' });
      const abajo = r.top + r.height / 2 < innerHeight / 2;
      caja.style.top = abajo ? Math.min(r.bottom + 14, innerHeight - caja.offsetHeight - 10) + 'px' : '';
      caja.style.bottom = abajo ? '' : Math.max(innerHeight - r.top + 14, 10) + 'px';
    }
    function pintar() {
      const p = lista[i], e = document.querySelector(p.el), ult = i === lista.length - 1;
      caja.innerHTML = '<small>' + (i + 1) + ' de ' + lista.length + '</small><b>' + esc(p.t) + '</b><p>' + esc(p.x) + '</p>' +
        '<div class="btns"><button type="button" class="small alt" data-t="x">Saltar</button>' +
        (i ? '<button type="button" class="small alt" data-t="a">‹ Anterior</button>' : '') +
        '<button type="button" class="small" data-t="s">' + (ult ? '¡Listo!' : 'Siguiente ›') + '</button></div>';
      e.scrollIntoView({ block: 'center' });
      requestAnimationFrame(ubicar);
      const b = caja.querySelector('[data-t="s"]'); if (b) b.focus({ preventScroll: true });
    }
    caja.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.t === 'x') return fin();
      if (b.dataset.t === 'a') { i--; return pintar(); }
      if (i === lista.length - 1) return fin();
      i++; pintar();
    };
    capa.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fin(); });
    addEventListener('resize', ubicar); addEventListener('scroll', ubicar, true);
    pintar();
    return true;
  }

  window.CFX_TOUR = { iniciar, visto, olvidar: (k) => { try { localStorage.removeItem('cfx:tour:' + k); } catch (e) { /* nada */ } } };
})();
