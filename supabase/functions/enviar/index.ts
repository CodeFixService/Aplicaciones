// Edge Function "enviar":
//  1) cada minuto busca las notificaciones programadas que ya llegaron a su hora y las
//     envía por push y/o correo (Gmail);
//  2) crea cuentas desde el panel ({accion: 'crear_usuario'}): el admin crea empresas y
//     clientes; cada empresa crea sus propios clientes. El registro libre está cerrado.
// Se despliega en Supabase → Edge Functions → nombre "enviar".
import webpush from 'npm:web-push@3.6.7';
import nodemailer from 'npm:nodemailer@6.9.16';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const EMAIL_DAILY_LIMIT = 450; // Gmail permite ~500 al día; dejamos margen
const EMAILS_PER_NOTIFICATION = 300;
const BRAND = 'FichaPro · CodeFix';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Notif = {
  id: string; title: string; body: string; url: string | null; image: string | null;
  channels: string[]; audience: string;
};
type Target = { endpoint: string | null; p256dh: string | null; auth: string | null; email: string | null; nombre: string | null };
type Secrets = Record<string, string>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function emailHtml(n: Notif, nombre: string | null) {
  const saludo = nombre ? `<p style="margin:0 0 12px">Hola ${esc(nombre.split(' ')[0])},</p>` : '';
  const img = n.image ? `<img src="${esc(n.image)}" alt="" style="width:100%;max-width:480px;border-radius:12px;display:block;margin:0 0 16px">` : '';
  const btn = n.url
    ? `<a href="${esc(n.url)}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Ver más</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f5fb;font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1c1830">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e4e1f0">
${saludo}<h2 style="margin:0 0 10px;font-size:22px">${esc(n.title)}</h2>
<p style="margin:0 0 16px;white-space:pre-line">${esc(n.body || '')}</p>${img}${btn}
</div><p style="font-size:12px;color:#6b6785;text-align:center;margin-top:14px">Enviado con ${BRAND}.
Si no quieres recibir más mensajes, responde a este correo con la palabra BAJA.</p></div></body></html>`;
}

export async function deliver(
  n: Notif, targets: Target[], secrets: Secrets, emailsLeft: number,
  removeEndpoint: (e: string) => Promise<unknown>,
  transportOverride?: unknown,
) {
  let pushSent = 0, pushFailed = 0, emailSent = 0;
  const errors: string[] = [];

  if (n.channels.includes('push')) {
    if (!secrets.vapid_public || !secrets.vapid_private) {
      errors.push('Faltan las claves push (Admin → Ajustes)');
    } else {
      webpush.setVapidDetails('mailto:' + (secrets.gmail_user || 'admin@codefix.app'), secrets.vapid_public, secrets.vapid_private);
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, image: n.image, tag: n.id });
      const subs = targets.filter((t) => t.endpoint && t.p256dh && t.auth);
      const seen = new Set<string>();
      for (let i = 0; i < subs.length; i += 50) {
        const chunk = subs.slice(i, i + 50).filter((t) => !seen.has(t.endpoint!) && seen.add(t.endpoint!));
        const res = await Promise.allSettled(chunk.map((t) =>
          webpush.sendNotification({ endpoint: t.endpoint!, keys: { p256dh: t.p256dh!, auth: t.auth! } }, payload, { TTL: 86400 })
        ));
        for (let j = 0; j < res.length; j++) {
          const r = res[j];
          if (r.status === 'fulfilled') { pushSent++; continue; }
          pushFailed++;
          const code = (r.reason as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) await removeEndpoint(chunk[j].endpoint!); // dispositivo dado de baja
        }
      }
    }
  }

  if (n.channels.includes('email')) {
    const emails = [...new Map(targets.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t])).values()];
    if (!transportOverride && (!secrets.gmail_user || !secrets.gmail_app_password)) {
      errors.push('Falta configurar Gmail (Admin → Ajustes)');
    } else if (emails.length) {
      const transport = (transportOverride as nodemailer.Transporter) || nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true, pool: true,
        auth: { user: secrets.gmail_user, pass: secrets.gmail_app_password.replace(/\s/g, '') },
      });
      const from = `"${(secrets.mail_from_name || 'FichaPro').replace(/"/g, '')}" <${secrets.gmail_user}>`;
      const limit = Math.min(emailsLeft, EMAILS_PER_NOTIFICATION);
      if (emails.length > limit) errors.push(`Se enviaron ${limit} de ${emails.length} correos por el límite diario de Gmail`);
      for (const t of emails.slice(0, Math.max(0, limit))) {
        try {
          await transport.sendMail({
            from, to: t.email!, subject: n.title,
            text: `${n.title}\n\n${n.body || ''}${n.url ? '\n\n' + n.url : ''}\n\n— ${BRAND}`,
            html: emailHtml(n, t.nombre),
          });
          emailSent++;
        } catch (e) {
          errors.push('Correo a ' + t.email + ': ' + (e as Error).message);
          if (/auth|login|credential/i.test((e as Error).message)) break; // contraseña mala: no insistir
        }
      }
      if (!transportOverride) transport.close();
    }
  }
  return { pushSent, pushFailed, emailSent, error: errors.length ? errors.slice(0, 5).join(' | ').slice(0, 900) : null };
}

function adminDb() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type NuevoUsuario = { email?: string; password?: string; nombre?: string; tipo?: string; negocio?: string | null };

export async function crearUsuario(jwt: string, b: NuevoUsuario) {
  const db = adminDb();
  if (!jwt) return { ok: false, error: 'Inicia sesión de nuevo' };
  const { data: who, error: e0 } = await db.auth.getUser(jwt);
  if (e0 || !who?.user) return { ok: false, error: 'Inicia sesión de nuevo' };
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (password.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  const negocio = b.negocio && /^[0-9a-f-]{36}$/i.test(b.negocio) ? b.negocio : null;
  const { data: prep, error: e1 } = await db.rpc('prepare_user_invite', {
    p_caller: who.user.id, p_email: email, p_nombre: String(b.nombre || ''), p_rol: b.tipo === 'user' ? 'user' : 'client',
    p_negocio: negocio,
  });
  if (e1) return { ok: false, error: e1.message };
  if (!prep?.ok) return prep;
  const { data: nu, error: e2 } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { empresa: String(b.nombre || '').trim() },
  });
  if (e2 || !nu?.user) {
    await db.rpc('cancel_user_invite', { p_email: email });
    const m = (e2 && e2.message) || 'No se pudo crear la cuenta';
    return { ok: false, error: /already|registered|exists/i.test(m) ? 'Ese correo ya tiene cuenta' : m };
  }
  return { ok: true, id: nu.user.id };
}

async function run() {
  const db = adminDb();
  const { data: due, error } = await db.rpc('claim_due_notifications');
  if (error) throw error;
  if (!due?.length) return { processed: 0 };

  const { data: secrets } = await db.rpc('get_secrets');
  const { data: sentToday } = await db.rpc('emails_sent_today');
  let emailsLeft = EMAIL_DAILY_LIMIT - (sentToday || 0);
  const removeEndpoint = async (e: string) => { await db.rpc('remove_endpoint', { p_endpoint: e }); };

  const results = [];
  for (const n of due as Notif[]) {
    try {
      const { data: targets, error: tErr } = await db.rpc('notification_targets', { p_id: n.id });
      if (tErr) throw tErr;
      const r = await deliver(n, targets || [], secrets || {}, emailsLeft, removeEndpoint);
      emailsLeft -= r.emailSent;
      await db.rpc('finish_notification', {
        p_id: n.id, p_push_sent: r.pushSent, p_push_failed: r.pushFailed, p_email_sent: r.emailSent, p_error: r.error,
      });
      results.push({ id: n.id, ...r });
    } catch (e) {
      await db.rpc('finish_notification', {
        p_id: n.id, p_push_sent: 0, p_push_failed: 0, p_email_sent: 0, p_error: String((e as Error).message || e),
      });
    }
  }
  return { processed: due.length, results };
}

if (Deno.env.get('SUPABASE_URL')) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      if (body && body.accion === 'crear_usuario') {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const out = await crearUsuario(jwt, body);
        return new Response(JSON.stringify(out), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const out = await run();
      return new Response(JSON.stringify(out), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  });
}
