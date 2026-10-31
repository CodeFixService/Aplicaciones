/* CodeFix · Núcleo · Cabecera, Ayuda y Ajustes (mismo archivo en cada repositorio).
   CFX_AYUDA.iniciar({ rpc, app, admin, premium, nombre, foto, cuenta, panel… })  → al entrar con sesión: cabecera común [campana][FREE/PRO][foto]; la foto abre el menú con
       · Guía para partir: lo que le falta configurar al negocio (cfx_guia). No se marca como listo hasta que lo hace de verdad,
         y se le recuerda cada vez que entra (y cada 1 hora con la app abierta) mientras falte algo.
       · Chat con soporte: escribe y le respondes desde el Centro de Mando → Mensajes (cfx_chat_*). El globo muestra lo no leído.
       · Términos y condiciones según el tipo de negocio (ley chilena: 19.496 del consumidor y 19.628 / 21.719 de datos personales).
   CFX_AYUDA.chat({ rpc }) · CFX_AYUDA.terminos(app) · CFX_AYUDA.guia()  (también se pueden abrir sueltos).
   CFX_AJUSTES.montar(el, secciones) → Ajustes en cuadrícula de tarjetas (igual en las 6 apps). */
(function () {
  'use strict';
  if (window.CFX_AYUDA) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yo = document.currentScript && document.currentScript.src;
  const RAIZ = yo ? yo.replace(/(shared|js)\/ayuda\.js.*$/, '') : location.origin + '/';
  const color = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || getComputedStyle(document.documentElement).getPropertyValue('--marca').trim() || (document.querySelector('meta[name="theme-color"]') || {}).content || '#2563eb';
  const CADA = 60 * 60 * 1000;
  // Dirección de cada app y del Centro de Mando según dónde se abre (un solo lugar para las 7):
  //  · Cloudflare Workers (<worker>.<cuenta>.workers.dev) → <worker>.<cuenta>.workers.dev
  //  · dominio propio (mando.codefix.app)                → <sub>.codefix.app
  //  · pruebas, GitHub Pages o Pages.dev                 → los Workers de la cuenta
  const CUENTA_WORKERS = 'juanjosuecastilloloyola.workers.dev';
  function web(worker, sub) {
    const h = location.hostname, p = h.split('.');
    if (/\.workers\.dev$/.test(h) && p.length >= 4) return 'https://' + worker + '.' + p.slice(1).join('.') + '/';
    if (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)|github\.io$|pages\.dev$/.test(h) || p.length < 2) return 'https://' + worker + '.' + CUENTA_WORKERS + '/';
    return 'https://' + sub + '.' + (p.length >= 3 ? p.slice(1).join('.') : h) + '/';
  }
  const panelCM = () => web('saas', 'mando') + 'admin/';
  const css = document.createElement('style');
  css.textContent =
    // Cabecera común: [campana][FREE/PRO][foto] a la derecha del encabezado de cada app.
    '.cfx-oc{display:none!important}.cfx-cab{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none;position:relative;z-index:1}' +
    '.cfx-cab.cfx-fija{position:fixed;top:calc(8px + env(safe-area-inset-top));right:10px;z-index:2147481000}' +
    '.cfx-cab>[data-cfx-campana]{margin:0!important;flex:none}' +
    '.cfx-atajo{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 11px;border-radius:99px;text-decoration:none;flex:none;font:800 12.5px/1 var(--cfx-letra,system-ui,sans-serif);' +
    'color:var(--brand,var(--marca,#2563eb));background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 35%,transparent)}' +
    '.cfx-atajo svg{flex:none}' +
    '.cfx-cab>.cfx-atajo{display:inline-flex!important;flex-direction:row!important;align-items:center!important;justify-content:center;gap:5px!important;width:auto!important;height:32px!important;min-width:0!important;min-height:0!important;padding:0 11px!important;margin:0!important;' +
    'font:800 12.5px/1 var(--cfx-letra,system-ui,sans-serif)!important;border:0!important;border-radius:99px!important;background:color-mix(in srgb,var(--brand,var(--marca,#2563eb)) 13%,transparent)!important;color:var(--brand,var(--marca,#2563eb))!important;box-shadow:none!important}' +
    '.cfx-cab>.cfx-atajo svg{width:16px!important;height:16px!important;margin:0!important}.cfx-cab>.cfx-atajo span{font-size:12.5px!important;line-height:1!important}' +
    '@media(max-width:600px){.cfx-atajo span{display:none}.cfx-cab>.cfx-atajo{width:36px!important;height:36px!important;padding:0!important;gap:0;justify-content:center;border-radius:50%!important}.cfx-cab>.cfx-atajo svg{width:18px!important;height:18px!important}}' +
    // Campana del mismo tamaño que la foto: redonda, con borde suave y el dibujo al centro.
    '.cfx-cab>[data-cfx-campana]{width:36px!important;height:36px!important;min-width:0!important;min-height:0!important;padding:0!important;border-radius:50%!important;display:grid!important;place-items:center!important;position:relative;' +
    'background:var(--cfx-tarjeta,#fff)!important;border:1px solid var(--cfx-borde,#e2e7ec)!important;box-shadow:0 1px 3px rgba(15,23,42,.08)!important;color:var(--cfx-texto,#111827)!important}' +
    '.cfx-cab>[data-cfx-campana]>svg{width:20px!important;height:20px!important;margin:0!important;display:block}' +
    '.cfx-sel-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f3f5f8);color:var(--cfx-texto,#111827);font:700 14px/1 var(--cfx-letra,system-ui,sans-serif);cursor:pointer;white-space:nowrap}' +
    '.cfx-sel-btn svg{flex:none;opacity:.7}.cfx-ayuda .ca-op.ca-mal b{color:var(--cfx-mal,#dc2626)}' +
    '.cfx-cuenta-g{margin:16px 0 8px}.cfx-cg-t{font:800 12px/1 var(--cfx-letra,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--cfx-texto-2,#5b6472);margin:0 2px 10px}' +
    '.cfx-srv{margin:0 0 14px}.cfx-srv-pista{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding:2px 2px 6px}.cfx-srv-pista::-webkit-scrollbar{display:none}' +
    '.cfx-srv-c{flex:0 0 calc(100% - 28px);scroll-snap-align:start;box-sizing:border-box;border-radius:18px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);box-shadow:var(--cfx-sombra,none);padding:12px 14px;transition:transform .2s cubic-bezier(.2,.8,.2,1)}' +
    '@media(min-width:700px){.cfx-srv-c{flex-basis:calc(50% - 10px)}}' +
    '.cfx-srv-cab{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:0;border:0;background:none;color:inherit;font:700 15px/1.2 var(--cfx-letra,system-ui,sans-serif);cursor:pointer;text-align:left}.cfx-srv-cab b{flex:1;min-width:0}' +
    '.cfx-srv-cab svg{flex:none;transition:transform .22s cubic-bezier(.2,.8,.2,1);opacity:.6}.cfx-srv.abierto .cfx-srv-cab svg{transform:rotate(180deg)}' +
    '.cfx-srv-pt{width:10px;height:10px;border-radius:50%;flex:none;background:#94a3b8}.cfx-srv-c.ok .cfx-srv-pt{background:var(--cfx-ok,#16a34a);box-shadow:0 0 0 4px color-mix(in srgb,var(--cfx-ok,#16a34a) 20%,transparent)}.cfx-srv-c.warn .cfx-srv-pt{background:var(--cfx-aviso,#ea580c)}' +
    '.cfx-srv-pc{font-size:13px;color:var(--cfx-texto-2,#5b6472)}.cfx-srv-barra{height:6px;border-radius:3px;background:var(--cfx-campo,#eef2f6);overflow:hidden;margin:8px 0 0}.cfx-srv-barra i{display:block;height:100%;width:0;border-radius:3px;background:var(--brand,var(--marca,#2563eb));transition:width .5s cubic-bezier(.2,.8,.2,1)}' +
    '.cfx-srv-det{display:grid;grid-template-rows:0fr;transition:grid-template-rows .25s cubic-bezier(.2,.8,.2,1)}.cfx-srv-det>div{overflow:hidden;min-height:0}.cfx-srv.abierto .cfx-srv-det{grid-template-rows:1fr}' +
    '.cfx-srv-det h4{margin:12px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--cfx-texto-2,#5b6472)}.cfx-srv-res{margin:10px 0 0;font-size:13px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-srv-f{display:flex;justify-content:space-between;gap:8px;font-size:13.5px;padding:4px 0;border-top:1px dashed var(--cfx-borde,#e2e7ec)}.cfx-srv-f span{min-width:0;overflow-wrap:anywhere}.cfx-srv-f small{color:var(--cfx-texto-2,#5b6472);flex:none}.cfx-srv-err{display:block;color:var(--cfx-aviso,#ea580c);font-size:12px;margin:2px 0 4px}' +
    '.cfx-srv-puntos{display:flex;justify-content:center;gap:6px}.cfx-srv-puntos i{width:7px;height:7px;border-radius:4px;background:var(--cfx-borde,#d4dae1);cursor:pointer;transition:width .2s,background .2s}.cfx-srv-puntos i.on{width:18px;background:var(--brand,var(--marca,#2563eb))}' +
    '.cfx-x-oculta{display:none!important}.cfx-aviso-desl{touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;will-change:transform}.cfx-aviso-desl *{-webkit-user-drag:none}' +
    '@keyframes cfxPista{0%,100%{transform:none}35%{transform:translateX(-42px)}60%{transform:translateX(-42px)}}.cfx-pista{animation:cfxPista 1.1s cubic-bezier(.2,.8,.2,1)}' +
    '.cfx-emerg{position:fixed;inset:auto;width:auto;height:fit-content;box-sizing:border-box;top:calc(10px + env(safe-area-inset-top));left:12px;right:12px;margin:0 auto;max-width:460px;z-index:2147483600;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:18px;border:1px solid var(--cfx-borde,#e2e7ec);' +
    'background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);box-shadow:0 18px 44px -12px rgba(15,23,42,.45);font-family:var(--cfx-letra,system-ui,sans-serif);cursor:pointer;touch-action:none;animation:cfxBaja .26s cubic-bezier(.2,.8,.2,1)}' +
    '@keyframes cfxBaja{from{transform:translateY(-120%);opacity:0}}.cfx-emerg b{display:block;font-size:15px;line-height:1.25}.cfx-emerg small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:13px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.cfx-emerg>div{min-width:0}' +
    '.cfx-emerg-ico{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;background:var(--brand,var(--marca,#2563eb))}.cfx-emerg-ico svg{width:20px;height:20px}' +
    '.cfx-cab>a,.cfx-cab>button{transition:transform .12s ease}.cfx-cab>a:active,.cfx-cab>button:active{transform:scale(.92)}' +
    // Título de la cabecera: más chico en celular y hasta 2 líneas antes de cortar con "…".
    ':is(button,a):has(> .cfx-titulo){justify-content:flex-start!important}.cfx-titulo{text-align:left;white-space:normal!important;display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden!important;text-overflow:ellipsis;line-height:1.12!important;min-width:0}' +
    '@media(max-width:600px){.cfx-titulo{font-size:clamp(14px,4vw,18px)!important}}' +
    '.cfx-plan{height:24px;min-height:0;padding:0 9px;border-radius:99px;border:0;cursor:pointer;font:800 11px/24px var(--cfx-letra,system-ui,sans-serif);letter-spacing:.06em;' +
    'background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto-2,#5b6472);box-shadow:inset 0 0 0 1px var(--cfx-borde,#e2e7ec)}' +
    '.cfx-plan.pro{background:linear-gradient(135deg,#f7d774,#d9a21b);color:#3b2a00;box-shadow:none}' +
    '.cfx-plan.rol{background:linear-gradient(135deg,#334155,#0f172a);color:#fff;box-shadow:none}' +
    '.cfx-av{width:36px;height:36px;min-height:0;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;flex:none;display:grid;place-items:center;' +
    'background:var(--brand,var(--marca,#2563eb));color:#fff;font:800 14px/1 var(--cfx-letra,system-ui,sans-serif);box-shadow:0 0 0 2px var(--cfx-tarjeta,#fff),0 0 0 3px var(--cfx-borde,#e2e7ec)}' +
    '.cfx-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}html.cfx-premium .cfx-av{box-shadow:0 0 0 2px var(--cfx-tarjeta,#fff),0 0 0 4px #d9a21b}' +
    '.cfx-av i{position:absolute;top:-5px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#dc2626;color:#fff;font:700 11px/18px system-ui,sans-serif;font-style:normal;padding:0 4px;box-sizing:border-box}' +
    '@media(max-width:420px){.cfx-cab{gap:6px}.cfx-plan{padding:0 7px;font-size:10px;letter-spacing:.04em}}' +
    '.cfx-ayuda .ca-yo{display:flex;align-items:center;gap:12px;padding:2px 0 12px;border-bottom:1px solid var(--cfx-borde,#e2e7ec);margin-bottom:6px}.cfx-ayuda .ca-yo .cfx-av{width:46px;height:46px;font-size:17px;cursor:default}' +
    '.cfx-ayuda .ca-yo b{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cfx-ayuda .ca-yo small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:12.5px;overflow-wrap:anywhere}.cfx-ayuda .ca-yo>div{min-width:0}' +
    // Ajustes en cuadrícula
    '.cfx-aj>button{min-height:96px}.cfx-aj>button>span:first-child{font-size:26px;line-height:1}.cfx-aj small{display:block;font-weight:500;font-size:12.5px;line-height:1.3;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-reg-b{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.cfx-reg-b button{flex:1 1 180px;min-height:44px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);font:700 14px var(--cfx-letra,system-ui,sans-serif);cursor:pointer}' +
    '.cfx-reg-b .cfx-reg-todo{color:#dc2626}.cfx-reg-f{padding:10px 12px;border-radius:12px;background:var(--cfx-tarjeta,#fff);border:1px solid var(--cfx-borde,#e2e7ec);margin:0 0 8px;overflow-wrap:anywhere}' +
    '.cfx-reg-f b{display:block}.cfx-reg-f span{display:block;font-size:13.5px;color:var(--cfx-texto-2,#5b6472)}.cfx-reg-f small{font-size:12px;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translate(-50%,20px);opacity:0;transition:.25s;z-index:2147483200;background:#111827;color:#fff;padding:10px 16px;border-radius:12px;font:600 14px var(--cfx-letra,system-ui,sans-serif);max-width:90vw}.cfx-toast.on{opacity:1;transform:translate(-50%,0)}' +
    '.cfx-flecha{display:inline-grid!important;place-items:center;line-height:1!important}.cfx-aj-cab{display:flex;align-items:center;gap:10px;margin:0 0 12px}.cfx-aj-cab h2{margin:0;font-size:19px;line-height:1.2}' +
    '.cfx-aj-volver{flex:none;width:40px;height:40px;min-height:0;padding:0;display:grid;place-items:center;line-height:1;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);font-size:20px;cursor:pointer}' +
    'dialog.cfx-ayuda{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:2147483100;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:var(--cfx-letra,system-ui,sans-serif)}' +
    'dialog.cfx-ayuda::backdrop{background:transparent}@media(min-width:600px){dialog.cfx-ayuda{align-items:center}}' +
    '.cfx-ayuda>div{background:var(--cfx-tarjeta,#fff);color:var(--cfx-texto,#111827);width:100%;max-width:520px;max-height:92%;display:flex;flex-direction:column;border-radius:20px 20px 0 0;box-sizing:border-box;padding:16px 16px calc(14px + env(safe-area-inset-bottom))}' +
    '@media(min-width:600px){.cfx-ayuda>div{border-radius:20px}}.cfx-ayuda h2{margin:0 0 6px;font-size:19px}.cfx-ayuda h3{font-size:15px;margin:14px 0 4px}.cfx-ayuda p,.cfx-ayuda li{font-size:14px;line-height:1.45;color:var(--cfx-texto-2,#5b6472)}' +
    '.cfx-ayuda .ca-cuerpo{overflow:auto;flex:1;min-height:0;padding:2px 4px;margin:0 -4px}.cfx-ayuda>div:focus{outline:none}.cfx-ayuda button{min-height:44px;border-radius:12px;border:0;font:inherit;font-weight:700;cursor:pointer;padding:0 12px;background:var(--cfx-campo,#eef2f6);color:var(--cfx-texto,#111827)}' +
    '.cfx-ayuda button.ca-si{background:var(--ca-color);color:#fff}.cfx-ayuda .ca-op{display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:6px 0;background:var(--cfx-campo,#f3f5f8)}.cfx-ayuda .ca-op b{flex:1}' +
    '.cfx-ayuda .ca-op i{font-style:normal;background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px}' +
    '.cfx-ayuda .ca-it{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--cfx-borde,#e2e7ec)}.cfx-ayuda .ca-it:first-child{border-top:0}.cfx-ayuda .ca-it span{font-size:20px;line-height:1}' +
    '.cfx-ayuda .ca-it div{flex:1}.cfx-ayuda .ca-it b{display:block;font-size:14.5px}.cfx-ayuda .ca-it p{margin:2px 0 0;font-size:13px}.cfx-ayuda .ca-it button{min-height:36px;font-size:13px;flex:none}' +
    '.cfx-ayuda .ca-it.ok b{text-decoration:line-through;opacity:.6}.cfx-ayuda .ca-barra{height:8px;border-radius:4px;background:var(--cfx-campo,#eef2f6);overflow:hidden;margin:6px 0 10px}.cfx-ayuda .ca-barra>div{height:100%;background:var(--ca-color)}' +
    '.cfx-ayuda .ca-msjs{display:flex;flex-direction:column;gap:6px;padding:6px 0}.cfx-ayuda .ca-m{max-width:82%;padding:8px 11px;border-radius:14px;font-size:14px;line-height:1.35;white-space:pre-wrap;word-break:break-word}' +
    '.cfx-ayuda .ca-m.yo{align-self:flex-end;background:var(--ca-color);color:#fff;border-bottom-right-radius:4px}.cfx-ayuda .ca-m.el{align-self:flex-start;background:var(--cfx-campo,#eef2f6);border-bottom-left-radius:4px}' +
    '.cfx-ayuda .ca-m small{display:block;opacity:.7;font-size:11px;margin-top:2px}.cfx-ayuda .ca-escribir{display:flex;gap:8px;padding-top:8px}.cfx-ayuda textarea{flex:1;min-height:44px;max-height:120px;border-radius:12px;border:1px solid var(--cfx-borde,#e2e7ec);background:var(--cfx-campo,#f7f9fb);color:inherit;font:inherit;padding:10px 12px;resize:none;box-sizing:border-box}' +
    '.cfx-ayuda .ca-pie{display:flex;gap:8px;margin-top:10px}.cfx-ayuda .ca-pie button{flex:1}' +
    // Perfil común (CFX_PERFIL)
    '.cfx-pf{display:flex;flex-direction:column;gap:10px}.cfx-pf label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px;margin:0}.cfx-pf input:not([type=color]),.cfx-pf textarea{width:100%;box-sizing:border-box;margin:0}' +
    '.cfx-pf-fila{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.cfx-pf-fila>span:first-child{flex:1;min-width:0}.cfx-pf-btns{display:flex;gap:8px;flex-wrap:wrap}.cfx-pf-btns button{min-height:40px}' +
    '.cfx-pf-av{width:64px;height:64px;font-size:22px;font-weight:800;border-radius:50%;flex:none;display:grid;place-items:center;overflow:hidden;background:var(--brand,var(--marca,#2563eb));color:var(--brand-ink,#fff)}' +
    '.cfx-pf-av img{width:100%;height:100%;object-fit:cover;display:block}.cfx-pf-yo .cfx-pf-av{width:52px;height:52px;font-size:18px}.cfx-pf-av b{font-size:1.3em;line-height:1}' +
    '.cfx-pf-icos,.cfx-pf-cols,.cfx-pf-modos{display:flex;flex-wrap:wrap;gap:8px}.cfx-pf-icos button{width:44px;height:44px;min-height:0;padding:0;font-size:22px;border-radius:12px}.cfx-pf-icos button.on{outline:3px solid var(--brand,#2563eb);outline-offset:1px}' +
    '.cfx-pf-cols button{width:38px;height:38px;min-height:0;padding:0;border-radius:50%;border:2px solid var(--cfx-tarjeta,#fff);box-shadow:0 0 0 1px var(--cfx-borde,#e2e7ec)}.cfx-pf-cols button.on{box-shadow:0 0 0 3px var(--cfx-texto,#111827)}.cfx-pf-cols button.cfx-pf-lock{opacity:.45}' +
    '.cfx-pf-libre{flex-direction:row!important;align-items:center}.cfx-pf-libre input{width:52px;height:40px;padding:0;border:0;background:none;flex:none}.cfx-pf-libre i{font-style:normal}' +
    '.cfx-pf-modos button{flex:1;min-width:96px}.cfx-pf-modos button.on,.cfx-pf-si{background:var(--brand,#2563eb)!important;color:var(--brand-ink,#fff)!important;border-color:transparent!important}' +
    '.cfx-pf-caja{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--cfx-borde,#e2e7ec);border-radius:14px}.cfx-pf-caja small{color:var(--cfx-texto-2,#5b6472)}.cfx-pf-peligro button{color:var(--cfx-mal,#dc2626)}' +
    '.cfx-pf-yo{display:flex;align-items:center;gap:12px;padding:2px 0 12px;margin-bottom:10px;border-bottom:1px solid var(--cfx-borde,#e2e7ec)}.cfx-pf-yo>div{min-width:0;flex:1}' +
    '.cfx-pf-yo b{display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cfx-pf-yo small{display:block;color:var(--cfx-texto-2,#5b6472);font-size:12.5px;overflow-wrap:anywhere}' +
    '.cfx-ayuda .cfx-pf-d{min-height:200px}';
  document.head.appendChild(css);

  let R = null, APP = '', estado = { items: [], sin_leer: 0 }, boya = null, abierta = null;
  const CFG = {};
  const pend = () => estado.items.filter((x) => !x.ok);

  function dialogo(html, alCerrar) {
    cerrar();
    const d = document.createElement('dialog'); d.className = 'cfx-ayuda'; d.style.setProperty('--ca-color', color());
    d.innerHTML = '<div>' + html + '</div>';
    document.body.appendChild(d); abierta = d;
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    d.firstChild.tabIndex = -1; try { d.firstChild.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-cerrar]')) cerrar(); });
    // iPhone: el teclado no achica la página; la ventana se ajusta a lo visible para que el chat quede sobre el teclado.
    const vv = window.visualViewport, ajustar = () => { d.style.height = vv.height + 'px'; d.style.top = vv.offsetTop + 'px'; d.style.bottom = 'auto'; };
    if (vv) { vv.addEventListener('resize', ajustar); vv.addEventListener('scroll', ajustar); ajustar(); }
    d.addEventListener('close', () => { if (vv) { vv.removeEventListener('resize', ajustar); vv.removeEventListener('scroll', ajustar); } if (alCerrar) alCerrar(); d.remove(); if (abierta === d) abierta = null; });
    return d.firstChild;
  }
  function cerrar() { if (abierta) { try { abierta.close(); } catch (e) { abierta.remove(); } abierta = null; } }

  // ---------- Cabecera común (arriba a la derecha, igual en las 6 apps): [🔔 campana] [FREE/PRO] [foto] ----------
  // La campana es la de la app (una sola: las repetidas se esconden). La foto abre el menú: inicio, mi cuenta, panel, ayuda, Premium y cerrar sesión.
  // Lo que ya está en el menú (casa, chat, persona, ADMIN, cerrar sesión…) se esconde con CFG.quitar (selector de cada app).
  const SVG_CAMPANA = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const SVG_CAMBIO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>';
  const CAMPANA = '#bCampana, #campana, #btnAvisos, [aria-label="Avisos"], [aria-label="Notificaciones"], a[href$="#avisos"], [data-cfx-campana]';
  function encabezado() {
    return [...document.querySelectorAll('header.top, header.cab, .cab, header, .topbar, .top')].find((h) => {
      const r = h.getBoundingClientRect(); return r.width > 200 && r.height >= 36 && r.height <= 130 && r.top <= 8 && getComputedStyle(h).display !== 'none';
    }) || null;
  }
  const iniciales = () => {
    const n = String(CFG.nombre || CFG.email || '').replace(/@.*/, '').trim().split(/[\s._-]+/).filter(Boolean);
    return esc(((n[0] || '?')[0] + (n[1] ? n[1][0] : '')).toUpperCase());
  };
  const esPro = () => !!(CFG.admin || ('pro' in CFG ? CFG.pro : CFG.premium));  // pro: la insignia (p. ej. en prueba Pro); premium: la app dorada
  function pintarBoya() {
    if (!R) return;
    if (!boya) {
      boya = document.createElement('div'); boya.className = 'cfx-cab';
      boya.innerHTML = '<a class="cfx-atajo cfx-oc"></a><button type="button" class="cfx-plan"></button><button type="button" class="cfx-av" aria-label="Mi cuenta y menú"></button>';
      boya.querySelector('.cfx-av').onclick = menu;
      boya.querySelector('.cfx-plan').onclick = () => (CFG.admin || !window.CFX_PAGOS ? menu() : window.CFX_PAGOS.abrir({ rpc: R }));
    }
    const h = encabezado();
    if (h) {
      if (boya.parentNode !== h) h.appendChild(boya);
      boya.classList.remove('cfx-fija');
      if (CFG.quitar) h.querySelectorAll(CFG.quitar).forEach((x) => x.classList.add('cfx-oc'));
      // El nombre de la cabecera que se cortaba con "…" pasa a 2 líneas (y letra más chica en celular).
      h.querySelectorAll('h1, h2, b, strong, span, div').forEach((x) => { if (!boya.contains(x) && !x.classList.contains('cfx-titulo') && x.childElementCount === 0 && (x.textContent || '').trim() && getComputedStyle(x).textOverflow === 'ellipsis') x.classList.add('cfx-titulo'); });
      const campanas = [...h.querySelectorAll(CAMPANA)].map((x) => x.closest('button, a') || x).filter((x, i, l) => l.indexOf(x) === i && !x.classList.contains('cfx-plan'));
      const una = campanas.find((x) => x.dataset.cfxCampana) || campanas.find((x) => !x.classList.contains('cfx-oc')) || campanas[0];
      campanas.forEach((x) => { if (x !== una) x.classList.add('cfx-oc'); });
      if (una && una.parentNode !== boya) { una.dataset.cfxCampana = '1'; boya.insertBefore(una, boya.querySelector('.cfx-plan')); }
      // Mismo ícono de campana en todas las apps (las que usan el emoji 🔔 pasan al dibujo de línea).
      if (una) [...una.childNodes].forEach((x) => { if (x.nodeType === 3 && /🔔/.test(x.textContent)) { const t = document.createElement('span'); t.innerHTML = SVG_CAMPANA; x.replaceWith(t.firstChild); } });
    } else if (!boya.isConnected) { document.body.appendChild(boya); boya.classList.add('cfx-fija'); }
    const plan = boya.querySelector('.cfx-plan'), av = boya.querySelector('.cfx-av'), at = boya.querySelector('.cfx-atajo');
    // Atajo fijo { ir, t }: el Centro de Mando pasa el suyo (Panel ⇄ App); en las otras apps solo el administrador (no socios, negocios ni clientes) va al panel del Centro de Mando.
    const atajo = 'atajo' in CFG ? CFG.atajo : CFG.admin && !CFG.socio && CFG.app !== 'mando' ? { ir: panelCM(), t: 'Panel' } : null;
    at.classList.toggle('cfx-oc', !atajo);
    if (atajo) { at.href = atajo.ir; at.setAttribute('aria-label', 'Ir a ' + atajo.t); at.innerHTML = SVG_CAMBIO + '<span>' + esc(atajo.t) + '</span>'; }
    // Administrador y socios: en vez del plan se ve su rol (ADMIN / SOCIO), así se nota que es una cuenta para administrar.
    const rol = CFG.admin ? (CFG.socio ? 'SOCIO' : 'ADMIN') : '';
    plan.textContent = rol || (esPro() ? 'PRO' : 'FREE'); plan.classList.toggle('pro', !rol && esPro()); plan.classList.toggle('rol', !!rol);
    plan.setAttribute('aria-label', rol ? (rol === 'ADMIN' ? 'Administrador' : 'Socio') : esPro() ? 'Plan PRO' : 'Plan FREE: ver Premium');
    const n = (CFG.admin ? 0 : pend().length + (estado.sin_leer || 0));
    av.innerHTML = (CFG.foto ? '<img src="' + esc(CFG.foto) + '" alt="">' : iniciales()) + (n ? '<i>' + n + '</i>' : '');
  }
  // Inicio: la primera pantalla de la app en esta sesión. Cerrar sesión: la función de la app, su botón, o se borra la sesión guardada.
  function inicio() { cerrar(); let u = ''; try { u = sessionStorage.getItem('cfx-inicio') || ''; } catch (e) { /* nada */ } location.href = u || RAIZ; }
  function salir() {
    cerrar();
    if (typeof CFG.salir === 'function') return CFG.salir();
    const b = [...document.querySelectorAll('button, a')].find((x) => /^\s*(🚪\s*)?(cerrar sesión|salir)\s*$/i.test(x.textContent || '') && !boya.contains(x));
    if (b) return b.click();
    try { Object.keys(localStorage).filter((k) => /-auth$|^sb-/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* nada */ }
    location.href = RAIZ;
  }
  function confirmarSalir() {
    const caja = dialogo('<h2>¿Cerrar sesión?</h2><p>Para volver a entrar necesitarás tu correo y tu clave.</p>' +
      '<div class="ca-pie"><button type="button" data-cerrar>Cancelar</button><button type="button" class="ca-si" data-salir>Cerrar sesión</button></div>');
    caja.querySelector('[data-salir]').onclick = salir;
  }
  function irA(dest) { cerrar(); if (typeof dest === 'function') return dest(); ir(dest); }
  // La foto de arriba solo cierra sesión (en todas las apps). Lo demás (cuenta, guía, soporte, términos, plan, invitar)
  // va en "Cuenta y ayuda", que el núcleo agrega al final de Más / Ajustes / Cuenta de cada app.
  function menu() {
    dialogo('<div class="ca-yo"><span class="cfx-av">' + (CFG.foto ? '<img src="' + esc(CFG.foto) + '" alt="">' : iniciales()) + '</span><div><b>' + esc(CFG.nombre || (CFG.admin ? 'Administrador' : CFG.email) || 'Mi cuenta') + '</b>' +
      (CFG.email && (CFG.nombre || CFG.admin) ? '<small>' + esc(CFG.email) + '</small>' : '') + '<small>' + (CFG.admin ? (CFG.socio ? 'Socio' : 'Administrador') : 'Plan ' + (esPro() ? 'PRO' : 'FREE')) + '</small></div></div>' +
      '<div class="ca-cuerpo">' + (R ? '<button type="button" class="ca-op" data-a="perfil"><span>👤</span><b>Mi perfil</b></button>' : '') +
      '<button type="button" class="ca-op" data-a="salir"><span>🚪</span><b>Cerrar sesión</b></button></div>').onclick = (ev) => { if (ev.target.closest('[data-a=salir]')) confirmarSalir(); if (ev.target.closest('[data-a=perfil]')) abrirPerfil(); };
  }
  function accion(a) {
    if (a === 'cuenta' || a === 'panel') return irA(CFG[a]);
    if (a === 'invitar') return invitar();
    if (a === 'guia') return guia();
    if (a === 'chat') return chat({ rpc: R });
    if (a === 'terminos') return terminos();
    if (a === 'premium' && window.CFX_PAGOS) return window.CFX_PAGOS.abrir({ rpc: R });
  }
  function cuentaEnMas() {
    if (!R || (CFG.admin && !CFG.socio)) return;
    const on = document.querySelector('nav.cfx-barra > .on, nav.cfx-barra > .activo, nav.cfx-barra > [aria-current]');
    const MAS = /^(más|mas|ajustes|cuenta|perfil)$/i;
    if (!(on && MAS.test((on.getAttribute('aria-label') || on.textContent || '').replace(/[0-9+]/g, '').trim())) && !MAS.test(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0])) return;
    const vis = (x) => x.offsetParent && !x.closest('.cfx-cuenta-g, dialog, .cfx-oc, [hidden]');
    const gs = [...document.querySelectorAll('.cfx-grilla')].filter(vis);
    const ancla = gs[gs.length - 1] || [...document.querySelectorAll('.view.on, .vista.on, section.on, main')].find(vis);
    if (!ancla) return;
    const caja = gs.length ? ancla.parentElement : ancla;
    if ([...caja.querySelectorAll(':scope > .cfx-cuenta-g')].length) return;
    const p = pend().length, adm = !!CFG.admin;
    const t = (a, ico, tx, extra) => '<button type="button" data-cfx-a="' + a + '"><span class="ic-caja">' + ico + '</span>' + tx + (extra || '') + '</button>';
    const d = document.createElement('div'); d.className = 'cfx-cuenta-g';
    d.innerHTML = '<div class="cfx-cg-t">Cuenta y ayuda</div><div class="cfx-grilla">' +
      (CFG.cuenta ? t('cuenta', '👤', 'Mi cuenta') : '') + (CFG.panel ? t('panel', '🛡️', 'Panel de administración') : '') +
      (!adm && estado.items.length ? t('guia', '🧭', 'Guía para partir', p ? '<i class="badge on">' + p + '</i>' : '') : '') +
      (!adm ? t('chat', '💬', 'Chat con soporte', estado.sin_leer ? '<i class="badge on">' + estado.sin_leer + '</i>' : '') : '') +
      t('terminos', '📄', 'Términos y condiciones') +
      (!adm && window.CFX_PAGOS ? t('premium', '⭐', esPro() ? 'Mi plan PRO' : 'Pasar a PRO') : '') +
      (!adm && !PERSONALES.includes(APP) ? t('invitar', '🎁', 'Invita y gana') : '') + '</div>';
    d.onclick = (ev) => { const b = ev.target.closest('[data-cfx-a]'); if (b) accion(b.dataset.cfxA); };
    if (gs.length) ancla.after(d); else ancla.appendChild(d);
  }

  // ---------- Ajustes en cuadrícula (igual en las 6 apps; cada app entrega SU lista) ----------
  // CFX_AJUSTES.montar(el, [{ k, ico, t, d, abrir(zona) | nodo }], { arriba, abajo })  → tarjetas; al tocar una se abre su sección con "←" que vuelve a la cuadrícula.
  //   abrir(zona): la sección se dibuja en zona.  nodo: una sección que ya está en la página (se muestra solo ella; abrir también se llama si viene).
  // Devuelve { abrir(k), grilla() } para entrar directo a una sección (p. ej. desde un link #ajustes/textos).
  function ajustes(el, L, o) {
    o = o || {};
    L = L.filter(Boolean);
    let w = el.querySelector(':scope > .cfx-aj-w');
    if (!w) { w = document.createElement('div'); w.className = 'cfx-aj-w'; el.prepend(w); }
    const nodos = L.map((s) => s.nodo).filter(Boolean);
    const grilla = () => {
      nodos.forEach((n) => n.classList.add('cfx-oc'));
      w.innerHTML = (o.arriba || '') + '<div class="cfx-grilla cfx-aj">' + L.map((s) => '<button type="button" data-k="' + esc(s.k) + '"><span>' + s.ico + '</span>' + esc(s.t) +
        (s.d ? '<small>' + esc(s.d) + '</small>' : '') + '</button>').join('') + '</div>' + (o.abajo || '');
      w.querySelectorAll('.cfx-aj > [data-k]').forEach((b) => { b.onclick = () => abrir(b.dataset.k); });
    };
    const abrir = (k) => {
      const s = L.find((x) => x.k === k); if (!s) return grilla();
      nodos.forEach((n) => n.classList.toggle('cfx-oc', n !== s.nodo));
      if (s.nodo) s.nodo.classList.remove('hidden');
      w.innerHTML = '<div class="cfx-aj-cab"><button type="button" class="cfx-aj-volver" data-sin-atras aria-label="Volver a Ajustes"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><h2>' + s.ico + ' ' + esc(s.t) + '</h2></div><div class="cfx-aj-zona"></div>';
      w.querySelector('.cfx-aj-volver').onclick = () => { grilla(); scrollTo(0, 0); };
      scrollTo(0, 0);
      return s.abrir ? s.abrir(w.querySelector('.cfx-aj-zona'), k) : undefined;
    };
    grilla();
    return { abrir, grilla };
  }

  // ---------- Registro de cambios: botones para borrarlo (igual en las 6 apps) ----------
  // CFX_AJUSTES.registro(el, rpc, { lista: true, recargar }) → arriba de el pone "Borrar lo de más de 30 días" y "Borrar todo" (pide confirmar).
  //   lista: además muestra el registro común (cfx_registro_lista) para las apps que no tienen uno propio.
  async function registro(el, rpc, o) {
    o = o || {};
    const caja = document.createElement('div'); caja.className = 'cfx-reg';
    caja.innerHTML = '<div class="cfx-reg-b"><button type="button" data-d="30">🧹 Borrar lo de más de 30 días</button><button type="button" data-d="0" class="cfx-reg-todo">🗑️ Borrar todo</button></div><div class="cfx-reg-l"></div>';
    el.prepend(caja);
    const pintar = async () => {
      if (!o.lista) return;
      const l = caja.querySelector('.cfx-reg-l');
      try {
        const L = await rpc('cfx_registro_lista', { p_limite: 300 });
        l.innerHTML = L.length ? L.map((x) => '<div class="cfx-reg-f"><b>' + esc(x.accion) + '</b><span>' + esc(x.detalle || '') + '</span><small>' + esc(x.quien || '') + ' · ' + new Date(x.creado).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>').join('')
          : '<p style="margin:8px 0;color:var(--cfx-texto-2,#5b6472)">Sin cambios registrados.</p>';
      } catch (x) { l.innerHTML = '<p>' + esc(x.message || x) + '</p>'; }
    };
    caja.querySelector('.cfx-reg-b').onclick = (ev) => {
      const b = ev.target.closest('[data-d]'); if (!b) return;
      const d = +b.dataset.d;
      const c = dialogo('<h2>' + (d ? '🧹 Borrar lo antiguo' : '🗑️ Borrar todo el registro') + '</h2><p>' + (d ? 'Se borran los cambios de hace más de 30 días.' : 'Se borra todo el registro de cambios. No se puede deshacer.') + '</p>' +
        '<div class="ca-pie"><button type="button" data-cerrar>Cancelar</button><button type="button" class="ca-si" data-si>Borrar</button></div>');
      c.querySelector('[data-si]').onclick = async (e) => {
        e.target.disabled = true;
        try { const n = await rpc('cfx_registro_borrar', { p_dias: d }); cerrar(); aviso('🧹 Registro borrado (' + n + ')'); pintar(); if (o.recargar) o.recargar(); }
        catch (x) { e.target.disabled = false; aviso(x.message || String(x)); }
      };
    };
    pintar();
  }
  function aviso(t) {
    const d = document.createElement('div'); d.className = 'cfx-toast'; d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.classList.add('on'), 10); setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); }, 2600);
  }

  // ---------- Guía ----------
  function ir(dest) {
    cerrar();
    if (dest === 'verificar' && window.CFX_VERIFICAR) return window.CFX_VERIFICAR.abrir({ rpc: R });
    if (dest === 'pagar' && window.CFX_PAGOS) return window.CFX_PAGOS.abrir({ rpc: R });
    const u = new URL(dest, RAIZ);
    if (u.pathname === location.pathname && u.hash) { if (location.hash === u.hash) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = u.hash; }
    else location.href = u.href;
  }
  function guia() {
    const L = estado.items, ok = L.filter((x) => x.ok).length;
    const caja = dialogo('<h2>🧭 Guía para partir</h2><p>' + (ok === L.length ? '¡Todo listo! Tu negocio está configurado.' : 'Te faltan ' + (L.length - ok) + ' de ' + L.length + ' pasos. Cada uno se marca solo cuando lo haces.') + '</p>' +
      '<div class="ca-barra"><div style="width:' + Math.round(ok * 100 / Math.max(1, L.length)) + '%"></div></div><div class="ca-cuerpo">' +
      L.map((x, i) => '<div class="ca-it' + (x.ok ? ' ok' : '') + '"><span>' + (x.ok ? '✅' : '⬜') + '</span><div><b>' + esc(x.t) + '</b>' + (x.d && !x.ok ? '<p>' + esc(x.d) + '</p>' : '') + '</div>' +
        (!x.ok && x.ir ? '<button type="button" class="ca-si" data-i="' + i + '">Hacerlo</button>' : '') + '</div>').join('') +
      '</div><div class="ca-pie"><button type="button" data-cerrar>' + (ok === L.length ? 'Cerrar' : 'Después') + '</button></div>');
    caja.onclick = (ev) => { const b = ev.target.closest('[data-i]'); if (b) ir(L[+b.dataset.i].ir); };
  }
  function recordar() {
    if (window.CFX_SIN_HOLA || !pend().length || document.hidden || document.querySelector('dialog[open], .cfx-hoja')) return;  // CFX_SIN_HOLA: pruebas
    let ult = 0; try { ult = Number(sessionStorage.getItem('cfx-guia-vista')) || 0; } catch (e) { /* nada */ }
    if (ult && Date.now() - ult < CADA) return;
    try { sessionStorage.setItem('cfx-guia-vista', String(Date.now())); } catch (e) { /* nada */ }
    guia();
  }

  // ---------- Chat ----------
  async function chat(o) {
    const rpc = (o && o.rpc) || R; if (!rpc) return;
    let vigia = null;
    const caja = dialogo('<h2>💬 Soporte</h2><p style="margin:0 0 4px">Escríbenos lo que necesites. Te avisamos cuando respondamos.</p><div class="ca-cuerpo"><div class="ca-msjs"><p>Cargando…</p></div></div>' +
      '<div class="ca-escribir"><textarea maxlength="1000" rows="1" placeholder="Escribe tu mensaje…"></textarea><button type="button" class="ca-si" data-enviar>Enviar</button></div>' +
      '<p class="ca-err" style="color:#dc2626;margin:4px 0 0;min-height:1em"></p><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>', () => clearInterval(vigia));
    const lista = caja.querySelector('.ca-msjs'), cuerpo = caja.querySelector('.ca-cuerpo'), ta = caja.querySelector('textarea'), err = caja.querySelector('.ca-err');
    async function cargar() {
      try {
        const m = await rpc('cfx_chat_mio');
        lista.innerHTML = m.length ? m.map((x) => '<div class="ca-m ' + (x.de === 'persona' ? 'yo' : 'el') + '">' + esc(x.texto) + '<small>' + new Date(x.creado).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>').join('')
          : '<p>Aún no hay mensajes. ¡Cuéntanos en qué te ayudamos!</p>';
        cuerpo.scrollTop = cuerpo.scrollHeight;
        if (estado.sin_leer) { estado.sin_leer = 0; pintarBoya(); }
      } catch (x) { lista.innerHTML = '<p>' + esc(x.message || x) + '</p>'; }
    }
    caja.querySelector('[data-enviar]').onclick = async (ev) => {
      const t = ta.value.trim(); if (!t) return;
      ev.target.disabled = true; err.textContent = '';
      try { await rpc('cfx_chat_enviar', { p_texto: t }); ta.value = ''; await cargar(); } catch (x) { err.textContent = (x && x.message) || String(x); }
      ev.target.disabled = false;
    };
    await cargar();
    vigia = setInterval(() => { if (!document.hidden) cargar(); }, 10000);
    ta.focus();
  }

  // ---------- Términos y condiciones ----------
  function detectar() {
    if (APP) return APP;
    const w = window, t = document.title || '';
    if (w.LC) return 'billetera';
    if (w.Api && w.U) return 'estaciona';
    if (/BiciTaller/i.test(t)) return 'taller';
    if (/Barber/i.test(t)) return 'barberia';
    if (/Órbita|Orbita/i.test(t)) return 'orbita';
    if (/Mando/i.test(t)) return 'mando';
    return '';
  }
  const NOMBRE = { billetera: 'Libreta de Cobros', orbita: 'Órbita', barberia: 'Barbería', taller: 'BiciTaller', estaciona: 'Estaciona', mando: 'Centro de Mando' };
  // Lo propio de cada tipo de negocio (va como sección 5).
  const PROPIO = {
    barberia: ['Reservas y abono previo',
      'Las horas se reservan en la app. Cada barbería puede pedir un abono previo para confirmar la hora; el monto y su política de cancelación se muestran antes de pagar. ' +
      'Si cancelas con la anticipación que indica la barbería, el abono se te devuelve o se abona a tu próxima hora. Si no llegas sin avisar, la barbería puede quedarse con el abono como compensación. ' +
      'El abono se descuenta del precio final del servicio. Los precios los fija cada barbería y deben incluir IVA cuando corresponda.'],
    taller: ['Reservas, abono previo y reparaciones',
      'Reservas tu hora en la app y el taller puede pedir un abono previo para confirmarla (el monto y la política de cancelación se muestran antes de pagar); el abono se descuenta del total. ' +
      'Antes de reparar, el taller te informa el presupuesto y no puede cobrar trabajos que no aprobaste. Las reparaciones tienen la garantía legal de 3 meses desde la entrega (art. 41 de la Ley 19.496). ' +
      'Si no retiras tu bicicleta dentro del plazo informado por el taller, este puede cobrar bodegaje según lo publicado.'],
    orbita: ['Compras en tiendas: pago, despacho, retracto y garantía',
      'Cada tienda publica sus productos y precios (con IVA incluido cuando corresponda). El pedido se paga completo antes del despacho; el costo de despacho depende de tu comuna y se muestra antes de pagar. ' +
      'En compras a distancia tienes derecho a retracto dentro de 10 días desde que recibes el producto, salvo que la tienda lo haya excluido de forma visible antes de la compra (art. 3 bis de la Ley 19.496). ' +
      'Los productos tienen garantía legal de 6 meses por fallas (cambio, reparación o devolución del dinero, a tu elección). La tienda entrega la boleta o factura.'],
    billetera: ['Fiado, cuotas y cobranza',
      'La Libreta registra ventas al fiado, cuotas y abonos entre un negocio y sus clientes; no es un banco ni presta dinero. Los intereses, si se pactan, no pueden superar el máximo convencional (Ley 18.010). ' +
      'Los recordatorios de cobro deben respetar la ley: sin amenazas, sin avisar a terceros (familia, trabajo), en días hábiles y horario razonable, y sin cobrar gastos de cobranza no permitidos (art. 37 de la Ley 19.496). ' +
      'El cliente puede ver su saldo y pedir corrección de cualquier error.'],
    estaciona: ['Arriendo de estacionamientos entre personas',
      'Estaciona conecta a quienes publican un estacionamiento con quienes lo arriendan. El precio, las reglas del lugar y la forma de pago las define quien publica, y se muestran antes de arrendar. ' +
      'Quien publica declara tener derecho a arrendar ese espacio (dueño o autorizado por la comunidad). Quien arrienda usa el espacio según lo acordado y responde por los daños que cause. ' +
      'Estaciona no custodia vehículos ni responde por robos o daños dentro del estacionamiento. Pedimos verificar identidad para dar más seguridad.'],
    mando: ['Uso personal',
      'El Centro de Mando organiza tus tareas, metas, ideas y descanso. Lo que anotas es privado y solo tú lo ves.']
  };
  function terminos(app) {
    const a = app || detectar(), n = NOMBRE[a] || 'esta app', p = PROPIO[a];
    const S = [
      ['1. Quiénes somos', n + ' es una aplicación de CodeFix (Chile). Puedes escribirnos desde el chat de soporte de la app. Estos términos siguen la Ley 19.496 sobre Protección de los Derechos de los Consumidores y las leyes de datos personales 19.628 y 21.719.'],
      ['2. Tu cuenta', 'Para crear una cuenta de negocio debes ser mayor de 18 años y dar datos verdaderos. Cuida tu contraseña: lo que se haga con tu cuenta es tu responsabilidad. Puedes borrar tu cuenta cuando quieras desde la app o pidiéndolo por el chat.'],
      ['3. Planes y pagos', 'Hay una versión gratis y una Premium (mensual, por varios meses o anual), con precios en pesos chilenos publicados en la app. ' +
        'Por transferencia pagas el precio exacto. Con link de pago o tarjeta se suma un cargo por pago online que se muestra en una línea aparte antes de pagar. ' +
        'El Premium se activa al validar tu comprobante (normalmente en 5 a 10 minutos en horario hábil) y dura los días comprados (30 por mes, 365 por año). No hay cobros automáticos: nada se renueva sin que pagues de nuevo. ' +
        'Si eres un negocio nuevo, el primer pago activa tu cuenta; al terminar ese período sigues en la versión gratis si no renuevas.'],
      ['4. Retracto y devoluciones', 'Puedes retractarte dentro de 10 días desde tu pago si aún no usaste las funciones Premium, y te devolvemos el monto por transferencia. ' +
        'Si el servicio falla por causa nuestra y no lo solucionamos, te devolvemos la parte proporcional de los días no usados.'],
      p ? ['5. ' + p[0], p[1]] : null,
      [(p ? '6' : '5') + '. Responsabilidad de cada negocio', 'Cada negocio que usa la app es el proveedor frente a sus propios clientes: fija sus precios, cobra con sus propios medios de pago (los abonos y pagos de sus clientes le llegan directo a él, no a CodeFix), entrega boleta y responde por sus productos y servicios según la ley. CodeFix entrega la herramienta.'],
      [(p ? '7' : '6') + '. Tus datos', 'Usamos tus datos solo para que la app funcione: cuenta, reservas o pedidos, avisos y soporte. No los vendemos. Los guardamos en servidores seguros (Supabase). ' +
        'Las fotos de comprobantes y de identidad se borran apenas se revisan. Las fotos que solo ves tú quedan en tu teléfono. Puedes pedir acceso, corrección, borrado o copia de tus datos, u oponerte a su uso, escribiendo al chat de soporte.'],
      [(p ? '8' : '7') + '. Buen uso', 'No está permitido publicar contenido falso, ilegal u ofensivo, suplantar a otras personas ni usar la app para estafas. Podemos suspender cuentas que lo hagan, avisándote el motivo.'],
      [(p ? '9' : '8') + '. Disponibilidad', 'Trabajamos para que la app esté siempre disponible y respaldamos la información, pero pueden ocurrir cortes por mantención o fallas de terceros (internet, servidores). Te recomendamos descargar tus respaldos.'],
      [(p ? '10' : '9') + '. Cambios', 'Si cambiamos estos términos o los precios, te avisamos en la app con al menos 15 días de anticipación. Los días Premium que ya pagaste se respetan.'],
      [(p ? '11' : '10') + '. Reclamos', 'Escríbenos primero por el chat: respondemos lo antes posible. Siempre puedes acudir al SERNAC (sernac.cl) o al Juzgado de Policía Local de tu comuna. Se aplica la ley chilena.']
    ].filter(Boolean);
    dialogo('<h2>📄 Términos y condiciones</h2><p style="margin:0">' + esc(n) + ' · vigentes desde octubre de 2026</p><div class="ca-cuerpo">' +
      S.map((x) => '<h3>' + esc(x[0]) + '</h3><p>' + esc(x[1]) + '</p>').join('') + '</div><div class="ca-pie"><button type="button" data-cerrar>Entendido</button></div>');
  }

  // ---------- Inicio ----------
  async function revisar() {
    if (!R) return;
    try { estado = await R('cfx_guia') || estado; } catch (e) { return; }
    estado.items = estado.items || [];
    pintarBoya();
    setTimeout(recordar, 4000);
  }
  // CFX_AYUDA.iniciar({ rpc, app, admin, premium, id, hasta, beneficios, nombre, email, foto, cuenta, panel, quitar, salir })
  //   una sola llamada al tener la cuenta (también para el admin): cabecera común, ayuda y sensación Premium (CFX_PREMIUM, nunca al admin).
  //   cuenta / panel: dirección (#… o url) o función para "Mi cuenta" y "Panel de administración". Se puede volver a llamar (p. ej. al cambiar la foto).
  // ---------- Referidos: ?ref=CODIGO en el link queda guardado y se asocia al crear/entrar a la cuenta nueva ----------
  const PERSONALES = ['mando', 'contenido'], SOCIOS_NUCLEO = ['billetera', 'orbita', 'estaciona'];
  try { const rf = new URLSearchParams(location.search).get('ref'); if (rf && /^[A-Za-z0-9]{4,12}$/.test(rf)) localStorage.setItem('cfx-ref', rf.toUpperCase()); } catch (e) { /* nada */ }
  async function refRegistrar() {
    let c = null; try { c = localStorage.getItem('cfx-ref'); } catch (e) { return; }
    if (!c || PERSONALES.includes(APP)) return;
    try { await R('cfx_ref_registrar', { p_codigo: c }); localStorage.removeItem('cfx-ref'); } catch (e) { /* base sin referidos todavía: se intenta otra vez */ }
  }
  async function invitar() {
    const caja = dialogo('<h2>🎁 Invita y gana</h2><p>Comparte tu link: quien se registre con él queda asociado a tu cuenta y te ganas días de Premium.</p><div class="ca-cuerpo" id="caRef"><p>Cargando…</p></div>' +
      '<div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>');
    try {
      const r = await R('cfx_ref_mio'); if (!r || !r.codigo) throw new Error('Tu cuenta no tiene código.');
      const link = RAIZ + '?ref=' + r.codigo, z = caja.querySelector('#caRef');
      z.innerHTML = '<p style="text-align:center;margin:6px 0"><b style="font-size:24px;letter-spacing:.06em">' + esc(r.codigo) + '</b></p><p style="word-break:break-all;font-size:13px;opacity:.8">' + esc(link) + '</p>' +
        '<p>Invitaste a <b>' + r.invitados + '</b> persona' + (r.invitados === 1 ? '' : 's') + (r.pagaron ? ' · ' + r.pagaron + ' ya pagaron' : '') + (r.invitados >= 3 ? ' 🏆' : '') + '</p>' +
        '<button type="button" class="ca-op" data-a="share"><span>📤</span><b>Compartir mi link</b></button><button type="button" class="ca-op" data-a="copiar"><span>📋</span><b>Copiar link</b></button>';
      z.onclick = async (ev) => {
        const b = ev.target.closest('[data-a]'); if (!b) return;
        const txt = 'Te recomiendo esta app 👉 ' + link;
        if (b.dataset.a === 'share' && navigator.share) { try { await navigator.share({ text: txt, url: link }); } catch (e) { /* cancelado */ } }
        else { try { await navigator.clipboard.writeText(link); b.querySelector('b').textContent = '¡Copiado!'; } catch (e) { /* sin permiso */ } }
      };
    } catch (e) { caja.querySelector('#caRef').innerHTML = '<p>' + esc(e.message) + '</p>'; }
  }
  function iniciar(o) {
    if (!o || !o.rpc) return;
    const primera = !R;
    R = o.rpc; APP = o.app || APP;
    Object.assign(CFG, o);
    if (!CFG.foto && !(window.CFX_PERFIL_APP || {}).foto) CFG.foto = lsL(fotoKey()) || null;  // foto guardada por BASE (este celular)
    try { if (!sessionStorage.getItem('cfx-inicio')) sessionStorage.setItem('cfx-inicio', location.pathname + location.search); } catch (e) { /* nada */ }
    if (window.CFX_PREMIUM && 'premium' in o) window.CFX_PREMIUM.marcar({ premium: !CFG.admin && !!CFG.premium, id: CFG.id, hasta: CFG.hasta, beneficios: CFG.beneficios });
    pintarBoya();
    // Socios comunes (Billetera, Órbita y Estaciona): la app no lo sabe; se pregunta una vez para mostrar SOCIO y no el atajo del CM.
    if (CFG.admin && CFG.socio === undefined && SOCIOS_NUCLEO.includes(APP)) R('cfx_es_socio').then((v) => { CFG.socio = !!v; pintarBoya(); }).catch(() => { CFG.socio = false; });
    if (CFG.admin) return;
    refRegistrar();
    revisar();
    if (primera) {
      setInterval(revisar, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    }
  }

  // ---------- Flechas siempre al centro de su cuadro ----------
  // Los botones que solo tienen una flecha de texto (‹ › ← →) pasan a un dibujo: así queda centrada en todas las letras y celulares.
  const FLECHA = { '‹': 'M15 18l-6-6 6-6', '›': 'M9 18l6-6-6-6', '←': 'M19 12H5M12 19l-7-7 7-7', '→': 'M5 12h14M12 5l7 7-7 7' };
  // El signo + queda solo en el botón principal (el + del centro): "+ Cuenta" → "Cuenta". No toca botones que son solo "+" ni "+ 2 libres".
  const MAS_TXT = /^(\s*)[+＋]\s*(?=\p{L})/u;
  function sinMas(b) {
    if (b.matches('.cfx-mas, .nuevo, .nav-mas, .mas-grande, [data-cfx-nuevo]') || b.closest('nav, .no-ico, [data-emoji]')) return;
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null); let t;
    while ((t = w.nextNode()) && !t.data.trim()) { /* primer texto */ }
    if (t && MAS_TXT.test(t.data)) t.data = t.data.replace(MAS_TXT, '$1');
    // Ícono "+" (SVG) delante de un texto: se quita; un botón que es solo el + se deja.
    const sv = b.querySelector('svg'); if (!sv || !(b.textContent || '').trim()) return;
    const d = [...sv.querySelectorAll('path')].map((x) => x.getAttribute('d')).join(' ').replace(/\s+/g, '');
    if (/^M12[ ,]?5v14M5[ ,]?12h14$/.test(d) || d === 'M12 5v14M5 12h14'.replace(/\s+/g, '')) { const c = sv.parentElement !== b && !sv.parentElement.textContent.trim() ? sv.parentElement : sv; c.remove(); }
  }
  function flechas(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll('button, a') : []).forEach((b) => {
      sinMas(b);
      if (b.children.length || b.dataset.cfxFlecha) return;
      const t = (b.textContent || '').trim(); if (!FLECHA[t]) return;
      b.dataset.cfxFlecha = '1';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;margin:auto"><path d="' + FLECHA[t] + '"/></svg>';
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', t === '←' ? 'Volver' : t === '‹' ? 'Anterior' : 'Siguiente');
      b.style.display = b.style.display || ''; b.classList.add('cfx-flecha');
    });
  }
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => { const e = n.nodeType === 1 ? n : n.parentElement; if (e) flechas(e.parentNode || e); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') flechas(document); else document.addEventListener('DOMContentLoaded', () => flechas(document));

  // ---------- Otras apps CodeFix (debajo del ingreso de cada app) ----------
  // Bajo el formulario de ingreso se muestran las otras apps: al tocar una se abre su registro. El CM y Cerebro (personales) no se muestran
  // ni la llevan; un formulario con data-sin-apps tampoco. La app donde estás no sale.
  const OTRAS = [['emprendedor', 'billetera', 'Billetera', 'Cobros y deudas', '#0f8a5f', '#crear'], ['aplicaciones', 'apps', 'Órbita', 'Tienda y pedidos', '#2563eb', ''],
    ['barberia', 'barberia', 'Barbería', 'Reservas de hora', '#b8860b', 'registro/'], ['taller', 'bicitaller', 'BiciTaller', 'Taller de bicis', '#16a34a', 'n/'],
    ['estacionamiento', 'estaciona', 'Estaciona', 'Arrienda o publica', '#1d4ed8', '']];
  const h0 = location.hostname.split('.')[0];
  const PROPIA = /^(saas|mando|contenido|cerebro)$/.test(h0) || /\/admin\//.test(location.pathname);
  function otrasApps() {
    if (PROPIA) return;
    document.querySelectorAll('input[type="password"][autocomplete="current-password"]').forEach((c) => {
      const f = c.closest('form'); if (!f || f.dataset.cfxApps || f.hasAttribute('data-sin-apps') || f.closest('dialog.cfx-ayuda')) return;
      f.dataset.cfxApps = '1';
      const L = OTRAS.filter((a) => a[0] !== h0 && a[1] !== h0);
      const d = document.createElement('div'); d.className = 'cfx-otras';
      d.innerHTML = '<p>¿Conoces las otras apps de CodeFix? Crea tu cuenta gratis</p><div>' + L.map((a) => '<a href="' + web(a[0], a[1]) + a[5] + '" target="_blank" rel="noopener" style="--c:' + a[4] + '">' +
        '<i aria-hidden="true">' + a[2][0] + '</i><b>' + a[2] + '</b><small>' + a[3] + '</small></a>').join('') + '</div>';
      f.after(d);
    });
  }
  const cssO = document.createElement('style');
  cssO.textContent = '.cfx-otras{margin:18px 0 4px}.cfx-otras>p{margin:0 0 8px;font-size:13px;opacity:.75;text-align:center}' +
    '.cfx-otras>div{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}.cfx-otras>div::-webkit-scrollbar{display:none}' +
    '.cfx-otras a{flex:1 0 96px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px;border-radius:14px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.06);color:inherit;text-decoration:none;text-align:center}' +
    '.cfx-otras i{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-style:normal;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--c),color-mix(in srgb,var(--c) 60%,#000));box-shadow:0 4px 12px color-mix(in srgb,var(--c) 35%,transparent);margin-bottom:2px}' +
    '.cfx-otras b{font-size:13px}.cfx-otras small{font-size:11px;opacity:.7;line-height:1.2}';
  document.head.appendChild(cssO);
  new MutationObserver(() => { clearTimeout(otrasApps.t); otrasApps.t = setTimeout(otrasApps, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') otrasApps(); else document.addEventListener('DOMContentLoaded', otrasApps);

  // ---------- "Volver" vuelve a la pantalla anterior (no al inicio) ----------
  // Se guarda el recorrido de la sesión; los botones "Volver"/"‹" de cualquier app hacen history.back() si hay una pantalla anterior.
  function pila() { try { return JSON.parse(sessionStorage.getItem('cfx-pila') || '[]'); } catch (e) { return []; } }
  function anotar() {
    const l = pila(), u = location.pathname + location.search + location.hash;
    if (l[l.length - 1] === u) return;
    if (l[l.length - 2] === u) l.pop(); else l.push(u);
    try { sessionStorage.setItem('cfx-pila', JSON.stringify(l.slice(-40))); } catch (e) { /* nada */ }
  }
  anotar(); addEventListener('hashchange', anotar); addEventListener('popstate', anotar);
  const VOLVER = /^\s*(‹|←|⬅️?|<)?\s*(volver|atrás|atras)?\s*$/i;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, a'); if (!b || b.closest('dialog, .modal, .sheet, .cfx-mv')) return;
    const t = (b.textContent || '').trim(), al = b.getAttribute('aria-label') || '';
    if (!(/volver|atrás/i.test(al) || (t && t.length <= 12 && VOLVER.test(t) && /[‹←⬅<]|volver|atr/i.test(t)))) return;
    const l = pila();
    // Solo en pantallas con dirección propia (#…): las vistas internas sin dirección usan su propio Volver.
    if (location.hash.length > 1 && l.length > 1 && !b.hasAttribute('data-sin-atras')) { e.preventDefault(); e.stopImmediatePropagation(); history.back(); }
  }, true);

  // La cabecera se vuelve a poner si la app redibuja su encabezado.
  setInterval(() => { if (R && (!boya || !boya.isConnected || (boya.classList.contains('cfx-fija') && encabezado()))) { if (boya && boya.classList.contains('cfx-fija')) boya.remove(); pintarBoya(); } }, 1500);

  window.CFX_AYUDA = { iniciar, chat, terminos, guia, revisar, menu, web, panelCM };
  // ---------- Tiras de filtros/pestañas que no caben: se deslizan de lado y se desvanecen en la orilla ----------
  function marcarTira(x) {
    x.classList.toggle('cfx-d-izq', x.scrollLeft > 4);
    x.classList.toggle('cfx-d-der', x.scrollLeft + x.clientWidth < x.scrollWidth - 4);
  }
  function tiras() {
    const padres = new Set(); document.querySelectorAll('button, a, .chip').forEach((b) => { if (b.parentElement) padres.add(b.parentElement); });
    padres.forEach((x) => {
      if (x.classList.contains('cfx-desliza')) return marcarTira(x);
      if (x.childElementCount < 2 || x.scrollWidth <= x.clientWidth + 4 || !x.clientWidth || x.closest('.cfx-barra, .cfx-cab, header, dialog')) return;
      const hijos = [...x.children], botones = hijos.filter((h) => /^(BUTTON|A)$/.test(h.tagName) || h.classList.contains('chip'));
      if (botones.length < hijos.length * 0.7 || getComputedStyle(x).display.indexOf('flex') < 0) return;
      x.classList.add('cfx-desliza'); x.addEventListener('scroll', () => marcarTira(x), { passive: true }); marcarTira(x);
    });
  }
  // ---------- Avisos: se borran deslizando hacia el lado (sin ✕) y se juntan los de abajo ----------
  // Cada app deja su botón "Borrar aviso" (aria-label) con su propia lógica: aquí se esconde y el deslizar lo toca.
  // Así cada persona sigue viendo y borrando solo SUS avisos, igual que antes.
  const XAV = '[aria-label="Borrar aviso"]';
  const filaAviso = (b) => b.closest('.notif, .item, li, .aviso') || b.parentElement;
  function irse(f, dir) {
    return new Promise((ok) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return ok();
      f.style.transition = 'transform .18s ease-in, opacity .18s ease-in'; f.style.transform = 'translateX(' + (dir * 110) + '%)'; f.style.opacity = '0';
      setTimeout(() => { const h = f.offsetHeight; f.style.overflow = 'hidden'; f.style.height = h + 'px'; void f.offsetHeight;
        f.style.transition = 'height .18s ease, margin .18s ease, padding .18s ease'; f.style.height = '0px'; f.style.marginTop = f.style.marginBottom = '0px'; f.style.paddingTop = f.style.paddingBottom = '0px';
        setTimeout(ok, 190); }, 170);
    });
  }
  function deslizable(b) {
    if (b.dataset.cfxDesl) return; b.dataset.cfxDesl = '1';
    const f = filaAviso(b); if (!f || f === document.body) return;
    b.classList.add('cfx-x-oculta'); f.classList.add('cfx-aviso-desl');
    f.setAttribute('draggable', 'false'); f.addEventListener('dragstart', (e) => e.preventDefault());
    let x0 = 0, y0 = 0, dx = 0, mov = false, id = null;
    f.addEventListener('pointerdown', (e) => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; dx = 0; mov = false; id = e.pointerId; f.style.transition = 'none'; });
    f.addEventListener('pointermove', (e) => {
      if (id !== e.pointerId) return;
      const ddx = e.clientX - x0, ddy = e.clientY - y0;
      if (!mov && (Math.abs(ddy) > 12 && Math.abs(ddy) > Math.abs(ddx))) { id = null; return; }
      if (!mov && Math.abs(ddx) > 10) { mov = true; try { f.setPointerCapture(e.pointerId); } catch (er) { /* nada */ } }
      if (mov) { dx = ddx; f.style.transform = 'translateX(' + dx + 'px)'; f.style.opacity = String(Math.max(.25, 1 - Math.abs(dx) / f.offsetWidth)); }
    });
    const soltar = async (e) => {
      if (id !== e.pointerId) return; id = null;
      if (!mov) return;
      if (Math.abs(dx) > f.offsetWidth * .3) { await irse(f, dx > 0 ? 1 : -1); f.classList.add('cfx-oc'); mov = false; b.click(); }
      else { f.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s'; f.style.transform = ''; f.style.opacity = ''; }
    };
    f.addEventListener('pointerup', soltar); f.addEventListener('pointercancel', soltar);
    // Si se deslizó, no cuenta como toque (no abre el aviso).
    f.addEventListener('click', (e) => { if (mov) { e.preventDefault(); e.stopPropagation(); mov = false; } }, true);
    // Pista una sola vez: el primer aviso se asoma hacia el lado.
    try { if (!localStorage.getItem('cfx-desl-pista')) { localStorage.setItem('cfx-desl-pista', '1'); setTimeout(() => f.classList.add('cfx-pista'), 500); } } catch (e) { /* nada */ }
  }
  function avisosDeslizar() { document.querySelectorAll(XAV + ':not([data-cfx-desl])').forEach(deslizable); }
  // "Borrar todos": los avisos salen hacia el lado en cascada (la app lo llama después de confirmar).
  async function salirTodos() {
    const fs = [...document.querySelectorAll('.cfx-aviso-desl:not(.cfx-oc)')].filter((f) => f.offsetParent);
    await Promise.all(fs.map((f, i) => new Promise((ok) => setTimeout(() => irse(f, 1).then(ok), Math.min(i, 8) * 45))));
  }
  // ---------- Aviso emergente: llega un aviso con la app abierta → baja arriba, encima de todo ----------
  let emerg = null;
  function emergente(o) {
    o = o || {};
    if (emerg) emerg.remove();
    const d = document.createElement('div'); d.className = 'cfx-emerg'; d.setAttribute('role', 'status');
    d.innerHTML = '<span class="cfx-emerg-ico">' + SVG_CAMPANA + '</span><div><b></b><small></small></div>';
    d.querySelector('b').textContent = String(o.titulo || 'Nuevo aviso').replace(/^🔔\s*/, ''); d.querySelector('small').textContent = o.cuerpo || '';
    document.body.appendChild(d); emerg = d;
    try { d.setAttribute('popover', 'manual'); d.showPopover(); } catch (e) { /* sin popover: igual queda arriba */ }
    const fuera = (dir) => { if (!d.isConnected) return; d.style.transition = 'transform .2s ease-in, opacity .2s'; d.style.transform = dir ? 'translateX(' + dir * 110 + '%)' : 'translateY(-130%)'; d.style.opacity = '0'; setTimeout(() => { d.remove(); if (emerg === d) emerg = null; }, 210); };
    const t = setTimeout(() => fuera(0), 5000);
    let x0 = null, y0 = 0, dx = 0, dy = 0;
    d.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = dy = 0; d.style.transition = 'none'; });
    d.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; dy = Math.min(0, e.clientY - y0); d.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; });
    d.addEventListener('pointerup', () => {
      if (x0 == null) return; x0 = null;
      if (Math.abs(dx) > 70 || dy < -30) { clearTimeout(t); return fuera(Math.abs(dx) > 70 ? Math.sign(dx) : 0); }
      d.style.transition = 'transform .2s'; d.style.transform = '';
      if (Math.abs(dx) < 6 && dy > -6) { clearTimeout(t); fuera(0); if (typeof o.abrir === 'function') o.abrir(); else { const c = document.querySelector('.cfx-cab [data-cfx-campana]'); if (c) c.click(); } }
    });
  }
  // ---------- Selectores de acción ("⭐ Premium…", "Acción…"): botón con flecha al centro que abre una hoja ----------
  // Elegir una opción cambia el <select> escondido y avisa "change": la app hace lo mismo que antes.
  const CHEV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  function selAccion() {
    document.querySelectorAll('select:not([data-cfx-sel])').forEach((sel) => {
      const o0 = sel.options[0];
      if (!o0 || sel.id || sel.name || o0.value !== '' || !/…\s*$/.test(o0.text) || sel.options.length < 2) return;  // solo selectores de acción, no campos de formulario
      sel.dataset.cfxSel = '1'; sel.classList.add('cfx-oc');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cfx-sel-btn';
      const t = o0.text.replace(/…\s*$/, '').trim();
      b.innerHTML = '<span></span>' + CHEV; b.querySelector('span').textContent = t; b.setAttribute('aria-label', t);
      sel.after(b);
      b.onclick = () => {
        const caja = dialogo('<h2></h2><div class="ca-cuerpo">' + [...sel.options].slice(1).map((o, i) => '<button type="button" class="ca-op' + (/quitar|eliminar|borrar|suspend/i.test(o.text) ? ' ca-mal' : '') + '" data-i="' + (i + 1) + '"><b></b></button>').join('') +
          '</div><div class="ca-pie"><button type="button" data-cerrar>Cancelar</button></div>');
        caja.querySelector('h2').textContent = t;
        caja.querySelectorAll('[data-i]').forEach((x) => { x.querySelector('b').textContent = sel.options[+x.dataset.i].text; x.onclick = () => { cerrar(); sel.value = sel.options[+x.dataset.i].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }; });
      };
    });
  }
  // ---------- Servidores en carrusel (Centro de Mando): una tarjeta por app, de lado, con el detalle que se despliega ----------
  // CFX_SERVIDORES.montar(el, [{ nombre, cargar: () => Promise<cfx_servidor()> }]). Abierto/cerrado vale para todas:
  // si deslizas con el detalle abierto, la siguiente ya viene abierta; si lo cierras, siguen chicas.
  function servidores(el, L) {
    const MB = (b) => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
    const hace = (f) => { if (!f) return 'nunca'; const m = Math.round((Date.now() - new Date(f)) / 60000); return m < 1 ? 'recién' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' d'; };
    let abierto = false;
    try { abierto = localStorage.getItem('cfx-srv-abierto') === '1'; } catch (e) { /* nada */ }
    el.innerHTML = '<div class="cfx-srv' + (abierto ? ' abierto' : '') + '"><div class="cfx-srv-pista">' + L.map((x, i) => '<div class="cfx-srv-c" data-i="' + i + '"><button type="button" class="cfx-srv-cab"><span class="cfx-srv-pt"></span><b></b><span class="cfx-srv-pc">…</span>' + CHEV + '</button>' +
      '<div class="cfx-srv-barra"><i></i></div><div class="cfx-srv-det"><div><p class="cfx-srv-res">Revisando…</p></div></div></div>').join('') + '</div><div class="cfx-srv-puntos">' + L.map((x, i) => '<i data-i="' + i + '"></i>').join('') + '</div></div>';
    const raiz = el.firstChild, pista = raiz.firstChild, puntos = [...raiz.querySelectorAll('.cfx-srv-puntos i')];
    L.forEach((x, i) => {
      const c = pista.children[i]; c.querySelector('b').textContent = x.nombre;
      Promise.resolve().then(x.cargar).then((u) => {
        const pc = Math.min(100, Math.round(u.db_bytes / u.limite_bytes * 100)), push = (u.tareas || []).filter((t) => /push|enviar|cola/i.test(t.nombre));
        const mal = push.some((t) => !t.activa || t.ok === false) || (u.tareas && u.tareas.length && !push.length);
        c.classList.add(pc > 80 || mal ? 'warn' : 'ok');
        c.querySelector('.cfx-srv-pc').textContent = pc + '%';
        c.querySelector('.cfx-srv-barra i').style.width = Math.max(2, pc) + '%';
        c.querySelector('.cfx-srv-det > div').innerHTML = '<p class="cfx-srv-res">' + MB(u.db_bytes) + ' de ' + MB(u.limite_bytes) + ' · ' + u.cuentas + ' cuentas</p>' +
          '<h4>Tareas automáticas</h4>' + ((u.tareas || []).length ? u.tareas.map((t) => '<div class="cfx-srv-f"><span>' + (t.activa && t.ok !== false ? '✅' : '⚠️') + ' ' + esc(t.nombre) + '</span><small>' + esc(t.activa ? hace(t.ultima) : 'pausada') + '</small></div>' +
            (t.ok === false && t.error ? '<small class="cfx-srv-err">' + esc(t.error) + '</small>' : '')).join('') : '<p class="cfx-srv-res">Sin tareas automáticas.</p>') +
          (u.tareas && !push.length ? '<small class="cfx-srv-err">No hay tarea de envío push: las notificaciones no salen al teléfono.</small>' : '') +
          '<h4>Lo que más pesa</h4>' + (u.tablas || []).map((t) => '<div class="cfx-srv-f"><span>' + esc(t.tabla) + '</span><small>' + MB(t.bytes) + ' · ' + t.filas + ' filas</small></div>').join('');
      }).catch((e) => {
        c.classList.add('warn'); c.querySelector('.cfx-srv-pc').textContent = '—';
        c.querySelector('.cfx-srv-det > div').innerHTML = '<p class="cfx-srv-res">' + esc(/cfx_servidor|PGRST202|does not exist|Could not find/i.test((e && e.message) || '') ? 'Su base se está actualizando (máx. 10 min).' : (e && e.message) || 'Sin conexión') + '</p>';
      });
    });
    raiz.addEventListener('click', (ev) => {
      if (ev.target.closest('.cfx-srv-cab')) { abierto = !abierto; raiz.classList.toggle('abierto', abierto); try { localStorage.setItem('cfx-srv-abierto', abierto ? '1' : '0'); } catch (e) { /* nada */ } return; }
      const d = ev.target.closest('.cfx-srv-puntos i'); if (d) pista.children[+d.dataset.i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
    const marcar = () => { const i = Math.round(pista.scrollLeft / Math.max(1, pista.children[0].offsetWidth + 10)); puntos.forEach((p, j) => p.classList.toggle('on', j === i)); };
    pista.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true }); marcar();
  }
  window.CFX_SERVIDORES = { montar: servidores };
  window.CFX_ANIM = { emergente, salirTodos, deslizar: avisosDeslizar };

  let tTiras = 0;
  const pedirTiras = () => { clearTimeout(tTiras); tTiras = setTimeout(() => { tiras(); avisosDeslizar(); selAccion(); cuentaEnMas(); }, 120); };
  new MutationObserver(pedirTiras).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', pedirTiras); addEventListener('hashchange', pedirTiras); pedirTiras();

  // ---------- Perfil común (igual en las 7 apps): foto y nombre · color y modo · avanzado (+ secciones propias) ----------
  // La app solo entrega cómo guarda (adaptador), igual que CFX_AJUSTES: window.CFX_PERFIL_APP = { guardar, clave, eliminar, … }.
  // Lo que la app no entrega lo pone BASE (este celular): foto local, color, modo, notificaciones (instalar.js).
  // Adaptador (todo opcional):
  //   nombre(), tituloNombre(), nombreFijo (texto: no se edita aquí), correo(), sub() · foto() (url o promesa) · guardarFoto(File | '' = quitar) · iconos [] · icono() · campos [{ k, t, v, tipo, ph, max }]
  //   guardar({ nombre, icono, ...campos }) (sin guardar: el nombre no se edita) · colores [hex | [nombre, hex]] · color() · guardarColor(c) · probarColor(c) · libre (color a gusto)
  //   modo() 'auto'|'claro'|'oscuro' · guardarModo(m) · pushActiva() · activarPush() · desactivarPush() · clave(nueva) · eliminar() (pide su propia confirmación) · puedeEliminar()
  //   bloqueo(que, valor) → texto si es Premium ('foto', 'icono', 'color', 'libre') · mejorar(texto) · arriba (html) · secciones [{ k, ico, t, d, abrir(zona) }]
  //   alGuardar() → después de cada cambio (p. ej. refrescar la cuenta)
  const PF = 'cfx-pf:';
  const lsL = (k) => { try { return localStorage.getItem(PF + k) || ''; } catch (e) { return ''; } };
  const lsG = (k, v) => { try { if (v) localStorage.setItem(PF + k, v); else localStorage.removeItem(PF + k); } catch (e) { /* lleno */ } };
  const HEX = /^#[0-9a-f]{6}$/i;
  function pintarModo(m) { const r = document.documentElement; if (m === 'claro' || m === 'oscuro') r.dataset.theme = m === 'claro' ? 'light' : 'dark'; else delete r.dataset.theme; }
  function pintarColor(c) {
    if (!HEX.test(c || '')) return;
    const n = parseInt(c.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255, r = document.documentElement.style;
    r.setProperty('--brand', c); r.setProperty('--marca', c); r.setProperty('--brand-ink', l > 0.62 ? '#0f172a' : '#ffffff');
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = c;
  }
  // Lo guardado por BASE se aplica apenas carga (solo existe en las apps que usan BASE).
  if (lsL('modo')) pintarModo(lsL('modo'));
  if (lsL('color')) pintarColor(lsL('color'));
  const fotoKey = () => 'foto:' + (CFG.id || CFG.email || '');
  function achicar(f, lado) {
    return new Promise((ok, mal) => {
      const img = new Image(); img.onerror = () => mal(new Error('No se pudo leer la imagen'));
      img.onload = () => { const s = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.8)); };
      img.src = URL.createObjectURL(f);
    });
  }
  const INST = () => window.CodeFixInstalar || {};
  const BASE = {
    nombre: () => CFG.nombre || '', correo: () => CFG.email || '', sub: () => (CFG.admin ? (CFG.socio ? 'Socio' : 'Administrador') : 'Plan ' + (esPro() ? 'PRO' : 'FREE')),
    foto: () => lsL(fotoKey()) || CFG.foto || '',
    guardarFoto: async (f) => { lsG(fotoKey(), f ? await achicar(f, (window.CFX_FOTO && window.CFX_FOTO.perfil.lado) || 400) : ''); },
    colores: ['#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#059669', '#0891b2', '#334155', '#111827'],
    color: () => lsL('color') || getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    guardarColor: (c) => { lsG('color', c); pintarColor(c); }, probarColor: pintarColor, libre: true,
    modo: () => lsL('modo') || 'auto', guardarModo: (m) => { lsG('modo', m === 'auto' ? '' : m); pintarModo(m); },
    pushActiva: () => (INST().pushActiva ? INST().pushActiva() : Promise.resolve(false)),
    activarPush: () => { if (!INST().activarPush) throw new Error('Este navegador no permite notificaciones'); return INST().activarPush(); },
    bloqueo: () => '', mejorar: (t) => { aviso('⭐ ' + t + ' es Premium'); if (window.CFX_PAGOS && R) window.CFX_PAGOS.abrir({ rpc: R }); }
  };
  // Herencia: lo que la app define (también lo heredado de su adaptador base: { __proto__: base, … }) reemplaza a BASE; lo demás queda de BASE.
  // Página sin adaptador (p. ej. un panel): solo foto, notificaciones y lo de este celular; el nombre no se edita.
  const SOLO_BASE = { guardar: null, guardarColor: null, guardarModo: null };
  const perfilApp = () => { const A = window.CFX_PERFIL_APP || SOLO_BASE, P = Object.assign({}, BASE); for (const k in A) P[k] = A[k]; return P; };
  const valor = (x) => (typeof x === 'function' ? x() : x);
  const errTxt = (e) => (e && (e.message || e.error_description)) || String(e || 'Error');
  const MODOS = [['auto', '📱 Automático'], ['claro', '☀️ Claro'], ['oscuro', '🌙 Oscuro']];

  function perfil(el, extraAd) {
    const P = Object.assign(perfilApp(), extraAd || {});
    let foto = '';
    const listo = async (fn, ok, btn) => {
      if (btn) btn.disabled = true;
      try { await fn(); if (ok) aviso(ok); if (P.alGuardar) await P.alGuardar(); return true; } catch (e) { aviso('⚠️ ' + errTxt(e)); return false; } finally { if (btn) btn.disabled = false; }
    };
    const av = (f, ico) => '<span class="cfx-pf-av">' + (f ? '<img src="' + esc(f) + '" alt="">' : ico ? '<b>' + esc(ico) + '</b>' : iniciales()) + '</span>';
    const cabeza = () => '<div class="ca-yo cfx-pf-yo">' + av(foto, valor(P.icono)) + '<div><b>' + esc(valor(P.nombre) || 'Mi cuenta') + '</b>' + (valor(P.correo) ? '<small>' + esc(valor(P.correo)) + '</small>' : '') + '<small>' + esc(valor(P.sub) || '') + '</small></div></div>';
    const pide = (que, v) => { const t = P.bloqueo(que, v); if (t) { P.mejorar(t); return true; } return false; };
    const refrescarFoto = async () => { foto = (await valor(P.foto)) || ''; CFG.foto = foto || null; if (boya) pintarBoya(); };

    function verYo(z) {
      let nueva, ico = valor(P.icono);
      const iconos = valor(P.iconos) || [], campos = valor(P.campos) || [];
      z.innerHTML = '<div class="cfx-pf">' + '<div class="cfx-pf-fila"><span data-pf-av>' + av(foto, ico) + '</span><div class="cfx-pf-btns">' +
        (P.guardarFoto ? '<button type="button" data-pf="foto">📷 ' + (foto ? 'Cambiar foto' : 'Poner foto') + '</button>' + (foto ? '<button type="button" data-pf="sinfoto">Quitar foto</button>' : '') + '<input type="file" accept="image/*" hidden>' : '') + '</div></div>' +
        (iconos.length ? '<label>Tu ícono</label><div class="cfx-pf-icos">' + iconos.map((i) => '<button type="button" data-ico="' + esc(i) + '" class="' + (i === ico ? 'on' : '') + '">' + (esc(i) || iniciales()) + '</button>').join('') + '</div>' : '') +
        '<label>' + esc(valor(P.tituloNombre) || 'Nombre') + '<input data-k="nombre" maxlength="80" value="' + esc(valor(P.nombre) || '') + '"' + (valor(P.nombreFijo) || !P.guardar ? ' readonly' : '') + '>' + (valor(P.nombreFijo) ? '<small>' + esc(valor(P.nombreFijo)) + '</small>' : '') + '</label>' +
        campos.map((c) => '<label>' + esc(c.t) + (c.tipo === 'area' ? '<textarea data-k="' + esc(c.k) + '" maxlength="' + (c.max || 300) + '" placeholder="' + esc(c.ph || '') + '">' + esc(c.v || '') + '</textarea>'
          : '<input data-k="' + esc(c.k) + '" type="' + (c.tipo || 'text') + '" maxlength="' + (c.max || 120) + '" placeholder="' + esc(c.ph || '') + '" value="' + esc(c.v || '') + '"' + (c.tipo === 'tel' ? ' inputmode="tel"' : '') + '>') + '</label>').join('') +
        '<button type="button" class="cfx-pf-si" data-pf="guardar">Guardar</button></div>';
      const q = (s) => z.querySelector(s), previa = () => { q('[data-pf-av]').innerHTML = av(nueva === undefined ? foto : nueva ? URL.createObjectURL(nueva) : '', ico); };
      const inp = q('input[type=file]');
      if (inp) inp.onchange = () => { if (inp.files[0]) { nueva = inp.files[0]; previa(); } };
      z.onclick = async (ev) => {
        const b = ev.target.closest('[data-pf], [data-ico]'); if (!b) return;
        if (b.dataset.ico !== undefined) { if (pide('icono', b.dataset.ico)) return; ico = b.dataset.ico; z.querySelectorAll('[data-ico]').forEach((x) => x.classList.toggle('on', x === b)); if (P.guardarFoto && nueva === undefined && foto && P.iconoQuitaFoto) nueva = ''; return previa(); }
        const a = b.dataset.pf;
        if (a === 'foto') { if (!pide('foto')) inp.click(); return; }
        if (a === 'sinfoto') { nueva = ''; return previa(); }
        if (a === 'guardar') {
          const d = { icono: ico }; z.querySelectorAll('[data-k]').forEach((i) => { d[i.dataset.k] = i.value.trim(); });
          if (await listo(async () => { if (nueva !== undefined) await P.guardarFoto(nueva); if (P.guardar) await P.guardar(d); }, '✅ Perfil guardado', b)) { if (d.nombre) CFG.nombre = d.nombre; await refrescarFoto(); verYo(z); pintarCabeza(); }
        }
      };
    }
    function verEstilo(z) {
      const cols = (valor(P.colores) || []).map((c) => (Array.isArray(c) ? c : [c, c])), act = String(valor(P.color) || '').toLowerCase(), m = valor(P.modo) || 'auto';
      const libre = valor(P.libre) && P.guardarColor;
      z.innerHTML = '<div class="cfx-pf">' + (P.guardarColor ? '<label>Color de la app</label><div class="cfx-pf-cols">' + cols.map(([n, c]) => '<button type="button" data-c="' + esc(c) + '" title="' + esc(n) + '" aria-label="' + esc(n) + '" style="background:' + esc(c) + '" class="' +
        (c.toLowerCase() === act ? 'on' : '') + (P.bloqueo('color', c) ? ' cfx-pf-lock' : '') + '"></button>').join('') + '</div>' +
        (libre ? '<label class="cfx-pf-libre"><input type="color" value="' + esc(HEX.test(act) ? act : '#2563eb') + '"><span>🎨 Color a tu gusto' + (P.bloqueo('libre') ? ' <i>⭐</i>' : '') + '</span></label>' : '') : '') +
        (P.guardarModo ? '<label>Modo de pantalla</label><div class="cfx-pf-modos">' + MODOS.map(([k, t]) => '<button type="button" data-m="' + k + '" class="' + (k === m ? 'on' : '') + '">' + t + '</button>').join('') + '</div>' : '') + '</div>';
      z.onclick = (ev) => {
        const b = ev.target.closest('[data-c], [data-m]'); if (!b) return;
        if (b.dataset.m) return listo(() => P.guardarModo(b.dataset.m)).then(() => verEstilo(z));
        if (pide('color', b.dataset.c)) return;
        listo(() => P.guardarColor(b.dataset.c), '🎨 Color guardado').then(() => verEstilo(z));
      };
      const lib = z.querySelector('input[type=color]');
      if (lib) {
        lib.onclick = (ev) => { if (pide('libre')) ev.preventDefault(); };
        lib.oninput = () => P.probarColor && P.probarColor(lib.value);
        lib.onchange = () => listo(() => P.guardarColor(lib.value), '🎨 Color guardado').then(() => verEstilo(z));
      }
    }
    function verAvanzado(z) {
      z.innerHTML = '<div class="cfx-pf">' +
        '<div class="cfx-pf-caja"><b>🔔 Notificaciones en este celular</b><div class="cfx-pf-fila"><span data-push>Revisando…</span><button type="button" data-pf="push">Activar</button></div></div>' +
        (P.clave ? '<div class="cfx-pf-caja"><b>🔑 Cambiar contraseña</b><input data-c1 type="password" autocomplete="new-password" placeholder="Contraseña nueva (mín. 6)"><input data-c2 type="password" autocomplete="new-password" placeholder="Repítela">' +
          '<button type="button" data-pf="clave">Cambiar contraseña</button></div>' : '') +
        (P.eliminar && valor(P.puedeEliminar) !== false ? '<div class="cfx-pf-caja cfx-pf-peligro"><b>🗑️ Eliminar mi cuenta</b><small>' + esc(valor(P.eliminarTexto) || 'Se borran tu cuenta y tus datos. No se puede deshacer.') + '</small><button type="button" data-pf="eliminar">Eliminar mi cuenta</button></div>' : '') + '</div>';
      const q = (s) => z.querySelector(s);
      let on = false;
      const estado = async () => { on = await Promise.resolve(P.pushActiva()).catch(() => false); q('[data-push]').textContent = on ? '✅ Activas' : 'Apagadas'; q('[data-pf=push]').textContent = on ? (P.desactivarPush ? 'Desactivar' : 'Reactivar') : 'Activar'; };
      estado();
      z.onclick = async (ev) => {
        const b = ev.target.closest('[data-pf]'); if (!b) return; const a = b.dataset.pf;
        if (a === 'push') await (on && P.desactivarPush ? listo(() => P.desactivarPush(), 'Notificaciones desactivadas', b) : listo(() => P.activarPush(), '🔔 Notificaciones activadas', b)).then(estado);
        if (a === 'clave') {
          const c1 = q('[data-c1]').value, c2 = q('[data-c2]').value;
          if (c1.length < 6) return aviso('La contraseña debe tener al menos 6 caracteres');
          if (c1 !== c2) return aviso('Las contraseñas no coinciden');
          if (await listo(() => P.clave(c1), '🔑 Contraseña cambiada', b)) q('[data-c1]').value = q('[data-c2]').value = '';
        }
        if (a === 'eliminar') { cerrar(); try { await P.eliminar(); } catch (e) { aviso('⚠️ ' + errTxt(e)); } }
      };
    }
    let pintarCabeza = () => {};
    const L = [{ k: 'yo', ico: '👤', t: 'Foto y nombre', d: 'Cómo te ven', abrir: verYo }, { k: 'estilo', ico: '🎨', t: 'Color y modo', d: 'Claro, oscuro o automático', abrir: verEstilo },
      { k: 'avanzado', ico: '⚙️', t: 'Avanzado', d: 'Contraseña, avisos y cuenta', abrir: verAvanzado }].concat(valor(P.secciones) || []);
    el.classList.add('cfx-pf-w');
    const h = ajustes(el, L, { arriba: '<div data-pf-cab></div>' + (valor(P.arriba) || '') });
    const g = h.grilla;
    pintarCabeza = () => { const c = el.querySelector('[data-pf-cab]'); if (c) c.innerHTML = cabeza(); };
    h.grilla = () => { g(); pintarCabeza(); };
    el.querySelector('.cfx-aj-w').addEventListener('click', (ev) => { if (ev.target.closest('.cfx-aj-volver')) pintarCabeza(); });
    Promise.resolve(valor(P.foto)).then((f) => { foto = f || ''; pintarCabeza(); });
    return h;
  }
  function abrirPerfil(k) {
    const caja = dialogo('<div class="ca-cuerpo cfx-pf-d"></div><div class="ca-pie"><button type="button" data-cerrar>Cerrar</button></div>');
    const h = perfil(caja.querySelector('.cfx-pf-d'));
    if (k) h.abrir(k);
    return h;
  }
  window.CFX_PERFIL = { montar: perfil, abrir: abrirPerfil, BASE, pintarModo, pintarColor };

  window.CFX_AJUSTES = { montar: ajustes, registro };
  // La app pudo pedirlo antes de que este archivo cargara (CFX_AYUDA_PEND = { rpc, app }).
  if (window.CFX_AYUDA_PEND) iniciar(window.CFX_AYUDA_PEND);
})();
