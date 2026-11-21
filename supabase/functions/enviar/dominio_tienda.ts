// CodeFix · G145 a 🌐 Dominio propio de la tienda, conectado SOLO desde su app (sin pasar por Josué).
// La tienda guarda su dominio (dominio_guardar) y la app pide esto: con el token de Cloudflare de CodeFix
// (Josué lo pega 1 vez en CM → Control → 🌐 Dominio y queda copiado aquí) se crea el Custom Hostname
// www.<dominio> en la zona de CodeFix (Cloudflare for SaaS: 100 gratis, luego ~US$0,10/mes c/u).
// Sin imports: se prueba con node (SaaS/pruebas/g145a.js).

const API = 'https://api.cloudflare.com/client/v4';

export function limpiar(d: string | null | undefined): string {
  const x = String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(x) && x.length <= 80 ? x : '';
}

export type DomRes = { ok: boolean; estado: 'activo' | 'pendiente' | 'sin_codefix' | 'sin_dominio' | 'sin_modulo' | 'error'; host?: string; error?: string; quitado?: boolean };

// o.dominio = el de la tienda (de la base, nunca del navegador) · o.antes = el que tenía (se borra si ya nadie lo usa).
export async function dominioTienda(o: { token: string; cname: string; dominio: string | null; modulo: boolean; antes?: string | null; antesLibre?: boolean; f?: typeof fetch }): Promise<DomRes> {
  const f = o.f || fetch;
  const zonaNom = limpiar(String(o.cname || '').replace(/^tiendas\./, ''));
  if (!o.token || !zonaNom) return { ok: true, estado: 'sin_codefix' };
  const cf = async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await f(API + ruta, { method: metodo, headers: { Authorization: 'Bearer ' + o.token, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(((j.errors || [])[0] || {}).message || 'Cloudflare respondió ' + r.status);
    return j.result;
  };
  try {
    const zona = (await cf('GET', '/zones?name=' + encodeURIComponent(zonaNom)))[0];
    if (!zona) return { ok: true, estado: 'sin_codefix' };
    const buscar = async (h: string) => (await cf('GET', '/zones/' + zona.id + '/custom_hostnames?hostname=' + encodeURIComponent(h)))[0];
    let quitado = false;
    const a = limpiar(o.antes), d = limpiar(o.dominio);
    if (a && a !== d && o.antesLibre) {
      const v = await buscar('www.' + a);
      if (v) { await cf('DELETE', '/zones/' + zona.id + '/custom_hostnames/' + v.id); quitado = true; }
    }
    if (!d) return { ok: true, estado: 'sin_dominio', quitado };
    if (!o.modulo) return { ok: true, estado: 'sin_modulo', quitado };
    const host = 'www.' + d;
    let ch = await buscar(host);
    if (!ch) ch = await cf('POST', '/zones/' + zona.id + '/custom_hostnames', { hostname: host, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } });
    const ok = ch.status === 'active' && (!ch.ssl || ch.ssl.status === 'active');
    return { ok: true, estado: ok ? 'activo' : 'pendiente', host, quitado };
  } catch (e) { return { ok: false, estado: 'error', error: (e as Error).message }; }
}
