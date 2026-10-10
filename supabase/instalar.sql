-- =====================================================================
--  CodeFix · INSTALACIÓN / ACTUALIZACIÓN COMPLETA DEL SERVIDOR (un solo paso)
--  Supabase → SQL Editor → New query → pega TODO → Run.
--  Se puede volver a ejecutar sin perder datos (también sirve para actualizar).
-- =====================================================================

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
    'negocio_id', p.negocio_id, 'negocio', n.empresa,
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
  select jsonb_build_object('empresa', p.empresa, 'pro', public.is_pro(p.id))
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
  if p_audience = 'my_subscribers' and not (public.is_business(auth.uid()) and public.is_pro(auth.uid())) then
    raise exception 'Avisar a tus clientes es de la versión Pro para empresas';
  end if;
  if p_channels is null or cardinality(p_channels) = 0 or not (p_channels <@ array['push', 'email']) then
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
  update public.notifications set status = 'cancelled'
  where id = p_id and status = 'scheduled' and (owner_id = auth.uid() or public.is_admin());
end $$;

-- Avisos del admin que le corresponden al usuario (bandeja dentro de la app).
drop function if exists public.my_inbox();
create or replace function public.my_inbox()
returns table (id uuid, title text, body text, url text, image text, sent_at timestamptz, de text, leido boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select p.* from public.profiles p where p.id = auth.uid())
  select n.id, n.title, n.body, n.url, n.image, n.sent_at,
         case when o.role = 'admin' then 'CodeFix' else o.empresa end,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = me.id)
  from public.notifications n join me on true join public.profiles o on o.id = n.owner_id
  where n.status = 'sent' and n.sent_at > now() - interval '60 days'
    and (n.audience = 'all_users'
         or (me.role = 'user' and (n.audience = 'all_businesses'
               or (n.audience = 'pro_users' and public.is_pro(me.id))
               or (n.audience = 'free_users' and not public.is_pro(me.id))))
         or (me.role = 'client' and (n.audience = 'all_clients'
               or (n.audience = 'my_subscribers' and n.owner_id = me.negocio_id and not me.mute_offers)))
         or (n.audience = 'direct' and n.target_id = me.id and coalesce(n.url, '') not like 'apps/mensajes/%'))
  order by n.sent_at desc limit 40
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
        from public.subscribers s where s.negocio_id = n.owner_id
      union all
      select ps.endpoint, ps.p256dh, ps.auth, null::text, c.empresa
        from public.profiles c join public.push_subscriptions ps on ps.user_id = c.id
        where c.negocio_id = n.owner_id and c.role = 'client' and not c.suspended and not c.mute_offers
      union all
      select null, null, null, c.email, c.empresa from public.profiles c
        where c.negocio_id = n.owner_id and c.role = 'client' and not c.suspended and not c.mute_offers;
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
              and public.is_pro(auth.uid()) and public.is_business(auth.uid()));
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
  where key in ('payment_link', 'price_business', 'price_client', 'contact_whatsapp')
$$;

create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := trim(coalesce(p_value, ''));
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_key not in ('payment_link', 'price_business', 'price_client', 'contact_whatsapp') then
    raise exception 'Ajuste no permitido';
  end if;
  if p_key = 'payment_link' and v <> '' and v !~* '^https://' then raise exception 'El link de pago debe empezar con https://'; end if;
  if p_key like 'price_%' and v !~ '^[0-9]{0,9}$' then raise exception 'Precio no válido (solo números)'; end if;
  if p_key = 'contact_whatsapp' and v !~ '^[0-9]{0,15}$' then raise exception 'WhatsApp no válido (solo números con código de país)'; end if;
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

-- ¿Pueden hablar a y b?
create or replace function public.can_message(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and exists (
    select 1 from public.profiles pa, public.profiles pb
    where pa.id = a and pb.id = b and not pa.suspended
      and (pa.role = 'admin' or pb.role = 'admin' and pa.role = 'user'
           or (pa.role = 'user' and pb.role = 'client' and pb.negocio_id = pa.id)
           or (pa.role = 'client' and pb.role = 'user' and pa.negocio_id = pb.id))
  )
$$;

-- Mensajes que aún puedo enviar seguidos a "otro" (null = sin límite).
create or replace function public.chat_remaining(p_other uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then null else greatest(0, 3 - (
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
      return jsonb_build_object('ok', false, 'error', 'Ya enviaste 3 mensajes seguidos. Espera la respuesta para escribir de nuevo.');
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
create or replace function public.catalog_of(p_negocio uuid)
returns table (nombre text, precio numeric, precio_premium numeric, tiene_premium boolean, categoria text)
language sql stable security definer set search_path = '' as $$
  select c.nombre, c.precio,
         case when public.is_pro(auth.uid()) or c.owner_id = auth.uid() or public.is_admin() then c.precio_premium end,
         c.precio_premium is not null, c.categoria
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
       >= (case when public.is_pro(c.id) then 2000 else 30 end) then
      return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de clientes de tu plan (Free: 30)');
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

-- Clientes de mi empresa (para la empresa) — solo nombre y fecha.
create or replace function public.my_clients()
returns table (id uuid, nombre text, email text, creado timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.empresa, p.email, p.created_at from public.profiles p
  where p.role = 'client' and p.negocio_id = auth.uid()
  order by p.created_at desc limit 2000
$$;

revoke all on function public.prepare_user_invite(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_user_invite(text) from public, anon, authenticated;
revoke all on function public.my_clients() from public, anon;
grant execute on function public.my_clients() to authenticated;
revoke all on public.user_invites from anon, authenticated;

-- =====================================================================
--  Envío automático: cada minuto llama a la función "enviar".
--  Pega este archivo en Supabase → SQL Editor → Run (después de schema.sql
--  y de crear la Edge Function "enviar").
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'enviar-notificaciones';

select cron.schedule(
  'enviar-notificaciones',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gilsamacgappycibcqhq.supabase.co/functions/v1/enviar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
