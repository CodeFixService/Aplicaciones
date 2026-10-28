-- =====================================================================
--  CodeFix · Esquema del servidor (Supabase)
--  Pega TODO este archivo en Supabase → SQL Editor → Run.
--  Se puede volver a ejecutar sin perder datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfiles: uno por cada cuenta. El rol y el plan solo los cambia el admin.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  empresa         text not null default '',
  role            text not null default 'user' check (role in ('user', 'admin')),
  plan            text not null default 'free' check (plan in ('free', 'pro')),
  pro_until       timestamptz,
  suspended       boolean not null default false,
  failed_redeems  int not null default 0,
  last_failed_at  timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.profiles add column if not exists negocio_id uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists terms_at timestamptz;
alter table public.profiles add column if not exists trial_used boolean not null default false;
alter table public.profiles add column if not exists mute_offers boolean not null default false;
alter table public.profiles add column if not exists telefono text;
alter table public.profiles add column if not exists logo text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'client'));
create index if not exists profiles_negocio_idx on public.profiles (negocio_id);
alter table public.profiles enable row level security;

-- Roles: 'admin' (administrador general), 'user' (empresa/negocio), 'client' (cliente de un negocio).
-- El único administrador general. Solo se reconoce si confirmó su correo.
create or replace function public.admin_email() returns text
language sql immutable as $$ select 'juanjosuecastilloloyola@gmail.com'::text $$;

-- Invitaciones de alta (las crea el servidor al crear una cuenta desde el panel).
create table if not exists public.user_invites (
  email       text primary key,
  nombre      text not null default '',
  role        text not null check (role in ('user', 'client')),
  negocio_id  uuid references public.profiles (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.user_invites enable row level security;  -- sin políticas: solo el servidor
alter table public.profiles add column if not exists created_by uuid references public.profiles (id) on delete set null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv public.user_invites;
  es_admin boolean := lower(new.email) = public.admin_email();
begin
  -- Registro cerrado: solo entran cuentas creadas desde el panel (admin o empresa).
  select * into inv from public.user_invites
  where email = lower(new.email) and created_at > now() - interval '1 hour';
  if not es_admin and inv.email is null then
    raise exception 'El registro está cerrado. Pide tu acceso a tu tienda o al administrador.';
  end if;
  insert into public.profiles (id, email, empresa, role, negocio_id, created_by)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(meta ->> 'empresa', ''), inv.nombre, ''), 80),
    case when es_admin then 'admin' else inv.role end,
    case when not es_admin and inv.role = 'client' then inv.negocio_id end,
    inv.created_by
  )
  on conflict (id) do nothing;
  delete from public.user_invites where email = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas que ya existían antes de correr este archivo.
insert into public.profiles (id, email, role)
select u.id, lower(u.email),
       case when lower(u.email) = public.admin_email() then 'admin' else 'user' end
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role = 'admin' and not p.suspended
      and u.email_confirmed_at is not null
      and lower(u.email) = public.admin_email()
  )
$$;

create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and not p.suspended
      and (p.role = 'admin' or (p.plan = 'pro' and (p.pro_until is null or p.pro_until > now())))
  )
$$;

create or replace function public.is_business(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role in ('user', 'admin') and not p.suspended)
$$;

create or replace function public.admin_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where role = 'admin' and lower(email) = public.admin_email() limit 1
$$;

drop policy if exists "perfil propio o admin" on public.profiles;
create policy "perfil propio o admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
-- Sin políticas de insert/update/delete: todo cambio pasa por las funciones de abajo.

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan, 'role', p.role,
    'pro_until', p.pro_until, 'suspended', p.suspended, 'trial_used', p.trial_used,
    'mute_offers', p.mute_offers, 'terms_at', p.terms_at,
    'negocio_id', p.negocio_id, 'negocio', n.empresa, 'telefono', p.telefono, 'negocio_telefono', n.telefono,
    'logo', p.logo, 'negocio_logo', n.logo,
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin())
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;

create or replace function public.update_my_company(p_empresa text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set empresa = left(trim(p_empresa), 80) where id = auth.uid();
  return public.my_account();
end $$;

-- ---------------------------------------------------------------------
-- Licencias (keys Pro). Solo el admin las crea y las ve.
-- ---------------------------------------------------------------------
create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  empresa      text not null,
  months       int check (months is null or months > 0),
  price        numeric(12, 2),
  note         text,
  created_at   timestamptz not null default now(),
  redeemed_by  uuid references public.profiles (id) on delete set null,
  redeemed_at  timestamptz,
  revoked      boolean not null default false
);
alter table public.licenses enable row level security;
drop policy if exists "solo admin" on public.licenses;
create policy "solo admin" on public.licenses
  for select to authenticated using (public.is_admin());

create or replace function public.admin_create_license(p_empresa text, p_months int, p_price numeric, p_note text default null)
returns public.licenses
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  lic public.licenses;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede crear licencias'; end if;
  if coalesce(trim(p_empresa), '') = '' then raise exception 'Falta el nombre de la empresa'; end if;
  k := upper(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
  k := 'CFX-' || substr(k, 1, 4) || '-' || substr(k, 13, 4) || '-' || substr(k, 33, 4) || '-' || substr(k, 45, 4);
  insert into public.licenses (key, empresa, months, price, note)
  values (k, left(trim(p_empresa), 80), p_months, p_price, p_note)
  returning * into lic;
  return lic;
end $$;

create or replace function public.admin_revoke_license(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.licenses set revoked = true where id = p_id returning redeemed_by into uid;
  if uid is not null then
    update public.profiles set plan = 'free', pro_until = null where id = uid and role <> 'admin';
  end if;
end $$;

-- El usuario pega la key: si es válida su cuenta pasa a Pro.
-- Devuelve {ok, error|account}. Bloquea 1 hora tras 10 intentos fallidos.
create or replace function public.redeem_license(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  lic public.licenses;
  k text := upper(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'));
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero'); end if;
  if me.suspended then return jsonb_build_object('ok', false, 'error', 'Cuenta suspendida'); end if;
  if me.failed_redeems >= 10 and me.last_failed_at > now() - interval '1 hour' then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera una hora.');
  end if;

  select * into lic from public.licenses where key = k for update;
  if lic.id is null or lic.revoked or (lic.redeemed_by is not null and lic.redeemed_by <> me.id) then
    update public.profiles
      set failed_redeems = case when last_failed_at > now() - interval '1 hour' then failed_redeems + 1 else 1 end,
          last_failed_at = now()
      where id = me.id;
    return jsonb_build_object('ok', false, 'error', 'Key no válida o ya usada');
  end if;

  if lic.redeemed_by is null then
    update public.licenses set redeemed_by = me.id, redeemed_at = now() where id = lic.id;
  end if;
  update public.profiles
    set plan = 'pro',
        pro_until = case when lic.months is null then null
                         else greatest(coalesce(pro_until, now()), now()) + make_interval(months => lic.months) end,
        empresa = case when empresa = '' then lic.empresa else empresa end,
        failed_redeems = 0
    where id = me.id;
  return jsonb_build_object('ok', true, 'account', public.my_account());
end $$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_until timestamptz, p_suspended boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_plan not in ('free', 'pro') then raise exception 'Plan no válido'; end if;
  update public.profiles
    set plan = p_plan, pro_until = p_until, suspended = coalesce(p_suspended, false)
    where id = p_user and role <> 'admin';
end $$;

-- ---------------------------------------------------------------------
-- Secretos (claves push y Gmail). Nadie los lee desde la app; solo el servidor.
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;  -- sin políticas = nadie salvo el servidor

create or replace function public.admin_set_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_name not in ('vapid_public', 'vapid_private', 'gmail_user', 'gmail_app_password', 'mail_from_name') then
    raise exception 'Nombre no permitido';
  end if;
  insert into public.app_secrets (name, value) values (p_name, p_value)
  on conflict (name) do update set value = excluded.value;
end $$;

create or replace function public.admin_secret_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_object_agg(name, true), '{}'::jsonb) from public.app_secrets);
end $$;

-- La clave pública push sí es pública (la necesita cada celular para suscribirse).
create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('vapid_public', (select value from public.app_secrets where name = 'vapid_public'))
$$;

-- ---------------------------------------------------------------------
-- Suscripciones push de los usuarios de la app (para avisos del admin).
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

create or replace function public.save_my_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- ---------------------------------------------------------------------
-- Suscriptores de cada negocio (los clientes finales). Función Pro.
-- ---------------------------------------------------------------------
create table if not exists public.subscribers (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references public.profiles (id) on delete cascade,
  nombre       text not null default '',
  email        text,
  endpoint     text,
  p256dh       text,
  auth         text,
  created_at   timestamptz not null default now(),
  unique (negocio_id, endpoint),
  unique (negocio_id, email)
);
alter table public.subscribers enable row level security;
drop policy if exists "mis suscriptores" on public.subscribers;
create policy "mis suscriptores" on public.subscribers
  for select to authenticated using (negocio_id = auth.uid() or public.is_admin());
drop policy if exists "borrar mis suscriptores" on public.subscribers;
create policy "borrar mis suscriptores" on public.subscribers
  for delete to authenticated using (negocio_id = auth.uid());

create or replace function public.negocio_publico(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('empresa', p.empresa, 'pro', public.is_pro(p.id), 'telefono', p.telefono)
  from public.profiles p where p.id = p_id and p.role = 'user' and not p.suspended
$$;

create or replace function public.subscribe_negocio(
  p_negocio uuid, p_nombre text, p_email text, p_endpoint text, p_p256dh text, p_auth text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not public.is_pro(p_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Este negocio no tiene avisos activos');
  end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Correo no válido');
  end if;
  if em is null and p_endpoint is null then
    return jsonb_build_object('ok', false, 'error', 'Activa las notificaciones o escribe tu correo');
  end if;
  if (select count(*) from public.subscribers where negocio_id = p_negocio) >= 5000 then
    return jsonb_build_object('ok', false, 'error', 'Límite de suscriptores alcanzado');
  end if;

  -- Un mismo cliente se reconoce por su correo o por su dispositivo; se actualiza en vez de duplicar.
  update public.subscribers
    set nombre = coalesce(nullif(left(coalesce(p_nombre, ''), 60), ''), nombre),
        email = coalesce(em, email),
        endpoint = coalesce(p_endpoint, endpoint),
        p256dh = case when p_endpoint is null then p256dh else p_p256dh end,
        auth = case when p_endpoint is null then auth else p_auth end
    where id = (select id from public.subscribers
                where negocio_id = p_negocio
                  and ((em is not null and email = em) or (p_endpoint is not null and endpoint = p_endpoint))
                limit 1);
  if not found then
    insert into public.subscribers (negocio_id, nombre, email, endpoint, p256dh, auth)
    values (p_negocio, left(coalesce(p_nombre, ''), 60), em, p_endpoint, p_p256dh, p_auth);
  end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Notificaciones programadas (push y/o correo).
--   all_users        → admin: todas las empresas y todos los clientes
--   all_businesses / pro_users / free_users → admin: empresas (todas / Pro / Free)
--   all_clients      → admin: todos los clientes
--   my_subscribers   → empresa Pro: sus clientes (con cuenta o suscritos por enlace)
--   self             → prueba: solo a uno mismo
--   direct           → interno: aviso a una persona (mensajes, solicitudes)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  audience     text not null,
  channels     text[] not null default '{push}',
  title        text not null,
  body         text not null default '',
  url          text,
  image        text,
  send_at      timestamptz not null default now(),
  status       text not null default 'scheduled'
               check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  push_sent    int not null default 0,
  push_failed  int not null default 0,
  email_sent   int not null default 0,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.notifications add column if not exists target_id uuid references public.profiles (id) on delete cascade;
alter table public.notifications add column if not exists solo_premium boolean not null default false;
-- 'aviso' = notificación automática de una publicación nueva (solo push; no se lista como oferta).
alter table public.notifications add column if not exists kind text not null default 'oferta';
alter table public.notifications drop constraint if exists notifications_audience_check;
alter table public.notifications add constraint notifications_audience_check
  check (audience in ('all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients',
                      'my_subscribers', 'self', 'direct'));
create index if not exists notifications_owner_idx on public.notifications (owner_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "mis notificaciones" on public.notifications;
create policy "mis notificaciones" on public.notifications
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

-- Quién vio cada aviso ("visto").
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);
alter table public.notification_reads enable row level security;

create or replace function public.schedule_notification(
  p_title text, p_body text, p_url text, p_image text,
  p_audience text, p_channels text[], p_send_at timestamptz
) returns public.notifications
language plpgsql security definer set search_path = '' as $$
declare
  n public.notifications;
  admin boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if p_audience not in ('all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients', 'my_subscribers', 'self') then
    raise exception 'Destinatarios no válidos';
  end if;
  if p_audience in ('all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients') and not admin then
    raise exception 'Solo el administrador puede avisar a todos los usuarios';
  end if;
  p_channels := coalesce(p_channels, '{}');
  -- Campañas de una empresa: siempre se publican en "Ofertas" de sus clientes (sin canales = solo en la app).
  -- El envío automático (push y correo) es de la versión Pro.
  if p_audience = 'my_subscribers' and not public.is_business(auth.uid()) then
    raise exception 'Solo las empresas publican ofertas a sus clientes';
  end if;
  if p_audience = 'my_subscribers' and cardinality(p_channels) > 0 and not public.is_pro(auth.uid()) then
    raise exception 'El envío automático (push y correo) es de la versión Pro';
  end if;
  if not (p_channels <@ array['push', 'email'])
     or (cardinality(p_channels) = 0 and p_audience not in ('my_subscribers', 'all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients')) then
    raise exception 'Elige push y/o correo';
  end if;
  if 'email' = any(p_channels) and not public.is_pro(auth.uid()) then
    raise exception 'Los correos son de la versión Pro';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Falta el título'; end if;
  if coalesce(trim(p_url), '') <> '' and trim(p_url) !~* '^https?://' then raise exception 'El enlace debe empezar con https://'; end if;
  if coalesce(trim(p_image), '') <> '' and trim(p_image) !~* '^https?://' then raise exception 'Imagen no válida'; end if;
  if not admin and (select count(*) from public.notifications
                    where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Máximo 20 notificaciones por día';
  end if;

  insert into public.notifications (owner_id, audience, channels, title, body, url, image, send_at)
  values (auth.uid(), p_audience, p_channels, left(trim(p_title), 80), left(coalesce(p_body, ''), 400),
          nullif(trim(coalesce(p_url, '')), ''), nullif(trim(coalesce(p_image, '')), ''),
          greatest(coalesce(p_send_at, now()), now() - interval '1 minute'))
  returning * into n;
  return n;
end $$;

create or replace function public.cancel_notification(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Una oferta ya publicada también se puede quitar (deja de verse en "Ofertas").
  update public.notifications set status = 'cancelled'
  where id = p_id and (status = 'scheduled' or (status = 'sent' and audience = 'my_subscribers'))
    and (owner_id = auth.uid() or public.is_admin());
end $$;

-- Avisos del admin que le corresponden al usuario (bandeja dentro de la app).
drop function if exists public.my_inbox();
create or replace function public.my_inbox()
returns table (id uuid, title text, body text, url text, image text, sent_at timestamptz, de text, leido boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select p.* from public.profiles p where p.id = auth.uid())
  select n.id, n.title, n.body, n.url, n.image, coalesce(n.sent_at, n.send_at),
         case when o.role = 'admin' then 'CodeFix' else o.empresa end,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = me.id)
  from public.notifications n join me on true join public.profiles o on o.id = n.owner_id
  where (n.status = 'sent' or (n.status in ('scheduled', 'sending') and cardinality(n.channels) = 0 and n.send_at <= now()))
    and coalesce(n.sent_at, n.send_at) > now() - interval '60 days' and n.kind <> 'aviso'
    and (n.audience = 'all_users'
         or (me.role = 'user' and (n.audience = 'all_businesses'
               or (n.audience = 'pro_users' and public.is_pro(me.id))
               or (n.audience = 'free_users' and not public.is_pro(me.id))))
         or (me.role = 'client' and n.audience = 'all_clients')
         or (n.audience = 'direct' and n.target_id = me.id and coalesce(n.url, '') not like 'apps/mensajes/%'))
  order by coalesce(n.sent_at, n.send_at) desc limit 40
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.profiles),
    'empresas', (select count(*) from public.profiles where role = 'user'),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'pendientes', (select count(*) from public.requests where status = 'pending'),
    'reportes', (select count(*) from public.reports where not resolved),
    'pro', (select count(*) from public.profiles where public.is_pro(id) and role <> 'admin'),
    'licencias', (select count(*) from public.licenses where not revoked),
    'canjeadas', (select count(*) from public.licenses where redeemed_by is not null and not revoked),
    'ingresos', (select coalesce(sum(price), 0) from public.licenses where not revoked),
    'suscriptores', (select count(*) from public.subscribers),
    'dispositivos', (select count(*) from public.push_subscriptions));
end $$;

-- ---------------------------------------------------------------------
-- Funciones que usa SOLO el servidor de envíos (Edge Function "enviar").
-- ---------------------------------------------------------------------
create or replace function public.claim_due_notifications() returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications set status = 'sending'
  where id in (select id from public.notifications
               where status = 'scheduled' and send_at <= now()
               order by send_at limit 10 for update skip locked)
  returning *
$$;

create or replace function public.notification_targets(p_id uuid)
returns table (endpoint text, p256dh text, auth text, email text, nombre text)
language plpgsql stable security definer set search_path = '' as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id = p_id;
  if n.audience = 'my_subscribers' then
    return query
      select s.endpoint, s.p256dh, s.auth, s.email, s.nombre
        from public.subscribers s where s.negocio_id = n.owner_id and not coalesce(n.solo_premium, false)
      union all
      select ps.endpoint, ps.p256dh, ps.auth, null::text, c.empresa
        from public.profiles c join public.push_subscriptions ps on ps.user_id = c.id
        where c.negocio_id = n.owner_id and c.role = 'client' and not c.suspended and not c.mute_offers
          and (not coalesce(n.solo_premium, false) or public.is_pro(c.id))
      union all
      select null, null, null, c.email, c.empresa from public.profiles c
        where c.negocio_id = n.owner_id and c.role = 'client' and not c.suspended and not c.mute_offers
          and (not coalesce(n.solo_premium, false) or public.is_pro(c.id));
  elsif n.audience = 'direct' then
    return query select ps.endpoint, ps.p256dh, ps.auth, null::text, null::text
      from public.push_subscriptions ps where ps.user_id = n.target_id;
  elsif n.audience = 'self' then
    return query
      select ps.endpoint, ps.p256dh, ps.auth, null::text, null::text
        from public.push_subscriptions ps where ps.user_id = n.owner_id
      union all
      select null, null, null, p.email, p.empresa from public.profiles p where p.id = n.owner_id;
  else
    return query
      with users as (
        select p.id, p.email, p.empresa from public.profiles p
        where not p.suspended and p.role <> 'admin'
          and (n.audience = 'all_users'
               or (n.audience = 'all_businesses' and p.role = 'user')
               or (n.audience = 'pro_users' and p.role = 'user' and public.is_pro(p.id))
               or (n.audience = 'free_users' and p.role = 'user' and not public.is_pro(p.id))
               or (n.audience = 'all_clients' and p.role = 'client'))
      )
      select ps.endpoint, ps.p256dh, ps.auth, null::text, u.empresa
        from users u join public.push_subscriptions ps on ps.user_id = u.id
      union all
      select null, null, null, u.email, u.empresa from users u;
  end if;
end $$;

create or replace function public.emails_sent_today() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(email_sent), 0)::int from public.notifications where sent_at > now() - interval '1 day'
$$;

create or replace function public.finish_notification(p_id uuid, p_push_sent int, p_push_failed int, p_email_sent int, p_error text)
returns void
language sql security definer set search_path = '' as $$
  update public.notifications
  set status = case when p_push_sent + p_email_sent = 0 and p_error is not null then 'failed' else 'sent' end,
      push_sent = p_push_sent, push_failed = p_push_failed, email_sent = p_email_sent,
      error = p_error, sent_at = now()
  where id = p_id
$$;

create or replace function public.remove_endpoint(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
  update public.subscribers set endpoint = null, p256dh = null, auth = null where endpoint = p_endpoint;
  delete from public.subscribers where endpoint is null and email is null;
$$;

create or replace function public.get_secrets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(name, value), '{}'::jsonb) from public.app_secrets
$$;

-- ---------------------------------------------------------------------
-- Permisos: quién puede llamar a cada función.
-- ---------------------------------------------------------------------
revoke all on function public.claim_due_notifications() from public, anon, authenticated;
revoke all on function public.notification_targets(uuid) from public, anon, authenticated;
revoke all on function public.emails_sent_today() from public, anon, authenticated;
revoke all on function public.finish_notification(uuid, int, int, int, text) from public, anon, authenticated;
revoke all on function public.remove_endpoint(text) from public, anon, authenticated;
revoke all on function public.get_secrets() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.my_account() from public, anon;
revoke all on function public.update_my_company(text) from public, anon;
revoke all on function public.redeem_license(text) from public, anon;
revoke all on function public.save_my_push(text, text, text) from public, anon;
revoke all on function public.schedule_notification(text, text, text, text, text, text[], timestamptz) from public, anon;
revoke all on function public.cancel_notification(uuid) from public, anon;
revoke all on function public.my_inbox() from public, anon;
revoke all on function public.admin_create_license(text, int, numeric, text) from public, anon;
revoke all on function public.admin_revoke_license(uuid) from public, anon;
revoke all on function public.admin_set_plan(uuid, text, timestamptz, boolean) from public, anon;
revoke all on function public.admin_set_secret(text, text) from public, anon;
revoke all on function public.admin_secret_status() from public, anon;
revoke all on function public.admin_stats() from public, anon;

grant execute on function public.my_account(), public.update_my_company(text), public.redeem_license(text),
  public.save_my_push(text, text, text),
  public.schedule_notification(text, text, text, text, text, text[], timestamptz),
  public.cancel_notification(uuid), public.my_inbox(),
  public.admin_create_license(text, int, numeric, text), public.admin_revoke_license(uuid),
  public.admin_set_plan(uuid, text, timestamptz, boolean), public.admin_set_secret(text, text),
  public.admin_secret_status(), public.admin_stats()
  to authenticated;
grant execute on function public.public_config(), public.negocio_publico(uuid),
  public.subscribe_negocio(uuid, text, text, text, text, text) to anon, authenticated;

-- Las tablas solo se leen (según las políticas); se escriben por funciones.
revoke insert, update, delete, truncate on public.profiles, public.licenses, public.app_secrets,
  public.push_subscriptions, public.subscribers, public.notifications from anon, authenticated;
revoke select on public.app_secrets, public.push_subscriptions from anon, authenticated;
revoke select on public.profiles, public.licenses, public.subscribers, public.notifications from anon;
grant select on public.profiles, public.licenses, public.subscribers, public.notifications to authenticated;
grant delete on public.subscribers to authenticated;

-- ---------------------------------------------------------------------
-- Almacenamiento: imágenes de fichas (públicas) y respaldos (privados).
-- Cada usuario solo escribe en su carpeta <su id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fichas', 'fichas', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('respaldos', 'respaldos', false)
on conflict (id) do nothing;

drop policy if exists "fichas: subir propias (pro)" on storage.objects;
create policy "fichas: subir propias (pro)" on storage.objects for insert to authenticated
  with check (bucket_id = 'fichas' and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_business(auth.uid()));
drop policy if exists "fichas: reemplazar propias" on storage.objects;
create policy "fichas: reemplazar propias" on storage.objects for update to authenticated
  using (bucket_id = 'fichas' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fichas: borrar propias" on storage.objects;
create policy "fichas: borrar propias" on storage.objects for delete to authenticated
  using (bucket_id = 'fichas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "respaldos: leer propios" on storage.objects;
create policy "respaldos: leer propios" on storage.objects for select to authenticated
  using (bucket_id = 'respaldos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "respaldos: subir propios (pro)" on storage.objects;
create policy "respaldos: subir propios (pro)" on storage.objects for insert to authenticated
  with check (bucket_id = 'respaldos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_pro(auth.uid()));
drop policy if exists "respaldos: reemplazar propios" on storage.objects;
create policy "respaldos: reemplazar propios" on storage.objects for update to authenticated
  using (bucket_id = 'respaldos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
--  VERSIÓN 3: clientes con cuenta, chat, solicitudes, catálogo y ajustes
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes públicos que el admin cambia desde su panel (link de pago, precios).
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null default ''
);
alter table public.app_settings enable row level security;

create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('payment_link', 'price_business', 'price_client', 'contact_whatsapp', 'version_liberada')
$$;

create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := trim(coalesce(p_value, ''));
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_key not in ('payment_link', 'price_business', 'price_client', 'contact_whatsapp', 'version_liberada') then
    raise exception 'Ajuste no permitido';
  end if;
  if p_key = 'payment_link' and v <> '' and v !~* '^https://' then raise exception 'El link de pago debe empezar con https://'; end if;
  if p_key like 'price_%' and v !~ '^[0-9]{0,9}$' then raise exception 'Precio no válido (solo números)'; end if;
  if p_key = 'contact_whatsapp' and v !~ '^[0-9]{0,15}$' then raise exception 'WhatsApp no válido (solo números con código de país)'; end if;
  if p_key = 'version_liberada' and v !~ '^[0-9]+(\.[0-9]+){0,2}$' then raise exception 'Versión no válida'; end if;
  insert into public.app_settings (key, value) values (p_key, left(v, 500))
  on conflict (key) do update set value = excluded.value;
end $$;

-- ---------------------------------------------------------------------
-- Aviso interno a una persona (push). Lo usan el chat y las solicitudes.
-- ---------------------------------------------------------------------
create or replace function public.notify_user(p_target uuid, p_title text, p_body text, p_url text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (owner_id, target_id, audience, channels, title, body, url, send_at)
  select coalesce(auth.uid(), p_target), p_target, 'direct', '{push}', left(p_title, 80), left(coalesce(p_body, ''), 160), p_url, now()
  where p_target is not null
$$;

-- ---------------------------------------------------------------------
-- "Visto" de los avisos.
-- ---------------------------------------------------------------------
create or replace function public.mark_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.my_inbox() i where i.id = p_id) then return; end if;
  insert into public.notification_reads (notification_id, user_id) values (p_id, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.notification_views(p_ids uuid[])
returns table (id uuid, vistos int)
language sql stable security definer set search_path = '' as $$
  select n.id, (select count(*)::int from public.notification_reads r where r.notification_id = n.id)
  from public.notifications n
  where n.id = any(p_ids) and (n.owner_id = auth.uid() or public.is_admin())
$$;

-- ---------------------------------------------------------------------
-- Solicitudes: probar Pro 7 días / aviso de pago. Le llegan al admin.
-- ---------------------------------------------------------------------
create table if not exists public.requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('trial', 'payment')),
  note         text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
alter table public.requests enable row level security;
drop policy if exists "mis solicitudes" on public.requests;
create policy "mis solicitudes" on public.requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.request_pro(p_kind text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero'); end if;
  if me.role = 'admin' then return jsonb_build_object('ok', false, 'error', 'El administrador ya tiene todo'); end if;
  if p_kind not in ('trial', 'payment') then return jsonb_build_object('ok', false, 'error', 'Solicitud no válida'); end if;
  if p_kind = 'trial' and (me.trial_used or public.is_pro(me.id)) then
    return jsonb_build_object('ok', false, 'error', 'La prueba gratis ya se usó en esta cuenta');
  end if;
  if exists (select 1 from public.requests where user_id = me.id and kind = p_kind and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud pendiente. Te avisaremos pronto.');
  end if;
  if (select count(*) from public.requests where user_id = me.id and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 3 solicitudes por día');
  end if;
  insert into public.requests (user_id, kind, note) values (me.id, p_kind, left(p_note, 300));
  perform public.notify_user(public.admin_id(),
    case when p_kind = 'trial' then '🎁 Piden probar Pro' else '💰 Aviso de pago' end,
    coalesce(nullif(me.empresa, ''), me.email) || case when me.role = 'client' then ' (cliente)' else ' (empresa)' end,
    'apps/admin/');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_resolve_request(p_id uuid, p_approve boolean, p_days int default 7) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into r from public.requests where id = p_id and status = 'pending' for update;
  if r.id is null then raise exception 'La solicitud ya fue atendida'; end if;
  update public.requests set status = case when p_approve then 'approved' else 'rejected' end, resolved_at = now()
  where id = p_id;
  if p_approve then
    update public.profiles
      set plan = 'pro',
          pro_until = case when p_days is null then null
                           else greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days) end,
          trial_used = trial_used or r.kind = 'trial'
      where id = r.user_id and role <> 'admin';
    perform public.notify_user(r.user_id, '⭐ ¡Pro activado!',
      case when p_days is null then 'Tu versión Pro es permanente.' else 'Tu versión Pro está activa por ' || p_days || ' días.' end, './');
  else
    update public.profiles set trial_used = trial_used or r.kind = 'trial' where id = r.user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Chat empresa ↔ cliente (y con el admin).
-- Regla: máximo 3 mensajes seguidos hasta que la otra persona responda.
-- El administrador no tiene límite. Máximo 100 mensajes por día.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references public.profiles (id) on delete cascade,
  recipient   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists messages_pair_idx on public.messages
  (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient, read_at);
alter table public.messages enable row level security;
drop policy if exists "mis mensajes" on public.messages;
create policy "mis mensajes" on public.messages
  for select to authenticated using (sender = auth.uid() or recipient = auth.uid());

create table if not exists public.blocks (
  blocker     uuid not null references public.profiles (id) on delete cascade,
  blocked     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.profiles (id) on delete cascade,
  reported    uuid not null references public.profiles (id) on delete cascade,
  message_id  uuid references public.messages (id) on delete set null,
  reason      text not null,
  excerpt     text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "reportes admin" on public.reports;
create policy "reportes admin" on public.reports for select to authenticated using (public.is_admin());

-- Conexiones entre clientes (👥 Contactos): se piden con el código personal y se aceptan.
create table if not exists public.conexiones (
  id            uuid primary key default gen_random_uuid(),
  de            uuid not null references public.profiles (id) on delete cascade,
  para          uuid not null references public.profiles (id) on delete cascade,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  created_at    timestamptz not null default now(),
  respondida_at timestamptz,
  unique (de, para)
);
alter table public.conexiones enable row level security;  -- sin políticas: solo por funciones
revoke all on public.conexiones from anon, authenticated;

create or replace function public.conectados(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conexiones c where c.estado = 'aceptada'
                 and ((c.de = a and c.para = b) or (c.de = b and c.para = a)))
$$;

-- Mensajes seguidos sin respuesta: entre contactos 1 (Free) o 5 (Premium); el resto, 3.
create or replace function public.chat_limite(a uuid, b uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when pa.role = 'client' and pb.role = 'client' then (case when public.is_pro(a) then 5 else 1 end) else 3 end
                   from public.profiles pa, public.profiles pb where pa.id = a and pb.id = b), 3)
$$;

-- ¿Pueden hablar a y b?
create or replace function public.can_message(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and exists (
    select 1 from public.profiles pa, public.profiles pb
    where pa.id = a and pb.id = b and not pa.suspended
      and ((pa.role = 'admin' and pb.role = 'user') or (pb.role = 'admin' and pa.role = 'user')
           or (pa.role = 'user' and pb.role = 'client' and pb.negocio_id = pa.id)
           or (pa.role = 'client' and pb.role = 'user' and pa.negocio_id = pb.id)
           or (pa.role = 'client' and pb.role = 'client' and public.conectados(a, b)))
  )
$$;

-- Mensajes que aún puedo enviar seguidos a "otro" (null = sin límite).
create or replace function public.chat_remaining(p_other uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then null else greatest(0, public.chat_limite(auth.uid(), p_other) - (
    select count(*) from public.messages m
    where m.sender = auth.uid() and m.recipient = p_other
      and m.created_at > coalesce((select max(x.created_at) from public.messages x
                                   where x.sender = p_other and x.recipient = auth.uid()), '-infinity')
  ))::int end
$$;

create or replace function public.send_message(p_to uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  txt text := trim(coalesce(p_body, ''));
  left_ int;
  m public.messages;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero'); end if;
  if txt = '' then return jsonb_build_object('ok', false, 'error', 'Escribe un mensaje'); end if;
  if char_length(txt) > 1000 then return jsonb_build_object('ok', false, 'error', 'Máximo 1000 caracteres por mensaje'); end if;
  if not public.can_message(me.id, p_to) then
    return jsonb_build_object('ok', false, 'error', 'No puedes escribirle a esta cuenta');
  end if;
  if me.role <> 'admin' then
    if exists (select 1 from public.blocks where blocker = p_to and blocked = me.id)
       or exists (select 1 from public.blocks where blocker = me.id and blocked = p_to) then
      return jsonb_build_object('ok', false, 'error', 'La conversación está bloqueada');
    end if;
    left_ := public.chat_remaining(p_to);
    if left_ <= 0 then
      return jsonb_build_object('ok', false, 'error', case when public.chat_limite(me.id, p_to) = 1
        then 'Con la versión Free envías 1 mensaje a la vez. Espera la respuesta (o hazte Premium para enviar hasta 5).'
        else 'Ya enviaste ' || public.chat_limite(me.id, p_to) || ' mensajes seguidos. Espera la respuesta para escribir de nuevo.' end);
    end if;
    if (select count(*) from public.messages where sender = me.id and created_at > now() - interval '1 day') >= 100 then
      return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de 100 mensajes por día');
    end if;
  end if;
  insert into public.messages (sender, recipient, body) values (me.id, p_to, txt) returning * into m;
  perform public.notify_user(p_to,
    '💬 ' || case when me.role = 'admin' then 'CodeFix' else coalesce(nullif(me.empresa, ''), split_part(me.email, '@', 1)) end,
    txt, 'apps/mensajes/?con=' || me.id);
  return jsonb_build_object('ok', true, 'id', m.id, 'restantes', public.chat_remaining(p_to));
end $$;

-- Lista de conversaciones con el último mensaje y no leídos.
create or replace function public.chat_list()
returns table (other uuid, nombre text, rol text, ultimo text, ultimo_at timestamptz, mio boolean, no_leidos int, bloqueado boolean)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from public.messages m where m.sender = auth.uid() or m.recipient = auth.uid()
  ), last as (
    select distinct on (other) other, body, created_at, sender = auth.uid() as mio from mine order by other, created_at desc
  )
  select l.other,
         case when p.role = 'admin' then 'CodeFix (soporte)' else coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1)) end,
         p.role, l.body, l.created_at, l.mio,
         (select count(*)::int from public.messages x where x.sender = l.other and x.recipient = auth.uid() and x.read_at is null),
         exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = l.other)
  from last l join public.profiles p on p.id = l.other
  order by l.created_at desc
$$;

-- Mensajes de una conversación (marca como leídos los recibidos).
create or replace function public.chat_messages(p_other uuid)
returns table (id uuid, mio boolean, body text, created_at timestamptz, read_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then return; end if;
  update public.messages set read_at = now()
  where sender = p_other and recipient = auth.uid() and read_at is null;
  return query
    select m.id, m.sender = auth.uid(), m.body, m.created_at, m.read_at from (
      select * from public.messages x
      where (x.sender = auth.uid() and x.recipient = p_other) or (x.sender = p_other and x.recipient = auth.uid())
      order by x.created_at desc limit 200
    ) m order by m.created_at;
end $$;

-- Con quién puedo iniciar una conversación.
create or replace function public.my_contacts()
returns table (id uuid, nombre text, rol text, detalle text)
language sql stable security definer set search_path = '' as $$
  select p.id,
         case when p.role = 'admin' then 'CodeFix (soporte)' else coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1)) end,
         p.role,
         case when public.is_admin() then p.email
              when p.role = 'client' and (select me.role from public.profiles me where me.id = auth.uid()) = 'client'
                then 'Contacto · ' || coalesce((select n.empresa from public.profiles n where n.id = p.negocio_id), '')
              when p.role = 'client' then 'Cliente desde ' || to_char(p.created_at, 'DD/MM/YYYY') else '' end
  from public.profiles p
  where public.can_message(auth.uid(), p.id)
  order by p.role = 'admin' desc, 2
  limit 500
$$;

create or replace function public.block_contact(p_other uuid, p_block boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if p_block then
    insert into public.blocks (blocker, blocked) values (auth.uid(), p_other) on conflict do nothing;
  else
    delete from public.blocks where blocker = auth.uid() and blocked = p_other;
  end if;
end $$;

create or replace function public.report_message(p_message uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message and recipient = auth.uid();
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'Mensaje no encontrado'); end if;
  if (select count(*) from public.reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 10 reportes por día');
  end if;
  insert into public.reports (reporter, reported, message_id, reason, excerpt)
  values (auth.uid(), m.sender, m.id, left(coalesce(nullif(trim(p_reason), ''), 'Sin motivo'), 300), left(m.body, 300));
  perform public.notify_user(public.admin_id(), '🚩 Nuevo reporte', left(m.body, 100), 'apps/admin/');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_suspend boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.reports set resolved = true where id = p_id returning * into r;
  if p_suspend and r.reported is not null then
    update public.profiles set suspended = true where id = r.reported and role <> 'admin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Catálogo: productos que cada empresa publica para sus clientes.
-- ---------------------------------------------------------------------
create table if not exists public.catalog_items (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  client_key      text not null,
  nombre          text not null,
  precio          numeric(12, 2) not null check (precio >= 0),
  precio_premium  numeric(12, 2) check (precio_premium >= 0),
  categoria       text not null default '',
  updated_at      timestamptz not null default now(),
  unique (owner_id, client_key)
);
alter table public.catalog_items add column if not exists created_at timestamptz;
update public.catalog_items set created_at = updated_at where created_at is null;
alter table public.catalog_items alter column created_at set default now();
alter table public.catalog_items alter column created_at set not null;
alter table public.catalog_items enable row level security;

create or replace function public.catalog_upsert(p_key text, p_nombre text, p_precio numeric, p_premium numeric, p_categoria text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas publican productos'; end if;
  if coalesce(trim(p_nombre), '') = '' or p_precio is null or p_precio < 0 then raise exception 'Revisa nombre y precio'; end if;
  if not exists (select 1 from public.catalog_items where owner_id = auth.uid() and client_key = p_key)
     and (select count(*) from public.catalog_items where owner_id = auth.uid())
         >= (case when public.is_pro(auth.uid()) then 500 else 15 end) then
    raise exception 'Llegaste al máximo de productos publicados de tu plan';
  end if;
  insert into public.catalog_items (owner_id, client_key, nombre, precio, precio_premium, categoria)
  values (auth.uid(), left(p_key, 40), left(trim(p_nombre), 80), p_precio, p_premium, left(trim(coalesce(p_categoria, '')), 40))
  on conflict (owner_id, client_key) do update
    set nombre = excluded.nombre, precio = excluded.precio, precio_premium = excluded.precio_premium,
        categoria = excluded.categoria, updated_at = now();
end $$;

create or replace function public.catalog_delete(p_key text) returns void
language sql security definer set search_path = '' as $$
  delete from public.catalog_items where owner_id = auth.uid() and client_key = p_key
$$;

-- El cliente ve el catálogo de SU empresa. El precio Premium solo si es Premium.
-- Catálogo con clave (para favoritos y pedidos) y marca de producto nuevo (últimos 7 días).
drop function if exists public.catalog_of(uuid);
create or replace function public.catalog_of(p_negocio uuid)
returns table (nombre text, precio numeric, precio_premium numeric, tiene_premium boolean, categoria text,
               clave text, nuevo boolean)
language sql stable security definer set search_path = '' as $$
  select c.nombre, c.precio,
         case when public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin() then c.precio_premium end,
         c.precio_premium is not null, c.categoria, c.client_key, c.created_at > now() - interval '7 days'
  from public.catalog_items c
  where c.owner_id = p_negocio
    and (c.owner_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.profiles me where me.id = auth.uid() and me.negocio_id = p_negocio))
  order by c.categoria, c.nombre
$$;

-- ---------------------------------------------------------------------
-- Cuenta: silenciar ofertas, aceptar términos, eliminar cuenta.
-- ---------------------------------------------------------------------
create or replace function public.set_mute_offers(p_mute boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set mute_offers = coalesce(p_mute, false) where id = auth.uid();
  return public.my_account();
end $$;

create or replace function public.accept_terms() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set terms_at = now() where id = auth.uid() and terms_at is null;
  return public.my_account();
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if public.is_admin() then raise exception 'La cuenta del administrador no se puede eliminar desde la app'; end if;
  update public.profiles set negocio_id = null where negocio_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Permisos de la versión 3
-- ---------------------------------------------------------------------
revoke all on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_id() from public, anon;
revoke all on function public.is_business(uuid) from public, anon;
revoke all on function public.can_message(uuid, uuid) from public, anon;
revoke all on function public.public_settings() from public;
revoke all on function public.admin_set_setting(text, text) from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.notification_views(uuid[]) from public, anon;
revoke all on function public.request_pro(text, text) from public, anon;
revoke all on function public.admin_resolve_request(uuid, boolean, int) from public, anon;
revoke all on function public.chat_remaining(uuid) from public, anon;
revoke all on function public.send_message(uuid, text) from public, anon;
revoke all on function public.chat_list() from public, anon;
revoke all on function public.chat_messages(uuid) from public, anon;
revoke all on function public.my_contacts() from public, anon;
revoke all on function public.block_contact(uuid, boolean) from public, anon;
revoke all on function public.report_message(uuid, text) from public, anon;
revoke all on function public.admin_resolve_report(uuid, boolean) from public, anon;
revoke all on function public.catalog_upsert(text, text, numeric, numeric, text) from public, anon;
revoke all on function public.catalog_delete(text) from public, anon;
revoke all on function public.catalog_of(uuid) from public, anon;
revoke all on function public.set_mute_offers(boolean) from public, anon;
revoke all on function public.accept_terms() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.my_inbox() from public, anon;

grant execute on function public.public_settings() to anon, authenticated;
grant execute on function public.is_business(uuid), public.can_message(uuid, uuid), public.admin_id(),
  public.admin_set_setting(text, text), public.mark_notification_read(uuid), public.notification_views(uuid[]),
  public.request_pro(text, text), public.admin_resolve_request(uuid, boolean, int),
  public.chat_remaining(uuid), public.send_message(uuid, text), public.chat_list(), public.chat_messages(uuid),
  public.my_contacts(), public.block_contact(uuid, boolean), public.report_message(uuid, text),
  public.admin_resolve_report(uuid, boolean),
  public.catalog_upsert(text, text, numeric, numeric, text), public.catalog_delete(text), public.catalog_of(uuid),
  public.set_mute_offers(boolean), public.accept_terms(), public.delete_my_account(), public.my_inbox()
  to authenticated;

revoke insert, update, delete, truncate on public.app_settings, public.notification_reads, public.requests,
  public.messages, public.blocks, public.reports, public.catalog_items from anon, authenticated;
revoke select on public.app_settings, public.notification_reads, public.blocks, public.catalog_items from anon, authenticated;
revoke select on public.requests, public.messages, public.reports from anon;
grant select on public.requests, public.messages, public.reports to authenticated;

-- =====================================================================
--  VERSIÓN 3.1: cuentas creadas desde el panel (registro cerrado)
-- =====================================================================
-- Valida quién puede crear qué cuenta. La llama SOLO el servidor (función "enviar").
--   Admin   → crea empresas y clientes de cualquier empresa.
--   Empresa → crea solo clientes propios (Free: 30, Pro: 2000).
create or replace function public.prepare_user_invite(p_caller uuid, p_email text, p_nombre text, p_rol text, p_negocio uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.profiles;
  em text := lower(trim(coalesce(p_email, '')));
  nom text := left(trim(coalesce(p_nombre, '')), 80);
  neg uuid := p_negocio;
  admin boolean;
begin
  select * into c from public.profiles where id = p_caller;
  if c.id is null or c.suspended then return jsonb_build_object('ok', false, 'error', 'Sin permiso'); end if;
  admin := c.role = 'admin' and c.email = public.admin_email();
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Correo no válido'); end if;
  if nom = '' then return jsonb_build_object('ok', false, 'error', 'Escribe el nombre'); end if;
  if exists (select 1 from auth.users where lower(email) = em) then
    return jsonb_build_object('ok', false, 'error', 'Ese correo ya tiene cuenta');
  end if;
  if admin then
    if p_rol not in ('user', 'client') then return jsonb_build_object('ok', false, 'error', 'Tipo de cuenta no válido'); end if;
    if p_rol = 'client' and not exists (select 1 from public.profiles where id = neg and role = 'user' and not suspended) then
      return jsonb_build_object('ok', false, 'error', 'Elige la empresa del cliente');
    end if;
  elsif c.role = 'user' then
    if p_rol <> 'client' then return jsonb_build_object('ok', false, 'error', 'Solo puedes crear clientes'); end if;
    neg := c.id;
    if (select count(*) from public.profiles where negocio_id = c.id and role = 'client')
       >= (case when public.is_pro(c.id) then 300 else 50 end) then
      return jsonb_build_object('ok', false, 'error', case when public.is_pro(c.id) then 'Llegaste al máximo de 300 clientes'
        else 'Llegaste a 50 clientes. Pásate a Pro para tener hasta 300.' end);
    end if;
    if (select count(*) from public.profiles where created_by = c.id and created_at > now() - interval '1 day') >= 100 then
      return jsonb_build_object('ok', false, 'error', 'Máximo 100 cuentas nuevas por día');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  insert into public.user_invites (email, nombre, role, negocio_id, created_by)
  values (em, nom, p_rol, case when p_rol = 'client' then neg end, c.id)
  on conflict (email) do update
    set nombre = excluded.nombre, role = excluded.role, negocio_id = excluded.negocio_id,
        created_by = excluded.created_by, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_user_invite(p_email text) returns void
language sql security definer set search_path = '' as $$
  delete from public.user_invites where email = lower(trim(p_email))
$$;

-- (my_clients: ver versión 3.3)

revoke all on function public.prepare_user_invite(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_user_invite(text) from public, anon, authenticated;
revoke all on public.user_invites from anon, authenticated;

-- =====================================================================
--  VERSIÓN 3.3: ofertas para clientes, WhatsApp de clientes, push por cuenta
-- =====================================================================
alter table public.profiles add column if not exists telefono text;

-- WhatsApp del cliente (lo escribe su empresa o el admin). Vacío = sin WhatsApp.
create or replace function public.set_client_phone(p_email text, p_tel text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text := left(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), 15);
begin
  if t <> '' and length(t) < 7 then raise exception 'WhatsApp no válido (incluye el código de país)'; end if;
  update public.profiles set telefono = nullif(t, '')
  where email = lower(trim(coalesce(p_email, '')))
    and ((role = 'client' and (negocio_id = auth.uid() or public.is_admin()))
         or (role = 'user' and public.is_admin()));  -- los clientes del admin son las empresas
  if not found then raise exception 'Cliente no encontrado'; end if;
end $$;

-- Clientes de mi empresa (para la empresa): nombre, correo, fecha y WhatsApp.
drop function if exists public.my_clients();
create or replace function public.my_clients()
returns table (id uuid, nombre text, email text, creado timestamptz, telefono text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.empresa, p.email, p.created_at, p.telefono from public.profiles p
  where (p.role = 'client' and p.negocio_id = auth.uid())
     or (p.role = 'user' and public.is_admin())  -- los clientes del admin son las empresas
  order by p.created_at desc limit 2000
$$;

-- Este celular deja de recibir avisos de la cuenta que cierra sesión.
create or replace function public.remove_my_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Ofertas de la tienda. Las exclusivas se ven bloqueadas para clientes que no son Premium.
drop function if exists public.my_offers();
create or replace function public.my_offers()
returns table (id uuid, title text, body text, url text, image text, fecha timestamptz, leido boolean,
               solo_premium boolean, bloqueada boolean)
language sql stable security definer set search_path = '' as $$
  select n.id, n.title,
         case when x.bloq then '' else n.body end,
         case when x.bloq then null else n.url end,
         case when x.bloq then null else n.image end,
         coalesce(n.sent_at, n.send_at),
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = me.id),
         n.solo_premium, x.bloq
  from public.profiles me
  join public.notifications n
    on n.audience = 'my_subscribers'
   and n.owner_id = case when me.role = 'client' then me.negocio_id else me.id end
  cross join lateral (select n.solo_premium and me.role = 'client' and not public.is_pro(me.id) as bloq) x
  where me.id = auth.uid()
    and (n.status = 'sent' or (n.status in ('scheduled', 'sending') and cardinality(n.channels) = 0 and n.send_at <= now()))
    and coalesce(n.sent_at, n.send_at) > now() - interval '60 days' and n.kind <> 'aviso'
  order by coalesce(n.sent_at, n.send_at) desc limit 30
$$;

create or replace function public.mark_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (exists (select 1 from public.my_inbox() i where i.id = p_id)
                                or exists (select 1 from public.my_offers() o where o.id = p_id)) then return; end if;
  insert into public.notification_reads (notification_id, user_id) values (p_id, auth.uid())
  on conflict do nothing;
end $$;

revoke all on function public.set_client_phone(text, text) from public, anon;
revoke all on function public.my_clients() from public, anon;
revoke all on function public.remove_my_push(text) from public, anon;
revoke all on function public.my_offers() from public, anon;
grant execute on function public.set_client_phone(text, text), public.my_clients(), public.remove_my_push(text),
  public.my_offers() to authenticated;

-- =====================================================================
--  VERSIÓN 3.4: ofertas exclusivas Premium, productos nuevos, favoritos y pedidos
-- =====================================================================

-- La empresa marca una oferta como exclusiva para clientes Premium.
create or replace function public.set_offer_premium(p_id uuid, p_premium boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set solo_premium = coalesce(p_premium, false)
  where id = p_id and owner_id = auth.uid() and audience = 'my_subscribers' and status in ('scheduled', 'sent');
  if not found then raise exception 'Oferta no encontrada'; end if;
end $$;



revoke all on function public.set_offer_premium(uuid, boolean) from public, anon;
revoke all on function public.my_offers() from public, anon;
revoke all on function public.catalog_of(uuid) from public, anon;
grant execute on function public.set_offer_premium(uuid, boolean), public.my_offers(), public.catalog_of(uuid) to authenticated;

-- =====================================================================
--  VERSIÓN 3.5: WhatsApp de la tienda, diagnóstico de versión
-- =====================================================================
-- La empresa guarda su WhatsApp: sus clientes lo usan para enviarle pedidos.
create or replace function public.set_my_phone(p_tel text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text := left(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), 15);
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if t <> '' and length(t) < 8 then raise exception 'WhatsApp no válido (incluye el código de país, ej: 56912345678)'; end if;
  update public.profiles set telefono = nullif(t, '') where id = auth.uid();
  return public.my_account();
end $$;

-- Versión de la base de datos (la app avisa al admin si falta actualizarla).
create or replace function public.db_version() returns text
language sql immutable as $$ select '3.9'::text $$;

revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
grant execute on function public.db_version() to anon, authenticated;

-- =====================================================================
--  VERSIÓN 3.6: publicaciones (las fichas de Órbita se ven en la cadena)
--    Admin   → sus fichas las ven todas las empresas ("Novedades CodeFix").
--    Empresa → sus fichas las ven sus clientes ("Ofertas").
--  La imagen se guarda en la misma fila (no depende del almacenamiento).
-- =====================================================================
create table if not exists public.publicaciones (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  client_key  text not null,
  titulo      text not null,
  detalle     text not null default '',
  precio      text not null default '',
  imagen      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, client_key)
);
create index if not exists publicaciones_owner_idx on public.publicaciones (owner_id, updated_at desc);
alter table public.publicaciones enable row level security;  -- sin políticas: solo por funciones
revoke all on public.publicaciones from anon, authenticated;

create or replace function public.publicar_ficha(p_key text, p_titulo text, p_detalle text, p_precio text, p_imagen text)
returns void
language plpgsql security definer set search_path = '' as $$
declare img text := nullif(trim(coalesce(p_imagen, '')), '');
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas publican fichas'; end if;
  if coalesce(trim(p_key), '') = '' or coalesce(trim(p_titulo), '') = '' then raise exception 'La ficha necesita un título'; end if;
  if img is not null and img !~ '^(https://|data:image/(jpeg|png|webp);base64,)' then raise exception 'Imagen no válida'; end if;
  if length(coalesce(img, '')) > 600000 then raise exception 'La imagen es muy pesada'; end if;
  if not exists (select 1 from public.publicaciones where owner_id = auth.uid() and client_key = p_key)
     and (select count(*) from public.publicaciones where owner_id = auth.uid())
         >= (case when public.is_pro(auth.uid()) then 300 else 10 end) then
    raise exception 'Llegaste al máximo de fichas publicadas de tu plan (Free: 10)';
  end if;
  insert into public.publicaciones (owner_id, client_key, titulo, detalle, precio, imagen)
  values (auth.uid(), left(p_key, 60), left(trim(p_titulo), 80), left(coalesce(p_detalle, ''), 300), left(coalesce(p_precio, ''), 40), img)
  on conflict (owner_id, client_key) do update
    set titulo = excluded.titulo, detalle = excluded.detalle, precio = excluded.precio,
        imagen = excluded.imagen, updated_at = now();
end $$;

create or replace function public.borrar_publicacion(p_key text) returns void
language sql security definer set search_path = '' as $$
  delete from public.publicaciones where owner_id = auth.uid() and client_key = p_key
$$;

-- p_origen: 'tienda' → cliente: su empresa; empresa/admin: lo propio (vista previa).
--           'codefix' → lo que publica el administrador (lo ven todas las empresas).
drop function if exists public.ver_publicaciones(text);
drop function if exists public.ver_publicaciones(text, boolean);
create or replace function public.ver_publicaciones(p_origen text)
returns table (id uuid, titulo text, detalle text, precio text, imagen text, fecha timestamptz, de text, de_id uuid)
language sql stable security definer set search_path = '' as $$
  select x.id, x.titulo, x.detalle, x.precio, x.imagen, x.updated_at,
         case when o.role = 'admin' then 'CodeFix' else o.empresa end, x.owner_id
  from public.profiles me
  join public.publicaciones x on x.owner_id = case
         when p_origen = 'codefix' and me.role in ('user', 'admin') then public.admin_id()
         when p_origen = 'tienda' and me.role = 'client' then me.negocio_id
         when p_origen = 'tienda' then me.id end
  join public.profiles o on o.id = x.owner_id
  where me.id = auth.uid() and not me.suspended
  order by x.updated_at desc
  limit 100
$$;

create or replace function public.db_version() returns text
language sql immutable as $$ select '3.9'::text $$;

revoke all on function public.publicar_ficha(text, text, text, text, text) from public, anon;
revoke all on function public.borrar_publicacion(text) from public, anon;
revoke all on function public.ver_publicaciones(text) from public, anon;
grant execute on function public.publicar_ficha(text, text, text, text, text), public.borrar_publicacion(text),
  public.ver_publicaciones(text) to authenticated;

-- =====================================================================
--  VERSIÓN 3.7: pedidos con estados, cupones, sellos, publicaciones VIP,
--  avisos en cadena (admin → empresas → clientes), datos de la tienda,
--  panel de ingresos y vencimientos.
-- =====================================================================

-- ---------- Datos de la tienda ----------
alter table public.profiles add column if not exists datos_pago text;
alter table public.profiles add column if not exists horario text;
alter table public.profiles add column if not exists abierto boolean not null default true;
alter table public.profiles add column if not exists sellos_meta int;
alter table public.profiles add column if not exists sellos_premio text;
alter table public.profiles add column if not exists aviso_venc_at timestamptz;

create or replace function public.set_mi_tienda(p_datos_pago text, p_horario text, p_abierto boolean,
                                                p_sellos_meta int, p_sellos_premio text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if p_sellos_meta is not null and not public.is_pro(auth.uid()) then raise exception 'La tarjeta de sellos es de la versión Pro'; end if;
  if p_sellos_meta is not null and (p_sellos_meta < 2 or p_sellos_meta > 30) then raise exception 'La tarjeta debe tener entre 2 y 30 sellos'; end if;
  update public.profiles set
    datos_pago = nullif(left(trim(coalesce(p_datos_pago, '')), 400), ''),
    horario = nullif(left(trim(coalesce(p_horario, '')), 120), ''),
    abierto = coalesce(p_abierto, true),
    sellos_meta = p_sellos_meta,
    sellos_premio = nullif(left(trim(coalesce(p_sellos_premio, '')), 80), '')
  where id = auth.uid();
  return public.my_account();
end $$;

-- ¿Puede "me" comprarle a la tienda "t"? (cliente → su empresa; empresa → CodeFix)
create or replace function public.puede_comprar(me uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = me and not p.suspended
    and ((p.role = 'client' and p.negocio_id = t) or (p.role = 'user' and t = public.admin_id())))
$$;

-- Información pública de la tienda para quien le compra (o para la propia tienda).
create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', case when t.role = 'admin' then 'CodeFix' else t.empresa end,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id))
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or t.id = auth.uid() or public.is_admin())
$$;

-- ---------- Publicaciones: tipo, VIP, precio y aviso automático ----------
alter table public.publicaciones add column if not exists tipo text not null default 'oferta';
alter table public.publicaciones add column if not exists vip boolean not null default false;
alter table public.publicaciones add column if not exists precio_num numeric(12, 2);

-- Aviso push automático a quien corresponde (máx. 1 cada 10 minutos por tienda).
create or replace function public.avisar_publicacion(p_titulo text, p_que text, p_vip boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  -- máx. 1 aviso del mismo tipo cada 10 minutos (evita spam al publicar muchas cosas seguidas)
  if exists (select 1 from public.notifications where owner_id = me.id and kind = 'aviso' and solo_premium = p_vip
             and title like '%' || p_que and created_at > now() - interval '10 minutes') then return; end if;
  if me.role = 'admin' then
    insert into public.notifications (owner_id, audience, channels, kind, solo_premium, title, body, url, send_at)
    values (me.id, case when p_vip then 'pro_users' else 'all_businesses' end, '{push}', 'aviso', p_vip,
            left('📣 CodeFix: ' || p_que, 80), left(p_titulo, 160), 'apps/catalogo/?modo=codefix', now());
  else
    insert into public.notifications (owner_id, audience, channels, kind, solo_premium, title, body, url, send_at)
    values (me.id, 'my_subscribers', '{push}', 'aviso', p_vip,
            left('🏷️ ' || coalesce(nullif(me.empresa, ''), 'Tu tienda') || ': ' || p_que, 80), left(p_titulo, 160),
            'apps/catalogo/?v=ofertas', now());
  end if;
end $$;

drop function if exists public.publicar_ficha(text, text, text, text, text);
create or replace function public.publicar_ficha(p_key text, p_titulo text, p_detalle text, p_precio text, p_imagen text,
                                                 p_tipo text default 'oferta', p_vip boolean default false,
                                                 p_precio_num numeric default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  img text := nullif(trim(coalesce(p_imagen, '')), '');
  nueva boolean;
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas publican fichas'; end if;
  if coalesce(trim(p_key), '') = '' or coalesce(trim(p_titulo), '') = '' then raise exception 'La ficha necesita un título'; end if;
  if img is not null and img !~ '^(https://|data:image/(jpeg|png|webp);base64,)' then raise exception 'Imagen no válida'; end if;
  if length(coalesce(img, '')) > 600000 then raise exception 'La imagen es muy pesada'; end if;
  if p_precio_num is not null and (p_precio_num < 0 or p_precio_num > 99999999) then raise exception 'Precio no válido'; end if;
  nueva := not exists (select 1 from public.publicaciones where owner_id = auth.uid() and client_key = p_key);
  if nueva and (select count(*) from public.publicaciones where owner_id = auth.uid())
               >= (case when public.is_pro(auth.uid()) then 60 else 10 end) then
    raise exception '%', case when public.is_pro(auth.uid()) then 'Llegaste al máximo de 60 fichas publicadas: borra alguna antigua'
      else 'Llegaste a 10 fichas publicadas. Pásate a Pro para tener hasta 60.' end;
  end if;
  insert into public.publicaciones (owner_id, client_key, titulo, detalle, precio, imagen, tipo, vip, precio_num)
  values (auth.uid(), left(p_key, 60), left(trim(p_titulo), 80), left(coalesce(p_detalle, ''), 300), left(coalesce(p_precio, ''), 40), img,
          left(coalesce(nullif(p_tipo, ''), 'oferta'), 20), coalesce(p_vip, false), p_precio_num)
  on conflict (owner_id, client_key) do update
    set titulo = excluded.titulo, detalle = excluded.detalle, precio = excluded.precio, imagen = excluded.imagen,
        tipo = excluded.tipo, vip = excluded.vip, precio_num = excluded.precio_num, updated_at = now();
  if nueva then perform public.avisar_publicacion(trim(p_titulo), case when coalesce(p_vip, false) then 'oferta VIP ⭐' else 'nueva publicación' end, coalesce(p_vip, false)); end if;
end $$;

-- Las VIP las ven completas los Premium/Pro; los demás, bloqueadas (en gris).
drop function if exists public.ver_publicaciones(text);
drop function if exists public.ver_publicaciones(text, boolean);
create or replace function public.ver_publicaciones(p_origen text)
returns table (id uuid, titulo text, detalle text, precio text, imagen text, fecha timestamptz, de text, de_id uuid,
               tipo text, vip boolean, precio_num numeric, bloqueada boolean)
language sql stable security definer set search_path = '' as $$
  select x.id, x.titulo,
         case when b.bloq then '' else x.detalle end,
         case when b.bloq then '' else x.precio end,
         case when b.bloq then null else x.imagen end,
         x.updated_at, case when o.role = 'admin' then 'CodeFix' else o.empresa end, x.owner_id,
         x.tipo, x.vip, case when b.bloq then null else x.precio_num end, b.bloq
  from public.profiles me
  join public.publicaciones x on x.owner_id = case
         when p_origen = 'codefix' and me.role in ('user', 'admin') then public.admin_id()
         when p_origen = 'tienda' and me.role = 'client' then me.negocio_id
         when p_origen = 'tienda' then me.id end
  join public.profiles o on o.id = x.owner_id
  cross join lateral (select x.vip and x.owner_id <> me.id and me.role <> 'admin' and not public.is_pro(me.id) as bloq) b
  where me.id = auth.uid() and not me.suspended
  order by x.updated_at desc
  limit 100
$$;

-- Vistas de cada publicación (estadísticas de la tienda).
create table if not exists public.publicacion_vistas (
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  visto_at       timestamptz not null default now(),
  primary key (publicacion_id, user_id)
);
alter table public.publicacion_vistas enable row level security;
revoke all on public.publicacion_vistas from anon, authenticated;

create or replace function public.registrar_vistas(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.publicacion_vistas (publicacion_id, user_id)
  select v.id, auth.uid() from public.ver_publicaciones('tienda') v
  where v.id = any(p_ids) and v.de_id <> auth.uid()
  on conflict do nothing
$$;

-- ---------- Catálogo: productos VIP, catálogo de CodeFix para empresas, aviso de productos nuevos ----------
alter table public.catalog_items add column if not exists solo_premium boolean not null default false;

drop function if exists public.catalog_upsert(text, text, numeric, numeric, text);
create or replace function public.catalog_upsert(p_key text, p_nombre text, p_precio numeric, p_premium numeric, p_categoria text,
                                                 p_vip boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare nuevo boolean;
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas publican productos'; end if;
  if coalesce(trim(p_nombre), '') = '' or p_precio is null or p_precio < 0 then raise exception 'Revisa nombre y precio'; end if;
  nuevo := not exists (select 1 from public.catalog_items where owner_id = auth.uid() and client_key = p_key);
  if nuevo and (select count(*) from public.catalog_items where owner_id = auth.uid())
               >= (case when public.is_pro(auth.uid()) then 500 else 15 end) then
    raise exception 'Llegaste al máximo de productos publicados de tu plan';
  end if;
  insert into public.catalog_items (owner_id, client_key, nombre, precio, precio_premium, categoria, solo_premium)
  values (auth.uid(), left(p_key, 40), left(trim(p_nombre), 80), p_precio, p_premium, left(trim(coalesce(p_categoria, '')), 40), coalesce(p_vip, false))
  on conflict (owner_id, client_key) do update
    set nombre = excluded.nombre, precio = excluded.precio, precio_premium = excluded.precio_premium,
        categoria = excluded.categoria, solo_premium = excluded.solo_premium, updated_at = now();
  if nuevo then perform public.avisar_publicacion(trim(p_nombre), 'nuevos productos', false); end if;
end $$;

drop function if exists public.catalog_of(uuid);
create or replace function public.catalog_of(p_negocio uuid)
returns table (nombre text, precio numeric, precio_premium numeric, tiene_premium boolean, categoria text,
               clave text, nuevo boolean, solo_premium boolean, bloqueado boolean)
language sql stable security definer set search_path = '' as $$
  select c.nombre,
         case when b.bloq then null else c.precio end,
         case when b.ve then c.precio_premium end,
         c.precio_premium is not null, c.categoria, c.client_key, c.created_at > now() - interval '7 days',
         c.solo_premium, b.bloq
  from public.catalog_items c
  cross join lateral (select public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin() as ve) v
  cross join lateral (select v.ve, c.solo_premium and not v.ve as bloq) b
  where c.owner_id = p_negocio
    and (c.owner_id = auth.uid() or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio))
  order by c.categoria, c.nombre
$$;

-- ---------- Cupones (Pro) ----------
create table if not exists public.cupones (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  codigo      text not null,
  porcentaje  int not null check (porcentaje between 1 and 90),
  hasta       date,
  activo      boolean not null default true,
  usos        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (owner_id, codigo)
);
alter table public.cupones enable row level security;
revoke all on public.cupones from anon, authenticated;

create or replace function public.guardar_cupon(p_codigo text, p_porcentaje int, p_hasta date) returns void
language plpgsql security definer set search_path = '' as $$
declare c text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not (public.is_business(auth.uid()) and public.is_pro(auth.uid())) then raise exception 'Los cupones son de la versión Pro'; end if;
  if length(c) < 3 or length(c) > 20 then raise exception 'El código debe tener entre 3 y 20 letras o números'; end if;
  if p_porcentaje is null or p_porcentaje < 1 or p_porcentaje > 90 then raise exception 'El descuento debe ser entre 1 y 90 por ciento'; end if;
  if (select count(*) from public.cupones where owner_id = auth.uid()) >= 50 then raise exception 'Máximo 50 cupones'; end if;
  insert into public.cupones (owner_id, codigo, porcentaje, hasta) values (auth.uid(), c, p_porcentaje, p_hasta)
  on conflict (owner_id, codigo) do update set porcentaje = excluded.porcentaje, hasta = excluded.hasta, activo = true;
end $$;

create or replace function public.borrar_cupon(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cupones where id = p_id and owner_id = auth.uid()
$$;

create or replace function public.mis_cupones()
returns table (id uuid, codigo text, porcentaje int, hasta date, activo boolean, usos int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.porcentaje, c.hasta, c.activo, c.usos from public.cupones c
  where c.owner_id = auth.uid() order by c.created_at desc
$$;

create or replace function public.validar_cupon(p_negocio uuid, p_codigo text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare pct int;
begin
  if not public.puede_comprar(auth.uid(), p_negocio) then raise exception 'Sin permiso'; end if;
  select c.porcentaje into pct from public.cupones c
  where c.owner_id = p_negocio and c.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
    and c.activo and (c.hasta is null or c.hasta >= current_date) and public.is_pro(p_negocio);
  if pct is null then raise exception 'Cupón no válido o vencido'; end if;
  return pct;
end $$;

-- ---------- Tarjeta de sellos (Pro) ----------
create table if not exists public.sellos (
  negocio_id  uuid not null references public.profiles (id) on delete cascade,
  cliente_id  uuid not null references public.profiles (id) on delete cascade,
  cantidad    int not null default 0,
  premios     int not null default 0,
  primary key (negocio_id, cliente_id)
);
alter table public.sellos enable row level security;
revoke all on public.sellos from anon, authenticated;

create or replace function public.mis_sellos(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('cantidad', coalesce(s.cantidad, 0), 'premios', coalesce(s.premios, 0),
                            'meta', t.sellos_meta, 'premio', t.sellos_premio)
  from public.profiles t left join public.sellos s on s.negocio_id = t.id and s.cliente_id = auth.uid()
  where t.id = p_negocio and public.puede_comprar(auth.uid(), t.id) and t.sellos_meta is not null and public.is_pro(t.id)
$$;

-- ---------- Pedidos ----------
create table if not exists public.pedidos (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.profiles (id) on delete cascade,
  cliente_id  uuid not null references public.profiles (id) on delete cascade,
  lineas      jsonb not null,
  subtotal    numeric(12, 2) not null,
  descuento   numeric(12, 2) not null default 0,
  total       numeric(12, 2) not null,
  cupon       text,
  entrega     text not null check (entrega in ('retiro', 'despacho')),
  direccion   text,
  nota        text,
  estado      text not null default 'recibido'
              check (estado in ('recibido', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado')),
  sellado     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pedidos_negocio_idx on public.pedidos (negocio_id, created_at desc);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id, created_at desc);
alter table public.pedidos enable row level security;
revoke all on public.pedidos from anon, authenticated;

-- El servidor calcula los precios (no se confía en lo que manda el celular).
create or replace function public.crear_pedido(p_negocio uuid, p_items jsonb, p_entrega text, p_direccion text,
                                               p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pro boolean := public.is_pro(auth.uid());
  it jsonb; k text; n int; op text; ops text;
  nom text; pre numeric; vip boolean;
  lineas jsonb := '[]'::jsonb;
  sub numeric := 0; pct int := 0; desc_ numeric := 0;
  ped public.pedidos;
  cli text;
begin
  if not public.puede_comprar(me, p_negocio) then return jsonb_build_object('ok', false, 'error', 'No puedes pedirle a esta tienda'); end if;
  if p_entrega not in ('retiro', 'despacho') then return jsonb_build_object('ok', false, 'error', 'Elige despacho o retiro en tienda'); end if;
  if p_entrega = 'despacho' and coalesce(trim(p_direccion), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe la dirección de despacho');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    return jsonb_build_object('ok', false, 'error', 'El pedido está vacío');
  end if;
  if (select count(*) from public.pedidos where cliente_id = me and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 20 pedidos por día');
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    k := it ->> 'clave'; n := least(greatest(coalesce((it ->> 'cant')::int, 0), 0), 99);
    op := nullif(left(trim(coalesce(it ->> 'opcion', '')), 40), '');
    continue when n = 0 or k is null;
    nom := null; ops := null;
    if k like 'pub:%' then
      select x.titulo, x.precio_num, x.vip into nom, pre, vip from public.publicaciones x
      where x.owner_id = p_negocio and x.id::text = substr(k, 5);
    else
      select c.nombre, case when pro and c.precio_premium is not null then c.precio_premium else c.precio end, c.solo_premium, c.opciones
        into nom, pre, vip, ops from public.catalog_items c where c.owner_id = p_negocio and c.client_key = k;
    end if;
    -- Producto con opciones (colores, tallas…): hay que elegir una de la lista.
    if coalesce(ops, '') <> '' then
      if op is null or not exists (select 1 from unnest(string_to_array(ops, ',')) o where lower(trim(o)) = lower(op)) then
        return jsonb_build_object('ok', false, 'error', 'Elige el color u opción de "' || nom || '"');
      end if;
      nom := nom || ' (' || op || ')';
    end if;
    if nom is null or pre is null then return jsonb_build_object('ok', false, 'error', 'Un producto ya no está disponible: actualiza el pedido'); end if;
    if vip and not pro then return jsonb_build_object('ok', false, 'error', '"' || nom || '" es solo para Premium'); end if;
    lineas := lineas || jsonb_build_object('nombre', nom, 'cant', n, 'precio', pre, 'subtotal', pre * n, 'clave', k, 'opcion', op);
    sub := sub + pre * n;
  end loop;
  if jsonb_array_length(lineas) = 0 then return jsonb_build_object('ok', false, 'error', 'El pedido está vacío'); end if;
  if coalesce(trim(p_cupon), '') <> '' then
    begin
      pct := public.validar_cupon(p_negocio, p_cupon);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'Cupón no válido o vencido');
    end;
    desc_ := round(sub * pct / 100.0);
    update public.cupones set usos = usos + 1
    where owner_id = p_negocio and codigo = upper(regexp_replace(p_cupon, '[^A-Za-z0-9]', '', 'g'));
  end if;
  insert into public.pedidos (negocio_id, cliente_id, lineas, subtotal, descuento, total, cupon, entrega, direccion, nota)
  values (p_negocio, me, lineas, sub, desc_, sub - desc_,
          nullif(upper(regexp_replace(coalesce(p_cupon, ''), '[^A-Za-z0-9]', '', 'g')), ''),
          p_entrega, case when p_entrega = 'despacho' then left(trim(p_direccion), 200) end, nullif(left(trim(coalesce(p_nota, '')), 300), ''))
  returning * into ped;
  select coalesce(nullif(empresa, ''), split_part(email, '@', 1)) into cli from public.profiles where id = me;
  perform public.notify_user(p_negocio, '📦 Nuevo pedido de ' || cli,
    'Total $' || to_char(ped.total, 'FM999G999G999') || ' · ' || case when p_entrega = 'despacho' then 'Despacho' else 'Retiro en tienda' end,
    'apps/pedidos/');
  return jsonb_build_object('ok', true, 'id', ped.id, 'subtotal', ped.subtotal, 'descuento', ped.descuento, 'total', ped.total);
end $$;

-- Mis pedidos como comprador (opcional: de una tienda).
drop function if exists public.mis_pedidos(uuid);
create or replace function public.mis_pedidos(p_negocio uuid default null)
returns table (id uuid, negocio text, lineas jsonb, subtotal numeric, descuento numeric, total numeric, cupon text,
               entrega text, direccion text, nota text, estado text, fecha timestamptz, actualizado timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.id, case when t.role = 'admin' then 'CodeFix' else t.empresa end, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;

-- Pedidos que recibe mi tienda.
drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1)), c.telefono, x.lineas, x.subtotal,
         x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado, x.created_at
  from public.pedidos x join public.profiles c on c.id = x.cliente_id
  where x.negocio_id = auth.uid()
    and (p_estado is null or (p_estado = 'activos' and x.estado not in ('entregado', 'cancelado')) or x.estado = p_estado)
  order by x.created_at desc limit 300
$$;

create or replace function public.actualizar_pedido(p_id uuid, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ped public.pedidos;
  t public.profiles;
  s public.sellos;
  url text;
  txt text;
begin
  if p_estado not in ('recibido', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado') then
    raise exception 'Estado no válido';
  end if;
  update public.pedidos set estado = p_estado, updated_at = now()
  where id = p_id and negocio_id = auth.uid() returning * into ped;
  if ped.id is null then raise exception 'Pedido no encontrado'; end if;
  select * into t from public.profiles where id = ped.negocio_id;
  url := case when t.role = 'admin' then 'apps/catalogo/?modo=codefix&v=pedidos' else 'apps/catalogo/?v=pedidos' end;
  txt := case p_estado when 'preparando' then '👨‍🍳 Estamos preparando tu pedido'
                      when 'listo' then '✅ Tu pedido está listo para retirar'
                      when 'en_camino' then '🚚 Tu pedido va en camino'
                      when 'entregado' then '🎉 Pedido entregado. ¡Gracias por tu compra!'
                      when 'cancelado' then '❌ Tu pedido fue cancelado'
                      else '📦 Recibimos tu pedido' end;
  perform public.notify_user(ped.cliente_id, txt, coalesce(nullif(t.empresa, ''), 'CodeFix') || ' · Total $' || to_char(ped.total, 'FM999G999G999'), url);
  -- Sello en la tarjeta del cliente (una vez por pedido entregado).
  if p_estado = 'entregado' and not ped.sellado and t.sellos_meta is not null and public.is_pro(t.id) then
    update public.pedidos set sellado = true where id = ped.id;
    insert into public.sellos (negocio_id, cliente_id, cantidad) values (t.id, ped.cliente_id, 1)
    on conflict (negocio_id, cliente_id) do update set cantidad = public.sellos.cantidad + 1
    returning * into s;
    if s.cantidad >= t.sellos_meta then
      update public.sellos set cantidad = 0, premios = premios + 1 where negocio_id = t.id and cliente_id = ped.cliente_id;
      perform public.notify_user(ped.cliente_id, '🎁 ¡Completaste tu tarjeta de sellos!',
        'Premio: ' || coalesce(t.sellos_premio, 'pregunta en la tienda'), url);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'estado', p_estado);
end $$;

-- ---------- Estadísticas de la tienda (Pro) ----------
create or replace function public.estadisticas_tienda() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not (public.is_business(me) and public.is_pro(me)) then raise exception 'Las estadísticas son de la versión Pro'; end if;
  return jsonb_build_object(
    'pedidos', (select count(*) from public.pedidos where negocio_id = me and created_at > now() - interval '30 days'),
    'ventas', (select coalesce(sum(total), 0) from public.pedidos where negocio_id = me and estado = 'entregado' and created_at > now() - interval '30 days'),
    'clientes', (select count(*) from public.profiles where negocio_id = me and role = 'client'),
    'top_productos', (select coalesce(jsonb_agg(z), '[]') from (
        select l ->> 'nombre' as nombre, sum((l ->> 'cant')::int) as cant, sum((l ->> 'subtotal')::numeric) as monto
        from public.pedidos x, jsonb_array_elements(x.lineas) l
        where x.negocio_id = me and x.estado <> 'cancelado' and x.created_at > now() - interval '30 days'
        group by 1 order by 2 desc limit 5) z),
    'mejores_clientes', (select coalesce(jsonb_agg(z), '[]') from (
        select coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1)) as nombre, count(*) as pedidos, sum(x.total) as monto
        from public.pedidos x join public.profiles c on c.id = x.cliente_id
        where x.negocio_id = me and x.estado <> 'cancelado' and x.created_at > now() - interval '30 days'
        group by 1 order by 3 desc limit 5) z),
    'vistas', (select coalesce(jsonb_agg(z), '[]') from (
        select p.titulo, p.vip, (select count(*) from public.publicacion_vistas v where v.publicacion_id = p.id) as vistas
        from public.publicaciones p where p.owner_id = me order by 3 desc limit 10) z));
end $$;

-- ---------- Administrador: ingresos, vencimientos y detalle de empresas ----------
create or replace function public.admin_ingresos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pe numeric := coalesce(nullif((select value from public.app_settings where key = 'price_business'), '')::numeric, 0);
  pc numeric := coalesce(nullif((select value from public.app_settings where key = 'price_client'), '')::numeric, 0);
  ne int; nc int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select count(*) into ne from public.profiles where role = 'user' and public.is_pro(id);
  select count(*) into nc from public.profiles where role = 'client' and public.is_pro(id);
  return jsonb_build_object(
    'empresas_pro', ne, 'clientes_premium', nc, 'precio_empresa', pe, 'precio_cliente', pc,
    'estimado_mes', ne * pe,
    'licencias_mes', (select coalesce(sum(price), 0) from public.licenses where not revoked and created_at > date_trunc('month', now())),
    'pedidos_mes', (select count(*) from public.pedidos where created_at > date_trunc('month', now())),
    'vencen', (select coalesce(jsonb_agg(z order by z.pro_until), '[]') from (
        select p.id, coalesce(nullif(p.empresa, ''), p.email) as nombre, p.email, p.role, p.pro_until
        from public.profiles p
        where p.plan = 'pro' and p.pro_until between now() and now() + interval '7 days' and not p.suspended) z));
end $$;

create or replace function public.admin_avisar_vencimiento(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into p from public.profiles where id = p_user;
  if p.id is null then raise exception 'Cuenta no encontrada'; end if;
  perform public.notify_user(p.id, '⏰ Tu plan ' || case when p.role = 'client' then 'Premium' else 'Pro' end || ' vence pronto',
    'Vence el ' || to_char(p.pro_until, 'DD/MM/YYYY') || '. Renuévalo desde Ajustes → Plan para no perder tus beneficios.', './#plan');
  update public.profiles set aviso_venc_at = now() where id = p.id;
end $$;

-- Lo corre el cron cada día: avisa 3 días antes del vencimiento (una vez).
create or replace function public.avisar_vencimientos() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select * from public.profiles
           where plan = 'pro' and pro_until between now() + interval '2 days' and now() + interval '3 days'
             and not suspended and (aviso_venc_at is null or aviso_venc_at < now() - interval '20 days') loop
    insert into public.notifications (owner_id, target_id, audience, channels, title, body, url, send_at)
    values (coalesce(public.admin_id(), r.id), r.id, 'direct', '{push}',
            '⏰ Tu plan ' || case when r.role = 'client' then 'Premium' else 'Pro' end || ' vence en 3 días',
            'Renuévalo desde Ajustes → Plan para no perder tus beneficios.', './#plan', now());
    update public.profiles set aviso_venc_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_empresa(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select jsonb_build_object(
    'empresa', p.empresa, 'email', p.email, 'telefono', p.telefono, 'plan', case when public.is_pro(p.id) then 'Pro' else 'Free' end,
    'pro_until', p.pro_until, 'creada', p.created_at, 'abierto', p.abierto, 'horario', p.horario,
    'clientes', (select count(*) from public.profiles c where c.negocio_id = p.id and c.role = 'client'),
    'clientes_premium', (select count(*) from public.profiles c where c.negocio_id = p.id and c.role = 'client' and public.is_pro(c.id)),
    'productos', (select count(*) from public.catalog_items c where c.owner_id = p.id),
    'publicaciones', (select count(*) from public.publicaciones x where x.owner_id = p.id),
    'pedidos_30d', (select count(*) from public.pedidos x where x.negocio_id = p.id and x.created_at > now() - interval '30 days'),
    'ventas_30d', (select coalesce(sum(total), 0) from public.pedidos x where x.negocio_id = p.id and x.estado = 'entregado' and x.created_at > now() - interval '30 days'),
    'ultimas_publicaciones', (select coalesce(jsonb_agg(z), '[]') from (
        select x.titulo, x.tipo, x.vip, x.updated_at from public.publicaciones x where x.owner_id = p.id order by x.updated_at desc limit 5) z))
    from public.profiles p where p.id = p_id);
end $$;

revoke all on function public.set_mi_tienda(text, text, boolean, int, text) from public, anon;
revoke all on function public.puede_comprar(uuid, uuid) from public, anon;
revoke all on function public.tienda_info(uuid) from public, anon;
revoke all on function public.avisar_publicacion(text, text, boolean) from public, anon, authenticated;
revoke all on function public.publicar_ficha(text, text, text, text, text, text, boolean, numeric) from public, anon;
revoke all on function public.ver_publicaciones(text) from public, anon;
revoke all on function public.registrar_vistas(uuid[]) from public, anon;
revoke all on function public.catalog_upsert(text, text, numeric, numeric, text, boolean) from public, anon;
revoke all on function public.catalog_of(uuid) from public, anon;
revoke all on function public.guardar_cupon(text, int, date) from public, anon;
revoke all on function public.borrar_cupon(uuid) from public, anon;
revoke all on function public.mis_cupones() from public, anon;
revoke all on function public.validar_cupon(uuid, text) from public, anon;
revoke all on function public.mis_sellos(uuid) from public, anon;
revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text) from public, anon;
revoke all on function public.mis_pedidos(uuid) from public, anon;
revoke all on function public.pedidos_tienda(text) from public, anon;
revoke all on function public.actualizar_pedido(uuid, text) from public, anon;
revoke all on function public.estadisticas_tienda() from public, anon;
revoke all on function public.admin_ingresos() from public, anon;
revoke all on function public.admin_avisar_vencimiento(uuid) from public, anon;
revoke all on function public.avisar_vencimientos() from public, anon, authenticated;
revoke all on function public.admin_empresa(uuid) from public, anon;
grant execute on function public.set_mi_tienda(text, text, boolean, int, text), public.puede_comprar(uuid, uuid),
  public.tienda_info(uuid), public.publicar_ficha(text, text, text, text, text, text, boolean, numeric),
  public.ver_publicaciones(text), public.registrar_vistas(uuid[]),
  public.catalog_upsert(text, text, numeric, numeric, text, boolean), public.catalog_of(uuid),
  public.guardar_cupon(text, int, date), public.borrar_cupon(uuid), public.mis_cupones(), public.validar_cupon(uuid, text),
  public.mis_sellos(uuid), public.crear_pedido(uuid, jsonb, text, text, text, text), public.mis_pedidos(uuid),
  public.pedidos_tienda(text), public.actualizar_pedido(uuid, text), public.estadisticas_tienda(),
  public.admin_ingresos(), public.admin_avisar_vencimiento(uuid), public.admin_empresa(uuid)
  to authenticated;

-- =====================================================================
--  VERSIÓN 3.8: logo de la tienda, productos con opciones (colores, tallas),
--  límites para partir (Free 50 productos / Pro 200), imágenes que el celular
--  guarda (no se descargan dos veces) e indicador de uso del servidor.
-- =====================================================================

-- Logo chico (para la barra de arriba). Lo ven la empresa y sus clientes.
create or replace function public.set_mi_logo(p_logo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l text := nullif(trim(coalesce(p_logo, '')), '');
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if l is not null and (l !~ '^data:image/(jpeg|png|webp);base64,' or length(l) > 40000) then raise exception 'Logo no válido o muy pesado'; end if;
  update public.profiles set logo = l where id = auth.uid();
  return public.my_account();
end $$;

create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', case when t.role = 'admin' then 'CodeFix' else t.empresa end,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id), 'logo', t.logo)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or t.id = auth.uid() or public.is_admin())
$$;

-- ---------- Productos: descripción y opciones (cuentan como 1 producto) ----------
alter table public.catalog_items add column if not exists descripcion text not null default '';
alter table public.catalog_items add column if not exists opciones text not null default '';

drop function if exists public.catalog_upsert(text, text, numeric, numeric, text, boolean);
create or replace function public.catalog_upsert(p_key text, p_nombre text, p_precio numeric, p_premium numeric, p_categoria text,
                                                 p_vip boolean default false, p_descripcion text default '', p_opciones text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  nuevo boolean;
  -- "Rojo, azul ,  verde" → "Rojo, azul, verde" (máx. 20 opciones)
  ops text := (select string_agg(o, ', ') from (select left(trim(o), 40) o from unnest(string_to_array(coalesce(p_opciones, ''), ',')) o
               where trim(o) <> '' limit 20) z);
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas publican productos'; end if;
  if coalesce(trim(p_nombre), '') = '' or p_precio is null or p_precio < 0 then raise exception 'Revisa nombre y precio'; end if;
  nuevo := not exists (select 1 from public.catalog_items where owner_id = auth.uid() and client_key = p_key);
  if nuevo and (select count(*) from public.catalog_items where owner_id = auth.uid())
               >= (case when public.is_pro(auth.uid()) then 200 else 50 end) then
    raise exception '%', case when public.is_pro(auth.uid()) then 'Llegaste al máximo de 200 productos publicados'
      else 'Llegaste a 50 productos. Pásate a Pro para tener hasta 200 (o agrupa colores y tallas como opciones).' end;
  end if;
  insert into public.catalog_items (owner_id, client_key, nombre, precio, precio_premium, categoria, solo_premium, descripcion, opciones)
  values (auth.uid(), left(p_key, 40), left(trim(p_nombre), 80), p_precio, p_premium, left(trim(coalesce(p_categoria, '')), 40),
          coalesce(p_vip, false), left(trim(coalesce(p_descripcion, '')), 300), coalesce(ops, ''))
  on conflict (owner_id, client_key) do update
    set nombre = excluded.nombre, precio = excluded.precio, precio_premium = excluded.precio_premium,
        categoria = excluded.categoria, solo_premium = excluded.solo_premium,
        descripcion = excluded.descripcion, opciones = excluded.opciones, updated_at = now();
  if nuevo then perform public.avisar_publicacion(trim(p_nombre), 'nuevos productos', false); end if;
end $$;

drop function if exists public.catalog_of(uuid);
create or replace function public.catalog_of(p_negocio uuid)
returns table (nombre text, precio numeric, precio_premium numeric, tiene_premium boolean, categoria text,
               clave text, nuevo boolean, solo_premium boolean, bloqueado boolean, descripcion text, opciones text)
language sql stable security definer set search_path = '' as $$
  select c.nombre,
         case when b.bloq then null else c.precio end,
         case when b.ve then c.precio_premium end,
         c.precio_premium is not null, c.categoria, c.client_key, c.created_at > now() - interval '7 days',
         c.solo_premium, b.bloq, c.descripcion, c.opciones
  from public.catalog_items c
  cross join lateral (select public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin() as ve) v
  cross join lateral (select v.ve, c.solo_premium and not v.ve as bloq) b
  where c.owner_id = p_negocio
    and (c.owner_id = auth.uid() or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio))
  order by c.categoria, c.nombre
$$;

-- ---------- Imágenes: la lista viaja sin imágenes; el celular pide solo las que no tiene ----------
drop function if exists public.ver_publicaciones(text);
drop function if exists public.ver_publicaciones(text, boolean);
create or replace function public.ver_publicaciones(p_origen text, p_con_imagen boolean default true)
returns table (id uuid, titulo text, detalle text, precio text, imagen text, fecha timestamptz, de text, de_id uuid,
               tipo text, vip boolean, precio_num numeric, bloqueada boolean)
language sql stable security definer set search_path = '' as $$
  select x.id, x.titulo,
         case when b.bloq then '' else x.detalle end,
         case when b.bloq then '' else x.precio end,
         case when b.bloq or not p_con_imagen then null else x.imagen end,
         x.updated_at, case when o.role = 'admin' then 'CodeFix' else o.empresa end, x.owner_id,
         x.tipo, x.vip, case when b.bloq then null else x.precio_num end, b.bloq
  from public.profiles me
  join public.publicaciones x on x.owner_id = case
         when p_origen = 'codefix' and me.role in ('user', 'admin') then public.admin_id()
         when p_origen = 'tienda' and me.role = 'client' then me.negocio_id
         when p_origen = 'tienda' then me.id end
  join public.profiles o on o.id = x.owner_id
  cross join lateral (select x.vip and x.owner_id <> me.id and me.role <> 'admin' and not public.is_pro(me.id) as bloq) b
  where me.id = auth.uid() and not me.suspended
  order by x.updated_at desc
  limit 100
$$;

create or replace function public.imagenes_publicaciones(p_origen text, p_ids uuid[])
returns table (id uuid, imagen text, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.imagen, v.fecha from public.ver_publicaciones(p_origen, true) v
  where v.id = any(p_ids) and v.imagen is not null
$$;

-- ---------- Uso del servidor (plan gratis de Supabase: 500 MB de base de datos, 1 GB de archivos) ----------
create or replace function public.admin_uso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare almacen bigint := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  begin
    select coalesce(sum((metadata ->> 'size')::bigint), 0) into almacen from storage.objects;
  exception when others then almacen := 0;
  end;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()), 'db_limite', 500 * 1024 * 1024,
    'archivos_bytes', almacen, 'archivos_limite', 1024 * 1024 * 1024,
    'imagenes_bytes', (select coalesce(sum(length(imagen)), 0) from public.publicaciones),
    'empresas', (select count(*) from public.profiles where role = 'user'),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'productos', (select count(*) from public.catalog_items),
    'publicaciones', (select count(*) from public.publicaciones),
    'pedidos', (select count(*) from public.pedidos),
    'mensajes', (select count(*) from public.messages));
end $$;

revoke all on function public.set_mi_logo(text) from public, anon;
revoke all on function public.catalog_upsert(text, text, numeric, numeric, text, boolean, text, text) from public, anon;
revoke all on function public.catalog_of(uuid) from public, anon;
revoke all on function public.ver_publicaciones(text, boolean) from public, anon;
revoke all on function public.imagenes_publicaciones(text, uuid[]) from public, anon;
revoke all on function public.admin_uso() from public, anon;
grant execute on function public.set_mi_logo(text), public.tienda_info(uuid),
  public.catalog_upsert(text, text, numeric, numeric, text, boolean, text, text), public.catalog_of(uuid),
  public.ver_publicaciones(text, boolean), public.imagenes_publicaciones(text, uuid[]), public.admin_uso() to authenticated;

-- =====================================================================
--  VERSIÓN 3.9: 👥 Contactos entre clientes (con código), chat entre contactos
--  Free: 3 conexiones, 1 mensaje a la vez · Premium: 20 conexiones, hasta 5 seguidos.
--  Las conexiones no se cruzan: cada uno ve solo las suyas. Las empresas no las ven.
-- =====================================================================
alter table public.profiles add column if not exists codigo text;
create unique index if not exists profiles_codigo_idx on public.profiles (codigo) where codigo is not null;

create or replace function public.limite_conexiones(u uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.is_pro(u) then 20 else 3 end
$$;

-- Código personal: 4 letras del nombre + 4 números (ej: ROSA-4821).
create or replace function public.nuevo_codigo(u uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare base text; c text; i int := 0;
begin
  select upper(left(regexp_replace(translate(coalesce(nullif(empresa, ''), split_part(email, '@', 1)),
           'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^A-Za-z]', '', 'g'), 4)) into base from public.profiles where id = u;
  if coalesce(base, '') = '' then base := 'CFX'; end if;
  loop
    c := base || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where codigo = c);
    i := i + 1; if i > 20 then base := base || 'X'; end if;
  end loop;
  update public.profiles set codigo = c where id = u;
  return c;
end $$;

create or replace function public.mi_codigo() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if (select role from public.profiles where id = auth.uid()) is distinct from 'client' then raise exception 'Contactos es para clientes'; end if;
  select codigo into c from public.profiles where id = auth.uid();
  return coalesce(c, public.nuevo_codigo(auth.uid()));
end $$;

create or replace function public.cambiar_codigo() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if (select role from public.profiles where id = auth.uid()) is distinct from 'client' then raise exception 'Contactos es para clientes'; end if;
  return public.nuevo_codigo(auth.uid());
end $$;

create or replace function public.contar_conexiones(u uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conexiones where estado = 'aceptada' and (de = u or para = u)
$$;

create or replace function public.solicitar_conexion(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles; otro public.profiles; prev public.conexiones;
  c text := upper(trim(coalesce(p_codigo, '')));
  lim int;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.role is distinct from 'client' or me.suspended then return jsonb_build_object('ok', false, 'error', 'Contactos es para clientes'); end if;
  select * into otro from public.profiles where codigo = c and role = 'client' and not suspended;
  if otro.id is null then return jsonb_build_object('ok', false, 'error', 'No existe ese código. Revísalo con tu contacto.'); end if;
  if otro.id = me.id then return jsonb_build_object('ok', false, 'error', 'Ese es tu propio código'); end if;
  if public.conectados(me.id, otro.id) then return jsonb_build_object('ok', false, 'error', 'Ya son contactos'); end if;
  if exists (select 1 from public.blocks where (blocker = otro.id and blocked = me.id) or (blocker = me.id and blocked = otro.id)) then
    return jsonb_build_object('ok', false, 'error', 'No puedes conectarte con esta persona');
  end if;
  if exists (select 1 from public.conexiones where de = otro.id and para = me.id and estado = 'pendiente') then
    return jsonb_build_object('ok', false, 'error', 'Esa persona ya te envió una solicitud: acéptala en "Solicitudes"');
  end if;
  select * into prev from public.conexiones where de = me.id and para = otro.id;
  if prev.estado = 'pendiente' then return jsonb_build_object('ok', false, 'error', 'Ya le enviaste una solicitud. Espera su respuesta.'); end if;
  if prev.estado = 'rechazada' and prev.respondida_at > now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no aceptó tu solicitud. Podrás volver a intentarlo en 30 días.');
  end if;
  -- Anti-spam: máximo 3 solicitudes por día.
  if (select count(*) from public.conexiones where de = me.id and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 3 solicitudes por día. Intenta mañana.');
  end if;
  lim := public.limite_conexiones(me.id);
  if public.contar_conexiones(me.id) + (select count(*) from public.conexiones where de = me.id and estado = 'pendiente') >= lim then
    return jsonb_build_object('ok', false, 'error', case when lim = 3 then 'Con Free tienes hasta 3 contactos. Hazte Premium para tener hasta 20.'
      else 'Llegaste al máximo de 20 contactos' end);
  end if;
  insert into public.conexiones (de, para) values (me.id, otro.id)
  on conflict (de, para) do update set estado = 'pendiente', created_at = now(), respondida_at = null;
  perform public.notify_user(otro.id, '👥 Solicitud de contacto',
    coalesce(nullif(me.empresa, ''), 'Alguien') || ' quiere conectarse contigo', 'apps/contactos/');
  return jsonb_build_object('ok', true, 'nombre', coalesce(nullif(otro.empresa, ''), 'tu contacto'));
end $$;

create or replace function public.responder_conexion(p_id uuid, p_aceptar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.conexiones; me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into c from public.conexiones where id = p_id and para = me.id and estado = 'pendiente';
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada'); end if;
  if coalesce(p_aceptar, false) then
    if public.contar_conexiones(me.id) >= public.limite_conexiones(me.id) then
      return jsonb_build_object('ok', false, 'error', case when public.limite_conexiones(me.id) = 3
        then 'Con Free tienes hasta 3 contactos. Hazte Premium para tener hasta 20.' else 'Llegaste al máximo de 20 contactos' end);
    end if;
    if public.contar_conexiones(c.de) >= public.limite_conexiones(c.de) then
      return jsonb_build_object('ok', false, 'error', 'Esa persona ya llegó a su máximo de contactos');
    end if;
    update public.conexiones set estado = 'aceptada', respondida_at = now() where id = c.id;
    perform public.notify_user(c.de, '👥 ' || coalesce(nullif(me.empresa, ''), 'Tu contacto') || ' aceptó tu solicitud',
      'Ya pueden chatear en Mensajes', 'apps/contactos/');
  else
    update public.conexiones set estado = 'rechazada', respondida_at = now() where id = c.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mis contactos y solicitudes (solo nombre y tienda; nunca correo ni teléfono).
create or replace function public.mis_conexiones()
returns table (id uuid, otro uuid, nombre text, tienda text, estado text, enviada boolean, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, o.id, coalesce(nullif(o.empresa, ''), 'Sin nombre'), coalesce(n.empresa, ''), c.estado, c.de = auth.uid(),
         coalesce(c.respondida_at, c.created_at)
  from public.conexiones c
  join public.profiles o on o.id = case when c.de = auth.uid() then c.para else c.de end
  left join public.profiles n on n.id = o.negocio_id
  where (c.de = auth.uid() or c.para = auth.uid()) and c.estado in ('pendiente', 'aceptada')
  order by c.estado = 'pendiente' desc, 3
$$;

create or replace function public.eliminar_conexion(p_otro uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.conexiones where (de = auth.uid() and para = p_otro) or (de = p_otro and para = auth.uid())
$$;

revoke all on function public.conectados(uuid, uuid) from public, anon;
revoke all on function public.chat_limite(uuid, uuid) from public, anon;
revoke all on function public.limite_conexiones(uuid) from public, anon;
revoke all on function public.nuevo_codigo(uuid) from public, anon, authenticated;
revoke all on function public.contar_conexiones(uuid) from public, anon, authenticated;
revoke all on function public.mi_codigo() from public, anon;
revoke all on function public.cambiar_codigo() from public, anon;
revoke all on function public.solicitar_conexion(text) from public, anon;
revoke all on function public.responder_conexion(uuid, boolean) from public, anon;
revoke all on function public.mis_conexiones() from public, anon;
revoke all on function public.eliminar_conexion(uuid) from public, anon;
grant execute on function public.conectados(uuid, uuid), public.chat_limite(uuid, uuid), public.limite_conexiones(uuid),
  public.mi_codigo(), public.cambiar_codigo(), public.solicitar_conexion(text), public.responder_conexion(uuid, boolean),
  public.mis_conexiones(), public.eliminar_conexion(uuid) to authenticated;

-- =====================================================================
--  VERSIÓN 4.0: 📡 actividad de las empresas (solo la ve el administrador),
--  📣 motivar, ⭐ reseñas, 🌴 modo vacaciones, ⚡ respuestas rápidas y
--  🎨 color de la tienda.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '4.0'::text $$;

alter table public.profiles add column if not exists visto_at timestamptz;
alter table public.profiles add column if not exists motivado_at timestamptz;
alter table public.profiles add column if not exists vacaciones_hasta date;
alter table public.profiles add column if not exists vacaciones_msg text;
alter table public.profiles add column if not exists respuestas jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists color text;

-- Hoy en Chile (para vacaciones y horas de conexión).
create or replace function public.hoy_cl() returns date
language sql stable as $$ select (now() at time zone 'America/Santiago')::date $$;

-- ---------- 📡 Actividad: un registro chico por persona y día (se guarda 90 días) ----------
create table if not exists public.actividad_dia (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  dia       date not null,
  entradas  int not null default 0,
  horas     int[] not null default array_fill(0, array[24]),
  primary key (user_id, dia)
);
alter table public.actividad_dia enable row level security;  -- sin políticas: solo por funciones
revoke all on public.actividad_dia from anon, authenticated;

-- La app lo llama al abrirse (máx. una vez cada 10 minutos por persona).
create or replace function public.registrar_actividad() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  h int := extract(hour from now() at time zone 'America/Santiago')::int;
begin
  if me is null then return; end if;
  update public.profiles set visto_at = now()
  where id = me and (visto_at is null or visto_at < now() - interval '10 minutes');
  if not found then return; end if;
  insert into public.actividad_dia as a (user_id, dia, entradas, horas)
  values (me, public.hoy_cl(), 1, (select array_agg(case when i = h then 1 else 0 end order by i) from generate_series(0, 23) i))
  on conflict (user_id, dia) do update set entradas = a.entradas + 1, horas[h + 1] = a.horas[h + 1] + 1;
  delete from public.actividad_dia where user_id = me and dia < public.hoy_cl() - 90;
end $$;

-- Lista de empresas con su última actividad (para el semáforo 🟢🟡🔴).
create or replace function public.admin_actividad()
returns table (id uuid, empresa text, email text, telefono text, pro boolean, visto_at timestamptz,
               ultimo_producto timestamptz, ultima_ficha timestamptz, ultimo_pedido timestamptz,
               productos int, fichas int, clientes int, clientes_activos int, pedidos_7d int, entradas_7d int,
               push boolean, motivado_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query
  select p.id, p.empresa, p.email, p.telefono, public.is_pro(p.id), p.visto_at,
    (select max(c.created_at) from public.catalog_items c where c.owner_id = p.id),
    (select max(x.updated_at) from public.publicaciones x where x.owner_id = p.id),
    (select max(x.created_at) from public.pedidos x where x.negocio_id = p.id),
    (select count(*)::int from public.catalog_items c where c.owner_id = p.id),
    (select count(*)::int from public.publicaciones x where x.owner_id = p.id),
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'client'),
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'client' and c.visto_at > now() - interval '7 days'),
    (select count(*)::int from public.pedidos x where x.negocio_id = p.id and x.created_at > now() - interval '7 days'),
    (select coalesce(sum(a.entradas), 0)::int from public.actividad_dia a where a.user_id = p.id and a.dia > public.hoy_cl() - 7),
    exists (select 1 from public.push_subscriptions s where s.user_id = p.id),
    p.motivado_at
  from public.profiles p
  where p.role = 'user'
  order by p.visto_at desc nulls last;
end $$;

-- Resumen de hoy (para la tarjeta del administrador).
create or replace function public.admin_actividad_hoy() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d timestamptz := (public.hoy_cl()::timestamp at time zone 'America/Santiago');
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'empresas', (select count(*) from public.profiles where role = 'user' and visto_at >= d),
    'clientes', (select count(*) from public.profiles where role = 'client' and visto_at >= d),
    'productos', (select count(*) from public.catalog_items c join public.profiles p on p.id = c.owner_id
                  where p.role = 'user' and c.created_at >= d),
    'fichas', (select count(*) from public.publicaciones x join public.profiles p on p.id = x.owner_id
               where p.role = 'user' and x.updated_at >= d),
    'pedidos', (select count(*) from public.pedidos where created_at >= d));
end $$;

-- Detalle de una empresa: días activos, horario típico y últimos 14 días.
create or replace function public.admin_empresa_actividad(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare hs int[] := array_fill(0, array[24]); r record;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  for r in select horas from public.actividad_dia where user_id = p_id and dia > public.hoy_cl() - 30 loop
    for i in 1..24 loop hs[i] := hs[i] + coalesce(r.horas[i], 0); end loop;
  end loop;
  return jsonb_build_object(
    'visto_at', (select visto_at from public.profiles where id = p_id),
    'motivado_at', (select motivado_at from public.profiles where id = p_id),
    'push', exists (select 1 from public.push_subscriptions s where s.user_id = p_id),
    'dias_30', (select count(*) from public.actividad_dia where user_id = p_id and dia > public.hoy_cl() - 30),
    'entradas_30', (select coalesce(sum(entradas), 0) from public.actividad_dia where user_id = p_id and dia > public.hoy_cl() - 30),
    'horas', to_jsonb(hs),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('dia', g::date, 'entradas', coalesce(a.entradas, 0)) order by g), '[]')
             from generate_series(public.hoy_cl() - 13, public.hoy_cl(), interval '1 day') g
             left join public.actividad_dia a on a.user_id = p_id and a.dia = g::date),
    'clientes_activos', (select count(*) from public.profiles c where c.negocio_id = p_id and c.role = 'client' and c.visto_at > now() - interval '7 days'),
    'ultimo_producto', (select max(created_at) from public.catalog_items where owner_id = p_id),
    'ultima_ficha', (select max(updated_at) from public.publicaciones where owner_id = p_id),
    'ultimo_pedido', (select max(created_at) from public.pedidos where negocio_id = p_id));
end $$;

-- 🧹 Borra el historial de conexiones (la "última vez" de cada uno se mantiene).
create or replace function public.admin_limpiar_actividad() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  delete from public.actividad_dia where true;
  get diagnostics n = row_count;
  return n;
end $$;

-- 📣 Motivar: mensaje en su chat con CodeFix + notificación push (máx. 1 por empresa al día).
create or replace function public.admin_motivar(p_user uuid, p_titulo text, p_cuerpo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.profiles;
  t text := left(trim(coalesce(p_titulo, '')), 80);
  c text := left(trim(coalesce(p_cuerpo, '')), 1000);
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into u from public.profiles where id = p_user and role = 'user';
  if u.id is null then return jsonb_build_object('ok', false, 'error', 'Empresa no encontrada'); end if;
  if c = '' then return jsonb_build_object('ok', false, 'error', 'Escribe el mensaje'); end if;
  if u.motivado_at > now() - interval '20 hours' then
    return jsonb_build_object('ok', false, 'error', 'A ' || coalesce(nullif(u.empresa, ''), u.email) || ' ya le enviaste un aviso hoy');
  end if;
  insert into public.messages (sender, recipient, body) values (auth.uid(), u.id, c);
  perform public.notify_user(u.id, coalesce(nullif(t, ''), '💬 CodeFix'), c, 'apps/mensajes/?con=' || auth.uid());
  update public.profiles set motivado_at = now() where id = u.id;
  return jsonb_build_object('ok', true, 'push', exists (select 1 from public.push_subscriptions s where s.user_id = u.id));
end $$;

-- ---------- 🌴 Modo vacaciones (se apaga solo al pasar la fecha) ----------
create or replace function public.en_vacaciones(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select vacaciones_hasta >= public.hoy_cl() from public.profiles where id = t), false)
$$;

create or replace function public.set_vacaciones(p_hasta date, p_msg text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if p_hasta is not null and p_hasta < public.hoy_cl() then raise exception 'La fecha de regreso ya pasó'; end if;
  if p_hasta is not null and p_hasta > public.hoy_cl() + 120 then raise exception 'Máximo 120 días de vacaciones'; end if;
  update public.profiles set vacaciones_hasta = p_hasta,
    vacaciones_msg = case when p_hasta is null then null else nullif(left(trim(coalesce(p_msg, '')), 160), '') end
  where id = auth.uid();
  return public.my_account();
end $$;

-- Con la tienda de vacaciones no entran pedidos (lo revisa el servidor).
create or replace function public.pedido_sin_vacaciones() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h date;
begin
  if public.en_vacaciones(new.negocio_id) then
    select vacaciones_hasta into h from public.profiles where id = new.negocio_id;
    raise exception 'La tienda está de vacaciones hasta el %. Podrás pedir a su regreso.', to_char(h, 'DD-MM-YYYY');
  end if;
  return new;
end $$;
drop trigger if exists pedidos_vacaciones on public.pedidos;
create trigger pedidos_vacaciones before insert on public.pedidos
  for each row execute function public.pedido_sin_vacaciones();

-- ---------- 🎨 Color de la tienda (Free: 12 colores base · Pro: cualquiera) ----------
create or replace function public.set_mi_color(p_color text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text := lower(nullif(trim(coalesce(p_color, '')), ''));
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if c is not null and c !~ '^#[0-9a-f]{6}$' then raise exception 'Color no válido'; end if;
  if c is not null and not public.is_pro(auth.uid()) and c <> all (array['#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#dc2626',
      '#ea580c', '#d97706', '#16a34a', '#059669', '#0891b2', '#334155', '#111827']) then
    raise exception 'El color personalizado para tu tienda es de la versión Pro (con Free elige uno de los 12 colores)';
  end if;
  update public.profiles set color = c where id = auth.uid();
  return public.my_account();
end $$;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan, 'role', p.role,
    'pro_until', p.pro_until, 'suspended', p.suspended, 'trial_used', p.trial_used,
    'mute_offers', p.mute_offers, 'terms_at', p.terms_at,
    'negocio_id', p.negocio_id, 'negocio', n.empresa, 'telefono', p.telefono, 'negocio_telefono', n.telefono,
    'logo', p.logo, 'negocio_logo', n.logo, 'color', p.color, 'negocio_color', n.color,
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin())
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;

create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', case when t.role = 'admin' then 'CodeFix' else t.empresa end,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id), 'logo', t.logo, 'color', t.color,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or t.id = auth.uid() or public.is_admin())
$$;

-- ---------- ⚡ Respuestas rápidas del chat (Free: 3 · Pro: 20) ----------
create or replace function public.mis_respuestas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select respuestas from public.profiles where id = auth.uid()), '[]'::jsonb)
$$;

create or replace function public.set_mis_respuestas(p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l jsonb := '[]'::jsonb; x jsonb; t text; lim int;
begin
  if not public.is_business(auth.uid()) then raise exception 'Las respuestas rápidas son para las empresas'; end if;
  if jsonb_typeof(coalesce(p_lista, '[]'::jsonb)) <> 'array' then raise exception 'Lista no válida'; end if;
  lim := case when public.is_pro(auth.uid()) then 20 else 3 end;
  for x in select * from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    t := left(trim(coalesce(x #>> '{}', '')), 200);
    if t <> '' then l := l || to_jsonb(t); end if;
  end loop;
  if jsonb_array_length(l) > lim then
    raise exception '%', case when lim = 3 then 'Con Free tienes hasta 3 respuestas rápidas. Pásate a Pro para tener 20.'
      else 'Máximo 20 respuestas rápidas' end;
  end if;
  update public.profiles set respuestas = l where id = auth.uid();
  return l;
end $$;

-- ---------- ⭐ Reseñas: solo opina quien ya recibió un pedido de la tienda ----------
create table if not exists public.resenas (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.profiles (id) on delete cascade,
  autor_id    uuid not null references public.profiles (id) on delete cascade,
  estrellas   int not null check (estrellas between 1 and 5),
  texto       text not null default '',
  respuesta   text,
  destacada   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (negocio_id, autor_id)
);
create index if not exists resenas_negocio_idx on public.resenas (negocio_id, updated_at desc);
alter table public.resenas enable row level security;  -- sin políticas: solo por funciones
revoke all on public.resenas from anon, authenticated;

create or replace function public.puede_resenar(me uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.puede_comprar(me, t)
     and exists (select 1 from public.pedidos x where x.negocio_id = t and x.cliente_id = me and x.estado = 'entregado')
$$;

create or replace function public.dejar_resena(p_negocio uuid, p_estrellas int, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; nueva boolean;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.suspended then return jsonb_build_object('ok', false, 'error', 'Inicia sesión primero'); end if;
  if not public.puede_resenar(me.id, p_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Podrás dejar tu reseña cuando recibas tu primer pedido de esta tienda');
  end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then return jsonb_build_object('ok', false, 'error', 'Elige de 1 a 5 estrellas'); end if;
  nueva := not exists (select 1 from public.resenas where negocio_id = p_negocio and autor_id = me.id);
  insert into public.resenas (negocio_id, autor_id, estrellas, texto)
  values (p_negocio, me.id, p_estrellas, left(trim(coalesce(p_texto, '')), 300))
  on conflict (negocio_id, autor_id) do update set estrellas = excluded.estrellas, texto = excluded.texto, updated_at = now();
  if nueva then
    perform public.notify_user(p_negocio, '⭐ Nueva reseña: ' || repeat('★', p_estrellas) || repeat('☆', 5 - p_estrellas),
      coalesce(nullif(left(trim(coalesce(p_texto, '')), 120), ''), 'Un cliente calificó tu tienda'), 'apps/pedidos/?v=resenas');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Nombre corto del autor ("Rosa M."): nunca el correo.
create or replace function public.nombre_corto(n text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(split_part(trim(coalesce(n, '')), ' ', 1) ||
    case when split_part(trim(coalesce(n, '')), ' ', 2) <> '' then ' ' || upper(left(split_part(trim(n), ' ', 2), 1)) || '.' else '' end), ''), 'Cliente')
$$;

create or replace function public.ver_resenas(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pro boolean := public.is_pro(p_negocio);
begin
  if not (public.puede_comprar(auth.uid(), p_negocio) or p_negocio = auth.uid() or public.is_admin()) then
    raise exception 'No puedes ver las reseñas de esta tienda';
  end if;
  return jsonb_build_object(
    'promedio', (select round(avg(estrellas)::numeric, 1) from public.resenas where negocio_id = p_negocio),
    'total', (select count(*) from public.resenas where negocio_id = p_negocio),
    'puede', public.puede_resenar(auth.uid(), p_negocio),
    'pro', pro,
    'mia', (select jsonb_build_object('estrellas', estrellas, 'texto', texto) from public.resenas
            where negocio_id = p_negocio and autor_id = auth.uid()),
    'lista', (select coalesce(jsonb_agg(z), '[]') from (
      select r.id, public.nombre_corto(a.empresa) as autor, r.estrellas, r.texto, r.respuesta,
             r.destacada and pro as destacada, r.updated_at as fecha, r.autor_id = auth.uid() as mia
      from public.resenas r join public.profiles a on a.id = r.autor_id
      where r.negocio_id = p_negocio
      order by (r.destacada and pro) desc, r.updated_at desc limit 50) z));
end $$;

create or replace function public.responder_resena(p_id uuid, p_respuesta text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.resenas; t text := nullif(left(trim(coalesce(p_respuesta, '')), 300), '');
begin
  select * into r from public.resenas where id = p_id and negocio_id = auth.uid();
  if r.id is null then raise exception 'Reseña no encontrada'; end if;
  if not public.is_pro(auth.uid()) then raise exception 'Responder reseñas es de la versión Pro'; end if;
  update public.resenas set respuesta = t where id = p_id;
  if t is not null and r.respuesta is null then
    perform public.notify_user(r.autor_id, '💬 La tienda respondió tu reseña', t, 'apps/catalogo/?v=productos#resenas');
  end if;
end $$;

create or replace function public.destacar_resena(p_id uuid, p_destacar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.resenas where id = p_id and negocio_id = auth.uid()) then raise exception 'Reseña no encontrada'; end if;
  if not public.is_pro(auth.uid()) then raise exception 'Destacar reseñas es de la versión Pro'; end if;
  if coalesce(p_destacar, false) and (select count(*) from public.resenas where negocio_id = auth.uid() and destacada and id <> p_id) >= 3 then
    raise exception 'Puedes destacar hasta 3 reseñas';
  end if;
  update public.resenas set destacada = coalesce(p_destacar, false) where id = p_id;
end $$;

revoke all on function public.hoy_cl() from public, anon;
revoke all on function public.registrar_actividad() from public, anon;
revoke all on function public.admin_actividad() from public, anon;
revoke all on function public.admin_actividad_hoy() from public, anon;
revoke all on function public.admin_empresa_actividad(uuid) from public, anon;
revoke all on function public.admin_limpiar_actividad() from public, anon;
revoke all on function public.admin_motivar(uuid, text, text) from public, anon;
revoke all on function public.en_vacaciones(uuid) from public, anon;
revoke all on function public.set_vacaciones(date, text) from public, anon;
revoke all on function public.pedido_sin_vacaciones() from public, anon, authenticated;
revoke all on function public.set_mi_color(text) from public, anon;
revoke all on function public.mis_respuestas() from public, anon;
revoke all on function public.set_mis_respuestas(jsonb) from public, anon;
revoke all on function public.puede_resenar(uuid, uuid) from public, anon;
revoke all on function public.dejar_resena(uuid, int, text) from public, anon;
revoke all on function public.nombre_corto(text) from public, anon;
revoke all on function public.ver_resenas(uuid) from public, anon;
revoke all on function public.responder_resena(uuid, text) from public, anon;
revoke all on function public.destacar_resena(uuid, boolean) from public, anon;
grant execute on function public.hoy_cl(), public.registrar_actividad(), public.admin_actividad(), public.admin_actividad_hoy(),
  public.admin_empresa_actividad(uuid), public.admin_limpiar_actividad(), public.admin_motivar(uuid, text, text),
  public.en_vacaciones(uuid), public.set_vacaciones(date, text), public.set_mi_color(text), public.my_account(), public.tienda_info(uuid),
  public.mis_respuestas(), public.set_mis_respuestas(jsonb), public.puede_resenar(uuid, uuid), public.dejar_resena(uuid, int, text),
  public.nombre_corto(text), public.ver_resenas(uuid), public.responder_resena(uuid, text), public.destacar_resena(uuid, boolean)
  to authenticated;

-- =====================================================================
--  VERSIÓN 4.1: 🧹 limpieza automática (todos los días)
--  · Avisos y notificaciones ya enviados: se borran a los 7 días.
--  · Ofertas de las tiendas y campañas con imagen: a los 30 días.
--  · Mensajes del chat: a los 7 días.
--  · Los pedidos NO se borran (son el historial de ventas).
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '4.1'::text $$;

create index if not exists messages_created_idx on public.messages (created_at);

create or replace function public.limpiar_registros() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; c int; m int;
begin
  delete from public.notifications n
  where n.status in ('sent', 'failed', 'cancelled')
    and not ((n.audience = 'my_subscribers' and n.kind <> 'aviso') or n.image is not null)
    and coalesce(n.sent_at, n.send_at) < now() - interval '7 days';
  get diagnostics a = row_count;
  delete from public.notifications n
  where n.status in ('sent', 'failed', 'cancelled')
    and coalesce(n.sent_at, n.send_at) < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from public.messages where created_at < now() - interval '7 days';
  get diagnostics m = row_count;
  return jsonb_build_object('avisos', a, 'campanas', c, 'mensajes', m);
end $$;

-- Botón "🧹 Limpiar ahora" del administrador (hace lo mismo que la limpieza diaria).
create or replace function public.admin_limpiar_registros() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return public.limpiar_registros();
end $$;

revoke all on function public.limpiar_registros() from public, anon, authenticated;
revoke all on function public.admin_limpiar_registros() from public, anon;
grant execute on function public.admin_limpiar_registros() to authenticated;

-- =====================================================================
--  VERSIÓN 4.2: 🔄 versión nueva → aviso al admin; al tocar "Actualizar" se
--  libera sola para todos (con push). 🧹 Cada usuario limpia sus avisos.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '4.2'::text $$;

alter table public.profiles add column if not exists avisos_limpios_at timestamptz;

-- ¿La versión a es mayor que b? ('4.10' > '4.9')
create or replace function public.version_mayor(a text, b text) returns boolean
language sql immutable as $$
  select case when coalesce(a, '') !~ '^[0-9]+(\.[0-9]+){0,2}$' then false
              when coalesce(b, '') !~ '^[0-9]+(\.[0-9]+){0,2}$' then true
              else string_to_array(a, '.')::int[] > string_to_array(b, '.')::int[] end
$$;

-- El admin toca "Actualizar": la versión queda liberada y a todos les llega el aviso.
create or replace function public.admin_liberar_version(p_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v text := trim(coalesce(p_version, ''));
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if v !~ '^[0-9]+(\.[0-9]+){0,2}$' then raise exception 'Versión no válida'; end if;
  if not public.version_mayor(v, (select value from public.app_settings where key = 'version_liberada')) then return false; end if;
  insert into public.app_settings (key, value) values ('version_liberada', v)
  on conflict (key) do update set value = excluded.value;
  insert into public.notifications (owner_id, audience, channels, title, body, url, send_at, kind)
  values (auth.uid(), 'all_users', '{push}', '🔄 Nueva versión ' || v || ' de la app',
          'Abre la app y toca "Actualizar" para tener lo último.', './', now(), 'aviso');
  return true;
end $$;

-- Cada hora: si hay una versión publicada más nueva, avisa al admin (una vez por versión).
create or replace function public.avisar_version_nueva(p_version text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := p_version; a uuid := public.admin_id();
begin
  if v is null then
    begin
      execute $q$select (content::jsonb) ->> 'version' from extensions.http_get('https://codefixservice.github.io/Aplicaciones/version.json')$q$ into v;
    exception when others then return null;
    end;
  end if;
  if a is null or not public.version_mayor(v, coalesce((select value from public.app_settings where key = 'version_avisada'), '0'))
     or not public.version_mayor(v, (select value from public.app_settings where key = 'version_liberada')) then
    return null;
  end if;
  insert into public.app_settings (key, value) values ('version_avisada', v)
  on conflict (key) do update set value = excluded.value;
  perform public.notify_user(a, '🔄 Versión ' || v || ' lista para actualizar',
    'Abre la app y toca "Actualizar": se libera sola para todos.', './');
  return v;
end $$;

-- 🧹 Limpiar mis avisos: desde ahora solo veo los nuevos.
create or replace function public.limpiar_mis_avisos() returns timestamptz
language sql security definer set search_path = '' as $$
  update public.profiles set avisos_limpios_at = now() where id = auth.uid() returning avisos_limpios_at
$$;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan, 'role', p.role,
    'pro_until', p.pro_until, 'suspended', p.suspended, 'trial_used', p.trial_used,
    'mute_offers', p.mute_offers, 'terms_at', p.terms_at,
    'negocio_id', p.negocio_id, 'negocio', n.empresa, 'telefono', p.telefono, 'negocio_telefono', n.telefono,
    'logo', p.logo, 'negocio_logo', n.logo, 'color', p.color, 'negocio_color', n.color,
    'avisos_limpios_at', p.avisos_limpios_at,
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin())
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;

revoke all on function public.version_mayor(text, text) from public, anon;
revoke all on function public.admin_liberar_version(text) from public, anon;
revoke all on function public.avisar_version_nueva(text) from public, anon, authenticated;
revoke all on function public.limpiar_mis_avisos() from public, anon;
grant execute on function public.version_mayor(text, text), public.admin_liberar_version(text), public.limpiar_mis_avisos(),
  public.my_account() to authenticated;

-- =====================================================================
--  VERSIÓN 4.3: 📷 foto de producto (1 por producto, Free y Pro).
--  La app la achica a ~20-35 KB; el cliente la descarga una vez y queda
--  guardada en su celular (solo vuelve a bajar si cambia).
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '4.3'::text $$;

alter table public.catalog_items add column if not exists foto text;
alter table public.catalog_items add column if not exists foto_at timestamptz;

create or replace function public.set_foto_producto(p_key text, p_foto text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare f text := nullif(trim(coalesce(p_foto, '')), ''); t timestamptz := case when f is null then null else now() end;
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  if f is not null and (f !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$' or length(f) > 60000) then
    raise exception 'Foto no válida o muy pesada';
  end if;
  update public.catalog_items set foto = f, foto_at = t where owner_id = auth.uid() and client_key = p_key;
  if not found then raise exception 'Primero guarda el producto en tu catálogo'; end if;
  return t;
end $$;

-- Qué productos tienen foto y su versión (liviano: sin la imagen).
create or replace function public.fotos_catalogo(p_negocio uuid)
returns table (clave text, v bigint)
language sql stable security definer set search_path = '' as $$
  select c.client_key, (extract(epoch from c.foto_at) * 1000)::bigint
  from public.catalog_items c
  where c.owner_id = p_negocio and c.foto is not null
    and (c.owner_id = auth.uid() or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio))
    and (not c.solo_premium or public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin())
$$;

-- Las fotos que el celular aún no tiene guardadas.
create or replace function public.fotos_productos(p_negocio uuid, p_claves text[])
returns table (clave text, foto text, v bigint)
language sql stable security definer set search_path = '' as $$
  select c.client_key, c.foto, (extract(epoch from c.foto_at) * 1000)::bigint
  from public.catalog_items c
  where c.owner_id = p_negocio and c.client_key = any(p_claves) and c.foto is not null
    and (c.owner_id = auth.uid() or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio))
    and (not c.solo_premium or public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin())
  limit 60
$$;

-- Uso del servidor: las fotos de productos suman a "imágenes".
create or replace function public.admin_uso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare almacen bigint := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  begin
    select coalesce(sum((metadata ->> 'size')::bigint), 0) into almacen from storage.objects;
  exception when others then almacen := 0;
  end;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()), 'db_limite', 500 * 1024 * 1024,
    'archivos_bytes', almacen, 'archivos_limite', 1024 * 1024 * 1024,
    'imagenes_bytes', (select coalesce(sum(length(imagen)), 0) from public.publicaciones)
                      + (select coalesce(sum(length(foto)), 0) from public.catalog_items),
    'empresas', (select count(*) from public.profiles where role = 'user'),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'productos', (select count(*) from public.catalog_items),
    'publicaciones', (select count(*) from public.publicaciones),
    'pedidos', (select count(*) from public.pedidos),
    'mensajes', (select count(*) from public.messages));
end $$;

revoke all on function public.set_foto_producto(text, text) from public, anon;
revoke all on function public.fotos_catalogo(uuid) from public, anon;
revoke all on function public.fotos_productos(uuid, text[]) from public, anon;
grant execute on function public.set_foto_producto(text, text), public.fotos_catalogo(uuid), public.fotos_productos(uuid, text[]),
  public.admin_uso() to authenticated;

-- =====================================================================
--  VERSIÓN 5.0 · Órbita: planes editables, pagos con comprobante, links de
--  2 espacios, pedidos con retención y stock, tienda pública sin cuenta,
--  equipo del negocio, calificaciones por pedido (solo estrellas) y sin VIP.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.0'::text $$;

-- ---------- Roles: equipo del negocio ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'client', 'equipo'));
alter table public.user_invites drop constraint if exists user_invites_role_check;
alter table public.user_invites add constraint user_invites_role_check check (role in ('user', 'client', 'equipo'));
alter table public.profiles add column if not exists slug text;
create unique index if not exists profiles_slug_idx on public.profiles (slug) where slug is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv public.user_invites;
  es_admin boolean := lower(new.email) = public.admin_email();
begin
  select * into inv from public.user_invites
  where email = lower(new.email) and created_at > now() - interval '1 hour';
  if not es_admin and inv.email is null then
    raise exception 'El registro está cerrado. Pide tu acceso a tu tienda o al administrador.';
  end if;
  insert into public.profiles (id, email, empresa, role, negocio_id, created_by)
  values (new.id, lower(new.email), left(coalesce(nullif(meta ->> 'empresa', ''), inv.nombre, ''), 80),
    case when es_admin then 'admin' else inv.role end,
    case when not es_admin and inv.role in ('client', 'equipo') then inv.negocio_id end, inv.created_by)
  on conflict (id) do nothing;
  delete from public.user_invites where email = lower(new.email);
  return new;
end $$;

-- Negocio con el que trabaja una persona (dueño, admin o equipo).
create or replace function public.negocio_de(u uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p.role in ('user', 'admin') then p.id when p.role = 'equipo' then p.negocio_id end
  from public.profiles p where p.id = u and not p.suspended
$$;

-- Dirección corta de la tienda (fichapro…/t/?s=dulces-rosita).
create or replace function public.asegurar_slug(u uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare b text; s text; i int := 1;
begin
  select slug into s from public.profiles where id = u;
  if s is not null then return s; end if;
  select trim(both '-' from left(regexp_replace(lower(translate(coalesce(nullif(empresa, ''), split_part(email, '@', 1)),
           'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouaeiounnuu')), '[^a-z0-9]+', '-', 'g'), 40)) into b from public.profiles where id = u;
  if coalesce(b, '') = '' then b := 'tienda'; end if;
  s := b;
  while exists (select 1 from public.profiles where slug = s) loop i := i + 1; s := b || '-' || i; end loop;
  update public.profiles set slug = s where id = u;
  return s;
end $$;
do $$ declare r record; begin
  for r in select id from public.profiles where role = 'user' and slug is null loop perform public.asegurar_slug(r.id); end loop;
end $$;
create or replace function public.slug_nuevo_negocio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'user' and new.slug is null then perform public.asegurar_slug(new.id); end if;
  return new;
end $$;
drop trigger if exists profiles_slug on public.profiles;
create trigger profiles_slug after insert on public.profiles for each row execute function public.slug_nuevo_negocio();

-- ---------- Planes (todo editable desde el panel) ----------
create table if not exists public.planes (
  codigo       text primary key check (codigo in ('negocio_free', 'negocio_pro', 'cliente_free', 'cliente_pro')),
  nombre       text not null,
  descripcion  text not null default '',
  beneficios   jsonb not null default '[]'::jsonb,
  duracion_dias int not null default 30,
  limites      jsonb not null default '{}'::jsonb
);
alter table public.planes enable row level security;
revoke all on public.planes from anon, authenticated;
insert into public.planes (codigo, nombre, descripcion, beneficios, limites) values
 ('negocio_free', 'Gratis', 'Para partir', '["Tienda con link y QR", "Caja Rápida", "Pedidos online"]',
  '{"productos": 50, "clientes": 50, "fichas": 10, "respuestas": 3, "equipo": 0, "pedidos_mes": 30}'),
 ('negocio_pro', 'Pro', 'Todo Órbita', '["Hasta 200 productos y 300 clientes", "60 fichas y todas las plantillas", "Equipo de hasta 5 personas", "Pedidos online ilimitados", "Cupones, sellos y estadísticas", "Push y respaldo diario"]',
  '{"productos": 200, "clientes": 300, "fichas": 60, "respuestas": 20, "equipo": 5, "pedidos_mes": 100000}'),
 ('cliente_free', 'Gratis', 'Cliente', '[]', '{"contactos": 3, "favoritos": 5, "mensajes_seguidos": 1}'),
 ('cliente_pro', 'Premium', 'Cliente Premium', '["Tu propia Caja con Finanzas", "Colores e ícono a tu gusto", "Hasta 20 contactos y 5 mensajes seguidos", "Favoritos ilimitados"]',
  '{"contactos": 20, "favoritos": 1000, "mensajes_seguidos": 5}')
on conflict (codigo) do nothing;
update public.planes set descripcion = 'Todo Órbita' where codigo = 'negocio_pro' and descripcion = 'Todo FichaPro';  -- nuevo nombre de la app

create or replace function public.plan_de(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p.role = 'client' then 'cliente_' else 'negocio_' end
         || case when public.is_pro(case when p.role = 'equipo' then p.negocio_id else p.id end) then 'pro' else 'free' end
  from public.profiles p where p.id = u
$$;
create or replace function public.limite(u uuid, k text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (limites ->> k)::int from public.planes where codigo = public.plan_de(u)), 0)
$$;
create or replace function public.planes_publicos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(codigo, jsonb_build_object('nombre', nombre, 'descripcion', descripcion, 'beneficios', beneficios,
    'duracion_dias', duracion_dias, 'limites', limites)), '{}'::jsonb) from public.planes
$$;
create or replace function public.admin_plan_guardar(p_codigo text, p_nombre text, p_descripcion text, p_beneficios jsonb,
                                                     p_duracion int, p_limites jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if jsonb_typeof(coalesce(p_limites, '{}')) <> 'object' or jsonb_typeof(coalesce(p_beneficios, '[]')) <> 'array' then raise exception 'Datos no válidos'; end if;
  update public.planes set nombre = left(trim(coalesce(p_nombre, '')), 40), descripcion = left(trim(coalesce(p_descripcion, '')), 300),
    beneficios = p_beneficios, duracion_dias = greatest(1, least(coalesce(p_duracion, 30), 3650)), limites = limites || p_limites
  where codigo = p_codigo;
  if not found then raise exception 'Plan no encontrado'; end if;
  perform public.auditar('Plan editado', p_codigo);
end $$;

-- ---------- Reglas (minutos, días) ----------
create or replace function public.regla(k text, def int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::int from public.app_settings where key = 'regla_' || k and value ~ '^[0-9]+$'), def)
$$;
create or replace function public.reglas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('retencion_min', public.regla('retencion_min', 30), 'cancel_min', public.regla('cancel_min', 10),
    'comprobantes_dias', public.regla('comprobantes_dias', 30), 'aviso1_dias', public.regla('aviso1_dias', 15),
    'aviso2_dias', public.regla('aviso2_dias', 5), 'dias_regalo', public.regla('dias_regalo', 0))
$$;
create or replace function public.admin_set_regla(p_k text, p_v int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_k not in ('retencion_min', 'cancel_min', 'comprobantes_dias', 'aviso1_dias', 'aviso2_dias', 'dias_regalo') then raise exception 'Regla no válida'; end if;
  if p_v is null or p_v < 0 or p_v > 10000 then raise exception 'Valor no válido'; end if;
  insert into public.app_settings (key, value) values ('regla_' || p_k, p_v::text) on conflict (key) do update set value = excluded.value;
  perform public.auditar('Regla', p_k || ' = ' || p_v);
end $$;

-- ---------- Registro de cambios del administrador ----------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  accion text not null, detalle text not null default '', created_at timestamptz not null default now()
);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
create or replace function public.auditar(a text, d text) returns void
language sql security definer set search_path = '' as $$
  insert into public.auditoria (accion, detalle) values (left(a, 80), left(coalesce(d, ''), 300))
$$;
create or replace function public.admin_auditoria() returns setof public.auditoria
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select * from public.auditoria order by id desc limit 150;
end $$;

-- ---------- Links de pago: 2 espacios por tipo, uno activo ----------
create table if not exists public.links_pago (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  tipo     text not null check (tipo in ('pedido', 'premium_negocio', 'premium_cliente')),
  slot     int not null check (slot in (1, 2)),
  titulo   text not null default '',
  url      text not null default '',
  precio   int,
  activo   boolean not null default false,
  primary key (owner_id, tipo, slot)
);
alter table public.links_pago enable row level security;
revoke all on public.links_pago from anon, authenticated;
create or replace function public.set_link_pago(p_tipo text, p_slot int, p_titulo text, p_url text, p_precio int, p_activo boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare u text := trim(coalesce(p_url, ''));
begin
  if p_tipo = 'pedido' then
    if not exists (select 1 from public.profiles where id = auth.uid() and role in ('user', 'admin') and not suspended) then raise exception 'Solo el dueño del negocio'; end if;
  elsif p_tipo in ('premium_negocio', 'premium_cliente') then
    if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  else raise exception 'Tipo no válido'; end if;
  if p_slot not in (1, 2) then raise exception 'Espacio no válido'; end if;
  if u <> '' and u !~* '^https://' then raise exception 'El link debe empezar con https://'; end if;
  if coalesce(p_activo, false) and u = '' then raise exception 'Para activarlo, pega el link de pago'; end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 99999999) then raise exception 'Precio no válido'; end if;
  insert into public.links_pago (owner_id, tipo, slot, titulo, url, precio, activo)
  values (auth.uid(), p_tipo, p_slot, left(trim(coalesce(p_titulo, '')), 80), left(u, 500), p_precio, coalesce(p_activo, false))
  on conflict (owner_id, tipo, slot) do update set titulo = excluded.titulo, url = excluded.url, precio = excluded.precio, activo = excluded.activo;
  if coalesce(p_activo, false) then
    update public.links_pago set activo = false where owner_id = auth.uid() and tipo = p_tipo and slot <> p_slot;
  end if;
  if p_tipo <> 'pedido' then perform public.auditar('Link de pago', p_tipo || ' espacio ' || p_slot || case when p_activo then ' (activo)' else '' end); end if;
end $$;
create or replace function public.mis_links_pago() returns setof public.links_pago
language sql stable security definer set search_path = '' as $$
  select * from public.links_pago where owner_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('user', 'admin')) order by tipo, slot
$$;
create or replace function public.link_activo(o uuid, t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('titulo', titulo, 'url', url, 'precio', precio) from public.links_pago
  where owner_id = o and tipo = t and activo and url <> '' limit 1
$$;
-- Precio y link del Premium que ve cada uno (el del espacio activo).
create or replace function public.premium_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'negocio', public.link_activo(public.admin_id(), 'premium_negocio'), 'cliente', public.link_activo(public.admin_id(), 'premium_cliente'),
    'planes', public.planes_publicos())
$$;

-- ---------- Pagos del Premium al administrador (con comprobante) ----------
create table if not exists public.pagos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tipo        text not null check (tipo in ('premium_negocio', 'premium_cliente')),
  monto       int,
  comprobante text,
  estado      text not null default 'en_revision' check (estado in ('en_revision', 'aprobado', 'rechazado')),
  motivo      text,
  dias        int,
  created_at  timestamptz not null default now(),
  revisado_at timestamptz
);
create index if not exists pagos_estado_idx on public.pagos (estado, created_at desc);
alter table public.pagos enable row level security;
revoke all on public.pagos from anon, authenticated;

create or replace function public.img_ok(i text, maxlen int) returns boolean
language sql immutable as $$ select coalesce(i, '') ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(i) <= maxlen $$;

create or replace function public.subir_pago_premium(p_comprobante text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; t text; l jsonb;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.role not in ('user', 'client') then return jsonb_build_object('ok', false, 'error', 'Solo negocios y clientes'); end if;
  if not public.img_ok(p_comprobante, 400000) then return jsonb_build_object('ok', false, 'error', 'Sube una foto del comprobante'); end if;
  if exists (select 1 from public.pagos where user_id = me.id and estado = 'en_revision') then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes un comprobante en revisión. Te avisamos apenas lo revisemos.');
  end if;
  t := case when me.role = 'client' then 'premium_cliente' else 'premium_negocio' end;
  l := public.link_activo(public.admin_id(), t);
  insert into public.pagos (user_id, tipo, monto, comprobante) values (me.id, t, (l ->> 'precio')::int, p_comprobante);
  perform public.notify_user(public.admin_id(), '💰 Comprobante de ' || coalesce(nullif(me.empresa, ''), me.email),
    'Revisa el pago Premium en Administración → Pagos', 'apps/admin/#pagos');
  return jsonb_build_object('ok', true);
end $$;
drop function if exists public.mis_pagos();
create or replace function public.mis_pagos() returns table (id uuid, tipo text, monto int, estado text, motivo text, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, tipo, monto, estado, motivo, created_at from public.pagos where user_id = auth.uid() order by created_at desc limit 20
$$;
drop function if exists public.admin_pagos(text);
create or replace function public.admin_pagos(p_estado text)
returns table (id uuid, user_id uuid, nombre text, email text, rol text, tipo text, monto int, estado text, motivo text,
               fecha timestamptz, revisado timestamptz, pro_until timestamptz, tiene_comprobante boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select x.id, x.user_id, coalesce(nullif(p.empresa, ''), p.email), p.email, p.role, x.tipo, x.monto, x.estado, x.motivo,
    x.created_at, x.revisado_at, p.pro_until, x.comprobante is not null
  from public.pagos x join public.profiles p on p.id = x.user_id
  where p_estado is null or p_estado = '' or x.estado = p_estado order by x.created_at desc limit 200;
end $$;
create or replace function public.admin_pago_comprobante(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select comprobante from public.pagos where id = p_id);
end $$;
create or replace function public.admin_revisar_pago(p_id uuid, p_aprobar boolean, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pagos; d int; hasta timestamptz;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into x from public.pagos where id = p_id and estado = 'en_revision';
  if x.id is null then raise exception 'Ese pago ya fue revisado'; end if;
  if coalesce(p_aprobar, false) then
    d := (select duracion_dias from public.planes where codigo = case when x.tipo = 'premium_cliente' then 'cliente_pro' else 'negocio_pro' end);
    update public.profiles set plan = 'pro', pro_until = greatest(now(), coalesce(pro_until, now())) + make_interval(days => d), aviso_venc_at = null
    where id = x.user_id returning pro_until into hasta;
    update public.pagos set estado = 'aprobado', dias = d, revisado_at = now() where id = x.id;
    perform public.notify_user(x.user_id, '⭐ ¡Pago aprobado!', 'Tu plan Pro/Premium está activo hasta el ' || to_char(hasta at time zone 'America/Santiago', 'DD-MM-YYYY'), './#plan');
  else
    update public.pagos set estado = 'rechazado', motivo = nullif(left(trim(coalesce(p_motivo, '')), 200), ''), revisado_at = now() where id = x.id;
    perform public.notify_user(x.user_id, '❌ Comprobante rechazado', coalesce(nullif(trim(p_motivo), ''), 'Revisa el comprobante y vuelve a subirlo.'), './#plan');
  end if;
  perform public.auditar(case when p_aprobar then 'Pago aprobado' else 'Pago rechazado' end, x.tipo || ' · ' || x.user_id);
  return jsonb_build_object('ok', true);
end $$;

-- Dar / quitar Premium, suspender y eliminar cuentas (admin).
create or replace function public.admin_premium(p_user uuid, p_dias int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if coalesce(p_dias, 0) <= 0 then
    update public.profiles set plan = 'free', pro_until = null where id = p_user and role <> 'admin';
  else
    update public.profiles set plan = 'pro', pro_until = greatest(now(), coalesce(case when plan = 'pro' then pro_until end, now())) + make_interval(days => p_dias),
      aviso_venc_at = null where id = p_user and role <> 'admin';
  end if;
  perform public.auditar(case when coalesce(p_dias, 0) <= 0 then 'Quitó Premium' else 'Dio Premium +' || p_dias || ' días' end, p_user::text);
end $$;
create or replace function public.admin_suspender(p_user uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  update public.profiles set suspended = coalesce(p_suspender, false) where id = p_user and role <> 'admin';
  perform public.auditar(case when p_suspender then 'Suspendió' else 'Reactivó' end, p_user::text);
end $$;
create or replace function public.admin_eliminar_cuenta(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select email into e from public.profiles where id = p_user and role <> 'admin';
  if e is null then raise exception 'Cuenta no encontrada'; end if;
  update public.profiles set negocio_id = null where negocio_id = p_user and role = 'client';
  delete from auth.users where id in (select id from public.profiles where negocio_id = p_user and role = 'equipo');
  delete from auth.users where id = p_user;
  perform public.auditar('Eliminó cuenta', e);
end $$;

-- Avisos de vencimiento: 15 y 5 días antes (editables). Al vencer pasa solo a Free.
create or replace function public.avisar_vencimientos() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; faltan int;
begin
  for r in select * from public.profiles where plan = 'pro' and pro_until > now() and not suspended and role in ('user', 'client')
             and (aviso_venc_at is null or aviso_venc_at < now() - interval '20 hours') loop
    faltan := (r.pro_until at time zone 'America/Santiago')::date - public.hoy_cl();
    continue when faltan not in (public.regla('aviso1_dias', 15), public.regla('aviso2_dias', 5));
    insert into public.notifications (owner_id, target_id, audience, channels, title, body, url, send_at)
    values (coalesce(public.admin_id(), r.id), r.id, 'direct', '{push}',
            '⏰ Tu plan ' || case when r.role = 'client' then 'Premium' else 'Pro' end || ' vence en ' || faltan || ' días',
            'Paga con el link y sube el comprobante en Ajustes → Mi plan. Si no se valida a tiempo, pasa a Free.', './#plan', now());
    update public.profiles set aviso_venc_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Sin VIP: los productos/fichas/ofertas VIP se eliminan ----------
delete from public.catalog_items where solo_premium;
update public.catalog_items set precio_premium = null where precio_premium is not null;
delete from public.publicaciones where vip;
delete from public.notifications where solo_premium;
create or replace function public.sin_vip() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'catalog_items' then new.solo_premium := false; new.precio_premium := null; else new.vip := false; end if;
  return new;
end $$;
drop trigger if exists catalog_sin_vip on public.catalog_items;
create trigger catalog_sin_vip before insert or update on public.catalog_items for each row execute function public.sin_vip();
drop trigger if exists publicaciones_sin_vip on public.publicaciones;
create trigger publicaciones_sin_vip before insert or update on public.publicaciones for each row execute function public.sin_vip();
-- El administrador ya no publica productos ni fichas (solo administra).
delete from public.publicaciones where owner_id in (select id from public.profiles where role = 'admin');
delete from public.catalog_items where owner_id in (select id from public.profiles where role = 'admin');

-- ---------- Límites desde los planes ----------
create or replace function public.limite_conexiones(u uuid) returns int
language sql stable security definer set search_path = '' as $$ select public.limite(u, 'contactos') $$;
create or replace function public.chat_limite(a uuid, b uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when pa.role = 'client' and pb.role = 'client' then greatest(1, public.limite(a, 'mensajes_seguidos')) else 3 end
                   from public.profiles pa, public.profiles pb where pa.id = a and pb.id = b), 3)
$$;

create or replace function public.catalog_upsert(p_key text, p_nombre text, p_precio numeric, p_premium numeric, p_categoria text,
                                                 p_vip boolean default false, p_descripcion text default '', p_opciones text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  nuevo boolean; lim int := public.limite(auth.uid(), 'productos');
  ops text := (select string_agg(o, ', ') from (select left(trim(o), 40) o from unnest(string_to_array(coalesce(p_opciones, ''), ',')) o
               where trim(o) <> '' limit 20) z);
begin
  if not public.is_business(auth.uid()) or public.is_admin() then raise exception 'Solo las empresas publican productos'; end if;
  if coalesce(trim(p_nombre), '') = '' or p_precio is null or p_precio < 0 then raise exception 'Revisa nombre y precio'; end if;
  nuevo := not exists (select 1 from public.catalog_items where owner_id = auth.uid() and client_key = p_key);
  if nuevo and (select count(*) from public.catalog_items where owner_id = auth.uid()) >= lim then
    raise exception 'Llegaste al máximo de % productos de tu plan. Pásate a Pro para tener más (o agrupa colores y tallas como opciones).', lim;
  end if;
  insert into public.catalog_items (owner_id, client_key, nombre, precio, categoria, descripcion, opciones)
  values (auth.uid(), left(p_key, 40), left(trim(p_nombre), 80), p_precio, left(trim(coalesce(p_categoria, '')), 40),
          left(trim(coalesce(p_descripcion, '')), 300), coalesce(ops, ''))
  on conflict (owner_id, client_key) do update
    set nombre = excluded.nombre, precio = excluded.precio, categoria = excluded.categoria,
        descripcion = excluded.descripcion, opciones = excluded.opciones, updated_at = now();
  if nuevo then perform public.avisar_publicacion(trim(p_nombre), 'nuevos productos', false); end if;
end $$;

create or replace function public.publicar_ficha(p_key text, p_titulo text, p_detalle text, p_precio text, p_imagen text,
                                                 p_tipo text default 'oferta', p_vip boolean default false,
                                                 p_precio_num numeric default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  img text := nullif(trim(coalesce(p_imagen, '')), '');
  nueva boolean; lim int := public.limite(auth.uid(), 'fichas');
begin
  if not public.is_business(auth.uid()) or public.is_admin() then raise exception 'Solo las empresas publican fichas'; end if;
  if coalesce(trim(p_key), '') = '' or coalesce(trim(p_titulo), '') = '' then raise exception 'La ficha necesita un título'; end if;
  if img is not null and img !~ '^(https://|data:image/(jpeg|png|webp);base64,)' then raise exception 'Imagen no válida'; end if;
  if length(coalesce(img, '')) > 600000 then raise exception 'La imagen es muy pesada'; end if;
  if p_precio_num is not null and (p_precio_num < 0 or p_precio_num > 99999999) then raise exception 'Precio no válido'; end if;
  nueva := not exists (select 1 from public.publicaciones where owner_id = auth.uid() and client_key = p_key);
  if nueva and (select count(*) from public.publicaciones where owner_id = auth.uid()) >= lim then
    raise exception 'Llegaste a % fichas publicadas de tu plan: borra alguna antigua o pásate a Pro.', lim;
  end if;
  insert into public.publicaciones (owner_id, client_key, titulo, detalle, precio, imagen, tipo, precio_num)
  values (auth.uid(), left(p_key, 60), left(trim(p_titulo), 80), left(coalesce(p_detalle, ''), 300), left(coalesce(p_precio, ''), 40), img,
          left(coalesce(nullif(p_tipo, ''), 'oferta'), 20), p_precio_num)
  on conflict (owner_id, client_key) do update
    set titulo = excluded.titulo, detalle = excluded.detalle, precio = excluded.precio, imagen = excluded.imagen,
        tipo = excluded.tipo, precio_num = excluded.precio_num, updated_at = now();
  if nueva then perform public.avisar_publicacion(trim(p_titulo), 'nueva publicación', false); end if;
end $$;

create or replace function public.set_mis_respuestas(p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l jsonb := '[]'::jsonb; x jsonb; t text; lim int := public.limite(auth.uid(), 'respuestas');
begin
  if not public.is_business(auth.uid()) then raise exception 'Las respuestas rápidas son para las empresas'; end if;
  if jsonb_typeof(coalesce(p_lista, '[]'::jsonb)) <> 'array' then raise exception 'Lista no válida'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    t := left(trim(coalesce(x #>> '{}', '')), 200);
    if t <> '' then l := l || to_jsonb(t); end if;
  end loop;
  if jsonb_array_length(l) > lim then raise exception 'Tu plan permite hasta % respuestas rápidas', lim; end if;
  update public.profiles set respuestas = l where id = auth.uid();
  return l;
end $$;

-- Crear cuentas: admin (negocios y clientes), negocio (clientes y equipo), tienda pública (el cliente se registra solo).
create or replace function public.prepare_user_invite(p_caller uuid, p_email text, p_nombre text, p_rol text, p_negocio uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.profiles;
  em text := lower(trim(coalesce(p_email, '')));
  nom text := left(trim(coalesce(p_nombre, '')), 80);
  neg uuid := p_negocio;
  admin boolean;
begin
  select * into c from public.profiles where id = p_caller;
  if c.id is null or c.suspended then return jsonb_build_object('ok', false, 'error', 'Sin permiso'); end if;
  admin := c.role = 'admin' and c.email = public.admin_email();
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Correo no válido'); end if;
  if nom = '' then return jsonb_build_object('ok', false, 'error', 'Escribe el nombre'); end if;
  if exists (select 1 from auth.users where lower(email) = em) then return jsonb_build_object('ok', false, 'error', 'Ese correo ya tiene cuenta'); end if;
  if admin then
    if p_rol not in ('user', 'client') then return jsonb_build_object('ok', false, 'error', 'Tipo de cuenta no válido'); end if;
    if p_rol = 'client' and not exists (select 1 from public.profiles where id = neg and role = 'user' and not suspended) then
      return jsonb_build_object('ok', false, 'error', 'Elige el negocio del cliente');
    end if;
  elsif c.role = 'user' then
    if p_rol not in ('client', 'equipo') then return jsonb_build_object('ok', false, 'error', 'Solo puedes crear clientes y tu equipo'); end if;
    neg := c.id;
    if p_rol = 'client' and (select count(*) from public.profiles where negocio_id = c.id and role = 'client') >= public.limite(c.id, 'clientes') then
      return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de clientes de tu plan (' || public.limite(c.id, 'clientes') || '). Pásate a Pro para tener más.');
    end if;
    if p_rol = 'equipo' and (select count(*) from public.profiles where negocio_id = c.id and role = 'equipo') >= public.limite(c.id, 'equipo') then
      return jsonb_build_object('ok', false, 'error', case when public.limite(c.id, 'equipo') = 0 then 'El equipo es de la versión Pro'
        else 'Llegaste al máximo de ' || public.limite(c.id, 'equipo') || ' personas de equipo' end);
    end if;
    if (select count(*) from public.profiles where created_by = c.id and created_at > now() - interval '1 day') >= 100 then
      return jsonb_build_object('ok', false, 'error', 'Máximo 100 cuentas nuevas por día');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  insert into public.user_invites (email, nombre, role, negocio_id, created_by)
  values (em, nom, p_rol, case when p_rol in ('client', 'equipo') then neg end, c.id)
  on conflict (email) do update set nombre = excluded.nombre, role = excluded.role, negocio_id = excluded.negocio_id,
    created_by = excluded.created_by, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- El cliente crea su cuenta desde la página de la tienda (lo llama la función del servidor).
create or replace function public.prepare_registro_cliente(p_slug text, p_email text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.profiles; em text := lower(trim(coalesce(p_email, ''))); nom text := left(trim(coalesce(p_nombre, '')), 80);
begin
  select * into t from public.profiles where slug = lower(trim(coalesce(p_slug, ''))) and role = 'user' and not suspended;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'Tienda no encontrada'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Correo no válido'); end if;
  if nom = '' then return jsonb_build_object('ok', false, 'error', 'Escribe tu nombre'); end if;
  if exists (select 1 from auth.users where lower(email) = em) then return jsonb_build_object('ok', false, 'error', 'Ese correo ya tiene cuenta: ingresa con él'); end if;
  if (select count(*) from public.profiles where negocio_id = t.id and role = 'client') >= public.limite(t.id, 'clientes') then
    return jsonb_build_object('ok', false, 'error', 'La tienda no recibe más clientes con cuenta por ahora. Puedes pedir sin cuenta.');
  end if;
  if (select count(*) from public.profiles where negocio_id = t.id and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados registros seguidos. Intenta en un rato.');
  end if;
  insert into public.user_invites (email, nombre, role, negocio_id, created_by) values (em, nom, 'client', t.id, null)
  on conflict (email) do update set nombre = excluded.nombre, role = 'client', negocio_id = excluded.negocio_id, created_by = null, created_at = now();
  return jsonb_build_object('ok', true, 'negocio', t.id);
end $$;

-- Equipo del negocio.
create or replace function public.mi_equipo() returns table (id uuid, nombre text, email text, desde timestamptz, visto timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.empresa, p.email, p.created_at, p.visto_at from public.profiles p
  where p.negocio_id = auth.uid() and p.role = 'equipo' and public.is_business(auth.uid()) order by p.created_at
$$;
create or replace function public.quitar_equipo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_id and role = 'equipo' and negocio_id = auth.uid()) then raise exception 'No es de tu equipo'; end if;
  delete from auth.users where id = p_id;
end $$;

-- ---------- Pedidos: retención, comprobante, stock, invitados ----------
alter table public.pedidos alter column cliente_id drop not null;
alter table public.pedidos add column if not exists invitado_nombre text;
alter table public.pedidos add column if not exists invitado_tel text;
alter table public.pedidos add column if not exists token text;
alter table public.pedidos add column if not exists retenido_hasta timestamptz;
alter table public.pedidos add column if not exists comprobante text;
alter table public.pedidos add column if not exists comprobante_at timestamptz;
alter table public.pedidos add column if not exists pagado_at timestamptz;
alter table public.pedidos add column if not exists stock_descontado boolean not null default false;
alter table public.pedidos add column if not exists devolucion text;
alter table public.pedidos add column if not exists motivo text;
create unique index if not exists pedidos_token_idx on public.pedidos (token) where token is not null;
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check check (estado in
  ('pagando', 'en_revision', 'recibido', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado', 'rechazado', 'expirado'));
alter table public.catalog_items add column if not exists stock int;
create table if not exists public.calificaciones (
  pedido_id  uuid not null references public.pedidos (id) on delete cascade,
  de_negocio boolean not null,
  estrellas  int not null check (estrellas between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (pedido_id, de_negocio)
);
alter table public.calificaciones enable row level security;
revoke all on public.calificaciones from anon, authenticated;

-- Unidades apartadas por pedidos que aún no descuentan stock.
create or replace function public.apartado(n uuid, k text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((l ->> 'cant')::int), 0)::int from public.pedidos x, jsonb_array_elements(x.lineas) l
  where x.negocio_id = n and not x.stock_descontado and x.estado in ('pagando', 'en_revision', 'recibido') and l ->> 'clave' = k
$$;
create or replace function public.stock_catalogo(p_negocio uuid) returns table (clave text, stock int, disponible int)
language sql stable security definer set search_path = '' as $$
  select c.client_key, c.stock, greatest(0, c.stock - public.apartado(c.owner_id, c.client_key))
  from public.catalog_items c
  where c.owner_id = p_negocio and c.stock is not null
    and (public.negocio_de(auth.uid()) = p_negocio or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio)
         or exists (select 1 from public.profiles t where t.id = p_negocio and t.slug is not null))
$$;
create or replace function public.set_stock(p_key text, p_stock int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo el dueño del negocio'; end if;
  if p_stock is not null and (p_stock < 0 or p_stock > 1000000) then raise exception 'Stock no válido'; end if;
  update public.catalog_items set stock = p_stock where owner_id = auth.uid() and client_key = p_key;
end $$;
-- Venta en la Caja: descuenta del mismo stock (dueño o equipo).
create or replace function public.caja_descontar(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); it jsonb;
begin
  if n is null then raise exception 'Sin permiso'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update public.catalog_items set stock = greatest(0, stock - least(greatest(coalesce((it ->> 'cant')::int, 0), 0), 999))
    where owner_id = n and client_key = it ->> 'clave' and stock is not null;
  end loop;
end $$;
create or replace function public.mover_stock(p public.pedidos, signo int) returns void
language sql security definer set search_path = '' as $$
  update public.catalog_items c set stock = greatest(0, c.stock + signo * z.cant)
  from (select l ->> 'clave' k, sum((l ->> 'cant')::int) cant from jsonb_array_elements(p.lineas) l group by 1) z
  where c.owner_id = p.negocio_id and c.client_key = z.k and c.stock is not null
$$;

-- Arma las líneas con precios del servidor y revisa stock.
create or replace function public.armar_pedido(p_negocio uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; k text; n int; op text; ops text; nom text; pre numeric; st int; lineas jsonb := '[]'::jsonb; sub numeric := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    return jsonb_build_object('error', 'El pedido está vacío');
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    k := it ->> 'clave'; n := least(greatest(coalesce((it ->> 'cant')::int, 0), 0), 99);
    op := nullif(left(trim(coalesce(it ->> 'opcion', '')), 40), '');
    continue when n = 0 or k is null;
    nom := null; ops := null; st := null;
    if k like 'pub:%' then
      select x.titulo, x.precio_num into nom, pre from public.publicaciones x where x.owner_id = p_negocio and x.id::text = substr(k, 5);
    else
      select c.nombre, c.precio, c.opciones, case when c.stock is null then null else c.stock - public.apartado(p_negocio, k) end
        into nom, pre, ops, st from public.catalog_items c where c.owner_id = p_negocio and c.client_key = k;
    end if;
    if coalesce(ops, '') <> '' then
      if op is null or not exists (select 1 from unnest(string_to_array(ops, ',')) o where lower(trim(o)) = lower(op)) then
        return jsonb_build_object('error', 'Elige el color u opción de "' || nom || '"');
      end if;
    end if;
    if nom is null or pre is null then return jsonb_build_object('error', 'Un producto ya no está disponible: actualiza el pedido'); end if;
    if st is not null and st < n then
      return jsonb_build_object('error', case when st <= 0 then '"' || nom || '" está agotado' else 'De "' || nom || '" quedan ' || st end);
    end if;
    lineas := lineas || jsonb_build_object('nombre', nom || coalesce(' (' || op || ')', ''), 'cant', n, 'precio', pre, 'subtotal', pre * n, 'clave', k, 'opcion', op);
    sub := sub + pre * n;
  end loop;
  if jsonb_array_length(lineas) = 0 then return jsonb_build_object('error', 'El pedido está vacío'); end if;
  if (select count(*) from public.pedidos where negocio_id = p_negocio and created_at >= date_trunc('month', now())) >= public.limite(p_negocio, 'pedidos_mes') then
    return jsonb_build_object('error', 'La tienda alcanzó su máximo de pedidos online este mes. Escríbele por WhatsApp.');
  end if;
  return jsonb_build_object('lineas', lineas, 'sub', sub);
end $$;

create or replace function public.guardar_pedido(p_negocio uuid, p_cliente uuid, p_nombre text, p_tel text, p_items jsonb, p_entrega text,
                                                 p_direccion text, p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb; pct int := 0; desc_ numeric := 0; ped public.pedidos; l jsonb := public.link_activo(p_negocio, 'pedido'); quien text;
begin
  if public.en_vacaciones(p_negocio) then return jsonb_build_object('ok', false, 'error', 'La tienda está de vacaciones. Podrás pedir a su regreso.'); end if;
  if p_entrega not in ('retiro', 'despacho') then return jsonb_build_object('ok', false, 'error', 'Elige despacho o retiro en tienda'); end if;
  if p_entrega = 'despacho' and coalesce(trim(p_direccion), '') = '' then return jsonb_build_object('ok', false, 'error', 'Escribe la dirección de despacho'); end if;
  a := public.armar_pedido(p_negocio, p_items);
  if a ? 'error' then return jsonb_build_object('ok', false, 'error', a ->> 'error'); end if;
  if coalesce(trim(p_cupon), '') <> '' then
    begin pct := public.validar_cupon(p_negocio, p_cupon);
    exception when others then return jsonb_build_object('ok', false, 'error', 'Cupón no válido o vencido'); end;
    desc_ := round((a ->> 'sub')::numeric * pct / 100.0);
    update public.cupones set usos = usos + 1 where owner_id = p_negocio and codigo = upper(regexp_replace(p_cupon, '[^A-Za-z0-9]', '', 'g'));
  end if;
  insert into public.pedidos (negocio_id, cliente_id, invitado_nombre, invitado_tel, lineas, subtotal, descuento, total, cupon, entrega, direccion, nota,
                              estado, retenido_hasta, token)
  values (p_negocio, p_cliente, p_nombre, p_tel, a -> 'lineas', (a ->> 'sub')::numeric, desc_, (a ->> 'sub')::numeric - desc_,
          nullif(upper(regexp_replace(coalesce(p_cupon, ''), '[^A-Za-z0-9]', '', 'g')), ''), p_entrega,
          case when p_entrega = 'despacho' then left(trim(p_direccion), 200) end, nullif(left(trim(coalesce(p_nota, '')), 300), ''),
          case when l is null then 'recibido' else 'pagando' end,
          case when l is null then null else now() + make_interval(mins => public.regla('retencion_min', 30)) end,
          left(replace(gen_random_uuid()::text, '-', ''), 24))
  returning * into ped;
  quien := coalesce(p_nombre, (select coalesce(nullif(empresa, ''), split_part(email, '@', 1)) from public.profiles where id = p_cliente));
  perform public.notify_user(p_negocio, case when l is null then '📦 Nuevo pedido de ' else '⏳ Pedido por pagar de ' end || quien,
    'Total $' || to_char(ped.total, 'FM999G999G999') || ' · ' || case when p_entrega = 'despacho' then 'Despacho' else 'Retiro en tienda' end, 'apps/pedidos/');
  return jsonb_build_object('ok', true, 'id', ped.id, 'token', ped.token, 'subtotal', ped.subtotal, 'descuento', ped.descuento, 'total', ped.total,
    'estado', ped.estado, 'retenido_hasta', ped.retenido_hasta, 'link', l);
end $$;

create or replace function public.crear_pedido(p_negocio uuid, p_items jsonb, p_entrega text, p_direccion text,
                                               p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.puede_comprar(auth.uid(), p_negocio) then return jsonb_build_object('ok', false, 'error', 'No puedes pedirle a esta tienda'); end if;
  if (select count(*) from public.pedidos where cliente_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 20 pedidos por día');
  end if;
  return public.guardar_pedido(p_negocio, auth.uid(), null, null, p_items, p_entrega, p_direccion, p_nota, p_cupon);
end $$;

-- Pedido sin cuenta desde la página pública de la tienda.
create or replace function public.crear_pedido_invitado(p_slug text, p_nombre text, p_tel text, p_items jsonb, p_entrega text,
                                                        p_direccion text, p_nota text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid; nom text := left(trim(coalesce(p_nombre, '')), 60); tel text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
begin
  select id into t from public.profiles where slug = lower(trim(coalesce(p_slug, ''))) and role = 'user' and not suspended;
  if t is null then return jsonb_build_object('ok', false, 'error', 'Tienda no encontrada'); end if;
  if nom = '' then return jsonb_build_object('ok', false, 'error', 'Escribe tu nombre'); end if;
  if length(tel) < 8 or length(tel) > 15 then return jsonb_build_object('ok', false, 'error', 'Escribe tu WhatsApp (con código de país, ej: 56912345678)'); end if;
  if (select count(*) from public.pedidos where negocio_id = t and invitado_tel = tel and estado in ('pagando', 'en_revision', 'recibido')) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes 3 pedidos pendientes en esta tienda');
  end if;
  if (select count(*) from public.pedidos where negocio_id = t and cliente_id is null and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'La tienda recibió muchos pedidos seguidos. Intenta en un rato.');
  end if;
  return public.guardar_pedido(t, null, nom, tel, p_items, p_entrega, p_direccion, p_nota, null);
end $$;

-- ¿Quién mira el pedido? (cliente con cuenta, invitado con su enlace, o la tienda/equipo)
create or replace function public.pedido_ref(p_ref text) returns public.pedidos
language sql stable security definer set search_path = '' as $$
  select x.* from public.pedidos x
  where (length(coalesce(p_ref, '')) = 24 and x.token = p_ref)
     or (p_ref ~ '^[0-9a-f-]{36}$' and x.id::text = p_ref and (x.cliente_id = auth.uid() or public.negocio_de(auth.uid()) = x.negocio_id))
  limit 1
$$;

create or replace function public.ver_pedido(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); t public.profiles;
begin
  if x.id is null then return null; end if;
  select * into t from public.profiles where id = x.negocio_id;
  return jsonb_build_object('id', x.id, 'token', x.token, 'estado', x.estado, 'lineas', x.lineas, 'subtotal', x.subtotal, 'descuento', x.descuento,
    'total', x.total, 'entrega', x.entrega, 'direccion', x.direccion, 'nota', x.nota, 'fecha', x.created_at, 'retenido_hasta', x.retenido_hasta,
    'tiene_comprobante', x.comprobante is not null, 'devolucion', x.devolucion, 'motivo', x.motivo, 'nombre', x.invitado_nombre,
    'tienda', jsonb_build_object('nombre', t.empresa, 'slug', t.slug, 'logo', t.logo, 'color', t.color, 'telefono', t.telefono, 'datos_pago', t.datos_pago),
    'link', case when x.estado = 'pagando' then public.link_activo(x.negocio_id, 'pedido') end,
    'cancel_min', public.regla('cancel_min', 10),
    'calificado', exists (select 1 from public.calificaciones c where c.pedido_id = x.id and not c.de_negocio));
end $$;

create or replace function public.subir_comprobante(p_ref text, p_img text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref);
begin
  if x.id is null or (x.cliente_id is not null and x.cliente_id is distinct from auth.uid() and x.token is distinct from p_ref) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;
  if x.estado <> 'pagando' then return jsonb_build_object('ok', false, 'error', case when x.estado = 'expirado' then 'Se acabó el tiempo para pagar: haz el pedido de nuevo' else 'Este pedido ya no espera pago' end); end if;
  if x.retenido_hasta < now() then
    update public.pedidos set estado = 'expirado' where id = x.id;
    return jsonb_build_object('ok', false, 'error', 'Se acabó el tiempo para pagar: haz el pedido de nuevo');
  end if;
  if not public.img_ok(p_img, 400000) then return jsonb_build_object('ok', false, 'error', 'Sube una foto del comprobante'); end if;
  update public.pedidos set estado = 'en_revision', comprobante = p_img, comprobante_at = now(), updated_at = now() where id = x.id;
  perform public.notify_user(x.negocio_id, '🧾 Comprobante por revisar', coalesce(x.invitado_nombre, 'Un cliente') || ' · $' || to_char(x.total, 'FM999G999G999'), 'apps/pedidos/');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.aviso_cliente(x public.pedidos, titulo text, cuerpo text) returns void
language sql security definer set search_path = '' as $$
  select public.notify_user(x.cliente_id, titulo, cuerpo, 'apps/catalogo/?v=pedidos') where x.cliente_id is not null
$$;

-- La tienda (o su equipo) aprueba o rechaza el comprobante. Al aprobar se descuenta el stock.
create or replace function public.revisar_comprobante(p_id uuid, p_aprobar boolean, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos;
begin
  select * into x from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid()) and estado = 'en_revision';
  if x.id is null then raise exception 'Pedido no encontrado o ya revisado'; end if;
  if coalesce(p_aprobar, false) then
    perform public.mover_stock(x, -1);
    update public.pedidos set estado = 'preparando', pagado_at = now(), stock_descontado = true, updated_at = now() where id = x.id;
    perform public.aviso_cliente(x, '✅ Pago aprobado', 'Estamos preparando tu pedido');
  else
    update public.pedidos set estado = 'rechazado', motivo = nullif(left(trim(coalesce(p_motivo, '')), 200), ''), updated_at = now() where id = x.id;
    perform public.aviso_cliente(x, '❌ Comprobante rechazado', coalesce(nullif(trim(p_motivo), ''), 'Escríbele a la tienda'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.comprobante_pedido(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select comprobante from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid())
$$;

-- Cancelar (cliente o invitado): con devolución dentro de los primeros N minutos tras pagar.
create or replace function public.cancelar_pedido(p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); dev text;
begin
  if x.id is null or (x.cliente_id is not null and x.cliente_id is distinct from auth.uid() and x.token is distinct from p_ref) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;
  if x.estado not in ('pagando', 'en_revision', 'recibido', 'preparando') then return jsonb_build_object('ok', false, 'error', 'Este pedido ya no se puede cancelar'); end if;
  dev := case when x.comprobante_at is null then null
              when now() - x.comprobante_at <= make_interval(mins => public.regla('cancel_min', 10)) then 'pendiente' else 'sin_devolucion' end;
  if x.stock_descontado then perform public.mover_stock(x, 1); end if;
  update public.pedidos set estado = 'cancelado', devolucion = dev, stock_descontado = false, updated_at = now() where id = x.id;
  perform public.notify_user(x.negocio_id, '❌ Pedido cancelado por el cliente',
    coalesce(x.invitado_nombre, 'Cliente') || case when dev = 'pendiente' then ' · 💸 Devuelve el pago' else '' end, 'apps/pedidos/');
  return jsonb_build_object('ok', true, 'devolucion', dev);
end $$;
create or replace function public.marcar_devuelto(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.pedidos set devolucion = 'hecha' where id = p_id and negocio_id = public.negocio_de(auth.uid()) and devolucion = 'pendiente'
$$;

-- Cada minuto: los pedidos sin comprobante a tiempo se liberan solos.
create or replace function public.expirar_retenciones() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.pedidos set estado = 'expirado', updated_at = now() where estado = 'pagando' and retenido_hasta < now();
  get diagnostics n = row_count;
  return n;
end $$;

drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and q.de_negocio),
         (select round(avg(q.estrellas), 1) from public.calificaciones q join public.pedidos y on y.id = q.pedido_id
          where q.de_negocio and ((x.cliente_id is not null and y.cliente_id = x.cliente_id) or (x.cliente_id is null and y.invitado_tel = x.invitado_tel)))
  from public.pedidos x left join public.profiles c on c.id = x.cliente_id
  where x.negocio_id = public.negocio_de(auth.uid())
    and (p_estado is null or (p_estado = 'activos' and x.estado in ('recibido', 'preparando', 'listo', 'en_camino'))
         or (p_estado = 'revisar' and x.estado = 'en_revision') or (p_estado = 'pagando' and x.estado = 'pagando')
         or (p_estado = 'devolver' and x.devolucion = 'pendiente')
         or (p_estado = 'historial' and x.estado in ('entregado', 'cancelado', 'rechazado', 'expirado')) or x.estado = p_estado)
  order by x.created_at desc limit 300
$$;

drop function if exists public.mis_pedidos(uuid);
create or replace function public.mis_pedidos(p_negocio uuid default null)
returns table (id uuid, negocio text, lineas jsonb, subtotal numeric, descuento numeric, total numeric, cupon text,
               entrega text, direccion text, nota text, estado text, fecha timestamptz, actualizado timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, calificado boolean, token text)
language sql stable security definer set search_path = '' as $$
  select x.id, case when t.role = 'admin' then 'CodeFix' else t.empresa end, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at, x.retenido_hasta, x.comprobante is not null, x.devolucion,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and not q.de_negocio), x.token
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;

create or replace function public.actualizar_pedido(p_id uuid, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ped public.pedidos; t public.profiles; s public.sellos; txt text;
begin
  if p_estado not in ('preparando', 'listo', 'en_camino', 'entregado', 'cancelado') then raise exception 'Estado no válido'; end if;
  select * into ped from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid());
  if ped.id is null then raise exception 'Pedido no encontrado'; end if;
  if ped.estado in ('pagando', 'en_revision') and p_estado <> 'cancelado' then raise exception 'Primero revisa el comprobante del pago'; end if;
  if ped.estado in ('entregado', 'cancelado', 'rechazado', 'expirado') then raise exception 'Este pedido ya está cerrado'; end if;
  if p_estado = 'cancelado' and ped.stock_descontado then perform public.mover_stock(ped, 1); end if;
  if p_estado in ('preparando', 'listo', 'en_camino', 'entregado') and not ped.stock_descontado then perform public.mover_stock(ped, -1); end if;
  update public.pedidos set estado = p_estado, updated_at = now(),
    stock_descontado = p_estado <> 'cancelado',
    devolucion = case when p_estado = 'cancelado' and ped.comprobante is not null then 'pendiente' else devolucion end
  where id = p_id returning * into ped;
  select * into t from public.profiles where id = ped.negocio_id;
  txt := case p_estado when 'preparando' then '👨‍🍳 Estamos preparando tu pedido' when 'listo' then '✅ Tu pedido está listo para retirar'
           when 'en_camino' then '🚚 Tu pedido va en camino' when 'entregado' then '🎉 Pedido entregado. ¡Califica tu compra!'
           else '❌ Tu pedido fue cancelado' end;
  perform public.aviso_cliente(ped, txt, coalesce(nullif(t.empresa, ''), 'Tu tienda') || ' · Total $' || to_char(ped.total, 'FM999G999G999'));
  if p_estado = 'entregado' and ped.cliente_id is not null and not ped.sellado and t.sellos_meta is not null and public.is_pro(t.id) then
    update public.pedidos set sellado = true where id = ped.id;
    insert into public.sellos (negocio_id, cliente_id, cantidad) values (t.id, ped.cliente_id, 1)
    on conflict (negocio_id, cliente_id) do update set cantidad = public.sellos.cantidad + 1 returning * into s;
    if s.cantidad >= t.sellos_meta then
      update public.sellos set cantidad = 0, premios = premios + 1 where negocio_id = t.id and cliente_id = ped.cliente_id;
      perform public.notify_user(ped.cliente_id, '🎁 ¡Completaste tu tarjeta de sellos!', 'Premio: ' || coalesce(t.sellos_premio, 'pregunta en la tienda'), 'apps/catalogo/?v=pedidos');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'estado', p_estado);
end $$;

-- Resumen "Hoy" del negocio.
create or replace function public.hoy_negocio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); d timestamptz := public.hoy_cl()::timestamp at time zone 'America/Santiago';
begin
  if n is null then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'revisar', (select count(*) from public.pedidos where negocio_id = n and estado = 'en_revision'),
    'activos', (select count(*) from public.pedidos where negocio_id = n and estado in ('recibido', 'preparando', 'listo', 'en_camino')),
    'pagando', (select count(*) from public.pedidos where negocio_id = n and estado = 'pagando'),
    'devolver', (select count(*) from public.pedidos where negocio_id = n and devolucion = 'pendiente'),
    'hoy', (select count(*) from public.pedidos where negocio_id = n and created_at >= d),
    'vendido_hoy', (select coalesce(sum(total), 0) from public.pedidos where negocio_id = n and pagado_at >= d or (negocio_id = n and estado = 'entregado' and updated_at >= d and pagado_at is null)),
    'stock_bajo', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'stock', stock)), '[]') from public.catalog_items where owner_id = n and stock is not null and stock <= 3),
    'slug', public.asegurar_slug(n), 'link_pago', public.link_activo(n, 'pedido') is not null,
    'productos', (select count(*) from public.catalog_items where owner_id = n),
    'estrellas', (select round(avg(q.estrellas), 1) from public.calificaciones q join public.pedidos x on x.id = q.pedido_id where x.negocio_id = n and not q.de_negocio));
end $$;

-- ---------- Calificaciones por pedido (solo estrellas, en ambos sentidos) ----------
create or replace function public.calificar_pedido(p_ref text, p_estrellas int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); tienda boolean;
begin
  if x.id is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  if x.estado <> 'entregado' then return jsonb_build_object('ok', false, 'error', 'Podrás calificar cuando el pedido esté entregado'); end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then return jsonb_build_object('ok', false, 'error', 'Elige de 1 a 5 estrellas'); end if;
  tienda := coalesce(public.negocio_de(auth.uid()) = x.negocio_id, false) and x.token is distinct from p_ref;
  if not tienda and x.cliente_id is not null and x.cliente_id is distinct from auth.uid() and x.token is distinct from p_ref then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;
  insert into public.calificaciones (pedido_id, de_negocio, estrellas) values (x.id, tienda, p_estrellas)
  on conflict (pedido_id, de_negocio) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'Este pedido ya fue calificado'); end if;
  return jsonb_build_object('ok', true);
end $$;
-- Promedio de la tienda: calificaciones por pedido + estrellas de las reseñas anteriores.
create or replace function public.estrellas_tienda(n uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('promedio', round(avg(e), 1), 'total', count(e)) from (
    select q.estrellas e from public.calificaciones q join public.pedidos x on x.id = q.pedido_id where x.negocio_id = n and not q.de_negocio
    union all select r.estrellas from public.resenas r where r.negocio_id = n) z
$$;
update public.resenas set texto = '', respuesta = null, destacada = false where texto <> '' or respuesta is not null or destacada;

create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id), 'logo', t.logo, 'color', t.color,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;

-- El equipo ve el catálogo de su negocio (para vender en la Caja).
create or replace function public.catalog_of(p_negocio uuid)
returns table (nombre text, precio numeric, precio_premium numeric, tiene_premium boolean, categoria text,
               clave text, nuevo boolean, solo_premium boolean, bloqueado boolean, descripcion text, opciones text)
language sql stable security definer set search_path = '' as $$
  select c.nombre,
         case when b.bloq then null else c.precio end,
         case when b.ve then c.precio_premium end,
         c.precio_premium is not null, c.categoria, c.client_key, c.created_at > now() - interval '7 days',
         c.solo_premium, b.bloq, c.descripcion, c.opciones
  from public.catalog_items c
  cross join lateral (select public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin() as ve) v
  cross join lateral (select v.ve, c.solo_premium and not v.ve as bloq) b
  where c.owner_id = p_negocio
    and (c.owner_id = auth.uid() or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio) or public.negocio_de(auth.uid()) = p_negocio)
  order by c.categoria, c.nombre
$$;

-- ---------- Tienda pública (sin cuenta) ----------
create or replace function public.tienda_publica(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug, 'telefono', t.telefono, 'horario', t.horario, 'abierto', t.abierto,
    'logo', t.logo, 'color', t.color, 'datos_pago', t.datos_pago,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'retencion_min', public.regla('retencion_min', 30))
  from public.profiles t where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
$$;
create or replace function public.catalogo_publico(p_slug text)
returns table (clave text, nombre text, precio numeric, categoria text, descripcion text, opciones text, nuevo boolean, disponible int, foto_v bigint)
language sql stable security definer set search_path = '' as $$
  select c.client_key, c.nombre, c.precio, c.categoria, c.descripcion, c.opciones, c.created_at > now() - interval '7 days',
         case when c.stock is null then null else greatest(0, c.stock - public.apartado(c.owner_id, c.client_key)) end,
         (extract(epoch from c.foto_at) * 1000)::bigint
  from public.catalog_items c join public.profiles t on t.id = c.owner_id
  where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
  order by c.categoria, c.nombre
$$;
create or replace function public.fotos_publicas(p_slug text, p_claves text[]) returns table (clave text, foto text, v bigint)
language sql stable security definer set search_path = '' as $$
  select c.client_key, c.foto, (extract(epoch from c.foto_at) * 1000)::bigint
  from public.catalog_items c join public.profiles t on t.id = c.owner_id
  where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended and c.client_key = any(p_claves) and c.foto is not null
  limit 30
$$;
create or replace function public.ofertas_publicas(p_slug text)
returns table (id uuid, titulo text, detalle text, precio text, precio_num numeric, imagen text, tipo text, fecha timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.id, x.titulo, x.detalle, x.precio, x.precio_num, x.imagen, x.tipo, x.updated_at
  from public.publicaciones x join public.profiles t on t.id = x.owner_id
  where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
  order by x.updated_at desc limit 20
$$;

-- ---------- Admin: negocios, clientes, resumen y limpieza ----------
drop function if exists public.admin_negocios();
create or replace function public.admin_negocios()
returns table (id uuid, empresa text, email text, telefono text, slug text, logo text, color text, pro boolean, pro_until timestamptz,
               suspendido boolean, visto_at timestamptz, creado timestamptz, clientes int, equipo int, productos int, pedidos_mes int,
               link_pago boolean, estrellas numeric, pago_revision boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select p.id, p.empresa, p.email, p.telefono, p.slug, p.logo, p.color, public.is_pro(p.id), p.pro_until, p.suspended, p.visto_at, p.created_at,
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'client'),
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'equipo'),
    (select count(*)::int from public.catalog_items c where c.owner_id = p.id),
    (select count(*)::int from public.pedidos x where x.negocio_id = p.id and x.created_at >= date_trunc('month', now())),
    public.link_activo(p.id, 'pedido') is not null, (public.estrellas_tienda(p.id) ->> 'promedio')::numeric,
    exists (select 1 from public.pagos g where g.user_id = p.id and g.estado = 'en_revision')
  from public.profiles p where p.role = 'user' order by p.created_at desc;
end $$;
create or replace function public.admin_clientes()
returns table (id uuid, nombre text, email text, negocio_id uuid, negocio text, pro boolean, pro_until timestamptz, suspendido boolean,
               visto_at timestamptz, creado timestamptz, pedidos int, rol text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select p.id, p.empresa, p.email, p.negocio_id, n.empresa, public.is_pro(p.id), p.pro_until, p.suspended, p.visto_at, p.created_at,
    (select count(*)::int from public.pedidos x where x.cliente_id = p.id), p.role
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.role in ('client', 'equipo') order by p.created_at desc limit 2000;
end $$;
create or replace function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m timestamptz := date_trunc('month', now());
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'negocios', (select count(*) from public.profiles where role = 'user'),
    'negocios_pro', (select count(*) from public.profiles where role = 'user' and public.is_pro(id)),
    'activos_7d', (select count(*) from public.profiles where role = 'user' and visto_at > now() - interval '7 days'),
    'por_vencer', (select count(*) from public.profiles where role in ('user', 'client') and plan = 'pro' and pro_until between now() and now() + interval '7 days'),
    'clientes', (select count(*) from public.profiles where role = 'client'),
    'clientes_pro', (select count(*) from public.profiles where role = 'client' and public.is_pro(id)),
    'equipo', (select count(*) from public.profiles where role = 'equipo'),
    'pedidos_mes', (select count(*) from public.pedidos where created_at >= m),
    'pedidos_hoy', (select count(*) from public.pedidos where created_at >= public.hoy_cl()::timestamp at time zone 'America/Santiago'),
    'pagos_por_revisar', (select count(*) from public.pagos where estado = 'en_revision'),
    'ingresos_mes', (select coalesce(sum(monto), 0) from public.pagos where estado = 'aprobado' and revisado_at >= m)
                    + (select coalesce(sum(price), 0) from public.licenses where redeemed_at >= m),
    'version', public.db_version(),
    'uso', jsonb_build_object('db_bytes', pg_database_size(current_database()), 'db_limite', 500 * 1024 * 1024,
      'tablas', (select jsonb_object_agg(c.relname, pg_total_relation_size(c.oid)) from pg_class c join pg_namespace s on s.oid = c.relnamespace
                 where s.nspname = 'public' and c.relkind = 'r'),
      'comprobantes', (select count(*) from public.pedidos where comprobante is not null) + (select count(*) from public.pagos where comprobante is not null),
      'comprobantes_bytes', (select coalesce(sum(length(comprobante)), 0) from public.pedidos) + (select coalesce(sum(length(comprobante)), 0) from public.pagos)));
end $$;

-- Limpieza (diaria y con botones): comprobantes viejos, avisos y mensajes de 7 días, pedidos expirados de 60 días.
create or replace function public.limpiar(p_que text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int := 0; c int := 0; m int := 0; p int := 0; k int := 0; d int := public.regla('comprobantes_dias', 30); r jsonb;
begin
  if p_que in ('comprobantes', 'todo') then
    update public.pedidos set comprobante = null where comprobante is not null and estado not in ('en_revision') and comprobante_at < now() - make_interval(days => d);
    get diagnostics k = row_count;
    update public.pagos set comprobante = null where comprobante is not null and estado <> 'en_revision' and created_at < now() - make_interval(days => d);
    get diagnostics c = row_count; k := k + c; c := 0;
  end if;
  if p_que in ('avisos', 'mensajes', 'todo') then
    r := public.limpiar_registros(); a := (r ->> 'avisos')::int + (r ->> 'campanas')::int; m := (r ->> 'mensajes')::int;
  end if;
  if p_que in ('pedidos', 'todo') then
    delete from public.pedidos where estado in ('expirado', 'rechazado') and updated_at < now() - interval '60 days';
    get diagnostics p = row_count;
  end if;
  return jsonb_build_object('comprobantes', k, 'avisos', a, 'mensajes', m, 'pedidos', p);
end $$;
create or replace function public.admin_limpiar(p_que text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_que not in ('comprobantes', 'avisos', 'mensajes', 'pedidos', 'todo') then raise exception 'Opción no válida'; end if;
  perform public.auditar('Limpieza', p_que);
  return public.limpiar(p_que);
end $$;

-- La dirección de la app (Cloudflare) la guarda el panel del admin: el aviso de versión nueva la usa.
create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := trim(coalesce(p_value, ''));
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_key not in ('payment_link', 'price_business', 'price_client', 'contact_whatsapp', 'version_liberada', 'app_url') then raise exception 'Ajuste no permitido'; end if;
  if p_key in ('payment_link', 'app_url') and v <> '' and v !~* '^https://' then raise exception 'El link debe empezar con https://'; end if;
  if p_key like 'price_%' and v !~ '^[0-9]{0,9}$' then raise exception 'Precio no válido (solo números)'; end if;
  if p_key = 'contact_whatsapp' and v !~ '^[0-9]{0,15}$' then raise exception 'WhatsApp no válido (solo números con código de país)'; end if;
  if p_key = 'version_liberada' and v !~ '^[0-9]+(\.[0-9]+){0,2}$' then raise exception 'Versión no válida'; end if;
  insert into public.app_settings (key, value) values (p_key, left(v, 500)) on conflict (key) do update set value = excluded.value;
end $$;
create or replace function public.avisar_version_nueva(p_version text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := p_version; a uuid := public.admin_id();
  u text := coalesce((select value from public.app_settings where key = 'app_url'), 'https://aplicaciones.juanjosuecastilloloyola.workers.dev/');
begin
  if v is null then
    begin
      execute format($q$select (content::jsonb) ->> 'version' from extensions.http_get(%L)$q$, rtrim(u, '/') || '/version.json?t=' || extract(epoch from now())::bigint) into v;
    exception when others then return null;
    end;
  end if;
  if a is null or not public.version_mayor(v, coalesce((select value from public.app_settings where key = 'version_avisada'), '0'))
     or not public.version_mayor(v, (select value from public.app_settings where key = 'version_liberada')) then
    return null;
  end if;
  insert into public.app_settings (key, value) values ('version_avisada', v) on conflict (key) do update set value = excluded.value;
  perform public.notify_user(a, '🔄 Versión ' || v || ' lista para actualizar', 'Abre la app y toca "Actualizar": se libera sola para todos.', './');
  return v;
end $$;

-- Permisos
revoke all on function public.negocio_de(uuid), public.asegurar_slug(uuid), public.slug_nuevo_negocio(), public.plan_de(uuid), public.limite(uuid, text),
  public.regla(text, int), public.auditar(text, text), public.link_activo(uuid, text), public.img_ok(text, int), public.apartado(uuid, text),
  public.mover_stock(public.pedidos, int), public.armar_pedido(uuid, jsonb),
  public.guardar_pedido(uuid, uuid, text, text, jsonb, text, text, text, text), public.pedido_ref(text), public.aviso_cliente(public.pedidos, text, text),
  public.expirar_retenciones(), public.estrellas_tienda(uuid), public.limpiar(text), public.sin_vip(), public.prepare_registro_cliente(text, text, text)
  from public, anon, authenticated;
grant execute on function public.prepare_registro_cliente(text, text, text) to service_role;
grant execute on function public.negocio_de(uuid), public.plan_de(uuid), public.limite(uuid, text), public.estrellas_tienda(uuid) to authenticated;
revoke all on function public.planes_publicos(), public.reglas(), public.premium_info(), public.tienda_publica(text), public.catalogo_publico(text),
  public.fotos_publicas(text, text[]), public.ofertas_publicas(text), public.crear_pedido_invitado(text, text, text, jsonb, text, text, text),
  public.ver_pedido(text), public.subir_comprobante(text, text), public.cancelar_pedido(text), public.calificar_pedido(text, int),
  public.stock_catalogo(uuid) from public;
grant execute on function public.planes_publicos(), public.reglas(), public.premium_info(), public.tienda_publica(text), public.catalogo_publico(text),
  public.fotos_publicas(text, text[]), public.ofertas_publicas(text), public.crear_pedido_invitado(text, text, text, jsonb, text, text, text),
  public.ver_pedido(text), public.subir_comprobante(text, text), public.cancelar_pedido(text), public.calificar_pedido(text, int),
  public.stock_catalogo(uuid) to anon, authenticated;
revoke all on function public.admin_plan_guardar(text, text, text, jsonb, int, jsonb), public.admin_set_regla(text, int), public.admin_auditoria(),
  public.set_link_pago(text, int, text, text, int, boolean), public.mis_links_pago(), public.subir_pago_premium(text), public.mis_pagos(),
  public.admin_pagos(text), public.admin_pago_comprobante(uuid), public.admin_revisar_pago(uuid, boolean, text), public.admin_premium(uuid, int),
  public.admin_suspender(uuid, boolean), public.admin_eliminar_cuenta(uuid), public.mi_equipo(), public.quitar_equipo(uuid), public.set_stock(text, int),
  public.caja_descontar(jsonb), public.revisar_comprobante(uuid, boolean, text), public.comprobante_pedido(uuid), public.marcar_devuelto(uuid),
  public.pedidos_tienda(text), public.mis_pedidos(uuid), public.hoy_negocio(), public.admin_negocios(), public.admin_clientes(), public.admin_resumen(),
  public.admin_limpiar(text) from public, anon;
grant execute on function public.admin_plan_guardar(text, text, text, jsonb, int, jsonb), public.admin_set_regla(text, int), public.admin_auditoria(),
  public.set_link_pago(text, int, text, text, int, boolean), public.mis_links_pago(), public.subir_pago_premium(text), public.mis_pagos(),
  public.admin_pagos(text), public.admin_pago_comprobante(uuid), public.admin_revisar_pago(uuid, boolean, text), public.admin_premium(uuid, int),
  public.admin_suspender(uuid, boolean), public.admin_eliminar_cuenta(uuid), public.mi_equipo(), public.quitar_equipo(uuid), public.set_stock(text, int),
  public.caja_descontar(jsonb), public.revisar_comprobante(uuid, boolean, text), public.comprobante_pedido(uuid), public.marcar_devuelto(uuid),
  public.pedidos_tienda(text), public.mis_pedidos(uuid), public.hoy_negocio(), public.admin_negocios(), public.admin_clientes(), public.admin_resumen(),
  public.admin_limpiar(text), public.tienda_info(uuid), public.crear_pedido(uuid, jsonb, text, text, text, text), public.publicar_ficha(text, text, text, text, text, text, boolean, numeric),
  public.catalog_upsert(text, text, numeric, numeric, text, boolean, text, text), public.set_mis_respuestas(jsonb), public.admin_set_setting(text, text)
  to authenticated;

-- =====================================================================
--  VERSIÓN 5.1 · Comprobantes con reintento, plan anual, prueba Pro
--  automática y beneficios que venden Premium:
--  Negocio Pro → recordatorio de carrito, reporte semanal, aviso de stock bajo.
--  Cliente Premium → descuento de la tienda, prioridad en la fila, "avísame
--  cuando llegue". Limpieza: sin solicitudes de prueba ni "Novedades CodeFix".
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.1'::text $$;

-- ---------- Columnas nuevas ----------
alter table public.pedidos add column if not exists rechazos int not null default 0;
alter table public.pedidos add column if not exists desc_premium numeric(12, 2) not null default 0;
alter table public.pagos add column if not exists anual boolean not null default false;
alter table public.profiles add column if not exists desc_premium int not null default 0;
alter table public.profiles drop constraint if exists profiles_desc_premium_check;
alter table public.profiles add constraint profiles_desc_premium_check check (desc_premium between 0 and 50);

-- ---------- Reglas: días de Pro gratis para cada negocio nuevo (por defecto 7) ----------
create or replace function public.reglas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('retencion_min', public.regla('retencion_min', 30), 'cancel_min', public.regla('cancel_min', 10),
    'comprobantes_dias', public.regla('comprobantes_dias', 30), 'aviso1_dias', public.regla('aviso1_dias', 15),
    'aviso2_dias', public.regla('aviso2_dias', 5), 'dias_regalo', public.regla('dias_regalo', 7), 'max_rechazos', public.regla('max_rechazos', 3))
$$;
create or replace function public.admin_set_regla(p_k text, p_v int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_k not in ('retencion_min', 'cancel_min', 'comprobantes_dias', 'aviso1_dias', 'aviso2_dias', 'dias_regalo', 'max_rechazos') then raise exception 'Regla no válida'; end if;
  if p_v is null or p_v < 0 or p_v > 10000 then raise exception 'Valor no válido'; end if;
  insert into public.app_settings (key, value) values ('regla_' || p_k, p_v::text) on conflict (key) do update set value = excluded.value;
  perform public.auditar('Regla', p_k || ' = ' || p_v);
end $$;
-- Antes la regla existía pero no hacía nada (quedaba en 0): se pasa a 7 una sola vez.
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'mig_51_regalo') then
    update public.app_settings set value = '7' where key = 'regla_dias_regalo' and value = '0';
    insert into public.app_settings (key, value) values ('mig_51_regalo', '1');
  end if;
end $$;

-- Prueba Pro automática: el negocio nuevo parte con N días de Pro.
create or replace function public.regalo_nuevo_negocio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d int := public.regla('dias_regalo', 7);
begin
  if new.role = 'user' and d > 0 and new.plan = 'free' and new.pro_until is null then
    new.plan := 'pro'; new.pro_until := now() + make_interval(days => d); new.trial_used := true;
  end if;
  return new;
end $$;
drop trigger if exists profiles_regalo on public.profiles;
create trigger profiles_regalo before insert on public.profiles for each row execute function public.regalo_nuevo_negocio();
create or replace function public.slug_nuevo_negocio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'user' and new.slug is null then perform public.asegurar_slug(new.id); end if;
  if new.role = 'user' and new.plan = 'pro' and new.pro_until is not null then
    perform public.notify_user(new.id, '🎁 ¡Tienes Pro gratis hasta el ' || to_char(new.pro_until at time zone 'America/Santiago', 'DD-MM') || '!',
      'Prueba cupones, sellos, equipo, estadísticas y avisos automáticos. Después sigues en Gratis o lo renuevas en Mi plan.', './#plan');
  end if;
  return new;
end $$;

-- Las solicitudes de "probar 7 días" ya no se usan (la prueba es automática; el pago va con comprobante).
create or replace function public.request_pro(p_kind text, p_note text default null) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('ok', false, 'error', 'Ahora se paga con el link y subiendo el comprobante en Mi plan.')
$$;
update public.requests set status = 'rejected', resolved_at = now() where status = 'pending' and kind = 'trial';

-- ---------- Plan anual: links propios y el pago guarda si es anual ----------
alter table public.links_pago drop constraint if exists links_pago_tipo_check;
alter table public.links_pago add constraint links_pago_tipo_check check (tipo in ('pedido', 'premium_negocio', 'premium_cliente', 'anual_negocio', 'anual_cliente'));
create or replace function public.set_link_pago(p_tipo text, p_slot int, p_titulo text, p_url text, p_precio int, p_activo boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare u text := trim(coalesce(p_url, ''));
begin
  if p_tipo = 'pedido' then
    if not exists (select 1 from public.profiles where id = auth.uid() and role in ('user', 'admin') and not suspended) then raise exception 'Solo el dueño del negocio'; end if;
  elsif p_tipo in ('premium_negocio', 'premium_cliente', 'anual_negocio', 'anual_cliente') then
    if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  else raise exception 'Tipo no válido'; end if;
  if p_slot not in (1, 2) then raise exception 'Espacio no válido'; end if;
  if u <> '' and u !~* '^https://' then raise exception 'El link debe empezar con https://'; end if;
  if coalesce(p_activo, false) and u = '' then raise exception 'Para activarlo, pega el link de pago'; end if;
  if p_precio is not null and (p_precio < 0 or p_precio > 99999999) then raise exception 'Precio no válido'; end if;
  insert into public.links_pago (owner_id, tipo, slot, titulo, url, precio, activo)
  values (auth.uid(), p_tipo, p_slot, left(trim(coalesce(p_titulo, '')), 80), left(u, 500),
          case when p_tipo = 'pedido' then null else p_precio end, coalesce(p_activo, false))
  on conflict (owner_id, tipo, slot) do update set titulo = excluded.titulo, url = excluded.url, precio = excluded.precio, activo = excluded.activo;
  if coalesce(p_activo, false) then
    update public.links_pago set activo = false where owner_id = auth.uid() and tipo = p_tipo and slot <> p_slot;
  end if;
  if p_tipo <> 'pedido' then perform public.auditar('Link de pago', p_tipo || ' espacio ' || p_slot || case when p_activo then ' (activo)' else '' end); end if;
end $$;
-- El precio no sirve en los links de pedidos (el total cambia en cada pedido).
update public.links_pago set precio = null where tipo = 'pedido' and precio is not null;
create or replace function public.premium_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'negocio', public.link_activo(public.admin_id(), 'premium_negocio'), 'cliente', public.link_activo(public.admin_id(), 'premium_cliente'),
    'negocio_anual', public.link_activo(public.admin_id(), 'anual_negocio'), 'cliente_anual', public.link_activo(public.admin_id(), 'anual_cliente'),
    'planes', public.planes_publicos())
$$;

drop function if exists public.subir_pago_premium(text);
create or replace function public.subir_pago_premium(p_comprobante text, p_anual boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me public.profiles; t text; l jsonb; anual boolean;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.role not in ('user', 'client') then return jsonb_build_object('ok', false, 'error', 'Solo negocios y clientes'); end if;
  if not public.img_ok(p_comprobante, 400000) then return jsonb_build_object('ok', false, 'error', 'Sube una foto del comprobante'); end if;
  if exists (select 1 from public.pagos where user_id = me.id and estado = 'en_revision') then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes un comprobante en revisión. Te avisamos apenas lo revisemos.');
  end if;
  t := case when me.role = 'client' then 'premium_cliente' else 'premium_negocio' end;
  l := public.link_activo(public.admin_id(), case when me.role = 'client' then 'anual_cliente' else 'anual_negocio' end);
  anual := coalesce(p_anual, false) and l is not null;
  if not anual then l := public.link_activo(public.admin_id(), t); end if;
  insert into public.pagos (user_id, tipo, monto, comprobante, anual) values (me.id, t, (l ->> 'precio')::int, p_comprobante, anual);
  perform public.notify_user(public.admin_id(), '💰 Comprobante de ' || coalesce(nullif(me.empresa, ''), me.email) || case when anual then ' (anual)' else '' end,
    'Revisa el pago Premium en Administración → Pagos', 'apps/admin/#pagos');
  return jsonb_build_object('ok', true);
end $$;
drop function if exists public.mis_pagos();
create or replace function public.mis_pagos() returns table (id uuid, tipo text, monto int, estado text, motivo text, fecha timestamptz, anual boolean, dias int)
language sql stable security definer set search_path = '' as $$
  select id, tipo, monto, estado, motivo, created_at, anual, dias from public.pagos where user_id = auth.uid() order by created_at desc limit 20
$$;
drop function if exists public.admin_pagos(text);
create or replace function public.admin_pagos(p_estado text)
returns table (id uuid, user_id uuid, nombre text, email text, rol text, tipo text, monto int, estado text, motivo text,
               fecha timestamptz, revisado timestamptz, pro_until timestamptz, tiene_comprobante boolean, anual boolean, dias int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select x.id, x.user_id, coalesce(nullif(p.empresa, ''), p.email), p.email, p.role, x.tipo, x.monto, x.estado, x.motivo,
    x.created_at, x.revisado_at, p.pro_until, x.comprobante is not null, x.anual, x.dias
  from public.pagos x join public.profiles p on p.id = x.user_id
  where p_estado is null or p_estado = '' or x.estado = p_estado order by x.created_at desc limit 200;
end $$;
drop function if exists public.admin_revisar_pago(uuid, boolean, text);
create or replace function public.admin_revisar_pago(p_id uuid, p_aprobar boolean, p_motivo text, p_dias int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pagos; d int; hasta timestamptz;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  select * into x from public.pagos where id = p_id and estado = 'en_revision';
  if x.id is null then raise exception 'Ese pago ya fue revisado'; end if;
  if coalesce(p_aprobar, false) then
    d := coalesce(nullif(p_dias, 0), case when x.anual then 365 end,
                  (select duracion_dias from public.planes where codigo = case when x.tipo = 'premium_cliente' then 'cliente_pro' else 'negocio_pro' end), 30);
    if d < 1 or d > 3650 then raise exception 'Días no válidos'; end if;
    update public.profiles set plan = 'pro', pro_until = greatest(now(), coalesce(case when plan = 'pro' then pro_until end, now())) + make_interval(days => d),
      aviso_venc_at = null
    where id = x.user_id returning pro_until into hasta;
    update public.pagos set estado = 'aprobado', dias = d, revisado_at = now() where id = x.id;
    perform public.notify_user(x.user_id, '⭐ ¡Pago aprobado!', 'Tu plan Pro/Premium está activo hasta el ' || to_char(hasta at time zone 'America/Santiago', 'DD-MM-YYYY'), './#plan');
  else
    update public.pagos set estado = 'rechazado', motivo = nullif(left(trim(coalesce(p_motivo, '')), 200), ''), revisado_at = now() where id = x.id;
    perform public.notify_user(x.user_id, '❌ Comprobante rechazado', coalesce(nullif(trim(p_motivo), ''), 'Revisa el comprobante y vuelve a subirlo.') || ' Puedes subir otro en Mi plan.', './#plan');
  end if;
  perform public.auditar(case when p_aprobar then 'Pago aprobado' || coalesce(' (' || d || ' días)', '') else 'Pago rechazado' end, x.tipo || ' · ' || x.user_id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Comprobante rechazado: el pedido vuelve a "Esperando pago" ----------
create or replace function public.revisar_comprobante(p_id uuid, p_aprobar boolean, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; m text := nullif(left(trim(coalesce(p_motivo, '')), 200), ''); hasta timestamptz;
begin
  select * into x from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid()) and estado = 'en_revision';
  if x.id is null then raise exception 'Pedido no encontrado o ya revisado'; end if;
  if coalesce(p_aprobar, false) then
    perform public.mover_stock(x, -1);
    update public.pedidos set estado = 'preparando', pagado_at = now(), stock_descontado = true, motivo = null, updated_at = now() where id = x.id;
    perform public.aviso_cliente(x, '✅ Pago aprobado', 'Estamos preparando tu pedido');
    return jsonb_build_object('ok', true, 'estado', 'preparando');
  end if;
  if x.rechazos + 1 < public.regla('max_rechazos', 3) then
    -- Le da otra oportunidad: el pedido y su stock siguen apartados con tiempo nuevo para subir otro comprobante.
    hasta := greatest(coalesce(x.retenido_hasta, now()), now() + make_interval(mins => public.regla('retencion_min', 30)));
    update public.pedidos set estado = 'pagando', motivo = coalesce(m, 'Comprobante rechazado'), rechazos = x.rechazos + 1,
      comprobante = null, comprobante_at = null, retenido_hasta = hasta, updated_at = now() where id = x.id;
    perform public.aviso_cliente(x, '❌ Comprobante rechazado: sube otro', coalesce(m, 'Revisa el pago') || ' · Tienes ' ||
      greatest(1, round(extract(epoch from hasta - now()) / 60))::int || ' min para subir otro.');
    return jsonb_build_object('ok', true, 'estado', 'pagando');
  end if;
  update public.pedidos set estado = 'rechazado', motivo = m, rechazos = x.rechazos + 1, updated_at = now() where id = x.id;
  perform public.aviso_cliente(x, '❌ Comprobante rechazado', coalesce(m, 'Escríbele a la tienda'));
  return jsonb_build_object('ok', true, 'estado', 'rechazado');
end $$;
-- Al subir el comprobante nuevo se borra el motivo del rechazo anterior.
create or replace function public.subir_comprobante(p_ref text, p_img text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref);
begin
  if x.id is null or (x.cliente_id is not null and x.cliente_id is distinct from auth.uid() and x.token is distinct from p_ref) then
    return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  end if;
  if x.estado <> 'pagando' then return jsonb_build_object('ok', false, 'error', case when x.estado = 'expirado' then 'Se acabó el tiempo para pagar: haz el pedido de nuevo' else 'Este pedido ya no espera pago' end); end if;
  if x.retenido_hasta < now() then
    update public.pedidos set estado = 'expirado' where id = x.id;
    return jsonb_build_object('ok', false, 'error', 'Se acabó el tiempo para pagar: haz el pedido de nuevo');
  end if;
  if not public.img_ok(p_img, 400000) then return jsonb_build_object('ok', false, 'error', 'Sube una foto del comprobante'); end if;
  update public.pedidos set estado = 'en_revision', comprobante = p_img, comprobante_at = now(), motivo = null, updated_at = now() where id = x.id;
  perform public.notify_user(x.negocio_id, '🧾 Comprobante por revisar' || case when x.rechazos > 0 then ' (reintento)' else '' end,
    coalesce(x.invitado_nombre, 'Un cliente') || ' · $' || to_char(x.total, 'FM999G999G999'), 'apps/pedidos/');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Descuento Premium (lo define cada tienda) y prioridad en la fila ----------
create or replace function public.set_desc_premium(p_pct int) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'user' and not suspended) then raise exception 'Solo el dueño del negocio'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 50 then raise exception 'Elige entre 0 y 50%%'; end if;
  update public.profiles set desc_premium = p_pct where id = auth.uid();
  return p_pct;
end $$;
-- ¿Este cliente es Premium para la tienda? (solo clientes con cuenta)
create or replace function public.es_cliente_premium(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select c is not null and exists (select 1 from public.profiles p where p.id = c and p.role = 'client') and public.is_pro(c)
$$;

create or replace function public.guardar_pedido(p_negocio uuid, p_cliente uuid, p_nombre text, p_tel text, p_items jsonb, p_entrega text,
                                                 p_direccion text, p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb; pct int := 0; desc_ numeric := 0; dp numeric := 0; sub numeric; ped public.pedidos; l jsonb := public.link_activo(p_negocio, 'pedido');
  quien text; prem boolean := public.es_cliente_premium(p_cliente);
begin
  if public.en_vacaciones(p_negocio) then return jsonb_build_object('ok', false, 'error', 'La tienda está de vacaciones. Podrás pedir a su regreso.'); end if;
  if p_entrega not in ('retiro', 'despacho') then return jsonb_build_object('ok', false, 'error', 'Elige despacho o retiro en tienda'); end if;
  if p_entrega = 'despacho' and coalesce(trim(p_direccion), '') = '' then return jsonb_build_object('ok', false, 'error', 'Escribe la dirección de despacho'); end if;
  a := public.armar_pedido(p_negocio, p_items);
  if a ? 'error' then return jsonb_build_object('ok', false, 'error', a ->> 'error'); end if;
  sub := (a ->> 'sub')::numeric;
  if coalesce(trim(p_cupon), '') <> '' then
    begin pct := public.validar_cupon(p_negocio, p_cupon);
    exception when others then return jsonb_build_object('ok', false, 'error', 'Cupón no válido o vencido'); end;
    desc_ := round(sub * pct / 100.0);
    update public.cupones set usos = usos + 1 where owner_id = p_negocio and codigo = upper(regexp_replace(p_cupon, '[^A-Za-z0-9]', '', 'g'));
  end if;
  if prem then dp := round(sub * coalesce((select desc_premium from public.profiles where id = p_negocio), 0) / 100.0); end if;
  dp := least(dp, sub - desc_);
  insert into public.pedidos (negocio_id, cliente_id, invitado_nombre, invitado_tel, lineas, subtotal, descuento, desc_premium, total, cupon, entrega, direccion, nota,
                              estado, retenido_hasta, token)
  values (p_negocio, p_cliente, p_nombre, p_tel, a -> 'lineas', sub, desc_ + dp, dp, sub - desc_ - dp,
          nullif(upper(regexp_replace(coalesce(p_cupon, ''), '[^A-Za-z0-9]', '', 'g')), ''), p_entrega,
          case when p_entrega = 'despacho' then left(trim(p_direccion), 200) end, nullif(left(trim(coalesce(p_nota, '')), 300), ''),
          case when l is null then 'recibido' else 'pagando' end,
          case when l is null then null else now() + make_interval(mins => public.regla('retencion_min', 30)) end,
          left(replace(gen_random_uuid()::text, '-', ''), 24))
  returning * into ped;
  quien := coalesce(p_nombre, (select coalesce(nullif(empresa, ''), split_part(email, '@', 1)) from public.profiles where id = p_cliente));
  perform public.notify_user(p_negocio, case when prem then '⭐ ' else '' end || case when l is null then '📦 Nuevo pedido de ' else '⏳ Pedido por pagar de ' end || quien,
    'Total $' || to_char(ped.total, 'FM999G999G999') || ' · ' || case when p_entrega = 'despacho' then 'Despacho' else 'Retiro en tienda' end ||
    case when prem then ' · Cliente Premium' else '' end, 'apps/pedidos/');
  return jsonb_build_object('ok', true, 'id', ped.id, 'token', ped.token, 'subtotal', ped.subtotal, 'descuento', ped.descuento, 'desc_premium', ped.desc_premium,
    'total', ped.total, 'estado', ped.estado, 'retenido_hasta', ped.retenido_hasta, 'link', l);
end $$;

create or replace function public.ver_pedido(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); t public.profiles;
begin
  if x.id is null then return null; end if;
  select * into t from public.profiles where id = x.negocio_id;
  return jsonb_build_object('id', x.id, 'token', x.token, 'estado', x.estado, 'lineas', x.lineas, 'subtotal', x.subtotal, 'descuento', x.descuento,
    'desc_premium', x.desc_premium, 'total', x.total, 'entrega', x.entrega, 'direccion', x.direccion, 'nota', x.nota, 'fecha', x.created_at,
    'retenido_hasta', x.retenido_hasta, 'rechazos', x.rechazos,
    'tiene_comprobante', x.comprobante is not null, 'devolucion', x.devolucion, 'motivo', x.motivo, 'nombre', x.invitado_nombre,
    'tienda', jsonb_build_object('nombre', t.empresa, 'slug', t.slug, 'logo', t.logo, 'color', t.color, 'telefono', t.telefono, 'datos_pago', t.datos_pago),
    'link', case when x.estado = 'pagando' then public.link_activo(x.negocio_id, 'pedido') end,
    'cancel_min', public.regla('cancel_min', 10),
    'calificado', exists (select 1 from public.calificaciones c where c.pedido_id = x.id and not c.de_negocio));
end $$;

drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric,
               premium boolean, desc_premium numeric, rechazos int, motivo text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and q.de_negocio),
         (select round(avg(q.estrellas), 1) from public.calificaciones q join public.pedidos y on y.id = q.pedido_id
          where q.de_negocio and ((x.cliente_id is not null and y.cliente_id = x.cliente_id) or (x.cliente_id is null and y.invitado_tel = x.invitado_tel))),
         pr.premium, x.desc_premium, x.rechazos, x.motivo
  from public.pedidos x left join public.profiles c on c.id = x.cliente_id
  cross join lateral (select c.role = 'client' and public.is_pro(c.id) as premium) pr
  where x.negocio_id = public.negocio_de(auth.uid())
    and (p_estado is null or (p_estado = 'activos' and x.estado in ('recibido', 'preparando', 'listo', 'en_camino'))
         or (p_estado = 'revisar' and x.estado = 'en_revision') or (p_estado = 'pagando' and x.estado = 'pagando')
         or (p_estado = 'devolver' and x.devolucion = 'pendiente')
         or (p_estado = 'historial' and x.estado in ('entregado', 'cancelado', 'rechazado', 'expirado')) or x.estado = p_estado)
  -- ⭐ Los pedidos pendientes de clientes Premium van primero en la fila.
  order by (coalesce(pr.premium, false) and x.estado in ('pagando', 'en_revision', 'recibido', 'preparando', 'listo', 'en_camino')) desc, x.created_at desc
  limit 300
$$;

drop function if exists public.mis_pedidos(uuid);
create or replace function public.mis_pedidos(p_negocio uuid default null)
returns table (id uuid, negocio text, lineas jsonb, subtotal numeric, descuento numeric, total numeric, cupon text,
               entrega text, direccion text, nota text, estado text, fecha timestamptz, actualizado timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, calificado boolean, token text,
               desc_premium numeric, motivo text, rechazos int)
language sql stable security definer set search_path = '' as $$
  select x.id, t.empresa, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at, x.retenido_hasta, x.comprobante is not null, x.devolucion,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and not q.de_negocio), x.token, x.desc_premium, x.motivo, x.rechazos
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;

create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id), 'logo', t.logo, 'color', t.color,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'desc_premium', t.desc_premium)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;

-- Tienda pública: dice si es Pro (para "🔔 Recibir ofertas" sin cuenta, lo que hacía la página vieja de suscribirse).
create or replace function public.tienda_publica(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug, 'telefono', t.telefono, 'horario', t.horario, 'abierto', t.abierto,
    'logo', t.logo, 'color', t.color, 'datos_pago', t.datos_pago,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'retencion_min', public.regla('retencion_min', 30), 'pro', public.is_pro(t.id), 'desc_premium', t.desc_premium)
  from public.profiles t where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
$$;
-- La página vieja de suscribirse redirige a la tienda: necesita su dirección corta.
create or replace function public.negocio_publico(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('empresa', p.empresa, 'pro', public.is_pro(p.id), 'telefono', p.telefono, 'slug', p.slug)
  from public.profiles p where p.id = p_id and p.role = 'user' and not p.suspended
$$;

-- Mi cuenta: suma la dirección corta de la tienda (Órbita → link y QR de la tienda).
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan, 'role', p.role,
    'pro_until', p.pro_until, 'suspended', p.suspended, 'trial_used', p.trial_used,
    'mute_offers', p.mute_offers, 'terms_at', p.terms_at,
    'negocio_id', p.negocio_id, 'negocio', n.empresa, 'telefono', p.telefono, 'negocio_telefono', n.telefono,
    'logo', p.logo, 'negocio_logo', n.logo, 'color', p.color, 'negocio_color', n.color,
    'avisos_limpios_at', p.avisos_limpios_at, 'slug', coalesce(p.slug, n.slug),
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin())
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;

-- ---------- 🛒 Recordatorio de carrito (tiendas Pro) ----------
create table if not exists public.carritos (
  cliente_id uuid not null references public.profiles (id) on delete cascade,
  negocio_id uuid not null references public.profiles (id) on delete cascade,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  avisado_at timestamptz,
  primary key (cliente_id, negocio_id)
);
alter table public.carritos enable row level security;
revoke all on public.carritos from anon, authenticated;
create or replace function public.guardar_carrito(p_negocio uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare l jsonb := '[]'::jsonb; it jsonb;
begin
  if not public.puede_comprar(auth.uid(), p_negocio) or not exists (select 1 from public.profiles where id = auth.uid() and role = 'client') then return; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then return; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 50 loop
    continue when jsonb_typeof(it) <> 'object' or coalesce(it ->> 'clave', '') = '';
    l := l || jsonb_build_object('clave', left(it ->> 'clave', 60), 'cant', least(greatest(coalesce((it ->> 'cant')::int, 1), 1), 99),
      'nombre', left(it ->> 'nombre', 80));
  end loop;
  if jsonb_array_length(l) = 0 then
    delete from public.carritos where cliente_id = auth.uid() and negocio_id = p_negocio;
  else
    insert into public.carritos (cliente_id, negocio_id, items) values (auth.uid(), p_negocio, l)
    on conflict (cliente_id, negocio_id) do update set items = excluded.items, updated_at = now(), avisado_at = null
      where public.carritos.items is distinct from excluded.items;
  end if;
end $$;
create or replace function public.crear_pedido(p_negocio uuid, p_items jsonb, p_entrega text, p_direccion text,
                                               p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.puede_comprar(auth.uid(), p_negocio) then return jsonb_build_object('ok', false, 'error', 'No puedes pedirle a esta tienda'); end if;
  if (select count(*) from public.pedidos where cliente_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 20 pedidos por día');
  end if;
  r := public.guardar_pedido(p_negocio, auth.uid(), null, null, p_items, p_entrega, p_direccion, p_nota, p_cupon);
  if (r ->> 'ok')::boolean then delete from public.carritos where cliente_id = auth.uid() and negocio_id = p_negocio; end if;
  return r;
end $$;
-- Cada hora (de 10 a 20 h de Chile): carritos sin pedir de hace más de 20 horas reciben un aviso, una vez.
create or replace function public.recordar_carritos() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; h int := extract(hour from now() at time zone 'America/Santiago');
begin
  if h < 10 or h > 20 then return 0; end if;
  for r in select k.*, t.empresa from public.carritos k join public.profiles t on t.id = k.negocio_id
           join public.profiles c on c.id = k.cliente_id
           where k.avisado_at is null and k.updated_at < now() - interval '20 hours' and k.updated_at > now() - interval '4 days'
             and not t.suspended and not c.suspended and c.negocio_id = k.negocio_id and public.is_pro(t.id) and not public.en_vacaciones(t.id)
           limit 500 loop
    perform public.notify_user(r.cliente_id, '🛒 Tu pedido en ' || coalesce(nullif(r.empresa, ''), 'la tienda') || ' te espera',
      'Dejaste ' || jsonb_array_length(r.items) || ' producto(s) en el carrito. ¡Termina tu pedido con un toque!', 'apps/catalogo/?v=pedidos');
    update public.carritos set avisado_at = now() where cliente_id = r.cliente_id and negocio_id = r.negocio_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 📊 Reporte semanal (cada lunes, tiendas Pro) ----------
create or replace function public.reporte_semanal() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; ven numeric; cnt int; top text; d timestamptz := now() - interval '7 days';
begin
  for r in select id from public.profiles where role = 'user' and not suspended and public.is_pro(id) loop
    select coalesce(sum(total), 0), count(*) into ven, cnt from public.pedidos
      where negocio_id = r.id and (pagado_at >= d or (pagado_at is null and estado = 'entregado' and updated_at >= d));
    select l ->> 'nombre' into top from public.pedidos x, jsonb_array_elements(x.lineas) l
      where x.negocio_id = r.id and x.created_at >= d and x.estado not in ('cancelado', 'expirado', 'rechazado')
      group by 1 order by sum((l ->> 'cant')::int) desc limit 1;
    perform public.notify_user(r.id,
      case when cnt > 0 then '📊 Tu semana: vendiste $' || to_char(ven, 'FM999G999G999') else '📊 Tu semana en Órbita' end,
      case when cnt > 0 then cnt || ' pedido(s) online' || coalesce(' · Tu producto top fue ' || top, '') || '. ¡Vamos por más!'
           else 'Esta semana no hubo ventas online. Comparte tu tienda por WhatsApp desde Hoy 📣' end, './');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- ⚠️ Stock bajo (tiendas Pro) y 🔔 "Avísame cuando llegue" (clientes Premium) ----------
create table if not exists public.avisos_stock (
  cliente_id uuid not null references public.profiles (id) on delete cascade,
  negocio_id uuid not null references public.profiles (id) on delete cascade,
  clave      text not null,
  created_at timestamptz not null default now(),
  primary key (cliente_id, negocio_id, clave)
);
alter table public.avisos_stock enable row level security;
revoke all on public.avisos_stock from anon, authenticated;
create or replace function public.avisame_stock(p_negocio uuid, p_clave text, p_quiero boolean default true) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.puede_comprar(auth.uid(), p_negocio) then raise exception 'No puedes pedirle a esta tienda'; end if;
  if not coalesce(p_quiero, true) then
    delete from public.avisos_stock where cliente_id = auth.uid() and negocio_id = p_negocio and clave = p_clave;
    return false;
  end if;
  if not public.es_cliente_premium(auth.uid()) then raise exception '⭐ "Avísame cuando llegue" es de Premium'; end if;
  if not exists (select 1 from public.catalog_items where owner_id = p_negocio and client_key = p_clave) then raise exception 'Producto no encontrado'; end if;
  if (select count(*) from public.avisos_stock where cliente_id = auth.uid()) >= 30 then raise exception 'Máximo 30 avisos a la vez'; end if;
  insert into public.avisos_stock (cliente_id, negocio_id, clave) values (auth.uid(), p_negocio, left(p_clave, 60)) on conflict do nothing;
  return true;
end $$;
create or replace function public.mis_avisos_stock(p_negocio uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select clave from public.avisos_stock where cliente_id = auth.uid() and negocio_id = p_negocio
$$;
create or replace function public.stock_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.stock is null or new.stock is not distinct from old.stock then return new; end if;
  if new.stock <= 2 and old.stock > 2 and public.is_pro(new.owner_id) then
    perform public.notify_user(new.owner_id, case when new.stock = 0 then '⚠️ Se agotó ' else '⚠️ Quedan ' || new.stock || ' de ' end || new.nombre,
      'Repón el stock para no perder ventas.', 'apps/caja/#productos');
  end if;
  if new.stock > coalesce(old.stock, 0) and new.stock - public.apartado(new.owner_id, new.client_key) > 0 then
    for r in delete from public.avisos_stock where negocio_id = new.owner_id and clave = new.client_key returning cliente_id loop
      perform public.notify_user(r.cliente_id, '🔔 ¡Llegó ' || new.nombre || '!', 'Volvió a haber stock. Pídelo antes de que se agote.', 'apps/catalogo/');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists catalog_stock_avisos on public.catalog_items;
create trigger catalog_stock_avisos after update of stock on public.catalog_items for each row execute function public.stock_avisos();

-- ---------- 📣 Vender por WhatsApp (Hoy, Pro): ofertas y productos para compartir ----------
create or replace function public.kit_whatsapp() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid());
begin
  if n is null then raise exception 'Sin permiso'; end if;
  if not public.is_pro(n) then raise exception '⭐ Vender por WhatsApp es de la versión Pro'; end if;
  return jsonb_build_object(
    'empresa', (select empresa from public.profiles where id = n), 'slug', (select slug from public.profiles where id = n),
    'ofertas', (select coalesce(jsonb_agg(z), '[]') from (select titulo, precio from public.publicaciones where owner_id = n order by updated_at desc limit 3) z),
    'productos', (select coalesce(jsonb_agg(z), '[]') from (select nombre, precio from public.catalog_items c where owner_id = n
                   and (c.stock is null or c.stock > 0) order by c.created_at desc limit 5) z),
    'imagen', (select imagen from public.publicaciones where owner_id = n and imagen like 'data:image/%' order by updated_at desc limit 1),
    'foto', (select foto from public.catalog_items where owner_id = n and foto is not null order by foto_at desc limit 1));
end $$;

-- ---------- Limpieza: carritos viejos ----------
create or replace function public.limpiar(p_que text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int := 0; c int := 0; m int := 0; p int := 0; k int := 0; d int := public.regla('comprobantes_dias', 30); r jsonb;
begin
  if p_que in ('comprobantes', 'todo') then
    update public.pedidos set comprobante = null where comprobante is not null and estado not in ('en_revision') and comprobante_at < now() - make_interval(days => d);
    get diagnostics k = row_count;
    update public.pagos set comprobante = null where comprobante is not null and estado <> 'en_revision' and created_at < now() - make_interval(days => d);
    get diagnostics c = row_count; k := k + c; c := 0;
  end if;
  if p_que in ('avisos', 'mensajes', 'todo') then
    r := public.limpiar_registros(); a := (r ->> 'avisos')::int + (r ->> 'campanas')::int; m := (r ->> 'mensajes')::int;
  end if;
  if p_que in ('pedidos', 'todo') then
    delete from public.pedidos where estado in ('expirado', 'rechazado') and updated_at < now() - interval '60 days';
    get diagnostics p = row_count;
    delete from public.carritos where updated_at < now() - interval '30 days';
    delete from public.avisos_stock where created_at < now() - interval '90 days';
  end if;
  return jsonb_build_object('comprobantes', k, 'avisos', a, 'mensajes', m, 'pedidos', p);
end $$;

-- ---------- 🏪 Registro abierto de negocios (link y QR públicos: /n/) ----------
-- Cualquier negocio crea su cuenta Free sola (con los días de Pro de regalo) y después compra el Pro.
-- Los clientes y el equipo siguen entrando solo con invitación. Se cierra con la regla "registro_negocios" = 0.
alter table public.profiles add column if not exists rubro text;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv public.user_invites;
  es_admin boolean := lower(new.email) = public.admin_email();
  nom text := left(trim(coalesce(meta ->> 'empresa', '')), 80);
  tel text := left(regexp_replace(coalesce(meta ->> 'telefono', ''), '\D', '', 'g'), 15);
begin
  select * into inv from public.user_invites
  where email = lower(new.email) and created_at > now() - interval '1 hour';
  if not es_admin and inv.email is null then
    if meta ->> 'tipo' = 'negocio' and public.regla('registro_negocios', 1) > 0 then
      if nom = '' then raise exception 'Escribe el nombre de tu negocio'; end if;
      if (select count(*) from public.profiles where role = 'user' and created_by is null and created_at > now() - interval '1 hour') >= 30 then
        raise exception 'Muchos registros seguidos. Intenta en un rato.';
      end if;
      insert into public.profiles (id, email, empresa, role, telefono, rubro)
      values (new.id, lower(new.email), nom, 'user', nullif(tel, ''), left(nullif(trim(coalesce(meta ->> 'rubro', '')), ''), 40))
      on conflict (id) do nothing;
      perform public.notify_user(public.admin_id(), '🏪 Nuevo negocio: ' || nom,
        coalesce(nullif(trim(meta ->> 'rubro'), ''), 'Sin rubro') || ' · ' || lower(new.email) || ' · se registró solo', 'apps/admin/#negocios');
      return new;
    end if;
    raise exception 'El registro está cerrado. Pide tu acceso a tu tienda o al administrador.';
  end if;
  insert into public.profiles (id, email, empresa, role, negocio_id, created_by)
  values (new.id, lower(new.email), left(coalesce(nullif(meta ->> 'empresa', ''), inv.nombre, ''), 80),
    case when es_admin then 'admin' else inv.role end,
    case when not es_admin and inv.role in ('client', 'equipo') then inv.negocio_id end, inv.created_by)
  on conflict (id) do nothing;
  delete from public.user_invites where email = lower(new.email);
  return new;
end $$;
-- ¿Está abierto? (la página /n/ lo pregunta antes de mostrar el formulario)
create or replace function public.registro_negocios_abierto() returns boolean
language sql stable security definer set search_path = '' as $$ select public.regla('registro_negocios', 1) > 0 $$;
create or replace function public.reglas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('retencion_min', public.regla('retencion_min', 30), 'cancel_min', public.regla('cancel_min', 10),
    'comprobantes_dias', public.regla('comprobantes_dias', 30), 'aviso1_dias', public.regla('aviso1_dias', 15),
    'aviso2_dias', public.regla('aviso2_dias', 5), 'dias_regalo', public.regla('dias_regalo', 7), 'max_rechazos', public.regla('max_rechazos', 3),
    'registro_negocios', public.regla('registro_negocios', 1))
$$;
create or replace function public.admin_set_regla(p_k text, p_v int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_k not in ('retencion_min', 'cancel_min', 'comprobantes_dias', 'aviso1_dias', 'aviso2_dias', 'dias_regalo', 'max_rechazos', 'registro_negocios') then
    raise exception 'Regla no válida';
  end if;
  if p_v is null or p_v < 0 or p_v > 10000 then raise exception 'Valor no válido'; end if;
  insert into public.app_settings (key, value) values ('regla_' || p_k, p_v::text) on conflict (key) do update set value = excluded.value;
  perform public.auditar('Regla', p_k || ' = ' || p_v);
end $$;
-- El negocio puede cambiar su rubro en Ajustes → Mi tienda.
create or replace function public.set_mi_rubro(p_rubro text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set rubro = left(nullif(trim(coalesce(p_rubro, '')), ''), 40) where id = auth.uid() and role = 'user'
$$;
-- Admin: el listado de negocios muestra el rubro y si se registró solo.
drop function if exists public.admin_negocios();
create or replace function public.admin_negocios()
returns table (id uuid, empresa text, email text, telefono text, slug text, logo text, color text, pro boolean, pro_until timestamptz,
               suspendido boolean, visto_at timestamptz, creado timestamptz, clientes int, equipo int, productos int, pedidos_mes int,
               link_pago boolean, estrellas numeric, pago_revision boolean, rubro text, autoregistro boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return query select p.id, p.empresa, p.email, p.telefono, p.slug, p.logo, p.color, public.is_pro(p.id), p.pro_until, p.suspended, p.visto_at, p.created_at,
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'client'),
    (select count(*)::int from public.profiles c where c.negocio_id = p.id and c.role = 'equipo'),
    (select count(*)::int from public.catalog_items c where c.owner_id = p.id),
    (select count(*)::int from public.pedidos x where x.negocio_id = p.id and x.created_at >= date_trunc('month', now())),
    public.link_activo(p.id, 'pedido') is not null, (public.estrellas_tienda(p.id) ->> 'promedio')::numeric,
    exists (select 1 from public.pagos g where g.user_id = p.id and g.estado = 'en_revision'), p.rubro, p.created_by is null
  from public.profiles p where p.role = 'user' order by p.created_at desc;
end $$;
create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', case when public.is_pro(t.id) then t.sellos_meta end, 'sellos_premio', t.sellos_premio,
    'pro', public.is_pro(t.id), 'logo', t.logo, 'color', t.color,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'desc_premium', t.desc_premium, 'rubro', t.rubro)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;
revoke all on function public.registro_negocios_abierto(), public.set_mi_rubro(text), public.admin_negocios() from public;
grant execute on function public.registro_negocios_abierto() to anon, authenticated;
grant execute on function public.set_mi_rubro(text), public.admin_negocios() to authenticated;
revoke all on function public.set_mi_rubro(text), public.admin_negocios() from anon;

-- Beneficios nuevos en la lista de los planes (solo si el administrador no los había cambiado).
update public.planes set beneficios = '["🛒 Recordatorio de carrito: el cliente que no terminó su pedido recibe un aviso", "📣 Vende por WhatsApp en 1 toque (foto + ofertas)", "📊 Reporte semanal: cuánto vendiste y tu producto top", "⚠️ Aviso de stock bajo", "Hasta 200 productos y 300 clientes", "60 fichas y todas las plantillas", "Equipo de hasta 5 personas", "Pedidos online ilimitados", "Cupones, sellos y estadísticas", "Push y respaldo diario"]'::jsonb
where codigo = 'negocio_pro' and beneficios = '["Hasta 200 productos y 300 clientes", "60 fichas y todas las plantillas", "Equipo de hasta 5 personas", "Pedidos online ilimitados", "Cupones, sellos y estadísticas", "Push y respaldo diario"]'::jsonb;
update public.planes set beneficios = '["⭐ El descuento Premium de tu tienda en cada pedido", "⭐ Tus pedidos aparecen primero en la fila", "🔔 Avísame cuando llegue (productos agotados)", "Tu propia Caja con Finanzas", "Colores e ícono a tu gusto", "Hasta 20 contactos y 5 mensajes seguidos", "Favoritos ilimitados"]'::jsonb
where codigo = 'cliente_pro' and beneficios = '["Tu propia Caja con Finanzas", "Colores e ícono a tu gusto", "Hasta 20 contactos y 5 mensajes seguidos", "Favoritos ilimitados"]'::jsonb;

-- Permisos 5.1
revoke all on function public.regalo_nuevo_negocio(), public.es_cliente_premium(uuid), public.recordar_carritos(), public.reporte_semanal(),
  public.stock_avisos() from public, anon, authenticated;
revoke all on function public.subir_pago_premium(text, boolean), public.mis_pagos(), public.admin_pagos(text), public.admin_revisar_pago(uuid, boolean, text, int),
  public.pedidos_tienda(text), public.mis_pedidos(uuid), public.set_desc_premium(int), public.guardar_carrito(uuid, jsonb), public.avisame_stock(uuid, text, boolean),
  public.mis_avisos_stock(uuid), public.kit_whatsapp(), public.crear_pedido(uuid, jsonb, text, text, text, text), public.revisar_comprobante(uuid, boolean, text)
  from public, anon;
grant execute on function public.subir_pago_premium(text, boolean), public.mis_pagos(), public.admin_pagos(text), public.admin_revisar_pago(uuid, boolean, text, int),
  public.pedidos_tienda(text), public.mis_pedidos(uuid), public.set_desc_premium(int), public.guardar_carrito(uuid, jsonb), public.avisame_stock(uuid, text, boolean),
  public.mis_avisos_stock(uuid), public.kit_whatsapp(), public.crear_pedido(uuid, jsonb, text, text, text, text), public.revisar_comprobante(uuid, boolean, text)
  to authenticated;

-- =====================================================================
--  VERSIÓN 5.2 · Limpieza del administrador (registro de cambios y
--  cuentas que no se usan) y logo de la marca como respaldo.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.2'::text $$;

-- 📜 Borrar el registro de cambios (solo el administrador). p_dias = 0 borra todo; si no, lo anterior a esos días.
create or replace function public.admin_limpiar_auditoria(p_dias int) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_dias is null or p_dias < 0 then raise exception 'Días no válidos'; end if;
  delete from public.auditoria where created_at < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;
  return n;
end $$;

-- 🧹 Cuentas de negocio que no se usan: sin Pro, sin productos, pedidos, clientes ni fichas,
-- creadas y sin entrar hace p_dias o más. Nunca toca negocios Pro ni al administrador.
create or replace function public.es_cuenta_inactiva(u uuid, p_dias int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = u and p.role = 'user' and not public.is_pro(p.id)
    and p.created_at < now() - make_interval(days => p_dias)
    and coalesce(p.visto_at, p.created_at) < now() - make_interval(days => p_dias)
    and not exists (select 1 from public.catalog_items c where c.owner_id = p.id)
    and not exists (select 1 from public.pedidos x where x.negocio_id = p.id)
    and not exists (select 1 from public.profiles c where c.negocio_id = p.id and c.role = 'client')
    and not exists (select 1 from public.publicaciones f where f.owner_id = p.id)
    and not exists (select 1 from public.pagos g where g.user_id = p.id and g.estado = 'en_revision'))
$$;
create or replace function public.admin_cuentas_inactivas(p_dias int)
returns table (id uuid, empresa text, email text, rubro text, creado timestamptz, visto_at timestamptz, autoregistro boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_dias is null or p_dias < 7 then raise exception 'Elige 7 días o más'; end if;
  return query select p.id, p.empresa, p.email, p.rubro, p.created_at, p.visto_at, p.created_by is null
  from public.profiles p where p.role = 'user' and public.es_cuenta_inactiva(p.id, p_dias)
  order by coalesce(p.visto_at, p.created_at) limit 500;
end $$;
create or replace function public.admin_borrar_inactivas(p_ids uuid[], p_dias int) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_dias is null or p_dias < 7 then raise exception 'Elige 7 días o más'; end if;
  -- Se vuelve a revisar cada cuenta: si en el intertanto la usaron, no se borra.
  for r in select p.id, p.email from public.profiles p where p.id = any(coalesce(p_ids, '{}')) and public.es_cuenta_inactiva(p.id, p_dias) loop
    delete from auth.users where id in (select id from public.profiles where negocio_id = r.id and role = 'equipo');
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  perform public.auditar('Borró cuentas sin uso', n || ' negocio(s) sin actividad en ' || p_dias || ' días');
  return n;
end $$;

-- Logo, color y nombre de la marca (el administrador): se ven cuando una empresa aún no sube su logo,
-- en el ingreso y en el registro de negocios.
create or replace function public.marca_publica() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('logo', p.logo, 'color', p.color, 'nombre', nullif(p.empresa, ''))
  from public.profiles p where p.id = public.admin_id()
$$;

revoke all on function public.admin_limpiar_auditoria(int), public.admin_cuentas_inactivas(int), public.admin_borrar_inactivas(uuid[], int)
  from public, anon;
grant execute on function public.admin_limpiar_auditoria(int), public.admin_cuentas_inactivas(int), public.admin_borrar_inactivas(uuid[], int)
  to authenticated;
revoke all on function public.es_cuenta_inactiva(uuid, int) from public, anon, authenticated;
revoke all on function public.marca_publica() from public;
grant execute on function public.marca_publica() to anon, authenticated;
