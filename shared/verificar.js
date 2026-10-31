/* CodeFix · Núcleo · Verificar identidad (mismo archivo en cada repositorio).
   CFX_VERIFICAR.abrir({ rpc })  → RUT, N° de documento, foto de la cédula (frente y reverso) y selfie. Lo revisa el administrador
   en el Centro de Mando → Control → Verificaciones; las fotos se borran al revisarlas. Usa el estilo de pagos.js (.cfx-pago). */
(function () {
  'use strict';
  if (window.CFX_VERIFICAR) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rutOk = (r) => {
    const s = String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); if (s.length < 2) return false;
    let suma = 0, m = 2; for (let i = s.length - 2; i >= 0; i--) { suma += Number(s[i]) * m; m = m === 7 ? 2 : m + 1; }
    const d = 11 - (suma % 11); return (d === 11 ? '0' : d === 10 ? 'K' : String(d)) === s.slice(-1);
  };
  function achicar(file) {
    const q = (window.CFX_FOTO_DE && window.CFX_FOTO_DE('documento')) || { lado: 1400, calidad: 0.72 };
    return new Promise((ok, mal) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, q.lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        let cal = q.calidad, d = c.toDataURL('image/jpeg', cal);
        while (d.length > 480000 && cal > 0.3) { cal -= 0.1; d = c.toDataURL('image/jpeg', cal); }
        ok(d);
      };
      img.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se pudo leer la foto')); };
      img.src = u;
    });
  }
  async function abrir(o) {
    const capa = document.createElement('dialog'); capa.className = 'cfx-pago';
    capa.style.setProperty('--cp-color', getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#2563eb');
    capa.innerHTML = '<div><p>Cargando…</p></div>';
    document.body.appendChild(capa); capa.showModal();
    const caja = capa.firstChild, cerrar = () => { capa.close(); capa.remove(); };
    capa.addEventListener('click', (ev) => { if (ev.target === capa || ev.target.closest('[data-x]')) cerrar(); });
    // Escape (y "atrás" del teclado) también la cierra, igual que tocar afuera.
    capa.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
    let e = null;
    try { e = await o.rpc('cfx_verif_estado'); } catch (x) { caja.innerHTML = '<p class="cp-err">' + esc(x.message) + '</p><button type="button" data-x>Cerrar</button>'; return; }
    if (e && e.estado !== 'rechazada') {
      caja.innerHTML = '<h2>🪪 Verificación</h2><div class="cp-ok">' + (e.estado === 'aprobada' ? '✅ Tu identidad está verificada.' : '⏳ Tu verificación está en revisión. Te avisamos apenas la revisemos.') + '</div><button type="button" data-x style="width:100%">Cerrar</button>';
      return;
    }
    const fotos = {};
    const pintar = () => {
      caja.innerHTML = '<h2>🪪 Verifica tu identidad</h2><p>Así tus clientes saben que eres una persona real. Las fotos solo las ve el administrador y se borran apenas las revisa.</p>' +
        (e && e.estado === 'rechazada' ? '<div class="cp-err">La anterior fue rechazada: ' + esc(e.motivo || '') + '</div>' : '') +
        '<label for="cvRut">RUT</label><input id="cvRut" placeholder="12.345.678-9" value="' + esc(o._rut || '') + '">' +
        '<label for="cvDoc">N° de documento (en tu cédula)</label><input id="cvDoc" placeholder="Ej: 123.456.789" value="' + esc(o._doc || '') + '">' +
        [['frente', 'Cédula: frente'], ['reverso', 'Cédula: reverso'], ['selfie', 'Selfie con tu cédula']].map((f) =>
          '<label for="cv' + f[0] + '">' + f[1] + (fotos[f[0]] ? ' ✓' : '') + '</label><input id="cv' + f[0] + '" data-f="' + f[0] + '" type="file" accept="image/*"' + (f[0] === 'selfie' ? ' capture="user"' : '') + '>').join('') +
        '<p class="cp-err" id="cvErr"></p><button type="button" class="cp-si" data-enviar style="width:100%">Enviar</button><button type="button" data-x style="width:100%;margin-top:10px">Ahora no</button>';
    };
    pintar();
    caja.addEventListener('input', (ev) => { if (ev.target.id === 'cvRut') o._rut = ev.target.value; if (ev.target.id === 'cvDoc') o._doc = ev.target.value; });
    caja.addEventListener('change', async (ev) => {
      const f = ev.target.dataset && ev.target.dataset.f; if (!f || !ev.target.files[0]) return;
      try { fotos[f] = await achicar(ev.target.files[0]); pintar(); } catch (x) { caja.querySelector('#cvErr').textContent = x.message; }
    });
    caja.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-enviar]'); if (!b) return;
      const err = caja.querySelector('#cvErr');
      if (!rutOk(o._rut)) { err.textContent = 'Revisa tu RUT'; return; }
      if (!fotos.frente || !fotos.reverso || !fotos.selfie) { err.textContent = 'Faltan fotos'; return; }
      b.disabled = true; b.textContent = 'Enviando…';
      try {
        await o.rpc('cfx_verif_enviar', { p_rut: o._rut, p_documento: o._doc || '', p_frente: fotos.frente, p_reverso: fotos.reverso, p_selfie: fotos.selfie });
        caja.innerHTML = '<h2>✅ ¡Enviada!</h2><div class="cp-ok">Te avisamos apenas la revisemos.</div><button type="button" data-x style="width:100%">Cerrar</button>';
      } catch (x) { err.textContent = (x && x.message) || String(x); b.disabled = false; b.textContent = 'Enviar'; }
    });
  }
  window.CFX_VERIFICAR = { abrir, rutOk };
})();
