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
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Administrador (dueño) o socio (núcleo: cfx_socios; los agrega el administrador desde el Centro de Mando).
  -- Sin sesión (p. ej. al instalar) no se llega a cfx_es_socio, que se crea más abajo.
  if auth.uid() is null then return false; end if;
  return exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role = 'admin' and not p.suspended
      and u.email_confirmed_at is not null
      and lower(u.email) = public.admin_email()
  ) or public.cfx_es_socio();
end $$;

create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and not p.suspended
      and (p.role = 'admin' or (p.plan = 'pro' and (p.pro_until is null or p.pro_until > now())))
  )
$$;
-- G19 (5.39): con "Vender módulos" prendido (CM → Apps → 🧩), estas funciones son módulos que el negocio compra aparte
-- (sea Free o Premium). Apagado: siguen siendo del Pro, como antes.
create or replace function public.pro_o_modulo(n uuid, k text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = n and p.role = 'admin') then return true; end if;
  if to_regprocedure('public.cfx_venta_on()') is not null and public.cfx_venta_on() and k = any(public.cfx_modulos_de_app()) then
    return public.cfx_modulo_de(k, n);
  end if;
  return public.is_pro(n);
end $$;
-- Para la app: {"equipo": true, ...} del negocio de la cuenta (null = venta apagada o no es negocio).
create or replace function public.mis_modulos(u uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid;
begin
  if to_regprocedure('public.cfx_venta_on()') is null or not public.cfx_venta_on() then return null; end if;
  n := public.cfx_negocio_cuenta(u);
  if n is null then return null; end if;
  return (select jsonb_object_agg(k, public.pro_o_modulo(n, k)) from unnest(public.cfx_modulos_de_app()) k);
end $$;
-- Con el módulo, el equipo tiene el cupo del plan más grande; sin venta de módulos, el de su plan.
create or replace function public.limite_equipo(n uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.mis_modulos(n) is not null then
    return case when public.pro_o_modulo(n, 'equipo') then coalesce((select max((limites ->> 'equipo')::int) from public.planes), 0) else 0 end;
  end if;
  return public.limite(n, 'equipo');
end $$;
revoke all on function public.pro_o_modulo(uuid, text), public.mis_modulos(uuid), public.limite_equipo(uuid) from public, anon, authenticated;

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




-- El usuario pega la key: si es válida su cuenta pasa a Pro.
-- Devuelve {ok, error|account}. Bloquea 1 hora tras 10 intentos fallidos.
create or replace function public.redeem_license(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin  -- A5 (bd 5.30): las keys viven en cfx_keys (núcleo; se crean en el Centro de Mando). Se mantiene el nombre que usan las pantallas.
  r := public.cfx_key_canjear(p_key);  -- bd 5.31: la key mala vuelve como {error} (sin raise) para que el intento fallido quede anotado.
  if r ? 'error' then return jsonb_build_object('ok', false, 'error', r ->> 'error'); end if;
  return jsonb_build_object('ok', true, 'account', public.my_account());
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
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
  if not public.pro_o_modulo(p_negocio, 'campanas') then
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
  if p_audience = 'my_subscribers' and cardinality(p_channels) > 0 and not public.pro_o_modulo(auth.uid(), 'campanas') then
    raise exception 'El envío automático (push y correo) es de la versión Pro';
  end if;
  if not (p_channels <@ array['push', 'email'])
     or (cardinality(p_channels) = 0 and p_audience not in ('my_subscribers', 'all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients')) then
    raise exception 'Elige push y/o correo';
  end if;
  if 'email' = any(p_channels) and not public.pro_o_modulo(auth.uid(), 'campanas') then
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
revoke all on function public.admin_set_plan(uuid, text, timestamptz, boolean) from public, anon;
revoke all on function public.admin_set_secret(text, text) from public, anon;
revoke all on function public.admin_secret_status() from public, anon;

grant execute on function public.my_account(), public.update_my_company(text), public.redeem_license(text),
  public.save_my_push(text, text, text),
  public.schedule_notification(text, text, text, text, text, text[], timestamptz),
  public.cancel_notification(uuid), public.my_inbox(),
  public.admin_set_plan(uuid, text, timestamptz, boolean), public.admin_set_secret(text, text),
  public.admin_secret_status()
  to authenticated;
grant execute on function public.public_config(), public.negocio_publico(uuid),
  public.subscribe_negocio(uuid, text, text, text, text, text) to anon, authenticated;

-- Las tablas solo se leen (según las políticas); se escriben por funciones.
revoke insert, update, delete, truncate on public.profiles, public.app_secrets,
  public.push_subscriptions, public.subscribers, public.notifications from anon, authenticated;
revoke select on public.app_secrets, public.push_subscriptions from anon, authenticated;
revoke select on public.profiles, public.subscribers, public.notifications from anon;
grant select on public.profiles, public.subscribers, public.notifications to authenticated;
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
          pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => coalesce(p_days, 30)),  -- G25: nunca permanente
          trial_used = trial_used or r.kind = 'trial'
      where id = r.user_id and role <> 'admin';
    perform public.notify_user(r.user_id, '⭐ ¡Pro activado!',
      'Tu versión Pro está activa por ' || coalesce(p_days, 30) || ' días. Al vencer, se renueva pagando en Mi plan.', './');
  else
    update public.profiles set trial_used = trial_used or r.kind = 'trial' where id = r.user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Chat empresa ↔ cliente (y con el admin): desde la 5.32 vive en el núcleo (nucleo/sql/chat.sql: cfx_mensajes, cfx_bloqueos,
-- cfx_reportes y cfx_msg_*). Aquí quedan quién puede hablar con quién y los ganchos (cfx_chat_*).
-- ---------------------------------------------------------------------
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
revoke all on function public.my_contacts() from public, anon;
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
  public.my_contacts(),
  public.catalog_upsert(text, text, numeric, numeric, text), public.catalog_delete(text), public.catalog_of(uuid),
  public.set_mute_offers(boolean), public.accept_terms(), public.delete_my_account(), public.my_inbox()
  to authenticated;

revoke insert, update, delete, truncate on public.app_settings, public.notification_reads, public.requests,
  public.catalog_items from anon, authenticated;
revoke select on public.app_settings, public.notification_reads, public.catalog_items from anon, authenticated;
revoke select on public.requests from anon;
grant select on public.requests to authenticated;

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
  -- 🎟️ La tarjeta de sellos vive en el núcleo (cfx_sellos_cfg). Con el módulo apagado no se toca.
  if public.cfx_modulo('sellos') then perform public.cfx_sellos_guardar(p_sellos_meta, p_sellos_premio); end if;
  update public.profiles set
    datos_pago = nullif(left(trim(coalesce(p_datos_pago, '')), 400), ''),
    horario = nullif(left(trim(coalesce(p_horario, '')), 120), ''),
    abierto = coalesce(p_abierto, true)
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
    'licencias_mes', (select coalesce(sum(monto), 0) from public.cfx_pagos where estado = 'aprobado' and resuelto > date_trunc('month', now())),
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
    'mensajes', (select count(*) from public.cfx_mensajes));
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
  if exists (select 1 from public.cfx_bloqueos where (quien = otro.id and a = me.id) or (quien = me.id and a = otro.id)) then
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
  insert into public.cfx_mensajes (de, para, texto) values (auth.uid(), u.id, c);
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




-- Nombre corto del autor ("Rosa M."): nunca el correo.
create or replace function public.nombre_corto(n text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(split_part(trim(coalesce(n, '')), ' ', 1) ||
    case when split_part(trim(coalesce(n, '')), ' ', 2) <> '' then ' ' || upper(left(split_part(trim(n), ' ', 2), 1)) || '.' else '' end), ''), 'Cliente')
$$;




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
revoke all on function public.nombre_corto(text) from public, anon;
grant execute on function public.hoy_cl(), public.registrar_actividad(), public.admin_actividad(), public.admin_actividad_hoy(),
  public.admin_empresa_actividad(uuid), public.admin_limpiar_actividad(), public.admin_motivar(uuid, text, text),
  public.en_vacaciones(uuid), public.set_vacaciones(date, text), public.set_mi_color(text), public.my_account(), public.tienda_info(uuid),
  public.mis_respuestas(), public.set_mis_respuestas(jsonb), public.nombre_corto(text)
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
  delete from public.cfx_mensajes where creado < now() - interval '7 days';
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
  if f is not null and (f !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$' or length(f) > 320000) then -- vitrina (núcleo fotos.js)
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
    'mensajes', (select count(*) from public.cfx_mensajes));
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
-- (5.34) Un solo registro: va a cfx_registro del núcleo, el mismo que muestra el Centro de Mando.
create or replace function public.auditar(a text, d text) returns void
language plpgsql security definer set search_path = '' as $$
begin perform public.cfx_anotar(left(a, 60), left(coalesce(d, ''), 300)); end $$;
drop function if exists public.admin_auditoria();
create or replace function public.admin_auditoria() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'accion', r.accion, 'detalle', r.detalle, 'quien', r.quien, 'created_at', r.creado) order by r.id desc), '[]')
    from (select * from public.cfx_registro order by id desc limit 150) r);
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


create or replace function public.img_ok(i text, maxlen int) returns boolean
language sql immutable as $$ select coalesce(i, '') ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(i) <= maxlen $$;


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
    if p_rol = 'equipo' and (select count(*) from public.profiles where negocio_id = c.id and role = 'equipo') >= public.limite_equipo(c.id) then
      return jsonb_build_object('ok', false, 'error', case when public.limite_equipo(c.id) > 0 then 'Llegaste al máximo de ' || public.limite_equipo(c.id) || ' personas de equipo'
        when public.mis_modulos(c.id) is not null then 'Mi equipo es un módulo. Actívalo en Ajustes → 🧩 Módulos' else 'El equipo es de la versión Pro' end);
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
drop function if exists public.mi_equipo(); -- 5.22 le agregó el rol: sin esto, volver a correr el archivo falla
create function public.mi_equipo() returns table (id uuid, nombre text, email text, desde timestamptz, visto timestamptz)
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
drop function if exists public.crear_pedido_invitado(text, text, text, jsonb, text, text, text);
-- p_humano: token de Cloudflare Turnstile (lo pone humano.js); solo se exige si el admin guardó la secret key.
create or replace function public.crear_pedido_invitado(p_slug text, p_nombre text, p_tel text, p_items jsonb, p_entrega text,
                                                        p_direccion text, p_nota text, p_humano text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid; nom text := left(trim(coalesce(p_nombre, '')), 60); tel text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
begin
  select id into t from public.profiles where slug = lower(trim(coalesce(p_slug, ''))) and role = 'user' and not suspended;
  if t is null then return jsonb_build_object('ok', false, 'error', 'Tienda no encontrada'); end if;
  if not public.cfx_humano_ok(p_humano) then return jsonb_build_object('ok', false, 'error', 'Confirma que no eres un robot y vuelve a intentar'); end if;
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
declare ped public.pedidos; t public.profiles; txt text;
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
  -- 🎟️ Tarjeta de sellos (núcleo: módulo 'sellos'): una compra entregada = un sello.
  if p_estado = 'entregado' and ped.cliente_id is not null and not ped.sellado and public.cfx_sellos_cfg_de(t.id) is not null then
    update public.pedidos set sellado = true where id = ped.id;
    perform public.cfx_sello_sumar(t.id, ped.cliente_id);
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
-- Promedio de la tienda: calificaciones por pedido.
create or replace function public.estrellas_tienda(n uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('promedio', round(avg(e), 1), 'total', count(e)) from (
    select q.estrellas e from public.calificaciones q join public.pedidos x on x.id = q.pedido_id where x.negocio_id = n and not q.de_negocio) z
$$;

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
    exists (select 1 from public.cfx_pagos g where g.cuenta = p.id and g.estado = 'pendiente')
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
    'pagos_por_revisar', (select count(*) from public.cfx_pagos where estado = 'pendiente'),
    'ingresos_mes', (select coalesce(sum(monto), 0) from public.cfx_pagos where estado = 'aprobado' and resuelto >= m),
    'version', public.db_version(),
    'uso', jsonb_build_object('db_bytes', pg_database_size(current_database()), 'db_limite', 500 * 1024 * 1024,
      'tablas', (select jsonb_object_agg(c.relname, pg_total_relation_size(c.oid)) from pg_class c join pg_namespace s on s.oid = c.relnamespace
                 where s.nspname = 'public' and c.relkind = 'r'),
      'comprobantes', (select count(*) from public.pedidos where comprobante is not null) + (select count(*) from public.cfx_pagos where comprobante is not null),
      'comprobantes_bytes', (select coalesce(sum(length(comprobante)), 0) from public.pedidos) + (select coalesce(sum(length(comprobante)), 0) from public.cfx_pagos)));
end $$;

-- Limpieza (diaria y con botones): comprobantes viejos, avisos y mensajes de 7 días, pedidos expirados de 60 días.
create or replace function public.limpiar(p_que text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int := 0; c int := 0; m int := 0; p int := 0; k int := 0; d int := public.regla('comprobantes_dias', 30); r jsonb;
begin
  if p_que in ('comprobantes', 'todo') then
    update public.pedidos set comprobante = null where comprobante is not null and estado not in ('en_revision') and comprobante_at < now() - make_interval(days => d);
    get diagnostics k = row_count;
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
  public.fotos_publicas(text, text[]), public.ofertas_publicas(text), public.crear_pedido_invitado(text, text, text, jsonb, text, text, text, text),
  public.ver_pedido(text), public.subir_comprobante(text, text), public.cancelar_pedido(text), public.calificar_pedido(text, int),
  public.stock_catalogo(uuid) from public;
grant execute on function public.planes_publicos(), public.reglas(), public.premium_info(), public.tienda_publica(text), public.catalogo_publico(text),
  public.fotos_publicas(text, text[]), public.ofertas_publicas(text), public.crear_pedido_invitado(text, text, text, jsonb, text, text, text, text),
  public.ver_pedido(text), public.subir_comprobante(text, text), public.cancelar_pedido(text), public.calificar_pedido(text, int),
  public.stock_catalogo(uuid) to anon, authenticated;
revoke all on function public.admin_plan_guardar(text, text, text, jsonb, int, jsonb), public.admin_set_regla(text, int), public.admin_auditoria(),
  public.set_link_pago(text, int, text, text, int, boolean), public.mis_links_pago(), public.admin_premium(uuid, int),
  public.admin_suspender(uuid, boolean), public.admin_eliminar_cuenta(uuid), public.mi_equipo(), public.quitar_equipo(uuid), public.set_stock(text, int),
  public.caja_descontar(jsonb), public.revisar_comprobante(uuid, boolean, text), public.comprobante_pedido(uuid), public.marcar_devuelto(uuid),
  public.pedidos_tienda(text), public.mis_pedidos(uuid), public.hoy_negocio(), public.admin_negocios(), public.admin_clientes(), public.admin_resumen(),
  public.admin_limpiar(text) from public, anon;
grant execute on function public.admin_plan_guardar(text, text, text, jsonb, int, jsonb), public.admin_set_regla(text, int), public.admin_auditoria(),
  public.set_link_pago(text, int, text, text, int, boolean), public.mis_links_pago(), public.admin_premium(uuid, int),
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
    perform public.aviso_cliente(x, '✅ Tu pedido fue aceptado', 'Pago aprobado: estamos preparando tu pedido');
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
-- (5.34) El carrito vive en el núcleo (cfx_carritos). guardar_carrito queda para la app 5.86.
create or replace function public.guardar_carrito(p_negocio uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin perform public.cfx_carrito_guardar(p_negocio, p_items); end $$;
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
  if (r ->> 'ok')::boolean then perform public.cfx_carrito_vaciar(auth.uid(), p_negocio); end if;
  return r;
end $$;
-- Cada hora (de 10 a 20 h de Chile): carritos sin pedir de hace más de 20 horas reciben un aviso, una vez.
create or replace function public.recordar_carritos() returns int
language plpgsql security definer set search_path = '' as $$
begin return public.cfx_carritos_recordar(); end $$;

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
  if not public.pro_o_modulo(n, 'redes') then raise exception '%', case when public.mis_modulos(n) is not null then '📲 Vender en redes es un módulo. Actívalo en Ajustes → 🧩 Módulos' else '⭐ Vender por WhatsApp es de la versión Pro' end; end if;
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
  end if;
  if p_que in ('avisos', 'mensajes', 'todo') then
    r := public.limpiar_registros(); a := (r ->> 'avisos')::int + (r ->> 'campanas')::int; m := (r ->> 'mensajes')::int;
  end if;
  if p_que in ('pedidos', 'todo') then
    delete from public.pedidos where estado in ('expirado', 'rechazado') and updated_at < now() - interval '60 days';
    get diagnostics p = row_count;
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
    exists (select 1 from public.cfx_pagos g where g.cuenta = p.id and g.estado = 'pendiente'), p.rubro, p.created_by is null
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
revoke all on function public.pedidos_tienda(text), public.mis_pedidos(uuid), public.set_desc_premium(int), public.guardar_carrito(uuid, jsonb), public.avisame_stock(uuid, text, boolean),
  public.mis_avisos_stock(uuid), public.kit_whatsapp(), public.crear_pedido(uuid, jsonb, text, text, text, text), public.revisar_comprobante(uuid, boolean, text)
  from public, anon;
grant execute on function public.pedidos_tienda(text), public.mis_pedidos(uuid), public.set_desc_premium(int), public.guardar_carrito(uuid, jsonb), public.avisame_stock(uuid, text, boolean),
  public.mis_avisos_stock(uuid), public.kit_whatsapp(), public.crear_pedido(uuid, jsonb, text, text, text, text), public.revisar_comprobante(uuid, boolean, text)
  to authenticated;

-- =====================================================================
--  VERSIÓN 5.2 · Limpieza del administrador (registro de cambios y
--  cuentas que no se usan) y logo de la marca como respaldo.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.4'::text $$;

-- 📜 Borrar el registro de cambios (solo el administrador). p_dias = 0 borra todo; si no, lo anterior a esos días.
create or replace function public.admin_limpiar_auditoria(p_dias int) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_dias is null or p_dias < 0 then raise exception 'Días no válidos'; end if;
  delete from public.cfx_registro where creado < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;
  return n;
end $$;

-- 🧹 Cuentas de negocio que no se usan: sin Pro, sin productos, pedidos, clientes ni fichas,
-- creadas y sin entrar hace p_dias o más. Nunca toca negocios Pro ni al administrador.
create or replace function public.es_cuenta_inactiva(u uuid, p_dias int) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.profiles p where p.id = u and p.role = 'user' and not public.is_pro(p.id)
    and p.created_at < now() - make_interval(days => p_dias)
    and coalesce(p.visto_at, p.created_at) < now() - make_interval(days => p_dias)
    and not exists (select 1 from public.catalog_items c where c.owner_id = p.id)
    and not exists (select 1 from public.pedidos x where x.negocio_id = p.id)
    and not exists (select 1 from public.profiles c where c.negocio_id = p.id and c.role = 'client')
    and not exists (select 1 from public.publicaciones f where f.owner_id = p.id)
    and not exists (select 1 from public.cfx_pagos g where g.cuenta = p.id and g.estado = 'pendiente'));
end $$;
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
-- =====================================================================
--  VERSIÓN 5.5 · Limpieza y respaldo
--  · Avisos y mensajes se guardan 30 días; antes se avisa (máx. 1 vez por semana, al menos 2 días antes).
--  · Cada persona borra un aviso (✕) o un chat completo. La tienda descarga su respaldo en Excel.
--  · Cada lunes: recordatorio de productos agotados hace más de 30 días.
--  · Funciones comunes cfx_* para el Centro de Mando (respaldo, limpieza e inventario).
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.18'::text $$;

alter table public.notification_reads add column if not exists oculto boolean not null default false;
alter table public.profiles add column if not exists aviso_limpieza_at timestamptz;

-- Bandeja sin los avisos que la persona borró.
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
    and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = me.id and r.oculto)
  order by coalesce(n.sent_at, n.send_at) desc limit 40
$$;

create or replace function public.ocultar_aviso(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.my_inbox() i where i.id = p_id) then return; end if;
  insert into public.notification_reads (notification_id, user_id, oculto) values (p_id, auth.uid(), true)
  on conflict (notification_id, user_id) do update set oculto = true;
end $$;

-- Limpieza diaria: avisos y mensajes de más de 30 días (las ofertas con imagen también 30). Los pedidos no se tocan.
create or replace function public.limpiar_registros() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; m int; r record;
begin
  for r in select p.id,
             (select count(*) from public.cfx_mensajes x where (x.de = p.id or x.para = p.id) and x.creado < now() - interval '21 days') as ms,
             (select count(*) from public.notifications x where x.audience = 'direct' and x.target_id = p.id and x.status in ('sent', 'failed', 'cancelled')
                and coalesce(x.sent_at, x.send_at) < now() - interval '21 days') as av
           from public.profiles p
           where (p.aviso_limpieza_at is null or p.aviso_limpieza_at < now() - interval '7 days')
             and (exists (select 1 from public.cfx_mensajes x where (x.de = p.id or x.para = p.id) and x.creado < now() - interval '28 days')
               or exists (select 1 from public.notifications x where x.audience = 'direct' and x.target_id = p.id and x.status in ('sent', 'failed', 'cancelled')
                    and coalesce(x.sent_at, x.send_at) < now() - interval '28 days'))
  loop
    insert into public.notifications (owner_id, target_id, audience, channels, title, body, url, send_at, status, sent_at)
    values (r.id, r.id, 'direct', '{}', '🧹 Limpieza automática',
      concat_ws(' y ', case when r.ms = 1 then '1 mensaje' when r.ms > 1 then r.ms || ' mensajes' end, case when r.av = 1 then '1 aviso' when r.av > 1 then r.av || ' avisos' end)
        || ' con más de 30 días se borran solos en los próximos días. Tus pedidos, productos y clientes no se tocan.', './', now(), 'sent', now());
    update public.profiles set aviso_limpieza_at = now() where id = r.id;
  end loop;
  delete from public.notifications n where n.status in ('sent', 'failed', 'cancelled') and coalesce(n.sent_at, n.send_at) < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.cfx_mensajes where creado < now() - interval '30 days';
  get diagnostics m = row_count;
  if extract(isodow from now() at time zone 'America/Santiago') = 1 then perform public.recordar_productos(); end if;
  return jsonb_build_object('avisos', a, 'campanas', 0, 'mensajes', m);
end $$;

-- Cada lunes: a cada tienda, sus productos agotados hace más de 30 días (para que borre los que ya no vende).
create or replace function public.recordar_productos() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; k int := 0;
begin
  for r in select owner_id, count(*) as n from public.catalog_items where stock is not null and stock <= 0 and updated_at < now() - interval '30 days'
           group by owner_id
  loop
    perform public.notify_user(r.owner_id, '📦 ' || r.n || case when r.n = 1 then ' producto agotado' else ' productos agotados' end,
      'Llevan más de 30 días sin stock. Si ya no los vendes, bórralos en Caja → Productos para que tu tienda se vea ordenada.', 'apps/caja/');
    k := k + 1;
  end loop;
  return k;
end $$;

-- Respaldo de la tienda (Excel): productos, pedidos, clientes, fichas, cupones y reseñas. Solo el dueño.
create or replace function public.mi_respaldo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = n and role in ('user', 'admin')) then raise exception 'Solo el dueño de la tienda'; end if;
  return jsonb_build_object(
    'Productos', (select coalesce(jsonb_agg(x order by x.nombre), '[]') from (select nombre, categoria, precio, precio_premium, stock, descripcion, opciones,
        solo_premium, created_at as creado, updated_at as actualizado from public.catalog_items where owner_id = n) x),
    'Pedidos', (select coalesce(jsonb_agg(x order by x.fecha), '[]') from (select p.created_at as fecha, coalesce(c.empresa, p.invitado_nombre, c.email) as cliente,
        coalesce(c.telefono, p.invitado_tel) as telefono, p.estado, p.entrega, p.direccion, p.subtotal, p.descuento, p.total, p.cupon, p.nota,
        (select string_agg(coalesce(l ->> 'cant', '1') || ' × ' || coalesce(l ->> 'nombre', l ->> 'titulo', '?'), ', ') from jsonb_array_elements(p.lineas) l) as detalle,
        p.pagado_at as pagado from public.pedidos p left join public.profiles c on c.id = p.cliente_id where p.negocio_id = n) x),
    'Clientes', (select coalesce(jsonb_agg(x order by x.nombre), '[]') from (select empresa as nombre, email as correo, telefono, plan, pro_until as premium_hasta,
        created_at as creado from public.profiles where negocio_id = n and role = 'client') x),
    'Fichas', (select coalesce(jsonb_agg(x order by x.creada), '[]') from (select titulo, detalle, precio, tipo, vip, created_at as creada from public.publicaciones where owner_id = n) x),
    'Cupones', (select coalesce(jsonb_agg(x), '[]') from (select codigo, porcentaje, hasta, activo, usos from public.cfx_descuentos where owner_id = n) x)
  );
end $$;

-- ---------- Centro de Mando: respaldo, limpieza (común a las 6 apps) ----------
create or replace function public.cfx_respaldo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'Cuentas', (select coalesce(jsonb_agg(x order by x.creada), '[]') from (select p.email as correo, p.empresa as nombre, p.role as rol, p.plan, p.pro_until as pro_hasta,
        p.rubro, p.telefono, p.suspended as suspendida, t.empresa as tienda, p.visto_at as visto, p.created_at as creada
      from public.profiles p left join public.profiles t on t.id = p.negocio_id) x),
    'Pagos', (select coalesce(jsonb_agg(x order by x.fecha), '[]') from (select g.creado as fecha, g.email as correo, g.rol, g.periodo, g.monto, g.medio, g.estado, g.dias, g.motivo,
        g.resuelto as revisado, (g.comprobante is not null) as con_comprobante from public.cfx_pagos g) x),
    'Keys', (select coalesce(jsonb_agg(to_jsonb(k) - 'hash'), '[]') from public.cfx_keys k),
    'Ajustes', (select coalesce(jsonb_agg(jsonb_build_object('clave', key, 'valor', value) order by key), '[]') from public.app_settings),
    'Registro', (select coalesce(jsonb_agg(to_jsonb(a) order by a.creado), '[]') from public.cfx_registro a));
end $$;

-- Gancho de la limpieza del núcleo (C18): lo propio de Órbita (el registro y los carritos los limpia el núcleo).
create or replace function public.cfx_limpieza_app() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := public.regla('comprobantes_dias', 30);
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_array(
    jsonb_build_object('clave', 'comprobantes', 'titulo', 'Comprobantes revisados', 'detalle', 'Más de ' || d || ' días (se borran solos cada día).',
      'filas', (select count(*) from public.pedidos where comprobante is not null and estado not in ('en_revision') and comprobante_at < now() - make_interval(days => d))),
    jsonb_build_object('clave', 'mensajes', 'titulo', 'Avisos y mensajes', 'detalle', 'Más de 30 días (se borran solos cada día).',
      'filas', (select count(*) from public.cfx_mensajes where creado < now() - interval '30 days')
             + (select count(*) from public.notifications where status in ('sent', 'failed', 'cancelled') and coalesce(sent_at, send_at) < now() - interval '30 days')),
    jsonb_build_object('clave', 'pedidos', 'titulo', 'Pedidos expirados o rechazados', 'detalle', 'Más de 60 días (se borran solos cada día).',
      'filas', (select count(*) from public.pedidos where estado in ('expirado', 'rechazado') and updated_at < now() - interval '60 days')));
end $$;

create or replace function public.cfx_limpiar_app(p_clave text) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  if p_clave not in ('comprobantes', 'mensajes', 'pedidos') then raise exception 'Opción no válida'; end if;
  r := public.limpiar(p_clave);
  return coalesce((r ->> 'comprobantes')::int, 0) + coalesce((r ->> 'avisos')::int, 0) + coalesce((r ->> 'mensajes')::int, 0) + coalesce((r ->> 'pedidos')::int, 0);
end $$;

revoke all on function public.limpiar_registros(), public.recordar_productos() from public, anon, authenticated;
revoke all on function public.cfx_limpieza_app(), public.cfx_limpiar_app(text) from public, anon, authenticated;
revoke all on function public.ocultar_aviso(uuid), public.mi_respaldo(), public.cfx_respaldo() from public, anon;
grant execute on function public.ocultar_aviso(uuid), public.mi_respaldo(), public.cfx_respaldo(), public.my_inbox() to authenticated;

create or replace function public.cfx_es_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'Solo el administrador'; end if; end $$;


-- =====================================================================
--  Ganchos para el núcleo (pagos): empresa = negocio, cliente = cliente (el Premium es el plan Pro de la cuenta).
-- =====================================================================
create or replace function public.cfx_yo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'email', p.email, 'nombre', p.empresa, 'premium_hasta', p.pro_until, 'creado', p.created_at,
    'rol', case p.role when 'user' then 'negocio' when 'client' then 'cliente' when 'admin' then 'admin' else 'otro' end)
  from public.profiles p where p.id = auth.uid()
$$;
create or replace function public.cfx_dar_premium(p_cuenta uuid, p_rol text, p_dias int) returns timestamptz
language sql security definer set search_path = '' as $$
  update public.profiles set plan = 'pro', pro_until = greatest(coalesce(case when plan = 'pro' then pro_until end, now()), now()) + make_interval(days => p_dias)
  where id = p_cuenta returning pro_until
$$;
create or replace function public.cfx_avisar(p_cuenta uuid, p_titulo text, p_cuerpo text) returns void
language sql security definer set search_path = '' as $$ select public.notify_user(p_cuenta, p_titulo, p_cuerpo, './') $$;
create or replace function public.cfx_avisar_admin(p_titulo text, p_cuerpo text) returns void
language sql security definer set search_path = '' as $$ select public.notify_user(public.admin_id(), p_titulo, p_cuerpo, 'apps/admin/') $$;

-- Ganchos de los módulos del núcleo (C19 y C14): qué módulos tiene Órbita y las reglas propias del chat.
create or replace function public.cfx_modulos_app() returns text[]
language sql immutable as $$ select array['chat', 'calificaciones', 'cupones', 'sellos', 'carrito', 'analisis'] $$;
create or replace function public.cfx_chat_puede(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.can_message(a, b) $$;
-- El admin escribe sin límite; entre clientes según su plan (mensajes_seguidos); con tiendas y soporte, 3.
create or replace function public.cfx_chat_seguidos(a uuid, b uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.profiles p where p.id = a and p.role = 'admin') then null else public.chat_limite(a, b) end
$$;
create or replace function public.cfx_chat_quien(u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nombre', case when p.role = 'admin' then 'CodeFix (soporte)' else coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1)) end,
                            'rol', p.role)
  from public.profiles p where p.id = u
$$;
create or replace function public.cfx_chat_aviso(p_para uuid, p_de uuid, p_texto text) returns void
language sql security definer set search_path = '' as $$
  select public.notify_user(p_para, '💬 ' || coalesce((select case when p.role = 'admin' then 'CodeFix' else coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1)) end
                                                       from public.profiles p where p.id = p_de), 'Mensaje'), p_texto, 'apps/mensajes/?con=' || p_de)
$$;
create or replace function public.cfx_chat_suspender(u uuid) returns void
language sql security definer set search_path = '' as $$ update public.profiles set suspended = true where id = u and role <> 'admin' $$;
revoke all on function public.cfx_modulos_app(), public.cfx_chat_puede(uuid, uuid), public.cfx_chat_seguidos(uuid, uuid), public.cfx_chat_quien(uuid),
  public.cfx_chat_aviso(uuid, uuid, text), public.cfx_chat_suspender(uuid) from public, anon, authenticated;

-- Ganchos de calificaciones (C15), cupones y sellos (C16) del núcleo: la ref es el pedido; cupones y sellos son del Pro.
create or replace function public.cfx_calif_ref(p_ref text, u uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); tienda boolean;
begin
  if x.id is null then return jsonb_build_object('error', 'Pedido no encontrado'); end if;
  if x.estado <> 'entregado' then return jsonb_build_object('error', 'Podrás calificar cuando el pedido esté entregado'); end if;
  tienda := coalesce(public.negocio_de(u) = x.negocio_id, false) and x.token is distinct from p_ref;
  if not tienda and x.cliente_id is not null and x.cliente_id is distinct from u and x.token is distinct from p_ref then
    return jsonb_build_object('error', 'Pedido no encontrado');
  end if;
  return jsonb_build_object('ref', x.id::text, 'negocio', x.negocio_id, 'cliente', x.cliente_id,
    'cliente_ref', case when x.cliente_id is null then x.invitado_tel end, 'de_negocio', tienda);
end $$;
create or replace function public.cfx_fid_dueno(u uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select case when public.is_business(u) then u end $$;
create or replace function public.cfx_fid_activo(n uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_pro(n) $$;
create or replace function public.cfx_fid_cliente(u uuid, n uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.puede_comprar(u, n) $$;
create or replace function public.cfx_sellos_aviso(n uuid, c uuid, p_premio text) returns void
language sql security definer set search_path = '' as $$
  select public.notify_user(c, '🎁 ¡Completaste tu tarjeta de sellos!', 'Premio: ' || coalesce(p_premio, 'pregunta en la tienda'), 'apps/catalogo/?v=pedidos')
$$;
revoke all on function public.cfx_calif_ref(text, uuid), public.cfx_fid_dueno(uuid), public.cfx_fid_activo(uuid, text), public.cfx_fid_cliente(uuid, uuid),
  public.cfx_sellos_aviso(uuid, uuid, text) from public, anon, authenticated;

-- Ganchos de administración para el núcleo (planes, textos, a quién avisar y verificación).
create or replace function public.cfx_planes_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('grupo', m.g, 'clave', k, 'free', f.limites -> k, 'premium', p.limites -> k) order by m.g, k), '[]')
  from (values ('negocio', 'negocio_free', 'negocio_pro'), ('cliente', 'cliente_free', 'cliente_pro')) m(g, fc, pc) join public.planes f on f.codigo = m.fc join public.planes p on p.codigo = m.pc,
  lateral (select jsonb_object_keys(f.limites || p.limites) as k) x
$$;
create or replace function public.cfx_plan_guardar_app(p_grupo text, p_clave text, p_free jsonb, p_premium jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare fc text; pc text;
begin
  select m.fc, m.pc into fc, pc from (values ('negocio', 'negocio_free', 'negocio_pro'), ('cliente', 'cliente_free', 'cliente_pro')) m(g, fc, pc) where m.g = p_grupo;
  if fc is null or p_clave !~ '^[a-z_]{2,40}$' then raise exception 'Plan no válido'; end if;
  update public.planes set limites = limites || jsonb_build_object(p_clave, p_free) where codigo = fc;
  update public.planes set limites = limites || jsonb_build_object(p_clave, p_premium) where codigo = pc;
end $$;
-- Textos editables (desde el Centro de Mando → Control → Textos). La app los pone donde dice data-texto="clave".
create table if not exists public.textos (clave text primary key, valor text not null default '', nombre text not null default '');
alter table public.textos enable row level security;
drop policy if exists textos_leer on public.textos;
create policy textos_leer on public.textos for select using (true);
revoke insert, update, delete, truncate on public.textos from anon, authenticated;
grant select on public.textos to anon, authenticated;
insert into public.textos (clave, valor, nombre) values
  ('login_titulo', 'Ingresa a tu cuenta', 'Ingreso: título'),
  ('login_bajada', 'Publicidad, clientes, ventas y notificaciones en un solo lugar.', 'Ingreso: texto bajo el título'),
  ('login_negocio', '🏪 ¿Tienes un negocio? Crea tu tienda gratis', 'Ingreso: botón para crear tienda'),
  ('login_cliente', '¿Eres cliente de una tienda? Pide tu cuenta a la tienda.', 'Ingreso: nota para clientes'),
  ('registro_titulo', 'Crea la tienda online de tu negocio, gratis', 'Registro de negocios: título'),
  ('registro_bajada', 'Para emprendimientos, pymes y negocios de cualquier rubro: productos o servicios, con o sin local.', 'Registro de negocios: texto bajo el título')
on conflict (clave) do nothing;
create or replace function public.cfx_textos_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'valor', valor, 'nombre', nombre) order by clave), '[]') from public.textos
$$;
create or replace function public.cfx_texto_guardar_app(p_clave text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.textos set valor = left(coalesce(p_valor, ''), 600) where clave = p_clave;
  if not found then raise exception 'Texto no encontrado'; end if;
end $$;
create or replace function public.cfx_destinatarios(p_destino text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where not suspended and role in ('user', 'client', 'equipo')
    and (p_destino = 'todos' or (p_destino = 'negocios' and role = 'user') or (p_destino = 'clientes' and role = 'client')
      or (p_destino = 'premium' and public.is_pro(id)) or (p_destino = 'gratis' and not public.is_pro(id)))
$$;
create or replace function public.cfx_marcar_verificado(p_cuenta uuid, p_si boolean) returns void
language sql security definer set search_path = '' as $$ select null::void $$;

-- =====================================================================
--  VERSIÓN 5.10 · Despacho por comuna y pago completo del pedido
--  Cada tienda elige si tiene retiro en tienda y cuánto cobra de despacho en cada comuna
--  (y desde qué monto el despacho es gratis). El cliente elige su comuna, ve el costo antes
--  de pedir y el total ya lo incluye (queda como una línea "🚚 Despacho a …" del pedido).
-- =====================================================================
alter table public.profiles add column if not exists despacho jsonb not null default '{}'::jsonb;
alter table public.pedidos add column if not exists costo_despacho numeric(12, 2) not null default 0;
alter table public.pedidos add column if not exists comuna text;

-- Normaliza para comparar comunas (sin tildes ni mayúsculas).
create or replace function public.comuna_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(trim(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')))
$$;

-- Costo del despacho: la comuna va al final de la dirección ("…, Ñuñoa"). Sin zonas configuradas: se coordina con la tienda ($0 aquí).
create or replace function public.costo_despacho(p_negocio uuid, p_entrega text, p_direccion text, p_monto numeric) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin return public.cfx_despacho_costo((select despacho from public.profiles where id = p_negocio), p_entrega, p_direccion, p_monto); end $$;

-- La tienda guarda su despacho: { retiro: true/false, gratis_desde: 30000, zonas: [{ comuna: 'Ñuñoa', precio: 2500 }, …] }.
create or replace function public.guardar_despacho(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo el dueño de la tienda'; end if;
  update public.profiles set despacho = public.cfx_despacho_limpio(p) where id = auth.uid();
  return (select despacho from public.profiles where id = auth.uid());
end $$;
create or replace function public.mi_despacho() returns jsonb
language sql stable security definer set search_path = '' as $$ select despacho from public.profiles where id = public.negocio_de(auth.uid()) $$;
revoke all on function public.costo_despacho(uuid, text, text, numeric), public.comuna_norm(text) from public, anon, authenticated;
revoke all on function public.guardar_despacho(jsonb), public.mi_despacho() from public, anon;
grant execute on function public.guardar_despacho(jsonb), public.mi_despacho() to authenticated;

create or replace function public.guardar_pedido(p_negocio uuid, p_cliente uuid, p_nombre text, p_tel text, p_items jsonb, p_entrega text,
                                                 p_direccion text, p_nota text, p_cupon text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb; pct int := 0; desc_ numeric := 0; dp numeric := 0; sub numeric; ped public.pedidos; l jsonb := public.link_activo(p_negocio, 'pedido');
  quien text; prem boolean := public.es_cliente_premium(p_cliente); dsp jsonb;
begin
  if public.en_vacaciones(p_negocio) then return jsonb_build_object('ok', false, 'error', 'La tienda está de vacaciones. Podrás pedir a su regreso.'); end if;
  if p_entrega not in ('retiro', 'despacho') then return jsonb_build_object('ok', false, 'error', 'Elige despacho o retiro en tienda'); end if;
  if p_entrega = 'despacho' and coalesce(trim(p_direccion), '') = '' then return jsonb_build_object('ok', false, 'error', 'Escribe la dirección de despacho'); end if;
  if p_entrega = 'retiro' and not coalesce((select (despacho ->> 'retiro')::boolean from public.profiles where id = p_negocio), true) then
    return jsonb_build_object('ok', false, 'error', 'Esta tienda no tiene retiro: elige despacho');
  end if;
  a := public.armar_pedido(p_negocio, p_items);
  if a ? 'error' then return jsonb_build_object('ok', false, 'error', a ->> 'error'); end if;
  sub := (a ->> 'sub')::numeric;
  if coalesce(trim(p_cupon), '') <> '' then
    -- 🏷️ Cupón del negocio (núcleo: módulo 'cupones'). El uso se suma cuando el pedido ya quedó guardado.
    pct := public.cfx_desc_pct(p_negocio, p_cupon);
    if pct is null then return jsonb_build_object('ok', false, 'error', 'Cupón no válido o vencido'); end if;
    desc_ := round(sub * pct / 100.0);
  end if;
  if prem then dp := round(sub * coalesce((select desc_premium from public.profiles where id = p_negocio), 0) / 100.0); end if;
  dp := least(dp, sub - desc_);
  -- Despacho según la comuna (lo configura la tienda): se suma al total como una línea más del pedido.
  dsp := public.costo_despacho(p_negocio, p_entrega, p_direccion, sub - desc_ - dp);
  if dsp ? 'error' then return jsonb_build_object('ok', false, 'error', dsp ->> 'error'); end if;
  if (dsp ->> 'costo')::numeric > 0 then
    a := jsonb_set(a, '{lineas}', (a -> 'lineas') || jsonb_build_object('nombre', '🚚 Despacho a ' || (dsp ->> 'comuna'), 'cant', 1, 'precio', (dsp ->> 'costo')::numeric,
      'subtotal', (dsp ->> 'costo')::numeric, 'clave', 'despacho', 'opcion', null));
  end if;
  insert into public.pedidos (negocio_id, cliente_id, invitado_nombre, invitado_tel, lineas, subtotal, descuento, desc_premium, total, cupon, entrega, direccion, nota,
                              estado, retenido_hasta, token, costo_despacho, comuna)
  values (p_negocio, p_cliente, p_nombre, p_tel, a -> 'lineas', sub, desc_ + dp, dp, sub - desc_ - dp + (dsp ->> 'costo')::numeric,
          nullif(upper(regexp_replace(coalesce(p_cupon, ''), '[^A-Za-z0-9]', '', 'g')), ''), p_entrega,
          case when p_entrega = 'despacho' then left(trim(p_direccion), 200) end, nullif(left(trim(coalesce(p_nota, '')), 300), ''),
          case when l is null then 'recibido' else 'pagando' end,
          case when l is null then null else now() + make_interval(mins => public.regla('retencion_min', 30)) end,
          left(replace(gen_random_uuid()::text, '-', ''), 24), (dsp ->> 'costo')::numeric, dsp ->> 'comuna')
  returning * into ped;
  if pct > 0 then perform public.cfx_desc_usar(p_negocio, p_cupon); end if;
  quien := coalesce(p_nombre, (select coalesce(nullif(empresa, ''), split_part(email, '@', 1)) from public.profiles where id = p_cliente));
  perform public.notify_user(p_negocio, case when prem then '⭐ ' else '' end || case when l is null then '📦 Nuevo pedido de ' else '⏳ Pedido por pagar de ' end || quien,
    'Total $' || to_char(ped.total, 'FM999G999G999') || ' · ' || case when p_entrega = 'despacho' then 'Despacho' else 'Retiro en tienda' end ||
    case when prem then ' · Cliente Premium' else '' end, 'apps/pedidos/');
  -- Al equipo (trabajadores de la tienda): pedido para preparar.
  if l is null then
    perform public.notify_user(e.id, '📦 Pedido para preparar', quien || ' · Total $' || to_char(ped.total, 'FM999G999G999'), 'apps/pedidos/')
    from public.profiles e where e.role = 'equipo' and e.negocio_id = p_negocio and not e.suspended;
  end if;
  return jsonb_build_object('ok', true, 'id', ped.id, 'token', ped.token, 'subtotal', ped.subtotal, 'descuento', ped.descuento, 'desc_premium', ped.desc_premium,
    'total', ped.total, 'despacho', ped.costo_despacho, 'estado', ped.estado, 'retenido_hasta', ped.retenido_hasta, 'link', l);
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
    'desc_premium', t.desc_premium, 'rubro', t.rubro, 'despacho', t.despacho)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;

create or replace function public.tienda_publica(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug, 'telefono', t.telefono, 'horario', t.horario, 'abierto', t.abierto,
    'logo', t.logo, 'color', t.color, 'datos_pago', t.datos_pago,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'retencion_min', public.regla('retencion_min', 30), 'pro', public.is_pro(t.id), 'desc_premium', t.desc_premium, 'despacho', t.despacho)
  from public.profiles t where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
$$;

-- Guía para partir (núcleo · ayuda): lo que le falta configurar a la tienda. Se marca solo cuando lo hace.
create or replace function public.cfx_guia_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(
    jsonb_build_object('k', 'perfil', 't', 'Nombre y logo de tu tienda', 'd', 'Así te ven tus clientes en el catálogo.', 'ir', '#ajustes', 'ok', p.empresa <> '' and p.logo is not null),
    jsonb_build_object('k', 'whatsapp', 't', 'Tu WhatsApp', 'd', 'Para recibir y coordinar pedidos.', 'ir', '#ajustes', 'ok', coalesce(p.telefono, '') <> ''),
    jsonb_build_object('k', 'productos', 't', 'Tus productos', 'd', 'Sube al menos un producto con foto y precio.', 'ir', 'apps/caja/',
      'ok', exists (select 1 from public.catalog_items i where i.owner_id = p.id)),
    jsonb_build_object('k', 'cobro', 't', 'Cómo te pagan los pedidos', 'd', 'Tu link de pago o tus datos de transferencia. Los pedidos se pagan completos.', 'ir', '#links',
      'ok', coalesce(p.datos_pago, '') <> '' or exists (select 1 from public.links_pago l where l.owner_id = p.id and l.tipo = 'pedido' and l.activo and l.url <> '')),
    jsonb_build_object('k', 'despacho', 't', 'Despacho o retiro', 'd', 'Elige si haces retiro en tienda y cuánto cobras de despacho por comuna.', 'ir', '#despacho',
      'ok', coalesce((p.despacho ->> 'retiro')::boolean, false) or jsonb_array_length(coalesce(p.despacho -> 'zonas', '[]'::jsonb)) > 0))
  from public.profiles p where p.id = auth.uid()), '[]'::jsonb)
$$;

-- =====================================================================
--  VERSIÓN 5.18 · Perfil de la tienda (U12): descripción, dirección y redes que se lucen en la página pública.
-- =====================================================================
alter table public.profiles add column if not exists perfil jsonb not null default '{}'::jsonb;

-- Guarda el perfil (solo textos cortos y limpios; redes como usuario o link https).
create or replace function public.set_mi_perfil(p_perfil jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := '{}'::jsonb; k text; v text;
  lim constant jsonb := '{"descripcion":400,"direccion":150,"comuna":60,"instagram":100,"facebook":100,"tiktok":100,"web":150,"correo":120}';
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  for k in select jsonb_object_keys(lim) loop
    v := nullif(trim(regexp_replace(coalesce(p_perfil ->> k, ''), '[<>]', '', 'g')), '');
    if v is null then continue; end if;
    v := left(v, (lim ->> k)::int);
    if k = 'web' and v !~* '^https?://' then v := 'https://' || v; end if;
    if k = 'correo' and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  update public.profiles set perfil = r where id = auth.uid();
  return r;
end $$;
revoke all on function public.set_mi_perfil(jsonb) from public, anon;
grant execute on function public.set_mi_perfil(jsonb) to authenticated;

create or replace function public.tienda_publica(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug, 'telefono', t.telefono, 'horario', t.horario, 'abierto', t.abierto,
    'logo', t.logo, 'color', t.color, 'datos_pago', t.datos_pago,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'retencion_min', public.regla('retencion_min', 30), 'pro', public.is_pro(t.id), 'desc_premium', t.desc_premium, 'despacho', t.despacho,
    'perfil', t.perfil, 'rubro', t.rubro, 'desde', t.created_at::date)
  from public.profiles t where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
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
    'desc_premium', t.desc_premium, 'rubro', t.rubro, 'despacho', t.despacho, 'perfil', t.perfil, 'desde', t.created_at::date)
  from public.profiles t
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;

-- =====================================================================
--  VERSIÓN 5.19 · Variantes: cada opción (color, talla…) con su propio precio y stock (tabla public.variantes).
--  · El dueño las pone en Caja (debajo de "Colores, tallas u opciones"); vacío = usa el precio/stock del producto.
--  · La tienda las muestra (variantes_de) y el pedido cobra y aparta por opción (armar_pedido, mover_stock).
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.19'::text $$;

create table if not exists public.variantes (
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  clave     text not null,
  nombre    text not null,
  precio    numeric(12, 2) check (precio >= 0),
  stock     int check (stock >= 0),
  orden     int not null default 0,
  primary key (owner_id, clave, nombre)
);
alter table public.variantes enable row level security;  -- sin políticas: solo por funciones
revoke all on public.variantes from anon, authenticated;

-- Lo apartado de una opción (pedidos aún sin descontar).
create or replace function public.apartado_op(n uuid, k text, op text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((l ->> 'cant')::int), 0)::int from public.pedidos x, jsonb_array_elements(x.lineas) l
  where x.negocio_id = n and not x.stock_descontado and x.estado in ('pagando', 'en_revision', 'recibido') and l ->> 'clave' = k and lower(l ->> 'opcion') = lower(op)
$$;

-- El dueño guarda la lista completa de un producto: [{ nombre, precio, stock }]. También deja catalog_items.opciones con los nombres.
create or replace function public.variantes_guardar(p_clave text, p_lista jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb; i int := 0; nom text;
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo el dueño del negocio'; end if;
  if not exists (select 1 from public.catalog_items where owner_id = auth.uid() and client_key = p_clave) then raise exception 'Publica el producto primero'; end if;
  if jsonb_typeof(coalesce(p_lista, '[]')) <> 'array' or jsonb_array_length(coalesce(p_lista, '[]')) > 20 then raise exception 'Máximo 20 opciones'; end if;
  delete from public.variantes where owner_id = auth.uid() and clave = p_clave;
  for v in select * from jsonb_array_elements(coalesce(p_lista, '[]')) loop
    nom := left(trim(coalesce(v ->> 'nombre', '')), 40);
    continue when nom = '';
    if (v ->> 'precio') is not null and (v ->> 'precio')::numeric < 0 or (v ->> 'stock') is not null and (v ->> 'stock')::int < 0 then raise exception 'Revisa precio y stock de "%"', nom; end if;
    insert into public.variantes (owner_id, clave, nombre, precio, stock, orden)
    values (auth.uid(), p_clave, nom, (v ->> 'precio')::numeric, case when (v ->> 'stock') is null then null else least((v ->> 'stock')::int, 1000000) end, i)
    on conflict do nothing;
    i := i + 1;
  end loop;
  update public.catalog_items set opciones = coalesce((select string_agg(nombre, ', ' order by orden) from public.variantes where owner_id = auth.uid() and clave = p_clave), opciones), updated_at = now()
  where owner_id = auth.uid() and client_key = p_clave;
end $$;

-- Opciones de la tienda con su precio (null = el del producto) y lo disponible (null = sin control de stock).
create or replace function public.variantes_de(p_negocio uuid) returns table (clave text, nombre text, precio numeric, disponible int)
language sql stable security definer set search_path = '' as $$
  select v.clave, v.nombre, v.precio, case when v.stock is null then null else greatest(0, v.stock - public.apartado_op(v.owner_id, v.clave, v.nombre)) end
  from public.variantes v
  where v.owner_id = p_negocio
    and (public.negocio_de(auth.uid()) = p_negocio or public.is_admin() or public.puede_comprar(auth.uid(), p_negocio)
         or exists (select 1 from public.profiles t where t.id = p_negocio and t.slug is not null))
  order by v.clave, v.orden
$$;

-- Arma las líneas con precios del servidor y revisa stock (ahora también el precio y stock de cada opción).
create or replace function public.armar_pedido(p_negocio uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; k text; n int; op text; ops text; nom text; pre numeric; st int; vp numeric; vs int; hay boolean; lineas jsonb := '[]'::jsonb; sub numeric := 0;
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
      select true, v.precio, case when v.stock is null then null else v.stock - public.apartado_op(p_negocio, k, v.nombre) end into hay, vp, vs
      from public.variantes v where v.owner_id = p_negocio and v.clave = k and lower(v.nombre) = lower(op);
      if hay then pre := coalesce(vp, pre); if vs is not null then st := least(coalesce(st, vs), vs); end if; end if;
    end if;
    if nom is null or pre is null then return jsonb_build_object('error', 'Un producto ya no está disponible: actualiza el pedido'); end if;
    if st is not null and st < n then
      nom := nom || coalesce(' (' || op || ')', '');
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

-- Descontar / devolver stock: del producto y de su opción.
create or replace function public.mover_stock(p public.pedidos, signo int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.catalog_items c set stock = greatest(0, c.stock + signo * z.cant)
  from (select l ->> 'clave' k, sum((l ->> 'cant')::int) cant from jsonb_array_elements(p.lineas) l group by 1) z
  where c.owner_id = p.negocio_id and c.client_key = z.k and c.stock is not null;
  update public.variantes v set stock = greatest(0, v.stock + signo * z.cant)
  from (select l ->> 'clave' k, lower(l ->> 'opcion') o, sum((l ->> 'cant')::int) cant from jsonb_array_elements(p.lineas) l where l ->> 'opcion' is not null group by 1, 2) z
  where v.owner_id = p.negocio_id and v.clave = z.k and lower(v.nombre) = z.o and v.stock is not null;
end $$;

revoke all on function public.apartado_op(uuid, text, text), public.mover_stock(public.pedidos, int), public.armar_pedido(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.variantes_guardar(text, jsonb), public.variantes_de(uuid) from public, anon;
grant execute on function public.variantes_guardar(text, jsonb) to authenticated;
grant execute on function public.variantes_de(uuid) to anon, authenticated;

-- =====================================================================
--  VERSIÓN 5.20 · 🔔 "Volvió el stock" también por opción: si una opción (color, talla…) vuelve a tener stock,
--  avisa a quienes pidieron "Avísame" de ese producto.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.20'::text $$;

create or replace function public.variante_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; nom text;
begin
  if new.stock is null or new.stock <= coalesce(old.stock, 0) then return new; end if;
  if new.stock - public.apartado_op(new.owner_id, new.clave, new.nombre) <= 0 then return new; end if;
  select c.nombre into nom from public.catalog_items c where c.owner_id = new.owner_id and c.client_key = new.clave
    and (c.stock is null or c.stock - public.apartado(new.owner_id, new.clave) > 0);
  if nom is null then return new; end if;
  for r in delete from public.avisos_stock where negocio_id = new.owner_id and clave = new.clave returning cliente_id loop
    perform public.notify_user(r.cliente_id, '🔔 ¡Llegó ' || nom || ' (' || new.nombre || ')!', 'Volvió a haber stock. Pídelo antes de que se agote.', 'apps/catalogo/');
  end loop;
  return new;
end $$;
drop trigger if exists variantes_stock_avisos on public.variantes;
create trigger variantes_stock_avisos after insert or update of stock on public.variantes for each row execute function public.variante_avisos();
revoke all on function public.variante_avisos() from public, anon, authenticated;

-- =====================================================================
--  VERSIÓN 5.21 · 📦 Inventario: la venta en Caja descuenta también la opción (color, talla…),
--  "Entró mercadería" suma stock sin pisar ventas, e inventario() da el stock real de productos y opciones.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.21'::text $$;

-- Venta en la Caja: descuenta del producto y, si trae opción, de esa opción (dueño o equipo).
create or replace function public.caja_descontar(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); it jsonb; c int;
begin
  if n is null then raise exception 'Sin permiso'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 500 then raise exception 'Lista no válida'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    c := least(greatest(coalesce((it ->> 'cant')::int, 0), 0), 999);
    continue when c = 0;
    update public.catalog_items set stock = greatest(0, stock - c)
    where owner_id = n and client_key = it ->> 'clave' and stock is not null;
    if nullif(trim(coalesce(it ->> 'opcion', '')), '') is not null then
      update public.variantes set stock = greatest(0, stock - c)
      where owner_id = n and clave = it ->> 'clave' and lower(nombre) = lower(trim(it ->> 'opcion')) and stock is not null;
    end if;
  end loop;
end $$;

-- Entró mercadería (o ajuste): suma o resta al stock actual del producto o de una opción. Devuelve el stock nuevo.
create or replace function public.stock_sumar(p_clave text, p_opcion text, p_cant int) returns int
language plpgsql security definer set search_path = '' as $$
declare n uuid := auth.uid(); r int;
begin
  if not public.is_business(n) then raise exception 'Solo el dueño del negocio'; end if;
  if p_cant is null or p_cant = 0 or abs(p_cant) > 100000 then raise exception 'Cantidad no válida'; end if;
  if nullif(trim(coalesce(p_opcion, '')), '') is null then
    update public.catalog_items set stock = least(1000000, greatest(0, coalesce(stock, 0) + p_cant)), updated_at = now()
    where owner_id = n and client_key = p_clave returning stock into r;
  else
    update public.variantes set stock = least(1000000, greatest(0, coalesce(stock, 0) + p_cant))
    where owner_id = n and clave = p_clave and lower(nombre) = lower(trim(p_opcion)) returning stock into r;
  end if;
  if r is null then raise exception 'Publica el producto primero'; end if;
  return r;
end $$;

-- Inventario del negocio (dueño o equipo): stock real, lo apartado por pedidos y el precio de cada opción (opcion null = el producto).
create or replace function public.inventario() returns table (clave text, opcion text, stock int, apartado int, precio numeric)
language sql stable security definer set search_path = '' as $$
  select c.client_key, null::text, c.stock, public.apartado(c.owner_id, c.client_key), null::numeric
  from public.catalog_items c where c.owner_id = public.negocio_de(auth.uid()) and c.stock is not null
  union all
  select v.clave, v.nombre, v.stock, public.apartado_op(v.owner_id, v.clave, v.nombre), v.precio
  from public.variantes v where v.owner_id = public.negocio_de(auth.uid())
$$;

-- 🔔 El aviso de un pedido abre ESE pedido: a 'apps/pedidos/' le suma ?p=<id> del pedido creado o cambiado en esta misma operación.
create or replace function public.aviso_pedido_url() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n uuid; pid uuid;
begin
  if new.url is distinct from 'apps/pedidos/' or new.target_id is null then return new; end if;
  n := coalesce(public.negocio_de(new.target_id), new.target_id);
  select x.id into pid from public.pedidos x where x.negocio_id = n and (x.created_at = now() or x.updated_at = now())
  order by x.updated_at desc limit 1;
  if pid is not null then new.url := 'apps/pedidos/?p=' || pid; end if;
  return new;
end $$;
drop trigger if exists notifications_pedido_url on public.notifications;
create trigger notifications_pedido_url before insert on public.notifications for each row execute function public.aviso_pedido_url();
revoke all on function public.aviso_pedido_url() from public, anon, authenticated;

revoke all on function public.caja_descontar(jsonb), public.stock_sumar(text, text, int), public.inventario() from public, anon;
grant execute on function public.caja_descontar(jsonb), public.stock_sumar(text, text, int), public.inventario() to authenticated;


-- =====================================================================
--  VERSIÓN 5.22 · 👥 Equipo con roles: vendedor (Caja y Pedidos), bodega (Inventario y Pedidos)
--  y admin (Caja, Inventario, Pedidos y Estadísticas). El dueño elige el rol de cada persona.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.22'::text $$;

alter table public.profiles add column if not exists equipo_rol text not null default 'vendedor';
alter table public.profiles drop constraint if exists profiles_equipo_rol_check;
alter table public.profiles add constraint profiles_equipo_rol_check check (equipo_rol in ('vendedor', 'bodega', 'admin'));

-- ¿Puede la persona conectada usar esta parte de la tienda? (caja, inventario, pedidos, estadisticas). El dueño, todo.
create or replace function public.equipo_puede(p_que text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when p.role in ('user', 'admin') then true
    when p.role = 'equipo' then case p.equipo_rol
      when 'admin' then p_que in ('caja', 'inventario', 'pedidos', 'estadisticas')
      when 'bodega' then p_que in ('inventario', 'pedidos')
      else p_que in ('caja', 'pedidos') end
    else false end
  from public.profiles p where p.id = auth.uid() and not p.suspended), false)
$$;

-- El dueño cambia el rol de una persona de su equipo.
create or replace function public.equipo_rol(p_email text, p_rol text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_rol not in ('vendedor', 'bodega', 'admin') then raise exception 'Rol no válido'; end if;
  update public.profiles set equipo_rol = p_rol
  where lower(email) = lower(trim(coalesce(p_email, ''))) and role = 'equipo' and negocio_id = auth.uid() and public.is_business(auth.uid());
  if not found then raise exception 'No es de tu equipo'; end if;
end $$;

drop function if exists public.mi_equipo();
create function public.mi_equipo() returns table (id uuid, nombre text, email text, desde timestamptz, visto timestamptz, rol text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.empresa, p.email, p.created_at, p.visto_at, p.equipo_rol from public.profiles p
  where p.negocio_id = auth.uid() and p.role = 'equipo' and public.is_business(auth.uid()) order by p.created_at
$$;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan, 'role', p.role,
    'pro_until', p.pro_until, 'suspended', p.suspended, 'trial_used', p.trial_used,
    'mute_offers', p.mute_offers, 'terms_at', p.terms_at,
    'negocio_id', p.negocio_id, 'negocio', n.empresa, 'telefono', p.telefono, 'negocio_telefono', n.telefono,
    'logo', p.logo, 'negocio_logo', n.logo, 'color', p.color, 'negocio_color', n.color,
    'avisos_limpios_at', p.avisos_limpios_at, 'slug', coalesce(p.slug, n.slug),
    'equipo_rol', case when p.role = 'equipo' then p.equipo_rol end,
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin(), 'mods', public.mis_modulos(p.id))
  from public.profiles p left join public.profiles n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;

-- Venta en la Caja: solo quien puede vender (dueño, vendedor o admin del equipo).
create or replace function public.caja_descontar(p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); it jsonb; c int;
begin
  if n is null or not public.equipo_puede('caja') then raise exception 'Sin permiso para vender en la Caja'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 500 then raise exception 'Lista no válida'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    c := least(greatest(coalesce((it ->> 'cant')::int, 0), 0), 999);
    continue when c = 0;
    update public.catalog_items set stock = greatest(0, stock - c)
    where owner_id = n and client_key = it ->> 'clave' and stock is not null;
    if nullif(trim(coalesce(it ->> 'opcion', '')), '') is not null then
      update public.variantes set stock = greatest(0, stock - c)
      where owner_id = n and clave = it ->> 'clave' and lower(nombre) = lower(trim(it ->> 'opcion')) and stock is not null;
    end if;
  end loop;
end $$;

-- Entró mercadería: el dueño, o bodega/admin del equipo (al stock de su negocio).
create or replace function public.stock_sumar(p_clave text, p_opcion text, p_cant int) returns int
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); r int;
begin
  if n is null or not public.equipo_puede('inventario') then raise exception 'Sin permiso para el inventario'; end if;
  if p_cant is null or p_cant = 0 or abs(p_cant) > 100000 then raise exception 'Cantidad no válida'; end if;
  if nullif(trim(coalesce(p_opcion, '')), '') is null then
    update public.catalog_items set stock = least(1000000, greatest(0, coalesce(stock, 0) + p_cant)), updated_at = now()
    where owner_id = n and client_key = p_clave returning stock into r;
  else
    update public.variantes set stock = least(1000000, greatest(0, coalesce(stock, 0) + p_cant))
    where owner_id = n and clave = p_clave and lower(nombre) = lower(trim(p_opcion)) returning stock into r;
  end if;
  if r is null then raise exception 'Publica el producto primero'; end if;
  return r;
end $$;

revoke all on function public.equipo_puede(text), public.equipo_rol(text, text), public.mi_equipo(), public.my_account(),
  public.caja_descontar(jsonb), public.stock_sumar(text, text, int) from public, anon;
grant execute on function public.equipo_puede(text), public.equipo_rol(text, text), public.mi_equipo(), public.my_account(),
  public.caja_descontar(jsonb), public.stock_sumar(text, text, int) to authenticated;
-- =====================================================================
--  VERSIÓN 5.23 · ⚡ Mercado Pago automático: la tienda pega su Access Token y el cliente paga con
--  Mercado Pago (Checkout Pro). El pedido se aprueba solo (al volver del pago y cada 2 min): sin comprobante.
--  El token queda solo en la base (nadie lo puede leer, ni el equipo ni la app).
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.23'::text $$;

create table if not exists public.mp_cuentas (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  token      text not null,
  nick       text,
  activo     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.mp_cuentas enable row level security;
revoke all on public.mp_cuentas from anon, authenticated;
alter table public.pedidos add column if not exists mp_desde timestamptz;
alter table public.pedidos add column if not exists mp_pago text;

-- Llamada a la API de Mercado Pago con el token de la tienda (solo dentro de la base).
create or replace function public.mp_api(p_token text, p_metodo text, p_ruta text, p_cuerpo jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st int; c text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
  execute 'select status, content from extensions.http(row($1, $2, $3, $4, $5)::extensions.http_request)' into st, c
    using p_metodo, 'https://api.mercadopago.com' || p_ruta, array[row('Authorization', 'Bearer ' || p_token)::extensions.http_header],
          'application/json', p_cuerpo::text;
  return jsonb_build_object('status', st, 'body', case when c ~ '^\s*[\{\[]' then c::jsonb end);
exception when others then
  return jsonb_build_object('status', 0, 'error', sqlerrm);
end $$;

-- Para los pedidos: si la tienda tiene Mercado Pago activo, el "link" lleva mp = true (el pedido queda por pagar).
create or replace function public.link_activo(o uuid, t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when t = 'pedido' and exists (select 1 from public.mp_cuentas m where m.owner_id = o and m.activo)
    then coalesce(s.l, '{}'::jsonb) || '{"mp": true}'::jsonb else s.l end
  from (select (select jsonb_build_object('titulo', titulo, 'url', url, 'precio', precio) from public.links_pago
                where owner_id = o and tipo = t and activo and url <> '' limit 1) as l) s
$$;

create or replace function public.mp_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('conectado', m.owner_id is not null, 'activo', coalesce(m.activo, false), 'nick', m.nick, 'fin', right(m.token, 4))
  from (select 1) x left join public.mp_cuentas m on m.owner_id = auth.uid()
$$;

-- El dueño conecta (token), activa/pausa (p_activo) o desconecta (sin token y p_activo null).
create or replace function public.mp_guardar(p_token text, p_activo boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tk text := nullif(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'), ''); r jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'user' and not suspended) then raise exception 'Solo el dueño de la tienda'; end if;
  if tk is null then
    if p_activo is null then delete from public.mp_cuentas where owner_id = auth.uid();
    else
      update public.mp_cuentas set activo = p_activo, updated_at = now() where owner_id = auth.uid();
      if not found and p_activo then raise exception 'Pega tu Access Token de Mercado Pago'; end if;
    end if;
    return public.mp_estado();
  end if;
  if tk !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$' or length(tk) > 300 then raise exception 'Ese no es un Access Token: empieza con APP_USR-'; end if;
  r := public.mp_api(tk, 'GET', '/users/me');
  if coalesce((r ->> 'status')::int, 0) = 0 then raise exception 'No se pudo conectar con Mercado Pago. Intenta de nuevo.'; end if;
  if (r ->> 'status')::int <> 200 then raise exception 'Mercado Pago no aceptó el token: copia el Access Token de producción'; end if;
  insert into public.mp_cuentas (owner_id, token, nick, activo)
  values (auth.uid(), tk, left(coalesce(r #>> '{body,nickname}', r #>> '{body,email}', ''), 80), coalesce(p_activo, true))
  on conflict (owner_id) do update set token = excluded.token, nick = excluded.nick, activo = excluded.activo, updated_at = now();
  perform public.auditar('Mercado Pago conectado', coalesce(r #>> '{body,nickname}', ''));
  return public.mp_estado();
end $$;

-- El cliente (con cuenta o con su enlace) pide el pago: devuelve la página de Mercado Pago.
create or replace function public.mp_pagar(p_ref text, p_volver text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref); tk text; t text; r jsonb; v text := left(coalesce(p_volver, ''), 500);
begin
  if x.id is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  if x.estado <> 'pagando' or x.retenido_hasta < now() then return jsonb_build_object('ok', false, 'error', 'Este pedido ya no espera pago'); end if;
  select token into tk from public.mp_cuentas where owner_id = x.negocio_id and activo;
  if tk is null then return jsonb_build_object('ok', false, 'error', 'La tienda no tiene Mercado Pago activo'); end if;
  if round(x.total) < 1 then return jsonb_build_object('ok', false, 'error', 'Monto no válido'); end if;
  if v !~ '^https://[^\s"<>]+$' then v := null; end if;
  select coalesce(nullif(trim(empresa), ''), 'Tienda') into t from public.profiles where id = x.negocio_id;
  r := public.mp_api(tk, 'POST', '/checkout/preferences', jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('id', x.id, 'title', left('Pedido en ' || t, 120), 'quantity', 1,
                                                  'currency_id', 'CLP', 'unit_price', round(x.total))),
    'external_reference', x.id::text,
    'payment_methods', jsonb_build_object('excluded_payment_types', jsonb_build_array(jsonb_build_object('id', 'ticket'))),
    'expires', true,
    'expiration_date_to', to_char(x.retenido_hasta at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000+00:00"'))
    || case when v is null then '{}'::jsonb else jsonb_build_object('back_urls', jsonb_build_object('success', v, 'pending', v, 'failure', v),
                                                                   'auto_return', 'approved') end);
  if coalesce((r ->> 'status')::int, 0) not in (200, 201) or r #>> '{body,init_point}' is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no respondió. Intenta de nuevo o usa otro medio de pago.');
  end if;
  update public.pedidos set mp_desde = coalesce(mp_desde, now()) where id = x.id;
  return jsonb_build_object('ok', true, 'url', r #>> '{body,init_point}');
end $$;

-- Busca en Mercado Pago un pago aprobado del pedido; si está, lo aprueba (igual que aprobar un comprobante).
create or replace function public.mp_confirmar(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; tk text; r jsonb; pg jsonb;
begin
  select * into x from public.pedidos where id = p_id for update;
  if x.id is null or x.estado not in ('pagando', 'expirado') or x.mp_desde is null or x.mp_pago is not null then return x.estado; end if;
  select token into tk from public.mp_cuentas where owner_id = x.negocio_id;
  if tk is null then return x.estado; end if;
  r := public.mp_api(tk, 'GET', '/v1/payments/search?sort=date_created&criteria=desc&external_reference=' || x.id::text);
  select e into pg from jsonb_array_elements(coalesce(r #> '{body,results}', '[]'::jsonb)) e
  where e ->> 'status' = 'approved' and e ->> 'external_reference' = x.id::text
    and coalesce(e ->> 'currency_id', 'CLP') = 'CLP' and (e ->> 'transaction_amount')::numeric >= round(x.total) limit 1;
  if pg is null then return x.estado; end if;
  perform public.mover_stock(x, -1);
  update public.pedidos set estado = 'preparando', pagado_at = now(), stock_descontado = true, motivo = null,
    mp_pago = left(pg ->> 'id', 40), updated_at = now() where id = x.id;
  perform public.notify_user(x.negocio_id, '⚡ Pagado con Mercado Pago', coalesce(x.invitado_nombre, 'Un cliente') || ' · $' ||
    to_char(x.total, 'FM999G999G999') || case when x.estado = 'expirado' then ' · llegó tarde: revisa el stock' else '' end, 'apps/pedidos/');
  perform public.aviso_cliente(x, '✅ Pago recibido', 'Mercado Pago aprobó tu pago: estamos preparando tu pedido');
  return 'preparando';
end $$;

create or replace function public.mp_revisar(p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos := public.pedido_ref(p_ref);
begin
  if x.id is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  return jsonb_build_object('ok', true, 'estado', public.mp_confirmar(x.id));
end $$;

-- Cada 2 minutos: revisa los pedidos que abrieron Mercado Pago (por si el cliente no volvió a la página).
create or replace function public.mp_revisar_pendientes() returns int
language plpgsql security definer set search_path = '' as $$
declare i uuid; n int := 0;
begin
  for i in select id from public.pedidos
           where mp_desde is not null and mp_pago is null and mp_desde > now() - interval '1 day'
             and (estado = 'pagando' or (estado = 'expirado' and updated_at > now() - interval '30 minutes'))
           order by mp_desde desc limit 40 loop
    if public.mp_confirmar(i) = 'preparando' then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.mp_api(text, text, text, jsonb), public.mp_confirmar(uuid), public.mp_revisar_pendientes() from public, anon, authenticated;
revoke all on function public.mp_estado(), public.mp_guardar(text, boolean), public.mp_pagar(text, text), public.mp_revisar(text) from public, anon;
grant execute on function public.mp_estado(), public.mp_guardar(text, boolean) to authenticated;
grant execute on function public.mp_pagar(text, text), public.mp_revisar(text) to anon, authenticated;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mp-revisar';
  perform cron.schedule('mp-revisar', '*/2 * * * *', 'select public.mp_revisar_pendientes()');
exception when others then
  raise notice 'Revisión de Mercado Pago no programada (%).', sqlerrm;
end $$;
-- =====================================================================
--  VERSIÓN 5.24 · 🧾 Boleta SII: la tienda guarda sus datos de emisor y entrega la boleta del pedido.
--  Manual: emite en el portal gratuito del SII y anota el folio. Automática: con su API key de OpenFactura
--  (Haulmer) la boleta electrónica (tipo 39) se emite sola al pagar o entregar. La API key queda solo en la base.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.24'::text $$;

create table if not exists public.boleta_cuentas (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  modo       text not null default 'manual' check (modo in ('manual', 'openfactura')),
  apikey     text,
  rut        text not null,
  razon      text not null,
  giro       text not null,
  direccion  text not null,
  comuna     text not null,
  auto       boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.boleta_cuentas enable row level security;
revoke all on public.boleta_cuentas from anon, authenticated;
alter table public.pedidos add column if not exists boleta_folio text;
alter table public.pedidos add column if not exists boleta_url text;
alter table public.pedidos add column if not exists boleta_at timestamptz;
alter table public.pedidos add column if not exists boleta_error text;
alter table public.pedidos add column if not exists boleta_intentos int not null default 0;

-- RUT chileno con dígito verificador (módulo 11): devuelve '12345678-5' o null.
create or replace function public.rut_normal(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare r text := upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')); c text; s int := 0; m int := 2; d text;
begin
  if r !~ '^[0-9]{7,8}[0-9K]$' then return null; end if;
  c := left(r, -1);
  for i in reverse length(c)..1 loop s := s + substr(c, i, 1)::int * m; m := case when m = 7 then 2 else m + 1 end; end loop;
  d := case 11 - s % 11 when 11 then '0' when 10 then 'K' else (11 - s % 11)::text end;
  return case when d = right(r, 1) then ltrim(c, '0') || '-' || d end;
end $$;

-- Lo que ve la tienda (dueño o su equipo); la API key nunca sale, solo sus 4 últimos caracteres al dueño.
create or replace function public.boleta_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('conectado', b.owner_id is not null, 'modo', b.modo, 'rut', b.rut, 'razon', b.razon, 'giro', b.giro,
    'direccion', b.direccion, 'comuna', b.comuna, 'auto', coalesce(b.auto, true),
    'fin', case when b.owner_id = auth.uid() then right(b.apikey, 4) end)
  from (select 1) x left join public.boleta_cuentas b on b.owner_id = public.negocio_de(auth.uid())
$$;

-- El dueño guarda sus datos de emisor (p null = quitar). apikey vacía mantiene la anterior.
create or replace function public.boleta_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  md text := coalesce(p ->> 'modo', 'manual');
  rt text := public.rut_normal(p ->> 'rut');
  k text := nullif(regexp_replace(coalesce(p ->> 'apikey', ''), '\s', '', 'g'), '');
  t text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'user' and not suspended) then raise exception 'Solo el dueño de la tienda'; end if;
  if p is null then delete from public.boleta_cuentas where owner_id = auth.uid(); return public.boleta_estado(); end if;
  if md not in ('manual', 'openfactura') then raise exception 'Modo no válido'; end if;
  if rt is null then raise exception 'RUT no válido: revisa el número y el dígito verificador'; end if;
  foreach t in array array['razon', 'giro', 'direccion', 'comuna'] loop
    if length(trim(coalesce(p ->> t, ''))) < 2 then
      raise exception 'Falta %', case t when 'razon' then 'la razón social' when 'giro' then 'el giro' when 'direccion' then 'la dirección' else 'la comuna' end;
    end if;
  end loop;
  if k is not null and (k !~ '^[A-Za-z0-9_-]{16,120}$') then raise exception 'Esa no parece una API key de OpenFactura'; end if;
  if md = 'openfactura' and k is null and not exists (select 1 from public.boleta_cuentas where owner_id = auth.uid() and apikey is not null) then
    raise exception 'Pega tu API key de OpenFactura';
  end if;
  insert into public.boleta_cuentas (owner_id, modo, apikey, rut, razon, giro, direccion, comuna, auto)
  values (auth.uid(), md, k, rt, left(trim(p ->> 'razon'), 100), left(trim(p ->> 'giro'), 80), left(trim(p ->> 'direccion'), 70),
          left(trim(p ->> 'comuna'), 20), coalesce((p ->> 'auto')::boolean, true))
  on conflict (owner_id) do update set modo = excluded.modo, apikey = coalesce(excluded.apikey, public.boleta_cuentas.apikey),
    rut = excluded.rut, razon = excluded.razon, giro = excluded.giro, direccion = excluded.direccion, comuna = excluded.comuna,
    auto = excluded.auto, updated_at = now();
  perform public.auditar('Boleta SII configurada', md || ' · ' || rt);
  return public.boleta_estado();
end $$;

-- Boleta electrónica (tipo 39, precios con IVA) del pedido, en el formato de OpenFactura.
create or replace function public.boleta_dte(x public.pedidos, c public.boleta_cuentas) returns jsonb
language plpgsql stable set search_path = '' as $$
declare det jsonb := '[]'::jsonb; l jsonb; n int := 0; suma numeric := 0; m numeric; q numeric; tot numeric := round(x.total); neto numeric; d numeric;
begin
  for l in select * from jsonb_array_elements(x.lineas) loop
    exit when n >= 59;
    q := greatest(coalesce((l ->> 'cant')::numeric, 1), 1); m := round(coalesce((l ->> 'subtotal')::numeric, 0));
    if m <= 0 then continue; end if;
    n := n + 1; suma := suma + m;
    det := det || jsonb_build_object('NroLinDet', n, 'NmbItem', left(coalesce(nullif(trim(l ->> 'nombre'), ''), 'Producto'), 80),
      'QtyItem', q, 'PrcItem', round(m / q, 2), 'MontoItem', m);
  end loop;
  if suma < tot then n := n + 1; det := det || jsonb_build_object('NroLinDet', n, 'NmbItem', 'Otros', 'QtyItem', 1, 'PrcItem', tot - suma, 'MontoItem', tot - suma); suma := tot; end if;
  d := suma - tot; neto := round(tot / 1.19);
  return jsonb_build_object('response', jsonb_build_array('FOLIO', 'SELF_SERVICE'), 'dte', jsonb_build_object(
    'Encabezado', jsonb_build_object(
      'IdDoc', jsonb_build_object('TipoDTE', 39, 'Folio', 0, 'FchEmis', to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD'), 'IndServicio', 3),
      'Emisor', jsonb_build_object('RUTEmisor', c.rut, 'RznSocEmisor', c.razon, 'GiroEmisor', c.giro, 'DirOrigen', c.direccion, 'CmnaOrigen', c.comuna),
      'Receptor', jsonb_build_object('RUTRecep', '66666666-6'),
      'Totales', jsonb_build_object('MntNeto', neto, 'IVA', tot - neto, 'MntTotal', tot)),
    'Detalle', det) || case when d > 0 then jsonb_build_object('DscRcgGlobal', jsonb_build_array(
      jsonb_build_object('NroLinDR', 1, 'TpoMov', 'D', 'GlosaDR', 'Descuento', 'TpoValor', '$', 'ValorDR', d))) else '{}'::jsonb end);
end $$;

create or replace function public.of_api(p_key text, p_cuerpo jsonb, p_idem text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st int; c text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  execute 'select status, content from extensions.http(row($1, $2, $3, $4, $5)::extensions.http_request)' into st, c
    using 'POST', 'https://api.haulmer.com/v2/dte/document',
          array[row('apikey', p_key)::extensions.http_header, row('Idempotency-Key', p_idem)::extensions.http_header], 'application/json', p_cuerpo::text;
  return jsonb_build_object('status', st, 'body', case when c ~ '^\s*[\{\[]' then c::jsonb end);
exception when others then
  return jsonb_build_object('status', 0, 'error', sqlerrm);
end $$;

-- Emite en OpenFactura (sin revisar quién llama: lo usan boleta_emitir y la revisión cada 5 min).
create or replace function public.boleta_intentar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; c public.boleta_cuentas; r jsonb; f text; e text;
begin
  select * into x from public.pedidos where id = p_id for update;
  if x.id is null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  if x.boleta_folio is not null then return jsonb_build_object('ok', true, 'folio', x.boleta_folio, 'url', x.boleta_url); end if;
  if x.estado not in ('preparando', 'listo', 'en_camino', 'entregado') then return jsonb_build_object('ok', false, 'error', 'El pedido aún no está pagado'); end if;
  if round(x.total) < 1 then return jsonb_build_object('ok', false, 'error', 'Pedido sin monto'); end if;
  select * into c from public.boleta_cuentas where owner_id = x.negocio_id;
  if c.owner_id is null or c.modo <> 'openfactura' or c.apikey is null then return jsonb_build_object('ok', false, 'error', 'Configura la boleta automática en Ajustes'); end if;
  r := public.of_api(c.apikey, public.boleta_dte(x, c), 'cfx-' || x.id::text);
  f := nullif(coalesce(r #>> '{body,FOLIO}', r #>> '{body,folio}'), '');
  if coalesce((r ->> 'status')::int, 0) in (200, 201) and f is not null then
    update public.pedidos set boleta_folio = left(f, 20), boleta_url = case when r #>> '{body,SELF_SERVICE,url}' ~ '^https://[^\s"<>]+$' then left(r #>> '{body,SELF_SERVICE,url}', 500) end,
      boleta_at = now(), boleta_error = null where id = x.id returning * into x;
    perform public.aviso_cliente(x, '🧾 Tu boleta', 'Boleta electrónica N° ' || f || ' de tu pedido');
    return jsonb_build_object('ok', true, 'folio', x.boleta_folio, 'url', x.boleta_url);
  end if;
  e := left(coalesce(case when (r ->> 'status')::int = 0 then 'No se pudo conectar con OpenFactura' end,
                     r #>> '{body,error,message}', r #>> '{body,message}', 'OpenFactura respondió ' || coalesce(r ->> 'status', '?')), 200);
  if (r ->> 'status')::int in (401, 403) then e := 'OpenFactura no aceptó la API key'; end if;
  update public.pedidos set boleta_error = e, boleta_intentos = boleta_intentos + 1 where id = x.id;
  return jsonb_build_object('ok', false, 'error', e);
end $$;

-- La tienda (dueño o equipo con Pedidos) emite la boleta de un pedido pagado.
create or replace function public.boleta_emitir(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.equipo_puede('pedidos') or not exists (select 1 from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid())) then
    raise exception 'Sin permiso';
  end if;
  return public.boleta_intentar(p_id);
end $$;

-- Modo manual: anota el folio de la boleta emitida en el SII (folio null = borrar si te equivocaste).
create or replace function public.boleta_anotar(p_id uuid, p_folio text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; f text := nullif(regexp_replace(coalesce(p_folio, ''), '\D', '', 'g'), '');
begin
  select * into x from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid()) for update;
  if x.id is null or not public.equipo_puede('pedidos') then raise exception 'Sin permiso'; end if;
  if x.estado not in ('preparando', 'listo', 'en_camino', 'entregado') then raise exception 'El pedido aún no está pagado'; end if;
  if f is not null and length(f) > 10 then raise exception 'Folio no válido'; end if;
  if x.boleta_url is not null then raise exception 'Esta boleta la emitió OpenFactura: no se cambia'; end if;
  update public.pedidos set boleta_folio = f, boleta_at = case when f is null then null else now() end, boleta_error = null
  where id = x.id returning * into x;
  if f is not null then perform public.aviso_cliente(x, '🧾 Tu boleta', 'Boleta electrónica N° ' || f || ' de tu pedido'); end if;
  return jsonb_build_object('ok', true, 'folio', f);
end $$;

-- Cada 5 minutos: boleta automática de los pedidos pagados en línea o entregados (hasta 5 intentos, últimos 3 días).
create or replace function public.boleta_pendientes() returns int
language plpgsql security definer set search_path = '' as $$
declare i uuid; n int := 0;
begin
  for i in select x.id from public.pedidos x join public.boleta_cuentas c on c.owner_id = x.negocio_id
           where c.modo = 'openfactura' and c.auto and c.apikey is not null and x.boleta_folio is null and x.boleta_intentos < 5
             and x.estado in ('preparando', 'listo', 'en_camino', 'entregado') and (x.pagado_at is not null or x.estado = 'entregado')
             and x.updated_at > now() - interval '3 days'
           order by x.updated_at limit 30 loop
    if (public.boleta_intentar(i) ->> 'ok')::boolean then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Lo que ve el cliente y la tienda de la boleta del pedido.
create or replace function public.boleta_de(x public.pedidos) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when x.boleta_folio is not null then jsonb_build_object('folio', x.boleta_folio, 'url', x.boleta_url, 'fecha', x.boleta_at,
    'rut', c.rut, 'razon', c.razon) when x.boleta_error is not null then jsonb_build_object('error', x.boleta_error) end
  from (select 1) z left join public.boleta_cuentas c on c.owner_id = x.negocio_id
$$;

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
    'calificado', public.cfx_calif_hecha(x.id::text, false),
    'boleta', case when x.boleta_folio is not null then public.boleta_de(x) end);
end $$;

drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric,
               premium boolean, desc_premium numeric, rechazos int, motivo text, boleta jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and q.de_negocio),
         (select round(avg(q.estrellas), 1) from public.calificaciones q join public.pedidos y on y.id = q.pedido_id
          where q.de_negocio and ((x.cliente_id is not null and y.cliente_id = x.cliente_id) or (x.cliente_id is null and y.invitado_tel = x.invitado_tel))),
         pr.premium, x.desc_premium, x.rechazos, x.motivo, public.boleta_de(x)
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
               desc_premium numeric, motivo text, rechazos int, boleta jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, t.empresa, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at, x.retenido_hasta, x.comprobante is not null, x.devolucion,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and not q.de_negocio), x.token, x.desc_premium, x.motivo, x.rechazos,
         case when x.boleta_folio is not null then public.boleta_de(x) end
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;

revoke all on function public.of_api(text, jsonb, text), public.boleta_intentar(uuid), public.boleta_pendientes(),
  public.boleta_dte(public.pedidos, public.boleta_cuentas), public.boleta_de(public.pedidos) from public, anon, authenticated;
revoke all on function public.boleta_estado(), public.boleta_guardar(jsonb), public.boleta_emitir(uuid), public.boleta_anotar(uuid, text),
  public.mis_pedidos(uuid), public.pedidos_tienda(text) from public, anon;
grant execute on function public.boleta_estado(), public.boleta_guardar(jsonb), public.boleta_emitir(uuid), public.boleta_anotar(uuid, text),
  public.mis_pedidos(uuid), public.pedidos_tienda(text) to authenticated;
grant execute on function public.rut_normal(text) to anon, authenticated;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'boleta-emitir';
  perform cron.schedule('boleta-emitir', '*/5 * * * *', 'select public.boleta_pendientes()');
exception when others then
  raise notice 'Boleta automática no programada (%).', sqlerrm;
end $$;
-- =====================================================================
--  VERSIÓN 5.26 · 🛡️ Seguridad (núcleo 2.44): anon sin funciones de admin, buckets con límite y Turnstile en compras sin cuenta.
-- =====================================================================
create or replace function public.db_version() returns text
language sql immutable as $$ select '5.42'::text $$;

-- =====================================================================
--  VERSIÓN 5.28 · ✅ Qué hacer hoy: el inicio del negocio arma su lista de tareas del día.
-- =====================================================================
create or replace function public.hoy_negocio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.negocio_de(auth.uid()); d timestamptz := public.hoy_cl()::timestamp at time zone 'America/Santiago';
  t public.profiles;
begin
  if n is null then raise exception 'Sin permiso'; end if;
  select * into t from public.profiles where id = n;
  return jsonb_build_object(
    'revisar', (select count(*) from public.pedidos where negocio_id = n and estado = 'en_revision'),
    'activos', (select count(*) from public.pedidos where negocio_id = n and estado in ('recibido', 'preparando', 'listo', 'en_camino')),
    'nuevos', (select count(*) from public.pedidos where negocio_id = n and estado = 'recibido'),
    'preparando', (select count(*) from public.pedidos where negocio_id = n and estado = 'preparando'),
    'listos', (select count(*) from public.pedidos where negocio_id = n and estado in ('listo', 'en_camino')),
    'pagando', (select count(*) from public.pedidos where negocio_id = n and estado = 'pagando'),
    'devolver', (select count(*) from public.pedidos where negocio_id = n and devolucion = 'pendiente'),
    'boleta_error', (select count(*) from public.pedidos where negocio_id = n and boleta_folio is null and boleta_error is not null and created_at > now() - interval '3 days'),
    'sin_leer', (select count(*) from public.cfx_mensajes where para = auth.uid() and leido is null),
    'hoy', (select count(*) from public.pedidos where negocio_id = n and created_at >= d),
    'vendido_hoy', (select coalesce(sum(total), 0) from public.pedidos where negocio_id = n and pagado_at >= d or (negocio_id = n and estado = 'entregado' and updated_at >= d and pagado_at is null)),
    'stock_bajo', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'stock', stock)), '[]') from public.catalog_items where owner_id = n and stock is not null and stock <= 3),
    'slug', public.asegurar_slug(n), 'link_pago', public.link_activo(n, 'pedido') is not null,
    'productos', (select count(*) from public.catalog_items where owner_id = n),
    'abierto', coalesce(t.abierto, true), 'vacaciones', t.vacaciones_hasta is not null and t.vacaciones_hasta >= public.hoy_cl(),
    'pro_dias', case when t.plan = 'pro' and t.pro_until is not null and t.pro_until > now() then ceil(extract(epoch from t.pro_until - now()) / 86400)::int end,
    'estrellas', (public.cfx_calif_negocio(n) ->> 'promedio')::numeric);
end $$;

-- =====================================================================
--  VERSIÓN 5.29 · 🧾 Comprobante de venta: Pedidos sabe con qué pagó el cliente (Mercado Pago o transferencia).
-- =====================================================================
drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric,
               premium boolean, desc_premium numeric, rechazos int, motivo text, boleta jsonb, medio text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         exists (select 1 from public.calificaciones q where q.pedido_id = x.id and q.de_negocio),
         (select round(avg(q.estrellas), 1) from public.calificaciones q join public.pedidos y on y.id = q.pedido_id
          where q.de_negocio and ((x.cliente_id is not null and y.cliente_id = x.cliente_id) or (x.cliente_id is null and y.invitado_tel = x.invitado_tel))),
         pr.premium, x.desc_premium, x.rechazos, x.motivo, public.boleta_de(x),
         case when x.mp_pago is not null then 'mercadopago' when x.comprobante_at is not null then 'transferencia' end
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
revoke all on function public.pedidos_tienda(text) from public, anon;
grant execute on function public.pedidos_tienda(text) to authenticated;

-- =====================================================================
--  VERSIÓN 5.42 · G25 ⏰ Renovación obligatoria: todo plan Pro/Premium tiene fecha de término (mensual 30 días, anual 365, regalo los días
--  que se den) y se corta solo al vencer; nunca queda "permanente" (solo el administrador). Los módulos ya vencían solos (hasta).
-- =====================================================================
--  VERSIÓN 5.41 · Lanzamiento (núcleo 2.58): 📄 políticas de la tienda (Ley 19.496), 📦 despacho al resto de Chile (precio fijo o por pagar),
--  🚚 código de seguimiento por pedido (Starken, Chilexpress, Blue Express, Correos), ✉️ correo al comprador en cada estado,
--  📊 medir anuncios (Meta Pixel + Google Analytics) y 🌐 dominio propio (módulos). El código va al final (después del núcleo).
-- =====================================================================

-- =====================================================================
--  VERSIÓN 5.40 · G20 🏪 Negocios desde el Centro de Mando (núcleo cfx_negocios / cfx_premium_cuenta / cfx_key_aplicar).
--  Ganchos: la lista de cuentas (negocios = dueños de tienda; clientes) y quitar Premium. Sin tablas nuevas.
-- =====================================================================
create or replace function public.cfx_cuentas_app(p_rol text, p_q text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'nombre', p.empresa, 'rol', p_rol,
    'premium_hasta', case when p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()) then coalesce(p.pro_until, 'infinity'::timestamptz) end,
    'creado', p.created_at, 'suspendido', p.suspended) order by p.created_at desc), '[]'::jsonb)
  from (select * from public.profiles x
        where x.role = case when p_rol = 'cliente' then 'client' else 'user' end
          and (coalesce(p_q, '') = '' or x.email ilike '%' || p_q || '%' or coalesce(x.empresa, '') ilike '%' || p_q || '%')
        order by x.created_at desc limit 300) p
$$;
create or replace function public.cfx_quitar_premium(p_cuenta uuid) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set plan = 'free', pro_until = null where id = p_cuenta and role in ('user', 'client')
$$;
revoke all on function public.cfx_cuentas_app(text, text), public.cfx_quitar_premium(uuid) from public, anon, authenticated;

-- =====================================================================
--  VERSIÓN 5.39 · G19 🧩 Módulos de pago por negocio (núcleo modulos_venta.sql). Ganchos: quién es el negocio de una cuenta
--  (dueño o su equipo; clientes y admin no), si tiene Premium (descuento en módulos) y los módulos de Órbita.
--  Con la venta prendida, estadísticas, equipo, campañas, vender en redes y webhooks dejan de venir con el Pro (pro_o_modulo).
-- =====================================================================
create or replace function public.cfx_negocio_de_cuenta(u uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p.role when 'user' then p.id when 'equipo' then p.negocio_id end from public.profiles p where p.id = u and not p.suspended
$$;
create or replace function public.cfx_es_premium(n uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_pro(n) $$;
create or replace function public.cfx_modulos_app() returns text[]
language sql immutable as $$ select array['chat', 'calificaciones', 'cupones', 'sellos', 'carrito', 'analisis', 'estadisticas', 'equipo', 'campanas', 'redes', 'webhooks'] $$;
revoke all on function public.cfx_negocio_de_cuenta(uuid), public.cfx_es_premium(uuid), public.cfx_modulos_app() from public, anon, authenticated;

-- =====================================================================
--  VERSIÓN 5.38 · G37 🔌 Avisos a otro sistema (webhooks). La tienda Pro pega una URL https y Órbita le manda (POST JSON firmado)
--  cada pedido nuevo y cada cambio de estado. Cola con reintentos (1, 5, 30 min, 2 h y 12 h); 20 fallos seguidos lo pausan y avisan.
--  Encabezados: X-CodeFix-Evento, X-CodeFix-Id (id del evento: sirve para no procesarlo dos veces) y
--  X-CodeFix-Firma: t=<segundos unix>,v1=<hex de HMAC-SHA256(secreto, t || '.' || cuerpo)>. Guía: docs/webhooks.md.
--  Un pedido nunca falla por esto (el gancho no lanza errores) y los envíos se borran a los 7 días.
-- =====================================================================
create table if not exists public.webhooks (
  owner_id      uuid primary key references public.profiles (id) on delete cascade,
  url           text not null check (length(url) <= 300),
  secreto       text not null,
  activo        boolean not null default true,
  fallos        int not null default 0,
  ultimo_at     timestamptz,
  ultimo_status int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.webhooks enable row level security;
revoke all on public.webhooks from anon, authenticated;

create table if not exists public.webhook_envios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  evento      text not null,
  pedido_id   uuid,
  cuerpo      jsonb not null,
  intentos    int not null default 0,
  proximo     timestamptz not null default now(),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'ok', 'error')),
  status      int,
  respuesta   text,
  enviado_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists webhook_envios_pend_idx on public.webhook_envios (proximo) where estado = 'pendiente';
create index if not exists webhook_envios_owner_idx on public.webhook_envios (owner_id, created_at desc);
alter table public.webhook_envios enable row level security;
revoke all on public.webhook_envios from anon, authenticated;

-- Solo https a un nombre de dominio público (sin IPs, localhost ni redes internas) y sin usuario:clave en la URL.
create or replace function public.webhook_url_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(length(p_url) <= 300
    and lower(p_url) ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:443)?(/[^[:space:]]*)?$'
    and lower(substring(p_url from '^https://([^/:]+)')) !~ '(^|\.)(localhost|local|internal|intranet|lan|home|corp|arpa|test|invalid|example)$', false)
$$;

-- Lo que recibe el sistema de la tienda: el pedido con sus líneas y el contacto del cliente (datos que el dueño ya ve en Pedidos).
create or replace function public.webhook_cuerpo(p_id uuid, p_evento text, x public.pedidos, p_antes text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p_id, 'evento', p_evento, 'creado', now(),
    'tienda', jsonb_build_object('slug', t.slug, 'nombre', t.empresa),
    'pedido', jsonb_build_object('id', x.id, 'estado', x.estado, 'estado_anterior', p_antes,
      'fecha', x.created_at, 'pagado', x.pagado_at is not null, 'total', x.total, 'subtotal', x.subtotal, 'descuento', x.descuento,
      'costo_despacho', x.costo_despacho, 'cupon', x.cupon, 'entrega', x.entrega, 'direccion', x.direccion, 'comuna', x.comuna, 'nota', x.nota,
      'lineas', (select coalesce(jsonb_agg(jsonb_build_object('clave', l ->> 'clave', 'nombre', l ->> 'nombre', 'opcion', l ->> 'opcion',
          'cantidad', (l ->> 'cant')::numeric, 'precio', (l ->> 'precio')::numeric, 'subtotal', (l ->> 'subtotal')::numeric)), '[]')
        from jsonb_array_elements(case when jsonb_typeof(x.lineas) = 'array' then x.lineas else '[]' end) l),
      'cliente', jsonb_build_object('nombre', coalesce(nullif(c.empresa, ''), x.invitado_nombre, 'Cliente'), 'telefono', coalesce(c.telefono, x.invitado_tel))))
  from public.profiles t left join public.profiles c on c.id = x.cliente_id
  where t.id = x.negocio_id
$$;

-- Gancho: pedido nuevo o cambio de estado → a la cola (si la tienda es Pro y tiene la URL activa).
create or replace function public.webhook_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid := gen_random_uuid(); ev text := case when tg_op = 'INSERT' then 'pedido.creado' else 'pedido.estado' end;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return null; end if;
  if not exists (select 1 from public.webhooks w where w.owner_id = new.negocio_id and w.activo) or not public.pro_o_modulo(new.negocio_id, 'webhooks') then return null; end if;
  insert into public.webhook_envios (id, owner_id, evento, pedido_id, cuerpo)
  values (v, new.negocio_id, ev, new.id, public.webhook_cuerpo(v, ev, new, case when tg_op = 'UPDATE' then old.estado end));
  return null;
exception when others then
  return null; -- el pedido sigue igual aunque falle el aviso
end $$;
drop trigger if exists pedidos_webhook on public.pedidos;
create trigger pedidos_webhook after insert or update of estado on public.pedidos for each row execute function public.webhook_pedido();

-- Envía lo que toca (cron cada minuto; o uno solo con p_id para la prueba). Respuesta 2xx = entregado.
create or replace function public.webhook_enviar(p_id uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare e record; ts text; cuerpo text; st int; c text; ok boolean; n int := 0; pausa boolean;
begin
  for e in select v.id, v.owner_id, v.evento, v.cuerpo, v.intentos, w.url, w.secreto
           from public.webhook_envios v join public.webhooks w on w.owner_id = v.owner_id
           where v.estado = 'pendiente' and (p_id is null or v.id = p_id) and (p_id is not null or (v.proximo <= now() and w.activo))
           order by v.proximo limit 25 for update of v skip locked loop
    ts := extract(epoch from now())::bigint::text; cuerpo := e.cuerpo::text;
    begin
      if not public.webhook_url_ok(e.url) then raise exception 'URL no permitida'; end if;
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '5');
      execute 'select status, left(content, 300) from extensions.http(row($1, $2, $3, $4, $5)::extensions.http_request)' into st, c
        using 'POST', e.url, array[row('X-CodeFix-Evento', e.evento)::extensions.http_header, row('X-CodeFix-Id', e.id::text)::extensions.http_header,
          row('X-CodeFix-Firma', 't=' || ts || ',v1=' || encode(extensions.hmac(ts || '.' || cuerpo, e.secreto, 'sha256'), 'hex'))::extensions.http_header,
          row('User-Agent', 'CodeFix-Webhooks/1')::extensions.http_header], 'application/json', cuerpo;
    exception when others then st := 0; c := left(sqlerrm, 300);
    end;
    ok := coalesce(st between 200 and 299, false);
    update public.webhook_envios set intentos = intentos + 1, status = st, respuesta = c, enviado_at = now(),
      estado = case when ok then 'ok' when intentos + 1 >= 6 or evento = 'ping' then 'error' else 'pendiente' end,
      proximo = now() + (array[1, 5, 30, 120, 720])[least(intentos + 1, 5)] * interval '1 minute'
    where id = e.id;
    update public.webhooks set ultimo_at = now(), ultimo_status = st, fallos = case when ok then 0 else fallos + 1 end,
      activo = activo and (ok or fallos + 1 < 20), updated_at = now()
    where owner_id = e.owner_id returning fallos = 20 and not activo into pausa;
    if pausa then
      perform public.notify_user(e.owner_id, '🔌 Avisos a tu sistema en pausa', 'Tu URL no respondió 20 veces seguidas. Revísala en Ajustes → Vender en redes.', './#redes');
    end if;
    n := n + 1;
  end loop;
  if p_id is null then delete from public.webhook_envios where created_at < now() - interval '7 days'; end if;
  return n;
end $$;

create or replace function public.webhook_dueno() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = me and p.role in ('user', 'admin')) then raise exception 'Solo el dueño de la tienda'; end if;
  return me;
end $$;

-- Ajustes → Vender en redes: datos de la tienda + estado de los avisos (el secreto lo ve solo el dueño).
create or replace function public.conexiones_estado() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno(); w public.webhooks;
begin
  select * into w from public.webhooks where owner_id = me;
  return (select jsonb_build_object('slug', public.asegurar_slug(me), 'empresa', t.empresa, 'telefono', t.telefono, 'pro', public.pro_o_modulo(me, 'webhooks'), 'modulo', public.mis_modulos(me) is not null,
    'webhook', case when w.owner_id is not null then jsonb_build_object('url', w.url, 'activo', w.activo, 'secreto', w.secreto, 'fallos', w.fallos,
      'ultimo_at', w.ultimo_at, 'ultimo_status', w.ultimo_status,
      'envios', (select coalesce(jsonb_agg(z order by z.fecha desc), '[]') from (select v.evento, v.estado, v.status, v.intentos, v.created_at as fecha,
          v.cuerpo #>> '{pedido,estado}' as pedido_estado from public.webhook_envios v where v.owner_id = me order by v.created_at desc limit 10) z)) end)
    from public.profiles t where t.id = me);
end $$;

-- Guardar la URL (null = quitar los avisos). El secreto se crea la primera vez.
create or replace function public.webhook_guardar(p_url text, p_activo boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno(); u text := nullif(trim(coalesce(p_url, '')), '');
begin
  if u is null then
    delete from public.webhooks where owner_id = me;
    delete from public.webhook_envios where owner_id = me;
    return public.conexiones_estado();
  end if;
  if not public.pro_o_modulo(me, 'webhooks') then raise exception '%', case when public.mis_modulos(me) is not null then '🔗 Avisos a tu sistema es un módulo. Actívalo en Ajustes → 🧩 Módulos' else 'Los avisos a otro sistema son de la versión Pro' end; end if;
  if not public.webhook_url_ok(u) then raise exception 'La URL debe empezar con https:// y ser un dominio público (sin IP ni localhost)'; end if;
  insert into public.webhooks (owner_id, url, secreto, activo)
  values (me, u, 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex'), coalesce(p_activo, true))
  on conflict (owner_id) do update set url = excluded.url, activo = excluded.activo, updated_at = now(),
    fallos = case when (excluded.activo and not public.webhooks.activo) or excluded.url <> public.webhooks.url then 0 else public.webhooks.fallos end;
  return public.conexiones_estado();
end $$;

-- Secreto nuevo (si se filtró): el anterior deja de servir al tiro.
create or replace function public.webhook_secreto_nuevo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno();
begin
  update public.webhooks set secreto = 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex'), updated_at = now() where owner_id = me;
  if not found then raise exception 'Primero guarda la URL'; end if;
  return public.conexiones_estado();
end $$;

-- 🧪 Probar: manda un aviso "ping" ahora mismo y devuelve lo que respondió la URL (máx. 10 por hora).
create or replace function public.webhook_probar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno(); v uuid := gen_random_uuid(); r public.webhook_envios;
begin
  if not exists (select 1 from public.webhooks where owner_id = me) then raise exception 'Primero guarda la URL'; end if;
  if not public.pro_o_modulo(me, 'webhooks') then raise exception '%', case when public.mis_modulos(me) is not null then '🔗 Avisos a tu sistema es un módulo. Actívalo en Ajustes → 🧩 Módulos' else 'Los avisos a otro sistema son de la versión Pro' end; end if;
  if (select count(*) from public.webhook_envios where owner_id = me and evento = 'ping' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Ya probaste 10 veces en esta hora. Espera un rato.'; end if;
  insert into public.webhook_envios (id, owner_id, evento, cuerpo)
  values (v, me, 'ping', jsonb_build_object('id', v, 'evento', 'ping', 'creado', now(),
    'tienda', (select jsonb_build_object('slug', slug, 'nombre', empresa) from public.profiles where id = me)));
  perform public.webhook_enviar(v);
  select * into r from public.webhook_envios where id = v;
  return jsonb_build_object('ok', r.estado = 'ok', 'status', r.status, 'respuesta', r.respuesta);
end $$;

revoke all on function public.webhook_url_ok(text), public.webhook_cuerpo(uuid, text, public.pedidos, text), public.webhook_pedido(),
  public.webhook_enviar(uuid), public.webhook_dueno() from public, anon, authenticated;
revoke all on function public.conexiones_estado(), public.webhook_guardar(text, boolean), public.webhook_secreto_nuevo(), public.webhook_probar() from public, anon;
grant execute on function public.conexiones_estado(), public.webhook_guardar(text, boolean), public.webhook_secreto_nuevo(), public.webhook_probar() to authenticated;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'webhooks';
  perform cron.schedule('webhooks', '* * * * *', 'select public.webhook_enviar()');
exception when others then
  raise notice 'Envío de webhooks no programado (%).', sqlerrm;
end $$;

-- =====================================================================
--  VERSIÓN 5.37 · G16 F30: Pedidos → Estadísticas en vivo. Suma hoy, ventas de cada día (30 días) y pedidos por hora,
--  y la ve también el equipo con rol admin (antes leía la cuenta del que entraba, no la de la tienda).
-- =====================================================================
create or replace function public.estadisticas_tienda() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); n uuid; d0 date := public.hoy_cl();
begin
  select public.negocio_de(p.id) into n from public.profiles p
  where p.id = me and (p.role in ('user', 'admin') or (p.role = 'equipo' and p.equipo_rol = 'admin'));
  if n is null or not (public.is_business(n) and public.pro_o_modulo(n, 'estadisticas')) then raise exception '%', case when public.mis_modulos(n) is not null then '📈 Estadísticas es un módulo. Actívalo en Ajustes → 🧩 Módulos' else 'Las estadísticas son de la versión Pro' end; end if;
  return (with v as (
      select x.total, (x.created_at at time zone 'America/Santiago') t from public.pedidos x
      where x.negocio_id = n and x.created_at > now() - interval '31 days'
        and (x.estado = 'entregado' or (x.pagado_at is not null and x.estado not in ('cancelado', 'rechazado', 'expirado'))))
    select jsonb_build_object(
    'pedidos', (select count(*) from public.pedidos where negocio_id = n and created_at > now() - interval '30 days'),
    'ventas', (select coalesce(sum(total), 0) from public.pedidos where negocio_id = n and estado = 'entregado' and created_at > now() - interval '30 days'),
    'clientes', (select count(*) from public.profiles where negocio_id = n and role = 'client'),
    'hoy', (select jsonb_build_object('pedidos', count(*), 'monto', coalesce(sum(v.total), 0)) from v where v.t::date = d0),
    'dias', (select jsonb_agg(jsonb_build_object('f', g::date, 'pedidos', (select count(*) from v where v.t::date = g::date),
        'monto', (select coalesce(sum(v.total), 0) from v where v.t::date = g::date)) order by g)
      from generate_series(d0 - 29, d0, interval '1 day') g),
    'horas', (select jsonb_agg((select count(*) from v where extract(hour from v.t) = h) order by h) from generate_series(0, 23) h),
    'top_productos', (select coalesce(jsonb_agg(z), '[]') from (
        select l ->> 'nombre' as nombre, sum((l ->> 'cant')::int) as cant, sum((l ->> 'subtotal')::numeric) as monto
        from public.pedidos x, jsonb_array_elements(x.lineas) l
        where x.negocio_id = n and x.estado <> 'cancelado' and x.created_at > now() - interval '30 days'
        group by 1 order by 2 desc limit 5) z),
    'mejores_clientes', (select coalesce(jsonb_agg(z), '[]') from (
        select coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1)) as nombre, count(*) as pedidos, sum(x.total) as monto
        from public.pedidos x join public.profiles c on c.id = x.cliente_id
        where x.negocio_id = n and x.estado <> 'cancelado' and x.created_at > now() - interval '30 days'
        group by 1 order by 3 desc limit 5) z),
    'vistas', (select coalesce(jsonb_agg(z), '[]') from (
        select p.titulo, p.vip, (select count(*) from public.publicacion_vistas w where w.publicacion_id = p.id) as vistas
        from public.publicaciones p where p.owner_id = n order by 3 desc limit 10) z)));
end $$;
revoke all on function public.estadisticas_tienda() from public, anon;
grant execute on function public.estadisticas_tienda() to authenticated;

-- =====================================================================
--  VERSIÓN 5.36 · núcleo 2.54: E24/E27 análisis nocturno (Python en GitHub Actions). Ganchos para el núcleo (analisis.sql):
--  las ventas de la tienda (pedidos entregados o pagados del último año), sus productos y negocios. El dueño y el equipo
--  con rol admin ven en Hoy los clientes que dejaron de comprar y los productos quietos (cfx_analisis_mio).
-- =====================================================================
create or replace function public.cfx_analisis_datos_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  with v as (
    select x.negocio_id n, coalesce(x.cliente_id::text, 'tel:' || nullif(x.invitado_tel, '')) c, (x.created_at at time zone 'America/Santiago')::date f,
           x.total m, x.lineas, x.cliente_id, x.invitado_nombre, x.invitado_tel
    from public.pedidos x
    where x.created_at > now() - interval '365 days' and (x.estado = 'entregado' or (x.pagado_at is not null and x.estado not in ('cancelado', 'rechazado', 'expirado')))
    order by x.created_at desc limit 50000)
  select jsonb_build_object(
    'ventas', coalesce((select jsonb_agg(jsonb_build_object('n', v.n, 'c', v.c, 'f', v.f, 'm', v.m,
        'l', (select coalesce(jsonb_agg(jsonb_build_array(l ->> 'clave', (l ->> 'cant')::int)), '[]') from jsonb_array_elements(v.lineas) l))) from v), '[]'),
    'clientes', coalesce((select jsonb_object_agg(z.c, jsonb_build_object('nombre', z.nombre, 'tel', z.tel)) from (
        select distinct on (v.c) v.c, coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1), v.invitado_nombre, 'Cliente') nombre, coalesce(p.telefono, v.invitado_tel, '') tel
        from v left join public.profiles p on p.id = v.cliente_id where v.c is not null) z), '{}'),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('n', i.owner_id, 'k', i.client_key, 'nombre', i.nombre, 'stock', i.stock,
        'creado', (i.created_at at time zone 'America/Santiago')::date)) from public.catalog_items i), '[]'),
    'negocios', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', coalesce(nullif(p.empresa, ''), split_part(p.email, '@', 1)),
        'creado', (p.created_at at time zone 'America/Santiago')::date, 'ingreso', (u.last_sign_in_at at time zone 'America/Santiago')::date))
      from public.profiles p left join auth.users u on u.id = p.id where p.role = 'user' and not p.suspended), '[]'))
$$;
create or replace function public.cfx_analisis_negocio(u uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public.negocio_de(u) from public.profiles p where p.id = u and (p.role in ('user', 'admin') or (p.role = 'equipo' and p.equipo_rol = 'admin'))
$$;
revoke all on function public.cfx_analisis_datos_app(), public.cfx_analisis_negocio(uuid) from public, anon, authenticated;

-- =====================================================================
--  VERSIÓN 5.35 · núcleo 2.52: B13 tiempo de carga real (cfx_cargas, cfx_carga_anotar; se ve en CM → Control → 🩺 Salud).
--  VERSIÓN 5.34 · núcleo 2.51: C17 carrito (cfx_carritos) y cálculo de despacho del núcleo; C18 limpieza del núcleo (automática cada
--  noche) y un solo registro de cambios (auditoria → cfx_registro); B10 índices para lo que corre cada minuto y las listas.
--  VERSIÓN 5.33 · núcleo 2.50: C15 calificaciones en 2 direcciones y C16 cupones + tarjeta de sellos pasan al núcleo
--  (cfx_calificaciones, cfx_descuentos, cfx_sellos, cfx_sellos_cfg). Módulos 'calificaciones', 'cupones' y 'sellos' (🧩 en el CM).
--  VERSIÓN 5.32 · núcleo 2.49: C19 módulos que se prenden desde el CM (cfx_modulos) y C14 chat en el núcleo (cfx_mensajes/cfx_msg_*).
--  VERSIÓN 5.31 · núcleo 2.48: una key mala ya no deshace su registro (cfx_key_canjear devuelve {error}); redeem_license lo respeta.
--  VERSIÓN 5.30 · A5: sin tablas dobles. pagos → cfx_pagos, licenses → cfx_keys y resenas (sin pantalla desde 3.9) se borran.
--  Los datos se copian ANTES de borrar (el bloque va después del núcleo, donde ya existen cfx_pagos y cfx_keys).
--  Las keys se canjean igual (redeem_license llama a cfx_key_canjear) y los pagos Premium se revisan en el Centro de Mando → Pagos.
-- =====================================================================

-- >>> CFX núcleo (no editar aquí: se copia de saas/nucleo/sql con sincronizar.py)
-- ---------------------------------------------------------------------
-- CodeFix · Pagos (igual en las 6 apps; lo reparte nucleo/sincronizar.py). Se administra desde el Centro de Mando → Pagos.
--   Precios iguales en las 6: negocio (inicio, mensual, anual) y cliente (mensual, anual). Link de pago SIN monto (la persona
--   escribe el monto; se le suma el cargo por pago online, visible como una línea aparte), tarjeta (otro link, con su propio cargo)
--   o transferencia (precio exacto, sin cargo), y foto del comprobante. Tú apruebas y se activa el Premium por días enteros.
--   Liberar: por N días nadie queda bloqueado y las cuentas creadas en ese tiempo no pagan el primer pago (quedan en gratis).
--   El comprobante se borra al aprobar o rechazar (ya no sirve). Negocios nuevos: bloqueados hasta su primer pago (si está activado).
--   Cada app define antes: cfx_yo(), cfx_dar_premium(uuid, text, int), cfx_avisar(uuid, text, text) y cfx_avisar_admin(text, text).
-- ---------------------------------------------------------------------
create table if not exists public.cfx_config (clave text primary key, valor jsonb not null);
alter table public.cfx_config enable row level security;
insert into public.cfx_config (clave, valor) values ('pagos', jsonb_build_object(
  'negocio', jsonb_build_object('inicio', 4900, 'inicio_dias', 30, 'mensual', 4900, 'anual', 49900, 'exigir_inicio', true),
  'cliente', jsonb_build_object('mensual', 3000, 'anual', 29900),
  'link', '', 'comision_pct', 0, 'whatsapp', '', 'tarjeta', jsonb_build_object('link', '', 'comision_pct', 0),
  'transferencia', jsonb_build_object('banco', '', 'tipo', '', 'numero', '', 'rut', '', 'titular', '', 'correo', ''),
  'inicio_desde', now()))
on conflict (clave) do nothing;

create table if not exists public.cfx_pagos (
  id          uuid primary key default gen_random_uuid(),
  cuenta      uuid not null,
  email       text not null default '',
  nombre      text not null default '',
  rol         text not null check (rol in ('negocio', 'cliente', 'otro')),
  periodo     text not null check (periodo in ('inicio', 'mensual', 'anual', 'otro')),
  monto       int not null check (monto between 1 and 100000000),
  medio       text not null check (medio in ('link', 'transferencia')),
  nota        text not null default '' check (length(nota) <= 300),
  comprobante text check (comprobante is null or (comprobante ~ '^data:image/(jpeg|png|webp);base64,' and length(comprobante) <= 400000)),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  dias        int,
  motivo      text not null default '',
  creado      timestamptz not null default now(),
  resuelto    timestamptz
);
alter table public.cfx_pagos add column if not exists cupon text;
alter table public.cfx_pagos add column if not exists meses int check (meses is null or meses between 1 and 24);
-- G19: pago de un módulo o pack (null = Premium).
alter table public.cfx_pagos add column if not exists producto text check (producto is null or producto ~ '^[a-z_]{2,30}$');
alter table public.cfx_pagos drop constraint if exists cfx_pagos_medio_check;
alter table public.cfx_pagos add constraint cfx_pagos_medio_check check (medio in ('link', 'transferencia', 'tarjeta'));
alter table public.cfx_pagos drop constraint if exists cfx_pagos_periodo_check;
alter table public.cfx_pagos add constraint cfx_pagos_periodo_check check (periodo in ('inicio', 'mensual', 'meses', 'anual', 'otro'));
create index if not exists cfx_pagos_cuenta_idx on public.cfx_pagos (cuenta, creado desc);
create index if not exists cfx_pagos_estado_idx on public.cfx_pagos (estado, creado);
alter table public.cfx_pagos enable row level security;
create table if not exists public.cfx_exentos (cuenta uuid primary key, nota text not null default '', creado timestamptz not null default now());
alter table public.cfx_exentos enable row level security;
revoke all on public.cfx_config, public.cfx_pagos, public.cfx_exentos from anon, authenticated;

-- ¿Cómo estoy? Precios, mi rol, si debo el primer pago y mi último pago.
create or replace function public.cfx_pago_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := (select valor from public.cfx_config where clave = 'pagos'); y jsonb := public.cfx_yo(); pagado boolean; debe boolean; bloq boolean;
        lib jsonb := (select valor from public.cfx_config where clave = 'liberar'); ld timestamptz := (lib ->> 'desde')::timestamptz; lh timestamptz := (lib ->> 'hasta')::timestamptz;
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  pagado := exists (select 1 from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and estado = 'aprobado')
    or exists (select 1 from public.cfx_exentos where cuenta = (y ->> 'id')::uuid);
  -- debe_inicio: cuenta nueva (desde que activaste la regla) sin primer pago. bloqueado: además es un negocio.
  -- Solo si ya hay una forma de pago configurada (si no, nadie podría pagar).
  debe := coalesce((c #>> '{negocio,exigir_inicio}')::boolean, false) and not pagado
     and (coalesce(c ->> 'link', '') <> '' or coalesce(c #>> '{transferencia,numero}', '') <> '' or coalesce(c #>> '{tarjeta,link}', '') <> '')
     and (y ->> 'creado')::timestamptz > coalesce((c ->> 'inicio_desde')::timestamptz, now())
     -- Liberado: mientras dure nadie queda bloqueado; las cuentas creadas en ese tiempo quedan en gratis sin primer pago.
     and not (lh is not null and (now() < lh or (y ->> 'creado')::timestamptz between coalesce(ld, '-infinity') and lh));
  bloq := debe and y ->> 'rol' = 'negocio';
  return jsonb_build_object('config', c - 'inicio_desde', 'yo', y, 'pagado', pagado, 'bloqueado', bloq, 'debe_inicio', debe,
    'liberado_hasta', case when lh > now() then lh end,
    'ultimo', (select to_jsonb(x) from (select id, periodo, monto, medio, estado, dias, motivo, creado, resuelto from public.cfx_pagos
               where cuenta = (y ->> 'id')::uuid order by creado desc limit 1) x));
end $$;

drop function if exists public.cfx_pago_pedir(text, int, text, text, text);
drop function if exists public.cfx_pago_pedir(text, int, text, text, text, text);
drop function if exists public.cfx_pago_pedir(text, int, text, text, text, text, int, text);
create or replace function public.cfx_pago_pedir(p_periodo text, p_monto int, p_medio text, p_comprobante text, p_nota text default '', p_cupon text default null, p_meses int default null, p_producto text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); i uuid; cup text := nullif(upper(trim(coalesce(p_cupon, ''))), '');
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if y ->> 'rol' not in ('negocio', 'cliente') and p_periodo <> 'otro' then raise exception 'Pide al dueño de la cuenta que haga el pago'; end if;
  if p_periodo not in ('inicio', 'mensual', 'meses', 'anual', 'otro') or p_medio not in ('link', 'transferencia', 'tarjeta') then raise exception 'Datos no válidos'; end if;
  if p_periodo = 'meses' and coalesce(p_meses, 0) not between 2 and 11 then raise exception 'Elige de 2 a 11 meses'; end if;
  -- Módulo o pack (G19): solo el dueño del negocio, 1 mes o 1 año, y que se venda en esta app.
  if p_producto is not null then
    if public.cfx_negocio_cuenta((y ->> 'id')::uuid) is distinct from (y ->> 'id')::uuid then raise exception 'Pide al dueño del negocio que haga el pago'; end if;
    if p_periodo not in ('mensual', 'anual') or not coalesce((public.cfx_venta() ->> 'activo')::boolean, false) or cardinality(public.cfx_venta_modulos(p_producto)) = 0 then raise exception 'Módulo no válido'; end if;
  end if;
  if coalesce(p_monto, 0) < 1 then raise exception 'Escribe el monto que pagaste'; end if;
  if coalesce(length(p_comprobante), 0) < 200 then raise exception 'Sube la foto del comprobante'; end if;
  if cup is not null then perform public.cfx_cupon_ver(cup); end if;
  if exists (select 1 from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and estado = 'pendiente') then raise exception 'Ya tienes un pago en revisión. Te avisamos apenas se apruebe.'; end if;
  if (select count(*) from public.cfx_pagos where cuenta = (y ->> 'id')::uuid and creado > now() - interval '1 day') >= 5 then raise exception 'Demasiados intentos hoy. Escribe a soporte.'; end if;
  insert into public.cfx_pagos (cuenta, email, nombre, rol, periodo, monto, medio, nota, comprobante, cupon, meses, producto)
  values ((y ->> 'id')::uuid, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), case when y ->> 'rol' in ('negocio', 'cliente') then y ->> 'rol' else 'otro' end,
          p_periodo, p_monto, p_medio, left(coalesce(p_nota, ''), 300), p_comprobante, cup, case when p_periodo = 'meses' then p_meses end, p_producto)
  returning id into i;
  -- Aviso al tiro: al Centro de Mando si la app está vinculada (si no, al administrador de esta app).
  perform public.cfx_al_cm('💳 Pago por revisar', coalesce(nullif(y ->> 'nombre', ''), y ->> 'email') || ' · $' || p_monto || coalesce(' · 🧩 ' || p_producto, '') || ' (' || case p_periodo when 'meses' then p_meses || ' meses' else p_periodo end || ', ' || p_medio || ')' || coalesce(' · cupón ' || cup, ''), 'pago');
  return i;
end $$;

-- Precios públicos (para la portada, sin iniciar sesión).
create or replace function public.cfx_precios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('negocio', valor -> 'negocio', 'cliente', valor -> 'cliente', 'comision_pct', valor -> 'comision_pct',
    'liberado_hasta', (select case when (l.valor ->> 'hasta')::timestamptz > now() then l.valor -> 'hasta' end from public.cfx_config l where l.clave = 'liberar'))
  from public.cfx_config where clave = 'pagos'
$$;
revoke all on function public.cfx_precios() from public;
grant execute on function public.cfx_precios() to anon, authenticated;

-- ---------- Administrador (lo llama el Centro de Mando) ----------
create or replace function public.cfx_pagos_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select valor from public.cfx_config where clave = 'pagos');
end $$;

create or replace function public.cfx_pagos_config_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'pagos');
begin
  perform public.cfx_es_admin();
  if jsonb_typeof(p) <> 'object' then raise exception 'Datos no válidos'; end if;
  if coalesce(p ->> 'link', '') <> '' and (p ->> 'link') !~ '^https://[^ ]+$' then raise exception 'El link de pago debe empezar con https://'; end if;
  if coalesce((p ->> 'comision_pct')::numeric, 0) not between 0 and 20 or coalesce((p #>> '{tarjeta,comision_pct}')::numeric, 0) not between 0 and 20 then raise exception 'El cargo por pago online va de 0 a 20 %%'; end if;
  if coalesce(p #>> '{tarjeta,link}', '') <> '' and (p #>> '{tarjeta,link}') !~ '^https://[^ ]+$' then raise exception 'El link de tarjeta debe empezar con https://'; end if;
  -- Al activar "bloquear hasta el primer pago", solo aplica a los negocios que se registren desde ahora.
  -- También cuando se configura la primera forma de pago (antes nadie podía pagar, así que nadie quedó obligado).
  if coalesce((p #>> '{negocio,exigir_inicio}')::boolean, false) and (not coalesce((v #>> '{negocio,exigir_inicio}')::boolean, false)
     or (coalesce(v ->> 'link', '') = '' and coalesce(v #>> '{transferencia,numero}', '') = '' and coalesce(v #>> '{tarjeta,link}', '') = ''
         and (coalesce(p ->> 'link', '') <> '' or coalesce(p #>> '{transferencia,numero}', '') <> '' or coalesce(p #>> '{tarjeta,link}', '') <> ''))) then
    p := p || jsonb_build_object('inicio_desde', now());
  end if;
  v := v || (p - 'inicio_desde') || case when p ? 'inicio_desde' then jsonb_build_object('inicio_desde', p -> 'inicio_desde') else '{}'::jsonb end;
  update public.cfx_config set valor = v where clave = 'pagos';
  return v;
end $$;

create or replace function public.cfx_pagos_lista(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.creado desc), '[]') from (
    select id, cuenta, email, nombre, rol, periodo, meses, producto, monto, medio, nota, estado, dias, motivo, creado, resuelto, comprobante is not null as con_comprobante,
      public.cfx_dias_sugeridos(g) as sugeridos,
      (select count(*) from public.cfx_pagos z where z.cuenta = g.cuenta and z.estado = 'aprobado') as aprobados
    from public.cfx_pagos g where p_estado = 'todos' or estado = p_estado order by creado desc limit 200) x);
end $$;

create or replace function public.cfx_pago_comprobante(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select comprobante from public.cfx_pagos where id = p_id);
end $$;

-- Días que corresponden a un pago (siempre días enteros): mensual 30, anual 365, N meses = N × 30, primer pago lo configurado,
-- y "otro monto" en proporción al precio mensual (sin contar el cargo por pago online).
create or replace function public.cfx_dias_sugeridos(g public.cfx_pagos) returns int
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := (select valor from public.cfx_config where clave = 'pagos'); m numeric; pct numeric; neto numeric;
begin
  if g.periodo = 'inicio' then return coalesce((c #>> '{negocio,inicio_dias}')::int, 30); end if;
  if g.periodo = 'mensual' then return 30; end if;
  if g.periodo = 'anual' then return 365; end if;
  if g.periodo = 'meses' then return 30 * coalesce(g.meses, 1); end if;
  m := nullif((c #>> array[case when g.rol = 'cliente' then 'cliente' else 'negocio' end, 'mensual'])::numeric, 0);
  pct := case g.medio when 'link' then coalesce((c ->> 'comision_pct')::numeric, 0) when 'tarjeta' then coalesce((c #>> '{tarjeta,comision_pct}')::numeric, 0) else 0 end;
  neto := g.monto / (1 + pct / 100);
  return case when m is null then 0 else least(3660, floor(neto * 30 / m))::int end;
end $$;
revoke all on function public.cfx_dias_sugeridos(public.cfx_pagos) from public, anon, authenticated;

create or replace function public.cfx_pago_resolver(p_id uuid, p_aprobar boolean, p_dias int default null, p_motivo text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.cfx_pagos; c jsonb := (select valor from public.cfx_config where clave = 'pagos'); d int; hasta timestamptz;
begin
  perform public.cfx_es_admin();
  select * into g from public.cfx_pagos where id = p_id and estado = 'pendiente' for update;
  if g.id is null then raise exception 'Pago no encontrado o ya resuelto'; end if;
  d := coalesce(p_dias, public.cfx_dias_sugeridos(g));
  if p_aprobar then
    if d < 0 or d > 3660 then raise exception 'Días no válidos'; end if;
    if d > 0 and g.producto is not null then hasta := public.cfx_modulos_dar(public.cfx_negocio_cuenta(g.cuenta), g.producto, d, 'pago');
    elsif d > 0 then hasta := public.cfx_dar_premium(g.cuenta, g.rol, d); end if;
    update public.cfx_pagos set estado = 'aprobado', dias = d, motivo = left(coalesce(p_motivo, ''), 200), resuelto = now(), comprobante = null where id = p_id;
    perform public.cfx_avisar(g.cuenta, '✅ Pago aprobado', case when hasta is not null then case when g.producto is not null then '🧩 Módulo activo' else 'Premium activo' end || ' hasta el ' || to_char(hasta at time zone 'America/Santiago', 'DD/MM/YYYY') || '. ¡Gracias!' else 'Gracias, tu pago quedó registrado.' end);
  else
    update public.cfx_pagos set estado = 'rechazado', motivo = left(coalesce(nullif(p_motivo, ''), 'No pudimos validar el comprobante'), 200), resuelto = now(), comprobante = null where id = p_id;
    perform public.cfx_avisar(g.cuenta, '⚠️ Pago rechazado', left(coalesce(nullif(p_motivo, ''), 'No pudimos validar el comprobante'), 200) || '. Puedes subirlo de nuevo.');
  end if;
  return jsonb_build_object('estado', case when p_aprobar then 'aprobado' else 'rechazado' end, 'dias', d, 'hasta', hasta);
end $$;

-- Liberar el registro por N días (0 = terminar ahora). Sin p_dias solo devuelve cómo está.
create or replace function public.cfx_liberar(p_dias int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'liberar');
begin
  perform public.cfx_es_admin();
  if p_dias is not null then
    if p_dias < 0 or p_dias > 90 then raise exception 'De 0 a 90 días'; end if;
    v := case when p_dias = 0 then coalesce(v, '{}'::jsonb) || jsonb_build_object('hasta', least(coalesce((v ->> 'hasta')::timestamptz, now()), now()))
         else jsonb_build_object('desde', case when (v ->> 'hasta')::timestamptz > now() then v -> 'desde' else to_jsonb(now()) end, 'hasta', now() + make_interval(days => p_dias)) end;
    insert into public.cfx_config (clave, valor) values ('liberar', v) on conflict (clave) do update set valor = excluded.valor;
  end if;
  return jsonb_build_object('desde', v -> 'desde', 'hasta', v -> 'hasta', 'activo', coalesce((v ->> 'hasta')::timestamptz > now(), false));
end $$;
revoke all on function public.cfx_liberar(int) from public, anon;
grant execute on function public.cfx_liberar(int) to authenticated;

-- Cuentas que no pagan el inicio (por ejemplo, las que creas tú de regalo).
create or replace function public.cfx_exento(p_cuenta uuid, p_si boolean, p_nota text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if p_si then insert into public.cfx_exentos (cuenta, nota) values (p_cuenta, left(coalesce(p_nota, ''), 200)) on conflict (cuenta) do update set nota = excluded.nota;
  else delete from public.cfx_exentos where cuenta = p_cuenta; end if;
end $$;

create or replace function public.cfx_exento_email(p_email text, p_si boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.cfx_es_admin();
  select id into u from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if u is null then raise exception 'No hay una cuenta con ese correo en esta app'; end if;
  perform public.cfx_exento(u, p_si, 'Desde el Centro de Mando');
  return lower(trim(p_email));
end $$;

revoke all on function public.cfx_exento_email(text, boolean) from public, anon;
grant execute on function public.cfx_exento_email(text, boolean) to authenticated;
revoke all on function public.cfx_pago_estado(), public.cfx_pago_pedir(text, int, text, text, text, text, int, text), public.cfx_pagos_config(), public.cfx_pagos_config_guardar(jsonb),
  public.cfx_pagos_lista(text), public.cfx_pago_comprobante(uuid), public.cfx_pago_resolver(uuid, boolean, int, text), public.cfx_exento(uuid, boolean, text) from public, anon;
grant execute on function public.cfx_pago_estado(), public.cfx_pago_pedir(text, int, text, text, text, text, int, text), public.cfx_pagos_config(), public.cfx_pagos_config_guardar(jsonb),
  public.cfx_pagos_lista(text), public.cfx_pago_comprobante(uuid), public.cfx_pago_resolver(uuid, boolean, int, text), public.cfx_exento(uuid, boolean, text) to authenticated;
revoke all on function public.cfx_yo(), public.cfx_dar_premium(uuid, text, int), public.cfx_avisar(uuid, text, text), public.cfx_avisar_admin(text, text) from public, anon, authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Administración común (igual en las 6 apps; se maneja desde el Centro de Mando → Control).
--   Planes (interruptores sí/no y límites), textos, aviso a todos, keys de Premium, cupones de descuento,
--   verificación de identidad y registro de lo que hace el administrador.
--   Cada app define antes: cfx_planes_app(), cfx_plan_guardar_app(text, text, jsonb, jsonb), cfx_textos_app(),
--   cfx_texto_guardar_app(text, text), cfx_destinatarios(text) y cfx_marcar_verificado(uuid, boolean).
-- ---------------------------------------------------------------------
create table if not exists public.cfx_registro (
  id bigserial primary key, quien text not null default '', accion text not null, detalle text not null default '', creado timestamptz not null default now());
create table if not exists public.cfx_keys (
  id uuid primary key default gen_random_uuid(), hash text not null unique, ultimos text not null, rol text not null check (rol in ('negocio', 'cliente')),
  dias int not null check (dias between 1 and 3660), nota text not null default '', creado timestamptz not null default now(),
  usada_por uuid, usada_email text, usada_at timestamptz, revocada boolean not null default false);
create table if not exists public.cfx_cupones (
  codigo text primary key check (codigo ~ '^[A-Z0-9-]{3,20}$'), pct int not null check (pct between 1 and 100), usos_max int, usos int not null default 0,
  vence date, activo boolean not null default true, creado timestamptz not null default now());
create table if not exists public.cfx_verificaciones (
  cuenta uuid primary key, email text not null default '', nombre text not null default '', rut text not null, documento text not null default '',
  frente text, reverso text, selfie text, estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo text not null default '', creado timestamptz not null default now(), resuelto timestamptz);
alter table public.cfx_registro enable row level security;
alter table public.cfx_keys enable row level security;
alter table public.cfx_cupones enable row level security;
alter table public.cfx_verificaciones enable row level security;
revoke all on public.cfx_registro, public.cfx_keys, public.cfx_cupones, public.cfx_verificaciones from anon, authenticated;

create or replace function public.cfx_anotar(p_accion text, p_detalle text) returns void
language sql security definer set search_path = '' as $$
  insert into public.cfx_registro (quien, accion, detalle) values (coalesce((select email from auth.users where id = auth.uid()), 'sistema'), left(p_accion, 60), left(coalesce(p_detalle, ''), 400))
$$;
create or replace function public.cfx_registro_lista(p_limite int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select * from public.cfx_registro order by id desc limit greatest(1, least(coalesce(p_limite, 200), 2000))) x);
end $$;

-- ---------- Planes: [{grupo, clave, free, premium}] (números o sí/no) ----------
-- Borrar el registro de cambios (el común y el propio de la app, si tiene): lo de más de N días, o todo con 0. Solo el administrador.
create or replace function public.cfx_registro_borrar(p_dias int default 30) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; k int; col text; desde timestamptz := case when coalesce(p_dias, 0) <= 0 then 'infinity'::timestamptz else now() - make_interval(days => p_dias) end;
begin
  perform public.cfx_es_admin();
  delete from public.cfx_registro where creado < desde; get diagnostics n = row_count;
  if to_regclass('public.auditoria') is not null then
    select c.column_name into col from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'auditoria'
      and c.column_name in ('created_at', 'at', 'creado', 'fecha') and c.data_type like 'timestamp%' order by c.ordinal_position limit 1;
    if col is not null then execute format('delete from public.auditoria where %I < $1', col) using desde; get diagnostics k = row_count; n := n + k; end if;
  end if;
  insert into public.cfx_registro (quien, accion, detalle) values (coalesce((select email from auth.users where id = auth.uid()), 'sistema'), 'registro borrado',
    case when coalesce(p_dias, 0) <= 0 then 'todo' else 'más de ' || p_dias || ' días' end || ' (' || n || ' filas)');
  return n;
end $$;
revoke all on function public.cfx_registro_borrar(int) from public, anon;
grant execute on function public.cfx_registro_borrar(int) to authenticated;

create or replace function public.cfx_planes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return public.cfx_planes_app();
end $$;
create or replace function public.cfx_plan_guardar(p_grupo text, p_clave text, p_free jsonb, p_premium jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if jsonb_typeof(p_free) not in ('number', 'boolean') or jsonb_typeof(p_premium) not in ('number', 'boolean') then raise exception 'Valor no válido'; end if;
  perform public.cfx_plan_guardar_app(p_grupo, p_clave, p_free, p_premium);
  perform public.cfx_anotar('plan', p_grupo || '.' || p_clave || ': gratis ' || p_free::text || ' · premium ' || p_premium::text);
end $$;

-- ---------- Textos: [{clave, valor}] ----------
create or replace function public.cfx_textos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return public.cfx_textos_app();
end $$;
create or replace function public.cfx_texto_guardar(p_clave text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  perform public.cfx_texto_guardar_app(p_clave, left(coalesce(p_valor, ''), 2000));
  perform public.cfx_anotar('texto', p_clave);
end $$;

-- ---------- Aviso a todos: destino todos | negocios | clientes | premium | gratis ----------
create or replace function public.cfx_aviso_masivo(p_destino text, p_titulo text, p_cuerpo text) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid; n int := 0;
begin
  perform public.cfx_es_admin();
  if trim(coalesce(p_titulo, '')) = '' then raise exception 'Escribe el título'; end if;
  if p_destino not in ('todos', 'negocios', 'clientes', 'premium', 'gratis', 'ofertas') then raise exception 'Destino no válido'; end if;
  -- 'ofertas' = publicidad: solo a quienes aceptaron recibir ofertas (consentimiento, sql/legal.sql).
  for u in select d from public.cfx_destinatarios(case when p_destino = 'ofertas' then 'todos' else p_destino end) d where p_destino <> 'ofertas' or public.cfx_acepta(d, 'ofertas') loop
    perform public.cfx_avisar(u, left(p_titulo, 80), left(coalesce(p_cuerpo, ''), 240));
    n := n + 1;
  end loop;
  perform public.cfx_anotar('aviso', p_destino || ' (' || n || '): ' || p_titulo);
  return n;
end $$;

-- ---------- Nueva versión disponible: push a todos al liberar (una sola vez por versión) ----------
-- La llama el Centro de Mando después de liberar (Apps → Liberar) con las notas que se escriben ahí.
create table if not exists public.cfx_versiones (version text primary key, notas text not null default '', avisados int not null default 0, creado timestamptz not null default now());
alter table public.cfx_versiones enable row level security;
create or replace function public.cfx_avisar_version(p_version text, p_notas text default '', p_app text default '') returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid; n int := 0; v text := trim(coalesce(p_version, '')); nt text := left(trim(coalesce(p_notas, '')), 140);
begin
  perform public.cfx_es_admin();
  if v !~ '^[0-9]+(\.[0-9]+){0,3}$' then raise exception 'Versión no válida'; end if;
  if exists (select 1 from public.cfx_versiones where version = v) then return 0; end if;
  for u in select * from public.cfx_destinatarios('todos') loop
    perform public.cfx_avisar(u, '🚀 Nueva versión disponible', left(coalesce(nullif(trim(p_app), '') || ' ', '') || 'v' || v || case when nt <> '' then ' · ' || nt else '' end || '. Se actualiza sola al abrirla.', 240));
    n := n + 1;
  end loop;
  insert into public.cfx_versiones (version, notas, avisados) values (v, nt, n);
  perform public.cfx_anotar('version', 'v' || v || ' avisada a ' || n);
  return n;
end $$;
revoke execute on function public.cfx_avisar_version(text, text, text) from public, anon;
grant execute on function public.cfx_avisar_version(text, text, text) to authenticated;

-- ---------- Keys de Premium (de un solo uso). Se guardan cifradas: el código completo solo se ve al crearlas. ----------
create or replace function public.cfx_keys_crear(p_n int, p_rol text, p_dias int, p_nota text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text; out jsonb := '[]'::jsonb;
begin
  perform public.cfx_es_admin();
  if p_rol not in ('negocio', 'cliente') or coalesce(p_dias, 0) not between 1 and 3660 or coalesce(p_n, 0) not between 1 and 50 then raise exception 'Datos no válidos'; end if;
  for i in 1..p_n loop
    c := upper(replace(gen_random_uuid()::text, '-', ''));
    c := 'CFX-' || substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
    insert into public.cfx_keys (hash, ultimos, rol, dias, nota) values (encode(sha256(convert_to(c, 'UTF8')), 'hex'), right(c, 4), p_rol, p_dias, left(coalesce(p_nota, ''), 120));
    out := out || to_jsonb(c);
  end loop;
  perform public.cfx_anotar('keys', p_n || ' keys ' || p_rol || ' de ' || p_dias || ' días');
  return out;
end $$;
create or replace function public.cfx_keys_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(to_jsonb(k) - 'hash' order by k.creado desc), '[]') from (select * from public.cfx_keys order by creado desc limit 300) k);
end $$;
create or replace function public.cfx_key_revocar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_keys set revocada = true where id = p_id and usada_por is null;
  perform public.cfx_anotar('key revocada', p_id::text);
end $$;
create or replace function public.cfx_key_canjear(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); k public.cfx_keys; h timestamptz; c text := upper(trim(coalesce(p_codigo, '')));
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if (select count(*) from public.cfx_registro where accion = 'key fallida' and detalle = (y ->> 'id') and creado > now() - interval '1 hour') >= 10 then
    raise exception 'Demasiados intentos. Prueba en una hora.';
  end if;
  select * into k from public.cfx_keys where hash = encode(sha256(convert_to(c, 'UTF8')), 'hex') for update;
  if k.id is null or k.revocada or k.usada_por is not null then
    -- Sin raise: si no, el registro se deshace y el límite de 10 por hora nunca cuenta (núcleo 2.48).
    insert into public.cfx_registro (quien, accion, detalle) values (coalesce(y ->> 'email', ''), 'key fallida', y ->> 'id');
    return jsonb_build_object('error', 'Key no válida o ya usada');
  end if;
  if k.rol <> coalesce(y ->> 'rol', '') then raise exception 'Esta key es para cuentas de %', case when k.rol = 'negocio' then 'negocio' else 'cliente' end; end if;
  h := public.cfx_dar_premium((y ->> 'id')::uuid, k.rol, k.dias);
  update public.cfx_keys set usada_por = (y ->> 'id')::uuid, usada_email = y ->> 'email', usada_at = now() where id = k.id;
  insert into public.cfx_exentos (cuenta, nota) values ((y ->> 'id')::uuid, 'Key ' || k.ultimos) on conflict (cuenta) do nothing;
  perform public.cfx_avisar_admin('🔑 Key canjeada', coalesce(y ->> 'email', '') || ' · ' || k.dias || ' días');
  return jsonb_build_object('hasta', h, 'dias', k.dias);
end $$;

-- ---------- Cupones de descuento (se aplican al pagar Premium) ----------
create or replace function public.cfx_cupon_ver(p_codigo text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare c public.cfx_cupones;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into c from public.cfx_cupones where codigo = upper(trim(coalesce(p_codigo, '')));
  if c.codigo is null or not c.activo or (c.vence is not null and c.vence < current_date) or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Cupón no válido o vencido';
  end if;
  return c.pct;
end $$;
create or replace function public.cfx_cupones_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.creado desc), '[]') from public.cfx_cupones c);
end $$;
create or replace function public.cfx_cupon_guardar(p_codigo text, p_pct int, p_usos_max int default null, p_vence date default null, p_activo boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  insert into public.cfx_cupones (codigo, pct, usos_max, vence, activo) values (upper(trim(p_codigo)), p_pct, p_usos_max, p_vence, coalesce(p_activo, true))
  on conflict (codigo) do update set pct = excluded.pct, usos_max = excluded.usos_max, vence = excluded.vence, activo = excluded.activo;
  perform public.cfx_anotar('cupón', upper(trim(p_codigo)) || ' ' || p_pct || '%');
end $$;
create or replace function public.cfx_cupon_borrar(p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  delete from public.cfx_cupones where codigo = upper(trim(p_codigo));
end $$;

-- ---------- Verificación de identidad (RUT, N° de documento, fotos de la cédula y selfie). Las fotos se borran al revisar. ----------
create or replace function public.cfx_rut_ok(r text) returns boolean
language plpgsql immutable as $$
declare s text := upper(regexp_replace(coalesce(r, ''), '[^0-9kK]', '', 'g')); cuerpo text; dv text; suma int := 0; m int := 2; res text;
begin
  if length(s) < 2 then return false; end if;
  cuerpo := left(s, length(s) - 1); dv := right(s, 1);
  if cuerpo !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(cuerpo)..1 loop
    suma := suma + substr(cuerpo, i, 1)::int * m; m := case when m = 7 then 2 else m + 1 end;
  end loop;
  res := case 11 - suma % 11 when 11 then '0' when 10 then 'K' else (11 - suma % 11)::text end;
  return res = dv;
end $$;
create or replace function public.cfx_verif_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('estado', estado, 'motivo', motivo, 'creado', creado, 'resuelto', resuelto) from public.cfx_verificaciones where cuenta = auth.uid())
$$;
create or replace function public.cfx_verif_enviar(p_rut text, p_documento text, p_frente text, p_reverso text, p_selfie text) returns void
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); r text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if not public.cfx_rut_ok(r) then raise exception 'RUT no válido'; end if;
  if exists (select 1 from public.cfx_verificaciones where rut = r and cuenta <> (y ->> 'id')::uuid and estado <> 'rechazada') then raise exception 'Ese RUT ya está en otra cuenta'; end if;
  if exists (select 1 from public.cfx_verificaciones where cuenta = (y ->> 'id')::uuid and estado = 'aprobada') then raise exception 'Tu identidad ya está verificada'; end if;
  if coalesce(length(p_frente), 0) < 200 or coalesce(length(p_reverso), 0) < 200 or coalesce(length(p_selfie), 0) < 200 then raise exception 'Faltan fotos'; end if;
  if length(p_frente) > 500000 or length(p_reverso) > 500000 or length(p_selfie) > 500000 then raise exception 'Fotos muy pesadas'; end if;
  insert into public.cfx_verificaciones (cuenta, email, nombre, rut, documento, frente, reverso, selfie, estado, motivo, creado, resuelto)
  values ((y ->> 'id')::uuid, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), r, left(coalesce(p_documento, ''), 20), p_frente, p_reverso, p_selfie, 'pendiente', '', now(), null)
  on conflict (cuenta) do update set rut = excluded.rut, documento = excluded.documento, frente = excluded.frente, reverso = excluded.reverso, selfie = excluded.selfie,
    estado = 'pendiente', motivo = '', creado = now(), resuelto = null;
  perform public.cfx_avisar_admin('🪪 Verificación por revisar', coalesce(nullif(y ->> 'nombre', ''), y ->> 'email'));
end $$;
create or replace function public.cfx_verif_lista(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.creado desc), '[]') from (select cuenta, email, nombre, rut, documento, estado, motivo, creado, resuelto
    from public.cfx_verificaciones where p_estado = 'todos' or estado = p_estado order by creado desc limit 200) x);
end $$;
create or replace function public.cfx_verif_fotos(p_cuenta uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select jsonb_build_object('frente', frente, 'reverso', reverso, 'selfie', selfie) from public.cfx_verificaciones where cuenta = p_cuenta);
end $$;
create or replace function public.cfx_verif_resolver(p_cuenta uuid, p_aprobar boolean, p_motivo text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_verificaciones set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, motivo = left(coalesce(p_motivo, ''), 200),
    resuelto = now(), frente = null, reverso = null, selfie = null where cuenta = p_cuenta and estado = 'pendiente';
  if not found then raise exception 'No hay una verificación pendiente'; end if;
  perform public.cfx_marcar_verificado(p_cuenta, p_aprobar);
  perform public.cfx_avisar(p_cuenta, case when p_aprobar then '🪪 Identidad verificada' else '🪪 Verificación rechazada' end,
    case when p_aprobar then 'Ya apareces como persona verificada.' else coalesce(nullif(p_motivo, ''), 'Revisa las fotos') || '. Puedes enviarla de nuevo.' end);
  perform public.cfx_anotar(case when p_aprobar then 'verificación aprobada' else 'verificación rechazada' end, p_cuenta::text);
end $$;

create or replace function public.cfx_cupon_usado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'aprobado' and old.estado = 'pendiente' and new.cupon is not null then update public.cfx_cupones set usos = usos + 1 where codigo = new.cupon; end if;
  return new;
end $$;
drop trigger if exists cfx_cupon_usado on public.cfx_pagos;
create trigger cfx_cupon_usado after update of estado on public.cfx_pagos for each row execute function public.cfx_cupon_usado();

-- ---------- Verificación humana (Cloudflare Turnstile): la site key es pública; la secret key va en Supabase → Authentication → CAPTCHA ----------
-- y, para las compras/reservas sin cuenta, también aquí (cfx_secretos, nunca sale de la base): la base revisa el token con Cloudflare.
insert into public.cfx_config (clave, valor) values ('humano', '{"site_key": ""}') on conflict (clave) do nothing;
create table if not exists public.cfx_secretos (clave text primary key, valor text not null, updated_at timestamptz not null default now());
alter table public.cfx_secretos enable row level security;
revoke all on public.cfx_secretos from anon, authenticated;
create or replace function public.cfx_humano() returns jsonb
language sql stable security definer set search_path = '' as $$
  select valor || jsonb_build_object('invitados', exists (select 1 from public.cfx_secretos where clave = 'turnstile'))
  from public.cfx_config where clave = 'humano' $$;
drop function if exists public.cfx_humano_guardar(text);
create or replace function public.cfx_humano_guardar(p_site_key text, p_secreto text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if coalesce(p_site_key, '') <> '' and p_site_key !~ '^[0-9A-Za-z_-]{10,60}$' then raise exception 'Site key no válida'; end if;
  if coalesce(p_secreto, '') <> '' and p_secreto !~ '^[0-9A-Za-z_-]{10,80}$' then raise exception 'Secret key no válida'; end if;
  update public.cfx_config set valor = jsonb_build_object('site_key', coalesce(p_site_key, '')) where clave = 'humano';
  -- null = dejar la secret key como está; '' = quitarla (o si se apaga la site key).
  if coalesce(p_site_key, '') = '' or p_secreto = '' then delete from public.cfx_secretos where clave = 'turnstile';
  elsif p_secreto is not null then
    insert into public.cfx_secretos (clave, valor) values ('turnstile', p_secreto)
    on conflict (clave) do update set valor = excluded.valor, updated_at = now();
  end if;
  perform public.cfx_anotar('humano', case when coalesce(p_site_key, '') = '' then 'apagado' else 'site key ' || right(p_site_key, 4) ||
    case when exists (select 1 from public.cfx_secretos where clave = 'turnstile') then ' + compras sin cuenta' else '' end end);
end $$;
-- ¿El token de Turnstile es de una persona? Sin secret key no se exige. Si Cloudflare no responde, no frena la venta.
create or replace function public.cfx_humano_ok(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text := (select valor from public.cfx_secretos where clave = 'turnstile'); st int; c text;
begin
  if k is null then return true; end if;
  if coalesce(p_token, '') = '' or length(p_token) > 4000 then return false; end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '5');
    execute 'select status, content from extensions.http(row($1, $2, $3, $4, $5)::extensions.http_request)' into st, c
      using 'POST', 'https://challenges.cloudflare.com/turnstile/v0/siteverify', array[]::extensions.http_header[],
            'application/x-www-form-urlencoded', 'secret=' || k || '&response=' || p_token;
  exception when others then return true;
  end;
  if st is distinct from 200 or c !~ '^\s*\{' then return true; end if;
  return coalesce((c::jsonb ->> 'success')::boolean, false);
end $$;
revoke all on function public.cfx_humano(), public.cfx_humano_guardar(text, text), public.cfx_humano_ok(text) from public, anon, authenticated;
grant execute on function public.cfx_humano() to anon, authenticated;
grant execute on function public.cfx_humano_guardar(text, text) to authenticated;

revoke all on function public.cfx_anotar(text, text), public.cfx_cupon_usado() from public, anon, authenticated;
revoke all on function public.cfx_registro_lista(int), public.cfx_planes(), public.cfx_plan_guardar(text, text, jsonb, jsonb), public.cfx_textos(), public.cfx_texto_guardar(text, text),
  public.cfx_aviso_masivo(text, text, text), public.cfx_keys_crear(int, text, int, text), public.cfx_keys_lista(), public.cfx_key_revocar(uuid), public.cfx_key_canjear(text),
  public.cfx_cupon_ver(text), public.cfx_cupones_lista(), public.cfx_cupon_guardar(text, int, int, date, boolean), public.cfx_cupon_borrar(text),
  public.cfx_verif_estado(), public.cfx_verif_enviar(text, text, text, text, text), public.cfx_verif_lista(text), public.cfx_verif_fotos(uuid), public.cfx_verif_resolver(uuid, boolean, text) from public, anon;
grant execute on function public.cfx_registro_lista(int), public.cfx_planes(), public.cfx_plan_guardar(text, text, jsonb, jsonb), public.cfx_textos(), public.cfx_texto_guardar(text, text),
  public.cfx_aviso_masivo(text, text, text), public.cfx_keys_crear(int, text, int, text), public.cfx_keys_lista(), public.cfx_key_revocar(uuid), public.cfx_key_canjear(text),
  public.cfx_cupon_ver(text), public.cfx_cupones_lista(), public.cfx_cupon_guardar(text, int, int, date, boolean), public.cfx_cupon_borrar(text),
  public.cfx_verif_estado(), public.cfx_verif_enviar(text, text, text, text, text), public.cfx_verif_lista(text), public.cfx_verif_fotos(uuid), public.cfx_verif_resolver(uuid, boolean, text) to authenticated;
revoke all on function public.cfx_planes_app(), public.cfx_plan_guardar_app(text, text, jsonb, jsonb), public.cfx_textos_app(), public.cfx_texto_guardar_app(text, text),
  public.cfx_destinatarios(text), public.cfx_marcar_verificado(uuid, boolean) from public, anon, authenticated;

-- ---------- Series para el Resumen del Centro de Mando: por mes, cuentas nuevas y pagos/ingresos aprobados (últimos N meses) ----------
create or replace function public.cfx_series(p_meses int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n int := greatest(1, least(coalesce(p_meses, 6), 24));
begin
  perform public.cfx_es_admin();
  return (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
      'cuentas', (select count(*) from auth.users u where u.created_at >= m and u.created_at < m + interval '1 month'),
      'pagos', (select count(*) from public.cfx_pagos p where p.estado = 'aprobado' and p.creado >= m and p.creado < m + interval '1 month'),
      'ingresos', (select coalesce(sum(p.monto), 0) from public.cfx_pagos p where p.estado = 'aprobado' and p.creado >= m and p.creado < m + interval '1 month')) order by m)
    from generate_series(date_trunc('month', now()) - make_interval(months => n - 1), date_trunc('month', now()), interval '1 month') m);
end $$;
revoke all on function public.cfx_series(int) from public, anon;
grant execute on function public.cfx_series(int) to authenticated;

-- ---------- Servidor (igual en las 7 apps): uso de la base, cuentas, tablas más pesadas y tareas automáticas ----------
-- El Centro de Mando lo muestra en el carrusel de servidores. "tareas" sirve para ver si el envío de push está corriendo.
create or replace function public.cfx_servidor() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t jsonb := '[]'; tb jsonb;
begin
  perform public.cfx_es_admin();
  select coalesce(jsonb_agg(x), '[]') into tb from (
    select jsonb_build_object('tabla', c.relname, 'bytes', pg_total_relation_size(c.oid), 'filas', greatest(c.reltuples, 0)::bigint) x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 6) q;
  begin
    execute $q$ select coalesce(jsonb_agg(jsonb_build_object('nombre', j.jobname, 'activa', j.active, 'cada', j.schedule,
        'ultima', r.end_time, 'ok', r.status = 'succeeded', 'error', left(r.return_message, 160)) order by j.jobname), '[]')
      from cron.job j left join lateral (select end_time, status, return_message from cron.job_run_details d where d.jobid = j.jobid order by d.runid desc limit 1) r on true $q$ into t;
  exception when others then t := '[]';
  end;
  return jsonb_build_object('db_bytes', pg_database_size(current_database()), 'limite_bytes', 500 * 1024 * 1024,
    'cuentas', (select count(*) from auth.users), 'tablas', tb, 'tareas', t, 'hora', now());
end $$;
revoke all on function public.cfx_servidor() from public, anon;
grant execute on function public.cfx_servidor() to authenticated;

-- ---------- Actualizar la base ahora (núcleo 2.31, igual en las 7 apps) ----------
-- El Centro de Mando lo usa cuando una base quedó atrás ("se está actualizando sola" que no avanza).
-- Programa una tarea de un solo uso (en máx. 1 minuto, sin el límite de tiempo de la app) que corre auto_actualizar() y anota
-- su resultado en cfx_registro ('auto'): así se ve la causa real si falla (la tarea de cada 10 min siempre figura "ok").
drop function if exists public.cfx_actualizar_ahora();
create or replace function public.cfx_actualizar_ahora(p_programar boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prog text := 'ok'; t jsonb := '[]'; ult jsonb;
begin
  perform public.cfx_es_admin();
  if p_programar then begin
    execute $q$ select cron.schedule('cfx-ahora', '* * * * *', $c$do $d$ declare r text; begin r := public.auto_actualizar(); perform public.cfx_anotar('auto', r); end $d$; select cron.unschedule('cfx-ahora')$c$) $q$;
  exception when others then prog := sqlerrm;
  end; else prog := ''; end if;
  begin
    execute $q$ select coalesce(jsonb_agg(jsonb_build_object('nombre', j.jobname, 'activa', j.active, 'cada', j.schedule, 'ultima', r.end_time, 'ok', r.status = 'succeeded', 'error', left(r.return_message, 160)) order by j.jobname), '[]')
      from cron.job j left join lateral (select end_time, status, return_message from cron.job_run_details d where d.jobid = j.jobid order by d.runid desc limit 1) r on true
      where j.jobname ~ 'auto|ahora' $q$ into t;
  exception when others then t := '[]';
  end;
  select coalesce(jsonb_agg(jsonb_build_object('detalle', detalle, 'creado', creado) order by id desc), '[]') into ult
    from (select * from public.cfx_registro where accion = 'auto' order by id desc limit 3) q;
  if p_programar then perform public.cfx_anotar('version', 'Actualizar base ahora: ' || left(prog, 200)); end if;
  return jsonb_build_object('programada', prog, 'tareas', t, 'ultimos', ult, 'hora', now());
end $$;
revoke all on function public.cfx_actualizar_ahora(boolean) from public, anon;
grant execute on function public.cfx_actualizar_ahora(boolean) to authenticated;

-- ---------- G20 · 🏪 Negocios desde el Centro de Mando (Control → app → Negocios) ----------
-- Lista de cuentas de la app, Premium 1 mes / 3 meses / 1 año o quitarlo, e ingresar una key a nombre de esa cuenta.
-- Ganchos de cada app (opcionales: sin ellos se avisa que llega en su turno):
--   cfx_cuentas_app(p_rol text, p_q text) → jsonb [{ id, email, nombre, rol, premium_hasta, creado }] · cfx_quitar_premium(p_cuenta uuid)
create or replace function public.cfx_negocios(p_q text default '', p_rol text default 'negocio') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.cfx_es_admin();
  if to_regprocedure('public.cfx_cuentas_app(text,text)') is null then return jsonb_build_object('error', 'Esta app aún no tiene la lista de negocios: llega cuando le toque su turno.'); end if;
  execute 'select public.cfx_cuentas_app($1, $2)' into r using case when p_rol = 'cliente' then 'cliente' else 'negocio' end, left(coalesce(p_q, ''), 80);
  return coalesce(r, '[]'::jsonb);
end $$;
create or replace function public.cfx_premium_cuenta(p_cuenta uuid, p_rol text, p_dias int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h timestamptz;
begin
  perform public.cfx_es_admin();
  if p_cuenta is null or coalesce(p_rol, '') not in ('negocio', 'cliente') or p_dias is null or p_dias > 3660 then return jsonb_build_object('error', 'Datos no válidos'); end if;
  if p_dias > 0 then
    h := public.cfx_dar_premium(p_cuenta, p_rol, p_dias);
    if h is null then return jsonb_build_object('error', 'No se encontró la cuenta'); end if;
    perform public.cfx_avisar(p_cuenta, '⭐ Premium activado', 'Tienes Premium hasta el ' || to_char(h at time zone 'America/Santiago', 'DD-MM-YYYY') || '.');
    perform public.cfx_anotar('premium', p_dias || ' días a ' || p_cuenta);
    return jsonb_build_object('hasta', h);
  end if;
  if to_regprocedure('public.cfx_quitar_premium(uuid)') is null then return jsonb_build_object('error', 'Esta app aún no permite quitar Premium desde aquí.'); end if;
  execute 'select public.cfx_quitar_premium($1)' using p_cuenta;
  perform public.cfx_anotar('premium quitado', p_cuenta::text);
  return jsonb_build_object('hasta', null);
end $$;
create or replace function public.cfx_key_aplicar(p_cuenta uuid, p_rol text, p_email text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.cfx_keys; h timestamptz; c text := upper(trim(coalesce(p_codigo, '')));
begin
  perform public.cfx_es_admin();
  if p_cuenta is null or coalesce(p_rol, '') not in ('negocio', 'cliente') then return jsonb_build_object('error', 'Datos no válidos'); end if;
  select * into k from public.cfx_keys where hash = encode(sha256(convert_to(c, 'UTF8')), 'hex') for update;
  if k.id is null or k.revocada or k.usada_por is not null then return jsonb_build_object('error', 'Key no válida o ya usada'); end if;
  if k.rol <> p_rol then return jsonb_build_object('error', 'Esta key es para cuentas de ' || k.rol); end if;
  h := public.cfx_dar_premium(p_cuenta, k.rol, k.dias);
  if h is null then return jsonb_build_object('error', 'No se encontró la cuenta'); end if;
  update public.cfx_keys set usada_por = p_cuenta, usada_email = left(coalesce(p_email, ''), 200), usada_at = now() where id = k.id;
  insert into public.cfx_exentos (cuenta, nota) values (p_cuenta, 'Key ' || k.ultimos) on conflict (cuenta) do nothing;
  perform public.cfx_avisar(p_cuenta, '🔑 Premium activado', 'Tienes Premium por ' || k.dias || ' días.');
  perform public.cfx_anotar('key aplicada', '…' || k.ultimos || ' a ' || coalesce(p_email, p_cuenta::text));
  return jsonb_build_object('hasta', h, 'dias', k.dias);
end $$;
revoke all on function public.cfx_negocios(text, text), public.cfx_premium_cuenta(uuid, text, int), public.cfx_key_aplicar(uuid, text, text, text) from public, anon;
grant execute on function public.cfx_negocios(text, text), public.cfx_premium_cuenta(uuid, text, int), public.cfx_key_aplicar(uuid, text, text, text) to authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Ayuda (igual en las 6 apps; lo reparte nucleo/sincronizar.py).
--   1) Puente al Centro de Mando: los avisos importantes (pagos por revisar, mensajes de soporte) le llegan al tiro
--      al Centro de Mando. El Centro de Mando vincula cada app solo (cfx_cm_vincular) al abrir Pagos o Mensajes.
--   2) Chat de soporte: cada persona escribe desde su app y tú respondes desde el Centro de Mando → Mensajes.
--   3) Guía para partir: lo que le falta configurar a cada negocio (cfx_guia_app() de cada app). No se marca
--      como listo hasta que de verdad lo hace, y se le recuerda cada vez que entra.
--   Cada app define antes: cfx_guia_app() → [{ k, t, d, ok, ir }].
-- ---------------------------------------------------------------------

-- ---------- 1) Puente al Centro de Mando ----------
create or replace function public.cfx_cm_vincular(p_url text, p_key text, p_secreto text, p_app text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if coalesce(p_url, '') !~ '^https://[a-z0-9.-]+$' or length(coalesce(p_key, '')) < 20 or length(coalesce(p_secreto, '')) < 24 or coalesce(p_app, '') !~ '^[a-z]{2,20}$' then
    raise exception 'Datos de vínculo no válidos';
  end if;
  insert into public.cfx_config (clave, valor) values ('cm', jsonb_build_object('url', p_url, 'key', p_key, 'secreto', p_secreto, 'app', p_app, 'desde', now()))
  on conflict (clave) do update set valor = excluded.valor;
  return jsonb_build_object('vinculado', true, 'app', p_app);
end $$;

create or replace function public.cfx_cm_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'cm');
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('vinculado', coalesce(v ->> 'secreto', '') <> '', 'app', v ->> 'app', 'url', v ->> 'url', 'desde', v -> 'desde');
end $$;

-- Avisa al Centro de Mando (si la app está vinculada); si no, al administrador de esta app. Nunca hace fallar lo que la llama.
create or replace function public.cfx_al_cm(p_titulo text, p_cuerpo text, p_tipo text default 'aviso') returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb := (select valor from public.cfx_config where clave = 'cm');
begin
  if coalesce(v ->> 'secreto', '') = '' then
    perform public.cfx_avisar_admin(p_titulo, p_cuerpo);
    return;
  end if;
  begin
    perform net.http_post(
      url := (v ->> 'url') || '/rest/v1/rpc/cfx_aviso_externo',
      body := jsonb_build_object('p_app', v ->> 'app', 'p_secreto', v ->> 'secreto', 'p_titulo', left(p_titulo, 90), 'p_cuerpo', left(coalesce(p_cuerpo, ''), 240), 'p_tipo', p_tipo),
      headers := jsonb_build_object('apikey', v ->> 'key', 'Authorization', 'Bearer ' || (v ->> 'key'), 'Content-Type', 'application/json'));
  exception when others then
    begin perform public.cfx_avisar_admin(p_titulo, p_cuerpo); exception when others then null; end;
  end;
end $$;

-- ---------- 2) Chat de soporte ----------
create table if not exists public.cfx_chat (
  id      bigserial primary key,
  cuenta  uuid not null,
  email   text not null default '',
  nombre  text not null default '',
  rol     text not null default '',
  de      text not null check (de in ('persona', 'soporte')),
  texto   text not null check (length(texto) between 1 and 1000),
  leido   boolean not null default false,
  creado  timestamptz not null default now()
);
create index if not exists cfx_chat_cuenta_idx on public.cfx_chat (cuenta, id);
create index if not exists cfx_chat_sin_leer_idx on public.cfx_chat (de, leido) where not leido;
alter table public.cfx_chat enable row level security;
revoke all on public.cfx_chat from anon, authenticated;

create or replace function public.cfx_chat_mio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); u uuid := (y ->> 'id')::uuid;
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  update public.cfx_chat set leido = true where cuenta = u and de = 'soporte' and not leido;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'de', de, 'texto', texto, 'creado', creado) order by id), '[]')
          from (select * from public.cfx_chat where cuenta = u order by id desc limit 100) x);
end $$;

create or replace function public.cfx_chat_sin_leer() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.cfx_chat where cuenta = auth.uid() and de = 'soporte' and not leido
$$;

create or replace function public.cfx_chat_enviar(p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); u uuid := (y ->> 'id')::uuid; t text := trim(coalesce(p_texto, '')); i bigint;
begin
  if u is null then raise exception 'Inicia sesión'; end if;
  if t = '' then raise exception 'Escribe tu mensaje'; end if;
  if length(t) > 1000 then raise exception 'Máximo 1000 letras'; end if;
  if (select count(*) from public.cfx_chat where cuenta = u and de = 'persona' and creado > now() - interval '1 hour') >= 20 then
    raise exception 'Muchos mensajes seguidos. Espera un poco y te respondemos.';
  end if;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto)
  values (u, coalesce(y ->> 'email', ''), left(coalesce(y ->> 'nombre', ''), 80), coalesce(y ->> 'rol', ''), 'persona', t) returning id into i;
  delete from public.cfx_chat where cuenta = u and creado < now() - interval '365 days';
  perform public.cfx_al_cm('💬 ' || coalesce(nullif(y ->> 'nombre', ''), y ->> 'email', 'Mensaje'), left(t, 200), 'chat');
  return i;
end $$;

-- Administrador: bandeja (una fila por persona), conversación y respuesta.
create or replace function public.cfx_chat_bandeja() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select coalesce(jsonb_agg(x order by x.ultimo desc), '[]') from (
    select c.cuenta, max(c.email) as email, max(c.nombre) as nombre, max(c.rol) as rol, max(c.creado) as ultimo,
      (array_agg(c.texto order by c.id desc))[1] as texto, (array_agg(c.de order by c.id desc))[1] as de,
      count(*) filter (where c.de = 'persona' and not c.leido) as sin_leer
    from public.cfx_chat c group by c.cuenta order by max(c.creado) desc limit 200) x);
end $$;

create or replace function public.cfx_chat_hilo(p_cuenta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  update public.cfx_chat set leido = true where cuenta = p_cuenta and de = 'persona' and not leido;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'de', de, 'texto', texto, 'creado', creado) order by id), '[]')
          from (select * from public.cfx_chat where cuenta = p_cuenta order by id desc limit 200) x);
end $$;

create or replace function public.cfx_chat_responder(p_cuenta uuid, p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_texto, '')); i bigint; o public.cfx_chat;
begin
  perform public.cfx_es_admin();
  if t = '' or length(t) > 1000 then raise exception 'Escribe la respuesta (máx. 1000 letras)'; end if;
  select * into o from public.cfx_chat where cuenta = p_cuenta order by id desc limit 1;
  if o.id is null then raise exception 'Conversación no encontrada'; end if;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto, leido) values (p_cuenta, o.email, o.nombre, o.rol, 'soporte', t, false) returning id into i;
  update public.cfx_chat set leido = true where cuenta = p_cuenta and de = 'persona' and not leido;
  perform public.cfx_avisar(p_cuenta, '💬 Soporte te respondió', left(t, 200));
  return i;
end $$;

-- El administrador escribe primero a una cuenta (consejos o recomendaciones): queda en su chat de soporte (🛟) y en CM → Mensajes.
create or replace function public.cfx_chat_iniciar(p_cuenta uuid, p_texto text, p_email text default '', p_nombre text default '', p_rol text default 'negocio') returns bigint
language plpgsql security definer set search_path = '' as $$
declare t text := trim(coalesce(p_texto, '')); i bigint; o public.cfx_chat;
begin
  perform public.cfx_es_admin();
  if t = '' or length(t) > 1000 then raise exception 'Escribe el mensaje (máx. 1000 letras)'; end if;
  select * into o from public.cfx_chat where cuenta = p_cuenta order by id desc limit 1;
  insert into public.cfx_chat (cuenta, email, nombre, rol, de, texto, leido)
  values (p_cuenta, coalesce(o.email, left(coalesce(p_email, ''), 200)), coalesce(o.nombre, left(coalesce(p_nombre, ''), 120)), coalesce(o.rol, left(coalesce(p_rol, 'negocio'), 20)), 'soporte', t, false)
  returning id into i;
  perform public.cfx_avisar(p_cuenta, '💬 Soporte te escribió', left(t, 200));
  return i;
end $$;
revoke all on function public.cfx_chat_iniciar(uuid, text, text, text, text) from public, anon;
grant execute on function public.cfx_chat_iniciar(uuid, text, text, text, text) to authenticated;

-- ---------- 3) Guía para partir ----------
-- Pendientes de configuración del negocio (los arma cada app) + verificar identidad. Solo para negocios.
create or replace function public.cfx_guia() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); l jsonb;
begin
  if y is null or (y ->> 'id') is null then raise exception 'Inicia sesión'; end if;
  if y ->> 'rol' <> 'negocio' then return jsonb_build_object('items', '[]'::jsonb, 'sin_leer', public.cfx_chat_sin_leer()); end if;
  l := coalesce(public.cfx_guia_app(), '[]'::jsonb);
  -- Sin guía propia (Centro de Mando): nada que mostrar.
  if jsonb_array_length(l) > 0 and not exists (select 1 from jsonb_array_elements(l) e where e ->> 'k' = 'verificar') then l := l || jsonb_build_array(jsonb_build_object('k', 'verificar', 't', 'Verifica tu identidad',
    'd', 'Tus clientes confían más en un negocio verificado. Toma 2 minutos.',
    'ok', exists (select 1 from public.cfx_verificaciones v where v.cuenta = (y ->> 'id')::uuid and v.estado = 'aprobada'), 'ir', 'verificar')); end if;
  return jsonb_build_object('items', l, 'sin_leer', public.cfx_chat_sin_leer());
end $$;

revoke all on function public.cfx_al_cm(text, text, text) from public, anon, authenticated;
revoke all on function public.cfx_cm_vincular(text, text, text, text), public.cfx_cm_estado(), public.cfx_chat_mio(), public.cfx_chat_sin_leer(), public.cfx_chat_enviar(text),
  public.cfx_chat_bandeja(), public.cfx_chat_hilo(uuid), public.cfx_chat_responder(uuid, text), public.cfx_guia() from public, anon;
grant execute on function public.cfx_cm_vincular(text, text, text, text), public.cfx_cm_estado(), public.cfx_chat_mio(), public.cfx_chat_sin_leer(), public.cfx_chat_enviar(text),
  public.cfx_chat_bandeja(), public.cfx_chat_hilo(uuid), public.cfx_chat_responder(uuid, text), public.cfx_guia() to authenticated;
revoke all on function public.cfx_guia_app() from public, anon, authenticated;

-- ---------- PIN de la app (4 a 6 números), guardado en la cuenta. Se pide al abrir la app y tras 5 min sin usarla. ----------
create table if not exists public.cfx_pin (
  usuario    uuid primary key references auth.users (id) on delete cascade,
  hash       text not null,
  fallos     int not null default 0,
  espera     timestamptz,
  actualizado timestamptz not null default now()
);
alter table public.cfx_pin enable row level security;
revoke all on public.cfx_pin from anon, authenticated;

create or replace function public.cfx_pin_estado() returns boolean
language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.cfx_pin where usuario = auth.uid()) $$;

create or replace function public.cfx_pin_guardar(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if coalesce(p_pin, '') = '' then delete from public.cfx_pin where usuario = auth.uid(); return false; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener de 4 a 6 números'; end if;
  insert into public.cfx_pin (usuario, hash) values (auth.uid(), encode(sha256(convert_to(auth.uid()::text || ':' || p_pin, 'UTF8')), 'hex'))
  on conflict (usuario) do update set hash = excluded.hash, fallos = 0, espera = null, actualizado = now();
  return true;
end $$;

create or replace function public.cfx_pin_verificar(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.cfx_pin;
begin
  select * into r from public.cfx_pin where usuario = auth.uid();
  if not found then return jsonb_build_object('ok', true); end if;
  if r.espera is not null and r.espera > now() then return jsonb_build_object('ok', false, 'espera', ceil(extract(epoch from r.espera - now()))); end if;
  if r.hash = encode(sha256(convert_to(auth.uid()::text || ':' || coalesce(p_pin, ''), 'UTF8')), 'hex') then
    update public.cfx_pin set fallos = 0, espera = null where usuario = auth.uid(); return jsonb_build_object('ok', true);
  end if;
  update public.cfx_pin set fallos = case when r.fallos + 1 >= 5 then 0 else r.fallos + 1 end,
    espera = case when r.fallos + 1 >= 5 then now() + interval '5 minutes' else null end where usuario = auth.uid();
  return jsonb_build_object('ok', false, 'quedan', greatest(0, 4 - r.fallos), 'espera', case when r.fallos + 1 >= 5 then 300 else 0 end);
end $$;
revoke all on function public.cfx_pin_estado(), public.cfx_pin_guardar(text), public.cfx_pin_verificar(text) from public, anon;
grant execute on function public.cfx_pin_estado(), public.cfx_pin_guardar(text), public.cfx_pin_verificar(text) to authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Legal (igual en las 7 apps; lo reparte nucleo/sincronizar.py).
--   Términos y Política de privacidad con versión (Ley 19.628 modificada por la Ley 21.719, vigente desde el 1-dic-2026).
--   El texto vive en nucleo/ayuda.js (CFX_LEGAL.version). Aquí solo queda la prueba de quién aceptó qué versión y cuándo.
--   cfx_legal_estado()          → última versión aceptada por la cuenta (0 = ninguna).
--   cfx_legal_aceptar(version)  → guarda la aceptación (una fila por versión, nunca se pisa).
--   cfx_legal_resumen()         → admin: cuántas cuentas aceptaron cada versión.
-- ---------------------------------------------------------------------
create table if not exists public.cfx_legal (
  cuenta    uuid not null,
  version   int  not null check (version between 1 and 10000),
  aceptado  timestamptz not null default now(),
  agente    text not null default '',
  primary key (cuenta, version)
);
alter table public.cfx_legal enable row level security;
revoke all on public.cfx_legal from anon, authenticated;

create or replace function public.cfx_legal_estado() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(version), 0) from public.cfx_legal where cuenta = auth.uid()
$$;

create or replace function public.cfx_legal_aceptar(p_version int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Inicia sesión para aceptar.'; end if;
  if p_version is null or p_version < 1 or p_version > 10000 then raise exception 'Versión no válida.'; end if;
  insert into public.cfx_legal (cuenta, version, agente)
  values (u, p_version, left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 300))
  on conflict (cuenta, version) do nothing;
end $$;

create or replace function public.cfx_legal_resumen() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('version', version, 'cuentas', n, 'ultima', u) order by version desc)
    from (select version, count(*) n, max(aceptado) u from public.cfx_legal group by version) x), '[]'::jsonb);
end $$;

revoke all on function public.cfx_legal_estado(), public.cfx_legal_aceptar(int), public.cfx_legal_resumen() from public, anon;
grant execute on function public.cfx_legal_estado(), public.cfx_legal_aceptar(int), public.cfx_legal_resumen() to authenticated;

-- ---------------------------------------------------------------------
-- A2 · Consentimientos aparte de los términos (se dan y se retiran cuando quieras; queda el historial).
--   'ofertas'  = novedades y ofertas de CodeFix (parte en NO: solo con consentimiento expreso).
--   'negocios' = ofertas de los negocios donde eres cliente (parte en SÍ por la relación de cliente; se puede retirar).
--   cfx_consent_estado() · cfx_consent_guardar(tipo, si) · cfx_acepta(cuenta, tipo) (uso interno) · admin cfx_consent_resumen().
-- A3 · Derechos del titular (acceso, rectificación, supresión, oposición, portabilidad y bloqueo) con plazo de 30 días (+30 una vez).
--   cfx_mis_datos() → copia de todo lo de la cuenta (acceso y portabilidad al instante; queda registrado como solicitud respondida).
--   cfx_derecho_pedir(tipo, detalle) · cfx_derechos_mios() · admin cfx_derechos_lista(todas) y cfx_derecho_responder(id, accion, respuesta).
-- Brechas de seguridad (registro y aviso a la Agencia y a los afectados): admin cfx_brechas_lista(), cfx_brecha_guardar(jsonb),
--   cfx_brecha_marcar(id, 'agencia' | 'cerrar'), cfx_brecha_avisar(id, destino, titulo, cuerpo). Resumen: cfx_privacidad_resumen().
-- ---------------------------------------------------------------------
create table if not exists public.cfx_consent (
  cuenta uuid not null, tipo text not null check (tipo in ('ofertas', 'negocios')), si boolean not null,
  cambiado timestamptz not null default now(), agente text not null default '', primary key (cuenta, tipo));
create table if not exists public.cfx_consent_hist (
  id bigserial primary key, cuenta uuid not null, tipo text not null, si boolean not null, creado timestamptz not null default now(), agente text not null default '');
create table if not exists public.cfx_derechos (
  id bigserial primary key, cuenta uuid not null, email text not null default '',
  tipo text not null check (tipo in ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad', 'bloqueo')),
  detalle text not null default '', estado text not null default 'pendiente' check (estado in ('pendiente', 'prorrogada', 'respondida', 'rechazada')),
  creado timestamptz not null default now(), vence timestamptz not null default now() + interval '30 days', respuesta text not null default '', respondido timestamptz);
create index if not exists cfx_derechos_cuenta on public.cfx_derechos (cuenta, creado desc);
create table if not exists public.cfx_brechas (
  id bigserial primary key, detectada timestamptz not null default now(), descripcion text not null, datos text not null default '',
  afectados int not null default 0, riesgo text not null default 'medio' check (riesgo in ('bajo', 'medio', 'alto')), medidas text not null default '',
  agencia timestamptz, titulares timestamptz, avisados int not null default 0, cerrada timestamptz, creado timestamptz not null default now());
alter table public.cfx_consent enable row level security;
alter table public.cfx_consent_hist enable row level security;
alter table public.cfx_derechos enable row level security;
alter table public.cfx_brechas enable row level security;
revoke all on public.cfx_consent, public.cfx_consent_hist, public.cfx_derechos, public.cfx_brechas from anon, authenticated;

create or replace function public.cfx_agente() returns text language sql stable set search_path = '' as $$
  select left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 300) $$;
create or replace function public.cfx_acepta(p_cuenta uuid, p_tipo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select si from public.cfx_consent where cuenta = p_cuenta and tipo = p_tipo), p_tipo = 'negocios') $$;
create or replace function public.cfx_consent_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ofertas', public.cfx_acepta(auth.uid(), 'ofertas'), 'negocios', public.cfx_acepta(auth.uid(), 'negocios'),
    'cambiado', coalesce((select jsonb_object_agg(tipo, cambiado) from public.cfx_consent where cuenta = auth.uid()), '{}'::jsonb)) $$;
create or replace function public.cfx_consent_guardar(p_tipo text, p_si boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Inicia sesión.'; end if;
  if p_tipo not in ('ofertas', 'negocios') or p_si is null then raise exception 'Opción no válida.'; end if;
  insert into public.cfx_consent (cuenta, tipo, si, agente) values (u, p_tipo, p_si, public.cfx_agente())
  on conflict (cuenta, tipo) do update set si = excluded.si, cambiado = now(), agente = excluded.agente;
  insert into public.cfx_consent_hist (cuenta, tipo, si, agente) values (u, p_tipo, p_si, public.cfx_agente());
  return public.cfx_consent_estado();
end $$;
create or replace function public.cfx_consent_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'si', s, 'no', n) order by tipo)
    from (select tipo, count(*) filter (where si) s, count(*) filter (where not si) n from public.cfx_consent group by tipo) x), '[]'::jsonb);
end $$;

-- Copia de los datos de la cuenta: cada tabla con una columna de dueño (cuenta, owner_id, user_id, cliente_id…) = la cuenta.
-- No incluye claves, PIN, tokens ni llaves de API (se quitan esas columnas). Máx. 1000 filas por tabla.
create or replace function public.cfx_mis_datos() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r record; filas jsonb; out jsonb := '{}'::jsonb; quitar text[];
begin
  if u is null then raise exception 'Inicia sesión.'; end if;
  for r in
    select c.table_schema s, c.table_name t, c.column_name col
    from information_schema.columns c join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'privado') and c.data_type = 'uuid'
      and (c.column_name in ('cuenta', 'owner_id', 'user_id', 'usuario_id', 'cliente_id', 'target_id', 'autor_id', 'creado_por', 'created_by')
        or (c.column_name = 'id' and c.table_name in ('profiles', 'perfiles', 'usuarios', 'cuentas')))
      and c.table_name not in ('cfx_pin', 'cfx_keys', 'boleta_cuentas', 'push_subscriptions', 'app_secrets', 'cfx_verificaciones')
      and c.table_name !~ '(secret|clave|token)'
    order by 1, 2, 3
  loop
    select coalesce(array_agg(column_name::text), '{}') into quitar from information_schema.columns
      where table_schema = r.s and table_name = r.t and column_name ~* '(hash|^pin|pass|token|apikey|api_key|secret|clave|endpoint|^p256dh|^auth$)';
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from (select * from %I.%I where %I = $1 limit 1000) x', r.s, r.t, r.col) into filas using u, quitar;
    if jsonb_array_length(filas) > 0 then
      out := jsonb_set(out, array[r.s || '.' || r.t], coalesce(out -> (r.s || '.' || r.t), '[]'::jsonb) || filas);
    end if;
  end loop;
  insert into public.cfx_derechos (cuenta, email, tipo, detalle, estado, respuesta, respondido)
  values (u, coalesce((select email from auth.users where id = u), ''), 'portabilidad', 'Descarga desde la app', 'respondida', 'Copia entregada al instante (archivo JSON).', now());
  return jsonb_build_object('generado', now(), 'cuenta', jsonb_build_object('id', u, 'email', (select email from auth.users where id = u)),
    'consentimientos', public.cfx_consent_estado(), 'terminos_aceptados', (select coalesce(jsonb_agg(jsonb_build_object('version', version, 'aceptado', aceptado)), '[]'::jsonb) from public.cfx_legal where cuenta = u),
    'datos', out);
end $$;

create or replace function public.cfx_derecho_pedir(p_tipo text, p_detalle text default '') returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); e text; i bigint; nom text;
begin
  if u is null then raise exception 'Inicia sesión.'; end if;
  if p_tipo not in ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad', 'bloqueo') then raise exception 'Tipo de solicitud no válido.'; end if;
  if p_tipo in ('rectificacion', 'oposicion') and length(trim(coalesce(p_detalle, ''))) < 3 then raise exception 'Cuéntanos qué dato o qué uso (en pocas palabras).'; end if;
  if (select count(*) from public.cfx_derechos where cuenta = u and estado in ('pendiente', 'prorrogada')) >= 5 then raise exception 'Ya tienes 5 solicitudes en curso: espera la respuesta.'; end if;
  select email into e from auth.users where id = u;
  insert into public.cfx_derechos (cuenta, email, tipo, detalle) values (u, coalesce(e, ''), p_tipo, left(trim(coalesce(p_detalle, '')), 600)) returning id into i;
  nom := case p_tipo when 'acceso' then 'acceso' when 'rectificacion' then 'rectificación' when 'supresion' then 'supresión (borrar)' when 'oposicion' then 'oposición'
    when 'portabilidad' then 'portabilidad' else 'bloqueo' end;
  perform public.cfx_anotar('derecho', 'Solicitud de ' || nom || ' #' || i || ' de ' || coalesce(e, u::text));
  begin perform public.cfx_avisar_admin('🔒 Solicitud de datos: ' || nom, coalesce(e, '') || ' · responder antes del ' || to_char(now() + interval '30 days', 'DD-MM-YYYY')); exception when others then null; end;
  return i;
end $$;
create or replace function public.cfx_derechos_mios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'detalle', detalle, 'estado', estado, 'creado', creado, 'vence', vence, 'respuesta', respuesta, 'respondido', respondido) order by creado desc), '[]'::jsonb)
  from (select * from public.cfx_derechos where cuenta = auth.uid() order by creado desc limit 50) x $$;
create or replace function public.cfx_derechos_lista(p_todas boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cuenta', cuenta, 'email', email, 'tipo', tipo, 'detalle', detalle, 'estado', estado, 'creado', creado, 'vence', vence,
      'dias', ceil(extract(epoch from vence - now()) / 86400)::int, 'respuesta', respuesta, 'respondido', respondido) order by (estado in ('pendiente', 'prorrogada')) desc, vence)
    from (select * from public.cfx_derechos where p_todas or estado in ('pendiente', 'prorrogada') order by creado desc limit 300) x), '[]'::jsonb);
end $$;
create or replace function public.cfx_derecho_responder(p_id bigint, p_accion text, p_respuesta text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.cfx_derechos; t text := left(trim(coalesce(p_respuesta, '')), 800);
begin
  perform public.cfx_es_admin();
  select * into d from public.cfx_derechos where id = p_id for update;
  if d.id is null then raise exception 'No existe esa solicitud.'; end if;
  if d.estado not in ('pendiente', 'prorrogada') then raise exception 'Esa solicitud ya se respondió.'; end if;
  if length(t) < 3 then raise exception 'Escribe la respuesta (o el motivo).'; end if;
  if p_accion = 'prorrogar' then
    if d.estado = 'prorrogada' then raise exception 'Solo se puede prorrogar una vez.'; end if;
    update public.cfx_derechos set estado = 'prorrogada', vence = vence + interval '30 days', respuesta = t where id = p_id;
    perform public.cfx_avisar(d.cuenta, '🔒 Tu solicitud de datos tomará más tiempo', left('Respondemos antes del ' || to_char(d.vence + interval '30 days', 'DD-MM-YYYY') || '. ' || t, 240));
  elsif p_accion in ('responder', 'rechazar') then
    update public.cfx_derechos set estado = case when p_accion = 'responder' then 'respondida' else 'rechazada' end, respuesta = t, respondido = now() where id = p_id;
    perform public.cfx_avisar(d.cuenta, case when p_accion = 'responder' then '🔒 Respondimos tu solicitud de datos' else '🔒 Tu solicitud de datos no se pudo acoger' end, left(t, 240));
  else raise exception 'Acción no válida.'; end if;
  perform public.cfx_anotar('derecho', p_accion || ' #' || p_id || ' (' || d.tipo || ', ' || d.email || ')');
end $$;

create or replace function public.cfx_brechas_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(to_jsonb(b) order by b.detectada desc) from public.cfx_brechas b), '[]'::jsonb);
end $$;
create or replace function public.cfx_brecha_guardar(p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare i bigint := nullif(p ->> 'id', '')::bigint; d text := left(trim(coalesce(p ->> 'descripcion', '')), 1000);
begin
  perform public.cfx_es_admin();
  if length(d) < 5 then raise exception 'Describe qué pasó.'; end if;
  if coalesce(p ->> 'riesgo', 'medio') not in ('bajo', 'medio', 'alto') then raise exception 'Riesgo no válido.'; end if;
  if i is null then
    insert into public.cfx_brechas (detectada, descripcion, datos, afectados, riesgo, medidas)
    values (coalesce(nullif(p ->> 'detectada', '')::timestamptz, now()), d, left(coalesce(p ->> 'datos', ''), 500), greatest(coalesce(nullif(p ->> 'afectados', '')::int, 0), 0),
      coalesce(p ->> 'riesgo', 'medio'), left(coalesce(p ->> 'medidas', ''), 1000)) returning id into i;
    perform public.cfx_anotar('brecha', 'Nueva #' || i || ' (' || coalesce(p ->> 'riesgo', 'medio') || '): ' || d);
  else
    update public.cfx_brechas set descripcion = d, datos = left(coalesce(p ->> 'datos', ''), 500), afectados = greatest(coalesce(nullif(p ->> 'afectados', '')::int, 0), 0),
      riesgo = coalesce(p ->> 'riesgo', 'medio'), medidas = left(coalesce(p ->> 'medidas', ''), 1000) where id = i;
    if not found then raise exception 'No existe ese registro.'; end if;
    perform public.cfx_anotar('brecha', 'Editada #' || i);
  end if;
  return i;
end $$;
create or replace function public.cfx_brecha_marcar(p_id bigint, p_que text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if p_que = 'agencia' then update public.cfx_brechas set agencia = coalesce(agencia, now()) where id = p_id;
  elsif p_que = 'cerrar' then update public.cfx_brechas set cerrada = coalesce(cerrada, now()) where id = p_id;
  else raise exception 'Acción no válida.'; end if;
  if not found then raise exception 'No existe ese registro.'; end if;
  perform public.cfx_anotar('brecha', p_que || ' #' || p_id);
end $$;
create or replace function public.cfx_brecha_avisar(p_id bigint, p_destino text, p_titulo text, p_cuerpo text) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid; n int := 0;
begin
  perform public.cfx_es_admin();
  if not exists (select 1 from public.cfx_brechas where id = p_id) then raise exception 'No existe ese registro.'; end if;
  if trim(coalesce(p_titulo, '')) = '' or trim(coalesce(p_cuerpo, '')) = '' then raise exception 'Escribe el título y el mensaje.'; end if;
  if p_destino not in ('todos', 'negocios', 'clientes', 'premium', 'gratis') then raise exception 'Destino no válido'; end if;
  for u in select * from public.cfx_destinatarios(p_destino) loop
    perform public.cfx_avisar(u, left(p_titulo, 80), left(p_cuerpo, 240)); n := n + 1;
  end loop;
  update public.cfx_brechas set titulares = now(), avisados = avisados + n where id = p_id;
  perform public.cfx_anotar('brecha', 'Aviso a ' || p_destino || ' (' || n || ') #' || p_id);
  return n;
end $$;
create or replace function public.cfx_privacidad_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('pendientes', (select count(*) from public.cfx_derechos where estado in ('pendiente', 'prorrogada')),
    'vencen', (select count(*) from public.cfx_derechos where estado in ('pendiente', 'prorrogada') and vence < now() + interval '5 days'),
    'brechas', (select count(*) from public.cfx_brechas where cerrada is null), 'consent', public.cfx_consent_resumen(), 'legal', public.cfx_legal_resumen());
end $$;

revoke all on function public.cfx_agente(), public.cfx_acepta(uuid, text) from public, anon, authenticated;
revoke all on function public.cfx_consent_estado(), public.cfx_consent_guardar(text, boolean), public.cfx_consent_resumen(), public.cfx_mis_datos(),
  public.cfx_derecho_pedir(text, text), public.cfx_derechos_mios(), public.cfx_derechos_lista(boolean), public.cfx_derecho_responder(bigint, text, text),
  public.cfx_brechas_lista(), public.cfx_brecha_guardar(jsonb), public.cfx_brecha_marcar(bigint, text), public.cfx_brecha_avisar(bigint, text, text, text), public.cfx_privacidad_resumen() from public, anon;
grant execute on function public.cfx_consent_estado(), public.cfx_consent_guardar(text, boolean), public.cfx_consent_resumen(), public.cfx_mis_datos(),
  public.cfx_derecho_pedir(text, text), public.cfx_derechos_mios(), public.cfx_derechos_lista(boolean), public.cfx_derecho_responder(bigint, text, text),
  public.cfx_brechas_lista(), public.cfx_brecha_guardar(jsonb), public.cfx_brecha_marcar(bigint, text), public.cfx_brecha_avisar(bigint, text, text, text), public.cfx_privacidad_resumen() to authenticated;
-- ---------------------------------------------------------------------
-- CodeFix · Referidos (igual en las 7 apps; lo reparte nucleo/sincronizar.py). Se administra desde CM → Control → Referidos.
--   Cada usuario (negocio o cliente, nunca el admin) tiene su código. Quien se registra con él queda asociado a esa cuenta.
--   El admin ve quién invitó a quién, da días de Premium o manda un sticker de ánimo. Premio automático (opcional):
--   cuando el invitado paga su primer Premium, quien lo invitó recibe N días (cfx_config 'referidos' → dias_auto; 0 = apagado).
--   Usa lo que cada app define para los pagos: cfx_yo(), cfx_dar_premium(uuid, text, int) y cfx_avisar(uuid, text, text).
-- ---------------------------------------------------------------------
create table if not exists public.cfx_ref_codigos (cuenta uuid primary key, codigo text not null unique check (codigo ~ '^[A-Z0-9]{4,12}$'), creado timestamptz not null default now());
create table if not exists public.cfx_referidos (
  invitado uuid primary key, invito uuid not null, codigo text not null, email text not null default '', nombre text not null default '',
  creado timestamptz not null default now(), premiado boolean not null default false, dias_dados int not null default 0, stickers int not null default 0);
create index if not exists cfx_referidos_invito_idx on public.cfx_referidos (invito);
alter table public.cfx_ref_codigos enable row level security;
alter table public.cfx_referidos enable row level security;
revoke all on public.cfx_ref_codigos, public.cfx_referidos from anon, authenticated;
insert into public.cfx_config (clave, valor) values ('referidos', '{"dias_auto": 0}') on conflict (clave) do nothing;

-- Mi código para invitar (y cuántos se registraron con él). El admin no tiene.
create or replace function public.cfx_ref_mio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); c text; i int := 0;
begin
  if y is null or y ->> 'rol' = 'admin' then return null; end if;
  select codigo into c from public.cfx_ref_codigos where cuenta = (y ->> 'id')::uuid;
  while c is null and i < 20 loop
    c := upper(left(regexp_replace(translate(coalesce(nullif(y ->> 'nombre', ''), split_part(y ->> 'email', '@', 1)), 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'), '[^A-Za-z]', '', 'g'), 6));
    c := (case when length(c) < 2 then 'CF' else c end) || lpad((floor(random() * 10000))::int::text, 4, '0'); i := i + 1;
    begin insert into public.cfx_ref_codigos (cuenta, codigo) values ((y ->> 'id')::uuid, c); exception when unique_violation then c := null; end;
  end loop;
  return jsonb_build_object('codigo', c, 'invitados', (select count(*) from public.cfx_referidos where invito = (y ->> 'id')::uuid),
    'pagaron', (select count(*) from public.cfx_referidos r where r.invito = (y ->> 'id')::uuid and r.premiado));
end $$;
-- La cuenta nueva que llegó con un código queda asociada (una sola vez, solo en sus primeros 3 días, nunca consigo misma).
create or replace function public.cfx_ref_registrar(p_codigo text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare y jsonb := public.cfx_yo(); o uuid; quien text;
begin
  if y is null or y ->> 'rol' = 'admin' then return false; end if;
  if (select created_at from auth.users where id = (y ->> 'id')::uuid) < now() - interval '3 days' then return false; end if;
  select cuenta into o from public.cfx_ref_codigos where codigo = upper(trim(p_codigo));
  if o is null or o = (y ->> 'id')::uuid then return false; end if;
  insert into public.cfx_referidos (invitado, invito, codigo, email, nombre) values ((y ->> 'id')::uuid, o, upper(trim(p_codigo)), coalesce(y ->> 'email', ''), coalesce(y ->> 'nombre', ''))
    on conflict (invitado) do nothing;
  if not found then return false; end if;
  quien := coalesce(nullif(y ->> 'nombre', ''), split_part(y ->> 'email', '@', 1));
  perform public.cfx_avisar(o, '🎉 ' || quien || ' se registró con tu código', 'Gracias por recomendarnos. ¡Sigue invitando!');
  return true;
end $$;
-- Panel: quién invitó a quién (con correo de ambos), si el invitado ya pagó y lo que se le ha dado a quien invitó.
create or replace function public.cfx_ref_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('config', (select valor from public.cfx_config where clave = 'referidos'), 'filas', coalesce((select jsonb_agg(x order by x.creado desc) from (
    select r.invitado, r.email, r.nombre, r.creado, r.codigo, r.invito, u.email invito_email, r.premiado, r.dias_dados, r.stickers,
      exists (select 1 from public.cfx_pagos g where g.cuenta = r.invitado and g.estado = 'aprobado') pago
    from public.cfx_referidos r left join auth.users u on u.id = r.invito limit 1000) x), '[]'));
end $$;
-- Dar días de Premium y/o mandar un sticker (mensaje de ánimo) a quien invita.
create or replace function public.cfx_ref_premiar(p_cuenta uuid, p_dias int default 0, p_mensaje text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare hasta timestamptz; d int := greatest(0, least(coalesce(p_dias, 0), 365)); n int;
begin
  perform public.cfx_es_admin();
  select count(*) into n from public.cfx_referidos where invito = p_cuenta;
  if n = 0 then raise exception 'Esa cuenta no ha invitado a nadie'; end if;
  if d > 0 then
    hasta := public.cfx_dar_premium(p_cuenta, 'otro', d);
    update public.cfx_referidos set dias_dados = dias_dados + d where invitado = (select invitado from public.cfx_referidos where invito = p_cuenta order by creado desc limit 1);
  end if;
  if coalesce(trim(p_mensaje), '') <> '' or d > 0 then
    perform public.cfx_avisar(p_cuenta, left(coalesce(nullif(trim(p_mensaje), ''), '🏆 ¡Gracias por invitar!'), 90),
      case when d > 0 then '🎁 Te regalamos ' || d || ' días de Premium por recomendarnos (' || n || ' invitado' || case when n > 1 then 's' else '' end || ').' else 'Vas en ' || n || ' invitado' || case when n > 1 then 's' else '' end || '. ¡Sigue así!' end);
    update public.cfx_referidos set stickers = stickers + 1 where invitado = (select invitado from public.cfx_referidos where invito = p_cuenta order by creado desc limit 1);
  end if;
  perform public.cfx_anotar('referido', 'premio a ' || coalesce((select email from auth.users where id = p_cuenta), p_cuenta::text) || ': ' || d || ' días');
  return jsonb_build_object('dias', d, 'hasta', hasta);
end $$;
create or replace function public.cfx_ref_config_guardar(p_dias_auto int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  insert into public.cfx_config (clave, valor) values ('referidos', jsonb_build_object('dias_auto', greatest(0, least(coalesce(p_dias_auto, 0), 365))))
    on conflict (clave) do update set valor = excluded.valor;
  return (select valor from public.cfx_config where clave = 'referidos');
end $$;
-- Premio automático: al aprobarse el primer pago del invitado, quien lo invitó recibe dias_auto días (una sola vez por invitado).
create or replace function public.cfx_ref_al_pagar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.cfx_referidos; d int := coalesce(((select valor from public.cfx_config where clave = 'referidos') ->> 'dias_auto')::int, 0);
begin
  if new.estado <> 'aprobado' or old.estado = 'aprobado' then return new; end if;
  select * into r from public.cfx_referidos where invitado = new.cuenta and not premiado for update;
  if r.invitado is null then return new; end if;
  update public.cfx_referidos set premiado = true, dias_dados = dias_dados + case when d > 0 then d else 0 end where invitado = r.invitado;
  if d > 0 then
    perform public.cfx_dar_premium(r.invito, 'otro', d);
    perform public.cfx_avisar(r.invito, '🎁 ¡Ganaste ' || d || ' días de Premium!', coalesce(nullif(r.nombre, ''), split_part(r.email, '@', 1)) || ' pagó su Premium gracias a tu invitación.');
  end if;
  return new;
end $$;
drop trigger if exists cfx_ref_al_pagar on public.cfx_pagos;
create trigger cfx_ref_al_pagar after update of estado on public.cfx_pagos for each row execute function public.cfx_ref_al_pagar();
revoke all on function public.cfx_ref_al_pagar() from public, anon, authenticated;
revoke all on function public.cfx_ref_mio(), public.cfx_ref_registrar(text), public.cfx_ref_lista(), public.cfx_ref_premiar(uuid, int, text), public.cfx_ref_config_guardar(int) from public, anon;
grant execute on function public.cfx_ref_mio(), public.cfx_ref_registrar(text), public.cfx_ref_lista(), public.cfx_ref_premiar(uuid, int, text), public.cfx_ref_config_guardar(int) to authenticated;

-- ---------------------------------------------------------------------
-- CodeFix · Socios comunes (lo reparte nucleo/sincronizar.py). Los usan Billetera, Órbita y Estaciona (las otras apps tienen
-- sus propios socios). El socio entra con su correo y administra igual que el admin (cada app lo reconoce en su función de
-- administrador), pero solo el administrador dueño agrega o quita socios (CM → Control → 🤝 Socios). Lo que hace queda en el registro.
-- ---------------------------------------------------------------------
create table if not exists public.cfx_socios (email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre text not null default '' check (length(nombre) <= 60), creado timestamptz not null default now());
alter table public.cfx_socios enable row level security;
revoke all on public.cfx_socios from anon, authenticated;
create or replace function public.cfx_es_socio() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.cfx_socios s join auth.users u on lower(u.email) = s.email where u.id = auth.uid())
$$;
create or replace function public.cfx_socios_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('email', s.email, 'nombre', s.nombre, 'creado', s.creado, 'tiene_cuenta', exists (select 1 from auth.users u where lower(u.email) = s.email)) order by s.creado) from public.cfx_socios s), '[]');
end $$;
create or replace function public.cfx_socio_guardar(p_email text, p_nombre text default '', p_si boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  perform public.cfx_es_admin();
  if public.cfx_es_socio() then raise exception 'Solo el administrador agrega o quita socios'; end if;
  if coalesce(p_si, true) then
    insert into public.cfx_socios (email, nombre) values (e, left(coalesce(trim(p_nombre), ''), 60)) on conflict (email) do update set nombre = excluded.nombre;
    perform public.cfx_anotar('socio', 'agregó a ' || e);
  else
    delete from public.cfx_socios where email = e;
    perform public.cfx_anotar('socio', 'quitó a ' || e);
  end if;
end $$;
revoke all on function public.cfx_es_socio(), public.cfx_socios_lista(), public.cfx_socio_guardar(text, text, boolean) from public, anon;
grant execute on function public.cfx_es_socio(), public.cfx_socios_lista(), public.cfx_socio_guardar(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- CodeFix · Inventario (igual en las 6 apps; lo usa el Centro de Mando → Apps → Respaldo y limpieza).
--   Muestra las tablas que esta versión ya NO usa (restos de versiones antiguas) con cuántas filas tienen.
--   Nada se borra solo: las vacías se borran con un toque; las que tienen datos piden descargar el respaldo y escribir "sí".
--   cfx_tablas() = las tablas que crea este archivo (la revisa pruebas/inventario.py --verificar).
-- ---------------------------------------------------------------------
create or replace function public.cfx_tablas() returns text[] language sql immutable as $$ select array['public.actividad_dia', 'public.app_secrets', 'public.app_settings', 'public.avisos_stock', 'public.boleta_cuentas', 'public.calificaciones', 'public.catalog_items', 'public.cfx_analisis', 'public.cfx_bloqueos', 'public.cfx_brechas', 'public.cfx_calificaciones', 'public.cfx_cargas', 'public.cfx_carritos', 'public.cfx_chat', 'public.cfx_config', 'public.cfx_consent', 'public.cfx_consent_hist', 'public.cfx_cupones', 'public.cfx_derechos', 'public.cfx_descuentos', 'public.cfx_errores', 'public.cfx_exentos', 'public.cfx_keys', 'public.cfx_legal', 'public.cfx_mensajes', 'public.cfx_modulos_negocio', 'public.cfx_modulos_pruebas', 'public.cfx_pagos', 'public.cfx_pin', 'public.cfx_ref_codigos', 'public.cfx_referidos', 'public.cfx_registro', 'public.cfx_reportes', 'public.cfx_salud', 'public.cfx_secretos', 'public.cfx_sellos', 'public.cfx_sellos_cfg', 'public.cfx_socios', 'public.cfx_verificaciones', 'public.cfx_versiones', 'public.conexiones', 'public.cupones', 'public.links_pago', 'public.mp_cuentas', 'public.notification_reads', 'public.notifications', 'public.pedidos', 'public.planes', 'public.profiles', 'public.publicacion_vistas', 'public.publicaciones', 'public.push_subscriptions', 'public.requests', 'public.sellos', 'public.subscribers', 'public.textos', 'public.user_invites', 'public.variantes', 'public.webhook_envios', 'public.webhooks'] $$;
create or replace function public.cfx_inventario() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n bigint; out jsonb := '[]'::jsonb;
begin
  perform public.cfx_es_admin();
  for r in select s.nspname || '.' || c.relname as t, pg_total_relation_size(c.oid) as b from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname in ('public', 'privado') and c.relkind in ('r', 'p') and not (s.nspname || '.' || c.relname = any (public.cfx_tablas()))
           and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by 1
  loop
    execute 'select count(*) from ' || r.t into n;
    out := out || jsonb_build_object('tabla', r.t, 'filas', n, 'bytes', r.b);
  end loop;
  return out;
end $$;
create or replace function public.cfx_inventario_datos(p_tabla text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j jsonb;
begin
  perform public.cfx_es_admin();
  if not exists (select 1 from jsonb_array_elements(public.cfx_inventario()) x where x ->> 'tabla' = p_tabla) then raise exception 'Esa tabla no está en la lista de sobrantes'; end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from (select * from ' || p_tabla || ' limit 20000) t' into j;
  return j;
end $$;
create or replace function public.cfx_inventario_borrar(p_tabla text, p_confirmacion text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  perform public.cfx_es_admin();
  select e into x from jsonb_array_elements(public.cfx_inventario()) e where e ->> 'tabla' = p_tabla;
  if x is null then raise exception 'Esa tabla no está en la lista de sobrantes'; end if;
  if (x ->> 'filas')::bigint > 0 and lower(trim(coalesce(p_confirmacion, ''))) not in ('sí', 'si') then
    raise exception 'La tabla tiene % filas: descarga el respaldo y escribe "sí" para borrarla', x ->> 'filas';
  end if;
  execute 'drop table ' || p_tabla || ' cascade';
  return p_tabla || ' borrada';
end $$;
revoke all on function public.cfx_tablas(), public.cfx_inventario(), public.cfx_inventario_datos(text), public.cfx_inventario_borrar(text, text) from public, anon;
grant execute on function public.cfx_inventario(), public.cfx_inventario_datos(text), public.cfx_inventario_borrar(text, text) to authenticated;

-- ---------- Salud (G8): errores de la app en los teléfonos, ping anti-pausa y último respaldo ----------
-- Errores: carga.js manda cada error de JavaScript (agrupado por mensaje + lugar). Se guardan hasta 300 distintos y 30 días.
create table if not exists public.cfx_errores (
  id bigint generated always as identity primary key, firma text not null unique, mensaje text not null, donde text not null default '',
  pagina text not null default '', navegador text not null default '', version text not null default '', veces int not null default 1,
  con_cuenta boolean not null default false, creado timestamptz not null default now(), ultimo timestamptz not null default now());
-- Salud: 'ping' (lo toca GitHub Actions para que Supabase no pause la base) y 'respaldo' (lo anota el respaldo diario).
create table if not exists public.cfx_salud (clave text primary key, valor jsonb not null default '{}', cuando timestamptz not null default now());
-- B13 Carga real: cuánto demora en abrir cada página en los teléfonos (carga.js, 1 vez por página y sesión). Por día y página; 30 días.
create table if not exists public.cfx_cargas (dia date not null default current_date, pagina text not null, veces int not null default 0, ms bigint not null default 0,
  lcp bigint not null default 0, con_lcp int not null default 0, lentas int not null default 0, cache int not null default 0, primary key (dia, pagina));
alter table public.cfx_cargas enable row level security;
revoke all on public.cfx_cargas from anon, authenticated;
alter table public.cfx_errores enable row level security;
alter table public.cfx_salud enable row level security;
revoke all on public.cfx_errores, public.cfx_salud from anon, authenticated;

-- Sin cuenta también (el error puede pasar antes de entrar). Sin captcha: no crea cuentas ni avisa a nadie,
-- se agrupa por firma, tiene tope de filas y de veces, y se borra solo a los 30 días.
create or replace function public.cfx_error_anotar(p_mensaje text, p_donde text default '', p_pagina text default '', p_navegador text default '', p_version text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare m text := left(coalesce(p_mensaje, ''), 300); d text := left(coalesce(p_donde, ''), 600); f text;
begin
  if m = '' then return; end if;
  f := md5(m || '|' || split_part(d, E'\n', 1));
  update public.cfx_errores set veces = least(veces + 1, 1000000), ultimo = now(), pagina = left(coalesce(p_pagina, ''), 200),
    navegador = left(coalesce(p_navegador, ''), 120), version = left(coalesce(p_version, ''), 20), con_cuenta = con_cuenta or auth.uid() is not null
    where firma = f and ultimo < now() - interval '2 seconds';
  if found or exists (select 1 from public.cfx_errores where firma = f) then return; end if;
  delete from public.cfx_errores where ultimo < now() - interval '30 days';
  if (select count(*) from public.cfx_errores) >= 300 then return; end if;
  insert into public.cfx_errores (firma, mensaje, donde, pagina, navegador, version, con_cuenta)
    values (f, m, d, left(coalesce(p_pagina, ''), 200), left(coalesce(p_navegador, ''), 120), left(coalesce(p_version, ''), 20), auth.uid() is not null)
    on conflict (firma) do nothing;
end $$;
grant execute on function public.cfx_error_anotar(text, text, text, text, text) to anon, authenticated;

-- B13: sin cuenta también (la vitrina la abren clientes sin cuenta). Valores acotados, máximo 40 páginas por día y 1 fila por día y página.
create or replace function public.cfx_carga_anotar(p_pagina text, p_ms int, p_lcp int default null, p_cache boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare pg text := left(regexp_replace(lower(coalesce(p_pagina, '')), '[^a-z0-9/_.-]', '', 'g'), 60); m int := least(greatest(coalesce(p_ms, 0), 0), 60000);
  l int := least(greatest(coalesce(p_lcp, 0), 0), 60000);
begin
  if pg = '' or m = 0 then return; end if;
  if not exists (select 1 from public.cfx_cargas where dia = current_date and pagina = pg) then
    if (select count(*) from public.cfx_cargas where dia = current_date) >= 40 then return; end if;
    delete from public.cfx_cargas where dia < current_date - 30;
  end if;
  insert into public.cfx_cargas as c (dia, pagina, veces, ms, lcp, con_lcp, lentas, cache)
    values (current_date, pg, 1, m, l, (l > 0)::int, (m > 3000)::int, coalesce(p_cache, false)::int)
    on conflict (dia, pagina) do update set veces = c.veces + 1, ms = c.ms + excluded.ms, lcp = c.lcp + excluded.lcp, con_lcp = c.con_lcp + excluded.con_lcp,
      lentas = c.lentas + excluded.lentas, cache = c.cache + excluded.cache
    where c.veces < 100000;
end $$;
revoke all on function public.cfx_carga_anotar(text, int, int, boolean) from public;
grant execute on function public.cfx_carga_anotar(text, int, int, boolean) to anon, authenticated;

-- Marca de salud (solo la base: GitHub Actions la llama con la conexión del respaldo; ping la usa por dentro).
create or replace function public.cfx_salud_marca(p_clave text, p_valor jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.cfx_salud (clave, valor, cuando) values (left(p_clave, 40), coalesce(p_valor, '{}'), now())
  on conflict (clave) do update set valor = excluded.valor, cuando = now()
$$;
revoke all on function public.cfx_salud_marca(text, jsonb) from public, anon, authenticated;

-- Ping anti-pausa: el plan gratis de Supabase pausa la base tras 7 días sin uso. GitHub Actions (SaaS: salud.yml) lo llama cada día.
create or replace function public.cfx_ping() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select cuando from public.cfx_salud where clave = 'ping'), '-infinity') < now() - interval '10 minutes' then
    perform public.cfx_salud_marca('ping', '{}');
  end if;
  return 'ok';
end $$;
grant execute on function public.cfx_ping() to anon, authenticated;

-- Centro de Mando → Control → 🩺 Salud.
create or replace function public.cfx_salud() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object(
    'ping', (select cuando from public.cfx_salud where clave = 'ping'),
    'respaldo', (select valor || jsonb_build_object('cuando', cuando) from public.cfx_salud where clave = 'respaldo'),
    'analisis', (select valor || jsonb_build_object('cuando', cuando) from public.cfx_salud where clave = 'analisis'),
    'carga', coalesce((select jsonb_agg(c order by c.veces desc) from (select pagina, sum(veces)::int veces, (sum(ms) / nullif(sum(veces), 0))::int ms,
        (sum(lcp) / nullif(sum(con_lcp), 0))::int lcp, sum(lentas)::int lentas, sum(cache)::int cache
      from public.cfx_cargas where dia > current_date - 7 group by pagina order by sum(veces) desc limit 20) c), '[]'),
    'errores_24h', (select coalesce(sum(veces), 0) from public.cfx_errores where ultimo > now() - interval '24 hours'),
    'errores', coalesce((select jsonb_agg(to_jsonb(e) - 'firma' order by e.ultimo desc) from (select * from public.cfx_errores order by ultimo desc limit 100) e), '[]'));
end $$;
revoke all on function public.cfx_salud() from public, anon;
grant execute on function public.cfx_salud() to authenticated;

create or replace function public.cfx_errores_borrar(p_id bigint default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.cfx_es_admin();
  delete from public.cfx_errores where p_id is null or id = p_id;
  get diagnostics n = row_count;
  perform public.cfx_anotar('errores borrados', case when p_id is null then 'todos (' || n || ')' else '#' || p_id end);
  return n;
end $$;
revoke all on function public.cfx_errores_borrar(bigint) from public, anon;
grant execute on function public.cfx_errores_borrar(bigint) to authenticated;
-- ---------- Módulos enchufables (C19): se prenden y apagan desde el Centro de Mando → Mis aplicaciones → 🧩 Módulos ----------
-- Cada app dice qué módulos tiene con el gancho cfx_modulos_app() → text[] (si no lo tiene: ninguno). Por defecto quedan prendidos.
insert into public.cfx_config (clave, valor) values ('modulos', '{}') on conflict (clave) do nothing;

create or replace function public.cfx_modulos_de_app() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare r text[];
begin
  if to_regprocedure('public.cfx_modulos_app()') is null then return '{}'; end if;
  execute 'select public.cfx_modulos_app()' into r;
  return coalesce(r, '{}');
end $$;

create or replace function public.cfx_modulo(p_clave text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return p_clave = any(public.cfx_modulos_de_app())
    and coalesce(((select valor from public.cfx_config where clave = 'modulos') ->> p_clave)::boolean, true);
end $$;

-- Para la app (esconde lo apagado): {"chat": true, ...}. Un negocio (o su equipo) ve lo que tiene activo (G19: módulos de pago).
create or replace function public.cfx_modulos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid := public.cfx_negocio_cuenta(auth.uid());
begin
  if n is not null and coalesce((public.cfx_venta() ->> 'activo')::boolean, false) then return public.cfx_modulos_de(n); end if;
  return coalesce((select jsonb_object_agg(k, public.cfx_modulo(k)) from unnest(public.cfx_modulos_de_app()) k), '{}');
end $$;

-- Para el Centro de Mando: con nombre y para qué sirve.
create or replace function public.cfx_modulos_admin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('clave', k, 'nombre', coalesce(c.nombre, k), 'detalle', coalesce(c.detalle, ''),
      'activo', public.cfx_modulo(k), 'precio', public.cfx_venta_precio(k),
      'negocios', (select count(*) from public.cfx_modulos_negocio m where m.modulo = k and m.hasta > now())) order by o)
    from unnest(public.cfx_modulos_de_app()) with ordinality u(k, o)
    left join public.cfx_modulos_catalogo() c on c.clave = k), '[]');
end $$;

create or replace function public.cfx_modulo_guardar(p_clave text, p_activo boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  if not coalesce(p_clave = any(public.cfx_modulos_de_app()), false) then raise exception 'Esta app no tiene ese módulo'; end if;
  insert into public.cfx_config (clave, valor) values ('modulos', jsonb_build_object(p_clave, coalesce(p_activo, true)))
  on conflict (clave) do update set valor = public.cfx_config.valor || excluded.valor;
  perform public.cfx_anotar('módulo', p_clave || case when coalesce(p_activo, true) then ' prendido' else ' apagado' end);
  return public.cfx_modulos_admin();
end $$;

revoke all on function public.cfx_modulos_de_app(), public.cfx_modulo(text) from public, anon, authenticated;
revoke all on function public.cfx_modulos(), public.cfx_modulos_admin(), public.cfx_modulo_guardar(text, boolean) from public, anon;
grant execute on function public.cfx_modulos() to anon, authenticated;
grant execute on function public.cfx_modulos_admin(), public.cfx_modulo_guardar(text, boolean) to authenticated;
-- ---------- Módulos de pago por negocio (G19) ----------
-- Cada negocio compra (o prueba 7 días) los módulos que quiere, sea Free o Premium. Se venden sueltos o en packs
-- (Básico, Crecer, Completo). Si "Vender módulos" está apagado en esta app (Centro de Mando → Apps → 🧩), todo sigue como antes:
-- el módulo prendido sirve a todos. Precio 0 = incluido gratis para todos.
-- Gancho opcional de la app: cfx_negocio_cuenta(uuid) → el negocio de esa cuenta (dueño o su equipo); null = no es negocio.
--                            cfx_es_premium(uuid) → si el negocio tiene Premium (descuento en módulos).
create table if not exists public.cfx_modulos_negocio (
  negocio uuid not null,
  modulo  text not null check (modulo ~ '^[a-z_]{2,30}$'),
  hasta   timestamptz not null,
  origen  text not null default 'pago' check (origen in ('prueba', 'pago', 'regalo')),
  avisado timestamptz,
  creado  timestamptz not null default now(),
  primary key (negocio, modulo)
);
create index if not exists cfx_modulos_negocio_hasta_idx on public.cfx_modulos_negocio (hasta);
create table if not exists public.cfx_modulos_pruebas (
  negocio uuid not null,
  item    text not null,
  creado  timestamptz not null default now(),
  primary key (negocio, item)
);
alter table public.cfx_modulos_negocio enable row level security;
alter table public.cfx_modulos_pruebas enable row level security;
revoke all on public.cfx_modulos_negocio, public.cfx_modulos_pruebas from anon, authenticated;

-- Precios en pesos al mes. Anual = 10 meses (2 de regalo). Premium paga 20 % menos en módulos y packs.
insert into public.cfx_config (clave, valor) values ('modulos_venta', jsonb_build_object(
  'activo', false, 'prueba_dias', 7, 'descuento_premium', 20, 'anual_meses', 10, 'precio', 990, 'precios', '{}'::jsonb, 'links', '{}'::jsonb,
  'packs', jsonb_build_object(
    'basico',   jsonb_build_object('nombre', '🌱 Básico',   'detalle', 'Para que vuelvan a comprarte', 'precio', 1990, 'modulos', jsonb_build_array('cupones', 'sellos', 'calificaciones')),
    'crecer',   jsonb_build_object('nombre', '🚀 Crecer',   'detalle', 'Vende más todos los días', 'precio', 2990, 'destacado', true,
                                   'modulos', jsonb_build_array('cupones', 'sellos', 'calificaciones', 'chat', 'carrito', 'redes', 'estadisticas')),
    'completo', jsonb_build_object('nombre', '💎 Completo', 'detalle', 'Todos los módulos, también los nuevos', 'precio', 3990, 'modulos', '*'))))
on conflict (clave) do nothing;

-- Nombre y para qué sirve cada módulo (lo usan el Centro de Mando y la pantalla 🧩 Módulos del negocio).
create or replace function public.cfx_modulos_catalogo() returns table (clave text, nombre text, detalle text)
language sql immutable as $$
  values ('chat', '💬 Chat', 'Conversa con tus clientes dentro de la app, con límites contra el spam.'),
         ('calificaciones', '⭐ Calificaciones', 'Tus clientes te califican y tú a ellos: más confianza para comprar.'),
         ('cupones', '🏷️ Cupones', 'Crea códigos de descuento para tus clientes.'),
         ('sellos', '🎟️ Tarjeta de sellos', 'Cada compra suma un sello; al completar la meta, premio.'),
         ('carrito', '🛒 Recordar carrito', 'Si un cliente deja productos en el carrito, al día siguiente le llega un aviso.'),
         ('analisis', '🔎 Para vender más', 'Cada noche: clientes en riesgo, productos quietos, stock que se acaba y grupos de clientes.'),
         ('estadisticas', '📈 Estadísticas', 'Ventas, productos que más dejan y gráficos en vivo.'),
         ('equipo', '🧑‍🍳 Mi equipo', 'Suma vendedores y bodega con su propia cuenta y permisos.'),
         ('campanas', '📣 Campañas automáticas', 'Ofertas por notificación y correo a tus suscriptores.'),
         ('redes', '📲 Vender en redes', 'Pedir por WhatsApp, catálogo para Google e Instagram.'),
         ('webhooks', '🔗 Avisos a tu sistema', 'Cada pedido llega firmado a tu sistema o planilla (webhooks).'),
         ('medicion', '📊 Medir anuncios', 'Meta Pixel y Google Analytics en tu tienda: mide qué anuncio te trae ventas.'),
         ('dominio', '🌐 Dominio propio', 'Tu tienda en tu dirección (mitienda.cl) en vez del link de Órbita.'),
         ('reservas', '📅 Reservas', 'Agenda en línea para tus clientes.'),
         ('recordatorios', '⏰ Recordatorios', 'Avisos automáticos antes de cada cita o vencimiento.')
$$;

create or replace function public.cfx_venta() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select valor from public.cfx_config where clave = 'modulos_venta'), '{}'::jsonb)
$$;
-- Precio al mes de un módulo o pack (0 = incluido gratis).
create or replace function public.cfx_venta_precio(p_item text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((v #>> array['packs', p_item, 'precio'])::int, (v #>> array['precios', p_item])::int, (v ->> 'precio')::int, 0)
  from (select public.cfx_venta() v) x
$$;
-- ¿Está prendida la venta de módulos en esta app? (si no, todo funciona como antes del G19)
create or replace function public.cfx_venta_on() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((public.cfx_venta() ->> 'activo')::boolean, false) $$;
-- ¿Este módulo se vende aparte en esta app? (venta prendida y precio > 0)
create or replace function public.cfx_venta_activa(p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cfx_venta_on() and p_modulo = any(public.cfx_modulos_de_app()) and public.cfx_venta_precio(p_modulo) > 0
$$;
-- Módulos que trae un pack ('*' = todos los de la app) o el módulo mismo.
create or replace function public.cfx_venta_modulos(p_item text) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare p jsonb := public.cfx_venta() #> array['packs', p_item];
begin
  if p is null then return case when p_item = any(public.cfx_modulos_de_app()) then array[p_item] else '{}'::text[] end; end if;
  if p ->> 'modulos' = '*' then return public.cfx_modulos_de_app(); end if;
  return array(select x from jsonb_array_elements_text(coalesce(p -> 'modulos', '[]')) x where x = any(public.cfx_modulos_de_app()));
end $$;

create or replace function public.cfx_negocio_cuenta(p_cuenta uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare n uuid;
begin
  if p_cuenta is null then return null; end if;
  if to_regprocedure('public.cfx_negocio_de_cuenta(uuid)') is not null then execute 'select public.cfx_negocio_de_cuenta($1)' into n using p_cuenta;
  elsif to_regprocedure('public.cfx_analisis_negocio(uuid)') is not null then execute 'select public.cfx_analisis_negocio($1)' into n using p_cuenta;
  else n := p_cuenta; end if;
  return n;
end $$;
create or replace function public.cfx_negocio_premium(p_negocio uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r boolean;
begin
  if p_negocio is null or to_regprocedure('public.cfx_es_premium(uuid)') is null then return false; end if;
  execute 'select public.cfx_es_premium($1)' into r using p_negocio;
  return coalesce(r, false);
end $$;

-- ¿El negocio puede usar el módulo ahora? (prendido en la app + comprado, en prueba, regalado o incluido gratis)
create or replace function public.cfx_modulo_de(p_modulo text, p_negocio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cfx_modulo(p_modulo) and (not public.cfx_venta_activa(p_modulo)
    or exists (select 1 from public.cfx_modulos_negocio m where m.negocio = p_negocio and m.modulo = p_modulo and m.hasta > now()))
$$;
create or replace function public.cfx_modulo_mio(p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$ select public.cfx_modulo_de(p_modulo, public.cfx_negocio_cuenta(auth.uid())) $$;

-- Lo que puede usar cada negocio: {"chat": true, ...}. Para una tienda que ve un cliente.
create or replace function public.cfx_modulos_de(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_object_agg(k, public.cfx_modulo_de(k, p_negocio)) from unnest(public.cfx_modulos_de_app()) k), '{}')
$$;

-- Activa (o alarga) los módulos de un item por N días; N <= 0 los quita. Devuelve hasta cuándo.
create or replace function public.cfx_modulos_dar(p_negocio uuid, p_item text, p_dias int, p_origen text default 'pago') returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare k text; h timestamptz; mx timestamptz;
begin
  if p_negocio is null or cardinality(public.cfx_venta_modulos(p_item)) = 0 then raise exception 'Módulo no válido'; end if;
  foreach k in array public.cfx_venta_modulos(p_item) loop
    if coalesce(p_dias, 0) <= 0 then delete from public.cfx_modulos_negocio where negocio = p_negocio and modulo = k; continue; end if;
    insert into public.cfx_modulos_negocio as m (negocio, modulo, hasta, origen) values (p_negocio, k, now() + make_interval(days => p_dias), p_origen)
    on conflict (negocio, modulo) do update set hasta = greatest(m.hasta, now()) + make_interval(days => p_dias),
      origen = case when excluded.origen = 'prueba' then m.origen else excluded.origen end, avisado = null
    returning hasta into h;
    mx := greatest(mx, h);
  end loop;
  return mx;
end $$;

-- Pantalla 🧩 Módulos del negocio: catálogo, precios (con su descuento Premium), lo que tiene y hasta cuándo.
create or replace function public.cfx_modulos_tienda() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := public.cfx_venta(); n uuid := public.cfx_negocio_cuenta(auth.uid()); pre boolean; d int; am int;
begin
  if n is null then raise exception 'Solo para negocios'; end if;
  pre := public.cfx_negocio_premium(n);
  d := case when pre then greatest(0, least(90, coalesce((v ->> 'descuento_premium')::int, 0))) else 0 end;
  am := greatest(1, least(12, coalesce((v ->> 'anual_meses')::int, 10)));
  return jsonb_build_object('activo', coalesce((v ->> 'activo')::boolean, false), 'premium', pre, 'descuento', d, 'anual_meses', am,
    'descuento_pro', case when pre then 0 else greatest(0, least(90, coalesce((v ->> 'descuento_premium')::int, 0))) end,
    'prueba_dias', coalesce((v ->> 'prueba_dias')::int, 7), 'dueno', n = auth.uid(),
    'prueba_pack', exists (select 1 from public.cfx_modulos_pruebas p where p.negocio = n and p.item like 'pack:%'),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('clave', k, 'nombre', coalesce(c.nombre, k), 'detalle', coalesce(c.detalle, ''),
        'precio', round(public.cfx_venta_precio(k) * (100 - d) / 100.0)::int, 'lista', public.cfx_venta_precio(k),
        'vende', public.cfx_venta_activa(k), 'activo', public.cfx_modulo_de(k, n),
        'hasta', m.hasta, 'origen', m.origen, 'prueba_usada', exists (select 1 from public.cfx_modulos_pruebas p where p.negocio = n and p.item = k),
        'links', v #> array['links', k]) order by o)
      from unnest(public.cfx_modulos_de_app()) with ordinality u(k, o)
      left join public.cfx_modulos_catalogo() c on c.clave = k
      left join public.cfx_modulos_negocio m on m.negocio = n and m.modulo = k
      where public.cfx_modulo(k)), '[]'),
    'packs', coalesce((select jsonb_agg(jsonb_build_object('clave', p.key, 'nombre', p.value ->> 'nombre', 'detalle', coalesce(p.value ->> 'detalle', ''),
        'destacado', coalesce((p.value ->> 'destacado')::boolean, false), 'modulos', to_jsonb(public.cfx_venta_modulos(p.key)),
        'precio', round(coalesce((p.value ->> 'precio')::int, 0) * (100 - d) / 100.0)::int, 'lista', coalesce((p.value ->> 'precio')::int, 0),
        'suelto', (select coalesce(sum(public.cfx_venta_precio(x)), 0) from unnest(public.cfx_venta_modulos(p.key)) x),
        'links', v #> array['links', p.key]) order by coalesce((p.value ->> 'precio')::int, 0))
      from jsonb_each(coalesce(v -> 'packs', '{}')) p where cardinality(public.cfx_venta_modulos(p.key)) > 0), '[]'));
end $$;

-- Probar gratis: cada módulo una vez, y un solo pack por negocio. Solo el dueño.
create or replace function public.cfx_modulo_probar(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := public.cfx_venta(); n uuid := public.cfx_negocio_cuenta(auth.uid()); pack boolean := (public.cfx_venta() #> array['packs', p_item]) is not null;
        dias int := greatest(1, least(30, coalesce((v ->> 'prueba_dias')::int, 7))); h timestamptz;
begin
  if n is null or n <> auth.uid() then raise exception 'Solo el dueño del negocio'; end if;
  if not coalesce((v ->> 'activo')::boolean, false) or cardinality(public.cfx_venta_modulos(p_item)) = 0 then raise exception 'Módulo no válido'; end if;
  if pack and exists (select 1 from public.cfx_modulos_pruebas where negocio = n and item like 'pack:%') then raise exception 'Ya usaste la prueba gratis de un pack'; end if;
  if not pack and exists (select 1 from public.cfx_modulos_pruebas where negocio = n and item = p_item) then raise exception 'Ya usaste la prueba gratis de este módulo'; end if;
  if not pack and public.cfx_modulo_de(p_item, n) then raise exception 'Ya tienes este módulo activo'; end if;
  insert into public.cfx_modulos_pruebas (negocio, item) values (n, case when pack then 'pack:' || p_item else p_item end);
  -- La prueba no alarga lo que ya está pagado: solo prende lo que no tiene.
  insert into public.cfx_modulos_negocio as m (negocio, modulo, hasta, origen)
  select n, k, now() + make_interval(days => dias), 'prueba' from unnest(public.cfx_venta_modulos(p_item)) k
  on conflict (negocio, modulo) do update set hasta = greatest(m.hasta, excluded.hasta), origen = case when m.hasta > now() then m.origen else 'prueba' end, avisado = null;
  select max(hasta) into h from public.cfx_modulos_negocio where negocio = n and modulo = any(public.cfx_venta_modulos(p_item));
  perform public.cfx_anotar('módulo', 'prueba ' || p_item || ' · ' || n);
  return jsonb_build_object('ok', true, 'hasta', h);
end $$;

-- Aviso 3 días antes de que venza (una vez por vencimiento). Lo corre el cron diario.
create or replace function public.cfx_modulos_avisar() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; c int := 0;
begin
  for r in select m.negocio, min(m.hasta) hasta, string_agg(coalesce(k.nombre, m.modulo), ', ' order by m.modulo) nombres
           from public.cfx_modulos_negocio m left join public.cfx_modulos_catalogo() k on k.clave = m.modulo
           where m.avisado is null and m.hasta between now() and now() + interval '3 days' group by m.negocio limit 500 loop
    perform public.cfx_avisar(r.negocio, '🧩 Tus módulos vencen pronto', left(r.nombres, 120) || ' · vence el ' ||
      to_char(r.hasta at time zone 'America/Santiago', 'DD/MM') || '. Renuévalos en Ajustes → 🧩 Módulos y no pierdes nada.');
    update public.cfx_modulos_negocio set avisado = now() where negocio = r.negocio and avisado is null and hasta between now() and now() + interval '3 days';
    c := c + 1;
  end loop;
  return c;
end $$;

-- Al borrar un negocio (lo llama la app): sus módulos y sus pruebas.
create or replace function public.cfx_modulos_borrar(p_negocio uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cfx_modulos_negocio where negocio = p_negocio;
  delete from public.cfx_modulos_pruebas where negocio = p_negocio;
$$;

-- ---------- Centro de Mando ----------
create or replace function public.cfx_venta_admin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('config', public.cfx_venta(), 'app', to_jsonb(public.cfx_modulos_de_app()),
    'catalogo', (select coalesce(jsonb_agg(jsonb_build_object('clave', c.clave, 'nombre', c.nombre)), '[]') from public.cfx_modulos_catalogo() c where c.clave = any(public.cfx_modulos_de_app())),
    'activos', (select count(distinct negocio) from public.cfx_modulos_negocio where hasta > now() and origen = 'pago'),
    'pruebas', (select count(distinct negocio) from public.cfx_modulos_negocio where hasta > now() and origen = 'prueba'),
    'negocios', coalesce((select jsonb_agg(x order by x.hasta) from (
      select m.negocio, coalesce((select u.email from auth.users u where u.id = m.negocio), '') email, min(m.hasta) hasta,
        jsonb_agg(jsonb_build_object('modulo', m.modulo, 'hasta', m.hasta, 'origen', m.origen) order by m.modulo) modulos
      from public.cfx_modulos_negocio m where m.hasta > now() - interval '30 days' group by m.negocio limit 300) x), '[]'));
end $$;

create or replace function public.cfx_venta_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := public.cfx_venta(); l record; u record;
begin
  perform public.cfx_es_admin();
  if jsonb_typeof(p) <> 'object' then raise exception 'Datos no válidos'; end if;
  v := v || jsonb_strip_nulls(p - 'packs' - 'precios' - 'links')
         || jsonb_build_object('precios', coalesce(p -> 'precios', v -> 'precios', '{}'),   -- llegan completos desde el CM
                               'links', coalesce(p -> 'links', v -> 'links', '{}'),
                               'packs', coalesce(p -> 'packs', v -> 'packs', '{}'));
  if coalesce((v ->> 'precio')::numeric, 0) not between 0 and 1000000 or coalesce((v ->> 'descuento_premium')::numeric, 0) not between 0 and 90
     or coalesce((v ->> 'prueba_dias')::numeric, 7) not between 0 and 30 or coalesce((v ->> 'anual_meses')::numeric, 10) not between 1 and 12 then
    raise exception 'Revisa los números: precio de 0 a 1.000.000, descuento de 0 a 90 %%, prueba de 0 a 30 días, anual de 1 a 12 meses';
  end if;
  for l in select key, value from jsonb_each(coalesce(v -> 'precios', '{}')) loop
    if jsonb_typeof(l.value) <> 'number' or l.value::numeric not between 0 and 1000000 then raise exception 'Precio no válido: %', l.key; end if;
  end loop;
  for l in select key, value from jsonb_each(coalesce(v -> 'links', '{}')) loop
    for u in select key, value from jsonb_each_text(case when jsonb_typeof(l.value) = 'object' then l.value else '{}' end) loop
      if coalesce(u.value, '') <> '' and u.value !~ '^https://[^ ]+$' then raise exception 'El link de % debe empezar con https://', l.key; end if;
    end loop;
  end loop;
  update public.cfx_config set valor = v where clave = 'modulos_venta';
  perform public.cfx_anotar('módulos', 'venta ' || case when coalesce((v ->> 'activo')::boolean, false) then 'prendida' else 'apagada' end);
  return public.cfx_venta_admin();
end $$;

-- Regalar o quitar (p_dias = 0) un módulo o pack a un negocio por su correo.
create or replace function public.cfx_modulo_regalar(p_email text, p_item text, p_dias int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; n uuid; h timestamptz;
begin
  perform public.cfx_es_admin();
  select id into u from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if u is null then raise exception 'No hay una cuenta con ese correo en esta app'; end if;
  n := public.cfx_negocio_cuenta(u);
  if n is null then raise exception 'Esa cuenta no es un negocio'; end if;
  if coalesce(p_dias, 0) not between 0 and 3660 then raise exception 'De 0 a 3660 días'; end if;
  h := public.cfx_modulos_dar(n, p_item, p_dias, 'regalo');
  if h is not null then perform public.cfx_avisar(n, '🎁 Te regalamos un módulo', coalesce((select c.nombre from public.cfx_modulos_catalogo() c where c.clave = p_item), public.cfx_venta() #>> array['packs', p_item, 'nombre'], p_item) ||
    ' activo hasta el ' || to_char(h at time zone 'America/Santiago', 'DD/MM/YYYY') || '.'); end if;
  perform public.cfx_anotar('módulo', case when h is null then 'quitó ' else 'regaló ' || p_dias || ' días de ' end || p_item || ' a ' || lower(trim(p_email)));
  return public.cfx_venta_admin();
end $$;

revoke all on function public.cfx_modulos_catalogo(), public.cfx_venta(), public.cfx_venta_on(), public.cfx_venta_precio(text), public.cfx_venta_activa(text), public.cfx_venta_modulos(text),
  public.cfx_negocio_cuenta(uuid), public.cfx_negocio_premium(uuid), public.cfx_modulo_de(text, uuid), public.cfx_modulo_mio(text),
  public.cfx_modulos_dar(uuid, text, int, text), public.cfx_modulos_avisar(), public.cfx_modulos_borrar(uuid) from public, anon, authenticated;
revoke all on function public.cfx_modulos_de(uuid), public.cfx_modulos_tienda(), public.cfx_modulo_probar(text), public.cfx_venta_admin(),
  public.cfx_venta_guardar(jsonb), public.cfx_modulo_regalar(text, text, int) from public, anon;
grant execute on function public.cfx_modulos_de(uuid) to anon, authenticated;
grant execute on function public.cfx_modulos_tienda(), public.cfx_modulo_probar(text), public.cfx_venta_admin(), public.cfx_venta_guardar(jsonb),
  public.cfx_modulo_regalar(text, text, int) to authenticated;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'cfx-modulos';
  perform cron.schedule('cfx-modulos', '17 13 * * *', 'select public.cfx_modulos_avisar()');
exception when others then
  raise notice 'Aviso de módulos por vencer no programado (%).', sqlerrm;
end $$;
-- ---------- Chat entre personas (C14): las mismas reglas en todas las apps (módulo 'chat') ----------
-- Reglas: hasta N mensajes seguidos sin respuesta (el gancho decide N; null = sin límite, p. ej. el admin), 100 al día,
-- bloquear (ninguno de los dos escribe), reportar (le llega al admin) y borrar la conversación (para los dos).
-- Ganchos que pone cada app que usa el chat (y 'chat' en cfx_modulos_app()):
--   cfx_chat_puede(a, b) boolean         ¿a puede escribirle a b?
--   cfx_chat_seguidos(a, b) int          mensajes seguidos sin respuesta (null = sin límite)
--   cfx_chat_quien(u) jsonb              {"nombre": ..., "rol": ...} para la lista y los reportes
--   cfx_chat_aviso(para, de, texto) void push al que recibe (con el link a la conversación)
--   cfx_chat_suspender(u) void           el admin suspende una cuenta reportada
create table if not exists public.cfx_mensajes (
  id      uuid primary key default gen_random_uuid(),
  de      uuid not null references auth.users (id) on delete cascade,
  para    uuid not null references auth.users (id) on delete cascade,
  texto   text not null check (char_length(texto) between 1 and 1000),
  creado  timestamptz not null default now(),
  leido   timestamptz
);
create index if not exists cfx_mensajes_par_idx on public.cfx_mensajes (least(de, para), greatest(de, para), creado desc);
create index if not exists cfx_mensajes_para_idx on public.cfx_mensajes (para) where leido is null;
create index if not exists cfx_mensajes_de_idx on public.cfx_mensajes (de, creado);
create index if not exists cfx_mensajes_creado_idx on public.cfx_mensajes (creado);
create table if not exists public.cfx_bloqueos (
  quien   uuid not null references auth.users (id) on delete cascade,
  a       uuid not null references auth.users (id) on delete cascade,
  creado  timestamptz not null default now(),
  primary key (quien, a)
);
create table if not exists public.cfx_reportes (
  id        uuid primary key default gen_random_uuid(),
  quien     uuid not null references auth.users (id) on delete cascade,
  a         uuid not null references auth.users (id) on delete cascade,
  mensaje   uuid references public.cfx_mensajes (id) on delete set null,
  motivo    text not null,
  extracto  text not null default '',
  resuelto  boolean not null default false,
  creado    timestamptz not null default now()
);
alter table public.cfx_mensajes enable row level security;
alter table public.cfx_bloqueos enable row level security;
alter table public.cfx_reportes enable row level security;
revoke all on public.cfx_mensajes, public.cfx_bloqueos, public.cfx_reportes from anon, authenticated;

create or replace function public.cfx_msg_listo() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if not public.cfx_modulo('chat') then raise exception 'El chat no está disponible en esta app'; end if;
  return auth.uid();
end $$;

create or replace function public.cfx_msg_bloqueado(p_uno uuid, p_otro uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.cfx_bloqueos x where (x.quien = p_uno and x.a = p_otro) or (x.quien = p_otro and x.a = p_uno));
end $$;

-- Cuántos me quedan seguidos con "otro": {"restantes": n, "limite": n} (null = sin límite).
create or replace function public.cfx_msg_restantes(p_otro uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo(); lim int := public.cfx_chat_seguidos(u, p_otro); n int;
begin
  if lim is null then return jsonb_build_object('restantes', null, 'limite', null); end if;
  select count(*) into n from public.cfx_mensajes m where m.de = u and m.para = p_otro
    and m.creado > coalesce((select max(x.creado) from public.cfx_mensajes x where x.de = p_otro and x.para = u), '-infinity');
  return jsonb_build_object('restantes', greatest(0, lim - n), 'limite', lim);
end $$;

-- Enviar: {"ok": true, "id", "restantes"} o {"ok": false, "error"}.
create or replace function public.cfx_msg_enviar(p_para uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo(); t text := trim(coalesce(p_texto, '')); lim int; r jsonb; i uuid;
begin
  if t = '' then return jsonb_build_object('ok', false, 'error', 'Escribe un mensaje'); end if;
  if char_length(t) > 1000 then return jsonb_build_object('ok', false, 'error', 'Máximo 1000 caracteres por mensaje'); end if;
  if p_para is null or not coalesce(public.cfx_chat_puede(u, p_para), false) then
    return jsonb_build_object('ok', false, 'error', 'No puedes escribirle a esta cuenta');
  end if;
  lim := public.cfx_chat_seguidos(u, p_para);
  -- G19: con el chat a la venta, el negocio de la conversación debe tenerlo (con soporte siempre se puede).
  if lim is not null and public.cfx_chat_seguidos(p_para, u) is not null and public.cfx_venta_activa('chat') then
    if public.cfx_negocio_cuenta(u) is not null and not public.cfx_modulo_de('chat', public.cfx_negocio_cuenta(u)) then
      return jsonb_build_object('ok', false, 'error', 'El chat es un módulo. Actívalo en Ajustes → 🧩 Módulos');
    end if;
    if public.cfx_negocio_cuenta(p_para) is not null and not public.cfx_modulo_de('chat', public.cfx_negocio_cuenta(p_para)) then
      return jsonb_build_object('ok', false, 'error', 'Esta tienda no tiene chat. Escríbele por WhatsApp');
    end if;
  end if;
  if lim is not null then
    if public.cfx_msg_bloqueado(u, p_para) then return jsonb_build_object('ok', false, 'error', 'La conversación está bloqueada'); end if;
    if (public.cfx_msg_restantes(p_para) ->> 'restantes')::int <= 0 then
      return jsonb_build_object('ok', false, 'error', case when lim = 1
        then 'Envías 1 mensaje a la vez. Espera la respuesta para escribir de nuevo.'
        else 'Ya enviaste ' || lim || ' mensajes seguidos. Espera la respuesta para escribir de nuevo.' end);
    end if;
    if (select count(*) from public.cfx_mensajes where de = u and creado > now() - interval '1 day') >= 100 then
      return jsonb_build_object('ok', false, 'error', 'Llegaste al máximo de 100 mensajes por día');
    end if;
  end if;
  insert into public.cfx_mensajes (de, para, texto) values (u, p_para, t) returning id into i;
  perform public.cfx_chat_aviso(p_para, u, t);
  r := public.cfx_msg_restantes(p_para);
  return jsonb_build_object('ok', true, 'id', i, 'restantes', r -> 'restantes');
end $$;

-- Mis conversaciones: [{otro, nombre, rol, ultimo, ultimo_at, mio, no_leidos, bloqueado}] (las 100 más recientes).
create or replace function public.cfx_msg_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo();
begin
  return coalesce((with z as (select case when m.de = u then m.para else m.de end as otro, m.texto, m.creado, m.de = u as mio
                               from public.cfx_mensajes m where m.de = u or m.para = u),
                          l as (select distinct on (otro) * from z order by otro, creado desc),
                          t as (select * from l order by creado desc limit 100)
    select jsonb_agg(jsonb_build_object('otro', t.otro, 'nombre', coalesce(q.v ->> 'nombre', 'Cuenta'), 'rol', coalesce(q.v ->> 'rol', ''),
      'ultimo', t.texto, 'ultimo_at', t.creado, 'mio', t.mio,
      'no_leidos', (select count(*) from public.cfx_mensajes x where x.de = t.otro and x.para = u and x.leido is null),
      'bloqueado', exists (select 1 from public.cfx_bloqueos b where b.quien = u and b.a = t.otro)) order by t.creado desc)
    from t cross join lateral (select public.cfx_chat_quien(t.otro) as v) q), '[]');
end $$;

create or replace function public.cfx_msg_sin_leer() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.cfx_modulo('chat') then return 0; end if;
  return (select count(*)::int from public.cfx_mensajes where para = auth.uid() and leido is null);
end $$;

-- Una conversación (las últimas 200; marca como leídos los recibidos): [{id, mio, texto, creado, leido}].
create or replace function public.cfx_msg_hilo(p_otro uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo();
begin
  update public.cfx_mensajes set leido = now() where de = p_otro and para = u and leido is null;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mio', m.de = u, 'texto', m.texto, 'creado', m.creado, 'leido', m.leido) order by m.creado)
    from (select * from public.cfx_mensajes x where (x.de = u and x.para = p_otro) or (x.de = p_otro and x.para = u)
          order by x.creado desc limit 200) m), '[]');
end $$;

create or replace function public.cfx_msg_bloquear(p_otro uuid, p_bloquear boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo();
begin
  if p_otro is null or p_otro = u then raise exception 'Cuenta no válida'; end if;
  if p_bloquear then insert into public.cfx_bloqueos (quien, a) values (u, p_otro) on conflict do nothing;
  else delete from public.cfx_bloqueos where quien = u and a = p_otro; end if;
end $$;

create or replace function public.cfx_msg_reportar(p_mensaje uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo(); m public.cfx_mensajes;
begin
  select * into m from public.cfx_mensajes where id = p_mensaje and para = u;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'Mensaje no encontrado'); end if;
  if (select count(*) from public.cfx_reportes where quien = u and creado > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 10 reportes por día');
  end if;
  insert into public.cfx_reportes (quien, a, mensaje, motivo, extracto)
  values (u, m.de, m.id, left(coalesce(nullif(trim(p_motivo), ''), 'Sin motivo'), 300), left(m.texto, 300));
  perform public.cfx_avisar_admin('🚩 Nuevo reporte en el chat', left(m.texto, 100));
  return jsonb_build_object('ok', true);
end $$;

-- Borra la conversación completa (para los dos).
create or replace function public.cfx_msg_borrar(p_otro uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := public.cfx_msg_listo(); n int;
begin
  delete from public.cfx_mensajes where (de = u and para = p_otro) or (de = p_otro and para = u);
  get diagnostics n = row_count;
  return n;
end $$;

-- Administrador: reportes sin resolver y resolverlos (descartar o suspender a la cuenta reportada).
create or replace function public.cfx_msg_reportes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'motivo', r.motivo, 'extracto', r.extracto, 'creado', r.creado,
      'quien', coalesce(public.cfx_chat_quien(r.quien) ->> 'nombre', ''), 'a', coalesce(public.cfx_chat_quien(r.a) ->> 'nombre', ''),
      'quien_email', (select email from auth.users where id = r.quien), 'a_email', (select email from auth.users where id = r.a)) order by r.creado desc)
    from public.cfx_reportes r where not r.resuelto), '[]');
end $$;

create or replace function public.cfx_msg_resolver(p_id uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.cfx_reportes;
begin
  perform public.cfx_es_admin();
  update public.cfx_reportes set resuelto = true where id = p_id and not resuelto returning * into r;
  if r.id is null then raise exception 'El reporte ya fue atendido'; end if;
  if p_suspender then perform public.cfx_chat_suspender(r.a); end if;
  perform public.cfx_anotar('reporte chat', case when p_suspender then 'suspendida ' else 'descartado ' end || coalesce((select email from auth.users where id = r.a), ''));
end $$;

revoke all on function public.cfx_msg_listo(), public.cfx_msg_bloqueado(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cfx_msg_restantes(uuid), public.cfx_msg_enviar(uuid, text), public.cfx_msg_lista(), public.cfx_msg_sin_leer(),
  public.cfx_msg_hilo(uuid), public.cfx_msg_bloquear(uuid, boolean), public.cfx_msg_reportar(uuid, text), public.cfx_msg_borrar(uuid),
  public.cfx_msg_reportes(), public.cfx_msg_resolver(uuid, boolean) from public, anon;
grant execute on function public.cfx_msg_restantes(uuid), public.cfx_msg_enviar(uuid, text), public.cfx_msg_lista(), public.cfx_msg_sin_leer(),
  public.cfx_msg_hilo(uuid), public.cfx_msg_bloquear(uuid, boolean), public.cfx_msg_reportar(uuid, text), public.cfx_msg_borrar(uuid),
  public.cfx_msg_reportes(), public.cfx_msg_resolver(uuid, boolean) to authenticated;
-- ---------- Calificaciones en dos direcciones (C15): el cliente califica al negocio y el negocio al cliente (módulo 'calificaciones') ----------
-- Una calificación por "ref" (pedido, reserva, arriendo…) y por lado. Estrellas 1-5 y comentario opcional (300).
-- Gancho que pone cada app que las usa (y 'calificaciones' en cfx_modulos_app()):
--   cfx_calif_ref(ref, u) jsonb   quién califica esa ref: {"ref": text, "negocio": uuid, "cliente": uuid|null, "cliente_ref": text|null, "de_negocio": bool}
--                                 ("ref" = la referencia de verdad, p. ej. el id del pedido cuando llega su token)
--                                 o {"error": "..."} (no existe, aún no se puede, no es tuyo). u puede ser null (invitado con token).
-- Para mostrar: cfx_calif_negocio(n) y cfx_calif_cliente(c, ref) → {"promedio", "total"}; cfx_calif_hecha(ref, de_negocio).
-- Si el módulo está apagado no se califica, los promedios vuelven null y cfx_calif_hecha dice true (no aparece "Califica").
create table if not exists public.cfx_calificaciones (
  ref          text not null,
  de_negocio   boolean not null,
  negocio_id   uuid not null,
  cliente_id   uuid references auth.users (id) on delete set null,
  cliente_ref  text,
  estrellas    int not null check (estrellas between 1 and 5),
  comentario   text not null default '' check (char_length(comentario) <= 300),
  creado       timestamptz not null default now(),
  primary key (ref, de_negocio)
);
create index if not exists cfx_calif_negocio_idx on public.cfx_calificaciones (negocio_id) where not de_negocio;
create index if not exists cfx_calif_cliente_idx on public.cfx_calificaciones (cliente_id) where de_negocio;
create index if not exists cfx_calif_cref_idx on public.cfx_calificaciones (cliente_ref) where de_negocio and cliente_ref is not null;
alter table public.cfx_calificaciones enable row level security;
revoke all on public.cfx_calificaciones from anon, authenticated;

-- Calificar: {"ok": true} o {"ok": false, "error"}.
create or replace function public.cfx_calificar(p_ref text, p_estrellas int, p_comentario text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.cfx_modulo('calificaciones') then return jsonb_build_object('ok', false, 'error', 'Las calificaciones no están disponibles'); end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then return jsonb_build_object('ok', false, 'error', 'Elige de 1 a 5 estrellas'); end if;
  if coalesce(trim(p_ref), '') = '' then return jsonb_build_object('ok', false, 'error', 'No encontrado'); end if;
  r := public.cfx_calif_ref(p_ref, auth.uid());
  if r is null or r ? 'error' or r ->> 'negocio' is null then return jsonb_build_object('ok', false, 'error', coalesce(r ->> 'error', 'No encontrado')); end if;
  if not public.cfx_modulo_de('calificaciones', (r ->> 'negocio')::uuid) then return jsonb_build_object('ok', false, 'error', 'Las calificaciones no están disponibles'); end if;
  insert into public.cfx_calificaciones (ref, de_negocio, negocio_id, cliente_id, cliente_ref, estrellas, comentario)
  values (coalesce(r ->> 'ref', p_ref), coalesce((r ->> 'de_negocio')::boolean, false), (r ->> 'negocio')::uuid, (r ->> 'cliente')::uuid,
          nullif(left(r ->> 'cliente_ref', 60), ''), p_estrellas, left(trim(coalesce(p_comentario, '')), 300))
  on conflict (ref, de_negocio) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ya fue calificado'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ¿Ya calificó ese lado? (con el módulo apagado: true, para no pedirlo)
create or replace function public.cfx_calif_hecha(p_ref text, p_de_negocio boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cfx_modulo('calificaciones') then return true; end if;
  if public.cfx_venta_activa('calificaciones') and not coalesce(public.cfx_modulo_de('calificaciones', (public.cfx_calif_ref(p_ref, auth.uid()) ->> 'negocio')::uuid), false) then return true; end if;
  return exists (select 1 from public.cfx_calificaciones where ref = p_ref and de_negocio = p_de_negocio);
end $$;

-- Lo que los clientes dicen del negocio.
create or replace function public.cfx_calif_negocio(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cfx_modulo_de('calificaciones', p_negocio) then return null; end if;
  return (select jsonb_build_object('promedio', round(avg(estrellas), 1), 'total', count(*))
          from public.cfx_calificaciones where negocio_id = p_negocio and not de_negocio);
end $$;

-- Lo que los negocios dicen del cliente (por su cuenta o, si es invitado, por su referencia: teléfono…).
create or replace function public.cfx_calif_cliente(p_cliente uuid, p_cliente_ref text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cfx_modulo_mio('calificaciones') or (p_cliente is null and coalesce(p_cliente_ref, '') = '') then return null; end if;
  return (select jsonb_build_object('promedio', round(avg(estrellas), 1), 'total', count(*))
          from public.cfx_calificaciones where de_negocio
            and ((p_cliente is not null and cliente_id = p_cliente) or (p_cliente is null and cliente_ref = p_cliente_ref)));
end $$;

-- Al borrar un negocio o una ref (lo llama la app).
create or replace function public.cfx_calif_borrar(p_negocio uuid, p_ref text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cfx_calificaciones where negocio_id = p_negocio and (p_ref is null or ref = p_ref);
end $$;

revoke all on function public.cfx_calif_hecha(text, boolean), public.cfx_calif_negocio(uuid), public.cfx_calif_cliente(uuid, text),
  public.cfx_calif_borrar(uuid, text) from public, anon, authenticated;
revoke all on function public.cfx_calificar(text, int, text) from public;
grant execute on function public.cfx_calificar(text, int, text) to anon, authenticated;
-- ---------- Cupones del negocio y tarjeta de sellos (C16): módulos 'cupones' y 'sellos' ----------
-- OJO: no son los cupones del Premium (cfx_cupones / cfx_cupon_ver, los crea el admin). Estos los crea cada negocio para SUS clientes.
-- Ganchos que pone cada app que los usa (y 'cupones' / 'sellos' en cfx_modulos_app()):
--   cfx_fid_dueno(u) uuid                  negocio que administra la cuenta u (null = no es negocio)
--   cfx_fid_activo(negocio, modulo) bool   ¿el plan del negocio incluye ese módulo? (p. ej. solo Pro)
--   cfx_fid_cliente(u, negocio) bool       ¿u es cliente de ese negocio? (ve sus sellos y prueba cupones)
--   cfx_sellos_aviso(negocio, cliente, premio) void   push al cliente que completó la tarjeta
-- La app usa, dentro de sus funciones: cfx_desc_pct + cfx_desc_usar (al crear el pedido), cfx_sello_sumar (al entregar)
-- y cfx_sellos_cfg_de (para mostrar la tarjeta). cfx_fid_borrar al borrar un negocio.
create table if not exists public.cfx_descuentos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  codigo      text not null check (codigo ~ '^[A-Z0-9]{3,20}$'),
  porcentaje  int not null check (porcentaje between 1 and 90),
  hasta       date,
  activo      boolean not null default true,
  usos        int not null default 0,
  creado      timestamptz not null default now(),
  unique (owner_id, codigo)
);
create table if not exists public.cfx_sellos_cfg (
  owner_id  uuid primary key,
  meta      int not null check (meta between 2 and 30),
  premio    text check (char_length(premio) <= 80),
  creado    timestamptz not null default now()
);
create table if not exists public.cfx_sellos (
  negocio_id  uuid not null,
  cliente_id  uuid not null references auth.users (id) on delete cascade,
  cantidad    int not null default 0,
  premios     int not null default 0,
  actualizado timestamptz not null default now(),
  primary key (negocio_id, cliente_id)
);
create index if not exists cfx_sellos_cliente_idx on public.cfx_sellos (cliente_id);
alter table public.cfx_descuentos enable row level security;
alter table public.cfx_sellos_cfg enable row level security;
alter table public.cfx_sellos enable row level security;
revoke all on public.cfx_descuentos, public.cfx_sellos_cfg, public.cfx_sellos from anon, authenticated;

create or replace function public.cfx_desc_codigo(p_codigo text) returns text
language sql immutable set search_path = '' as $$ select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- El negocio de la cuenta, si el módulo está prendido y su plan lo incluye.
create or replace function public.cfx_fid_mio(p_modulo text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare n uuid;
begin
  if not public.cfx_modulo(p_modulo) then
    raise exception '% no está disponible en esta app', case p_modulo when 'cupones' then 'Los cupones' else 'La tarjeta de sellos' end;
  end if;
  n := public.cfx_fid_dueno(auth.uid());
  if n is null then raise exception 'Solo el negocio'; end if;
  if public.cfx_venta_on() then
    if not public.cfx_modulo_de(p_modulo, n) then
      raise exception '% Actívalo en Ajustes → 🧩 Módulos', case p_modulo when 'cupones' then 'Los cupones son un módulo.' else 'La tarjeta de sellos es un módulo.' end;
    end if;
  elsif not coalesce(public.cfx_fid_activo(n, p_modulo), false) then
    raise exception '% de la versión Pro', case p_modulo when 'cupones' then 'Los cupones son' else 'La tarjeta de sellos es' end;
  end if;
  return n;
end $$;

-- ¿El negocio puede usar el módulo ahora? (prendido + su plan)
create or replace function public.cfx_fid_ok(p_negocio uuid, p_modulo text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_negocio is null or not public.cfx_modulo(p_modulo) then return false; end if;
  if public.cfx_venta_on() then return public.cfx_modulo_de(p_modulo, p_negocio); end if;
  return coalesce(public.cfx_fid_activo(p_negocio, p_modulo), false);
end $$;

-- ---------- Cupones ----------
create or replace function public.cfx_desc_guardar(p_codigo text, p_porcentaje int, p_hasta date) returns void
language plpgsql security definer set search_path = '' as $$
declare n uuid := public.cfx_fid_mio('cupones'); c text := public.cfx_desc_codigo(p_codigo);
begin
  if length(c) < 3 or length(c) > 20 then raise exception 'El código debe tener entre 3 y 20 letras o números'; end if;
  if p_porcentaje is null or p_porcentaje < 1 or p_porcentaje > 90 then raise exception 'El descuento debe ser entre 1 y 90 por ciento'; end if;
  if (select count(*) from public.cfx_descuentos where owner_id = n) >= 50
     and not exists (select 1 from public.cfx_descuentos where owner_id = n and codigo = c) then raise exception 'Máximo 50 cupones'; end if;
  insert into public.cfx_descuentos (owner_id, codigo, porcentaje, hasta) values (n, c, p_porcentaje, p_hasta)
  on conflict (owner_id, codigo) do update set porcentaje = excluded.porcentaje, hasta = excluded.hasta, activo = true;
end $$;

create or replace function public.cfx_desc_borrar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cfx_descuentos where id = p_id and owner_id = public.cfx_fid_dueno(auth.uid());
end $$;

-- Mis cupones: [{id, codigo, porcentaje, hasta, activo, usos}]
create or replace function public.cfx_desc_lista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid := public.cfx_fid_mio('cupones');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'porcentaje', c.porcentaje, 'hasta', c.hasta,
    'activo', c.activo, 'usos', c.usos) order by c.creado desc) from public.cfx_descuentos c where c.owner_id = n), '[]');
end $$;

-- Porcentaje de un cupón vigente (null = no sirve). Interna: la app la usa al armar el pedido.
create or replace function public.cfx_desc_pct(p_negocio uuid, p_codigo text) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cfx_fid_ok(p_negocio, 'cupones') then return null; end if;
  return (select c.porcentaje from public.cfx_descuentos c
          where c.owner_id = p_negocio and c.codigo = public.cfx_desc_codigo(p_codigo) and c.activo and (c.hasta is null or c.hasta >= current_date));
end $$;

-- Suma un uso (la app la llama cuando el pedido ya quedó guardado).
create or replace function public.cfx_desc_usar(p_negocio uuid, p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.cfx_descuentos set usos = usos + 1 where owner_id = p_negocio and codigo = public.cfx_desc_codigo(p_codigo);
end $$;

-- El cliente prueba un cupón: devuelve el porcentaje o avisa que no sirve.
create or replace function public.cfx_desc_validar(p_negocio uuid, p_codigo text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare pct int;
begin
  if not public.cfx_modulo('cupones') then raise exception 'Cupón no válido o vencido'; end if;
  if not coalesce(public.cfx_fid_cliente(auth.uid(), p_negocio), false) then raise exception 'Sin permiso'; end if;
  pct := public.cfx_desc_pct(p_negocio, p_codigo);
  if pct is null then raise exception 'Cupón no válido o vencido'; end if;
  return pct;
end $$;

-- ---------- Tarjeta de sellos ----------
-- El negocio la arma (meta 2-30 y premio) o la apaga (meta null).
create or replace function public.cfx_sellos_guardar(p_meta int, p_premio text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n uuid;
begin
  if p_meta is null then
    n := public.cfx_fid_dueno(auth.uid());
    if n is null then raise exception 'Solo el negocio'; end if;
    delete from public.cfx_sellos_cfg where owner_id = n;
    return null;
  end if;
  n := public.cfx_fid_mio('sellos');
  if p_meta < 2 or p_meta > 30 then raise exception 'La tarjeta debe tener entre 2 y 30 sellos'; end if;
  insert into public.cfx_sellos_cfg (owner_id, meta, premio) values (n, p_meta, nullif(left(trim(coalesce(p_premio, '')), 80), ''))
  on conflict (owner_id) do update set meta = excluded.meta, premio = excluded.premio;
  return public.cfx_sellos_cfg_de(n);
end $$;

-- La tarjeta del negocio {meta, premio} (null = no tiene, módulo apagado o su plan no la incluye).
create or replace function public.cfx_sellos_cfg_de(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cfx_fid_ok(p_negocio, 'sellos') then return null; end if;
  return (select jsonb_build_object('meta', c.meta, 'premio', c.premio) from public.cfx_sellos_cfg c where c.owner_id = p_negocio);
end $$;

-- Mis sellos en un negocio: {cantidad, premios, meta, premio} o null.
create or replace function public.cfx_sellos_mios(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := public.cfx_sellos_cfg_de(p_negocio);
begin
  if c is null then return null; end if;
  if not coalesce(public.cfx_fid_cliente(auth.uid(), p_negocio), false) then return null; end if;
  return c || coalesce((select jsonb_build_object('cantidad', s.cantidad, 'premios', s.premios) from public.cfx_sellos s
                        where s.negocio_id = p_negocio and s.cliente_id = auth.uid()), jsonb_build_object('cantidad', 0, 'premios', 0));
end $$;

-- Suma un sello (al entregar una compra). Al llegar a la meta: vuelve a 0, suma un premio y avisa. Devuelve {cantidad, premio} o null.
create or replace function public.cfx_sello_sumar(p_negocio uuid, p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c jsonb := public.cfx_sellos_cfg_de(p_negocio); s public.cfx_sellos;
begin
  if c is null or p_cliente is null then return null; end if;
  insert into public.cfx_sellos (negocio_id, cliente_id, cantidad) values (p_negocio, p_cliente, 1)
  on conflict (negocio_id, cliente_id) do update set cantidad = public.cfx_sellos.cantidad + 1, actualizado = now() returning * into s;
  if s.cantidad >= (c ->> 'meta')::int then
    update public.cfx_sellos set cantidad = 0, premios = premios + 1 where negocio_id = p_negocio and cliente_id = p_cliente;
    perform public.cfx_sellos_aviso(p_negocio, p_cliente, c ->> 'premio');
    return jsonb_build_object('cantidad', 0, 'premio', true);
  end if;
  return jsonb_build_object('cantidad', s.cantidad, 'premio', false);
end $$;

-- Al borrar un negocio (lo llama la app): sus cupones, su tarjeta y los sellos de sus clientes.
create or replace function public.cfx_fid_borrar(p_negocio uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cfx_descuentos where owner_id = p_negocio;
  delete from public.cfx_sellos_cfg where owner_id = p_negocio;
  delete from public.cfx_sellos where negocio_id = p_negocio;
end $$;

revoke all on function public.cfx_desc_codigo(text), public.cfx_fid_mio(text), public.cfx_fid_ok(uuid, text), public.cfx_desc_pct(uuid, text),
  public.cfx_desc_usar(uuid, text), public.cfx_sellos_cfg_de(uuid), public.cfx_sello_sumar(uuid, uuid), public.cfx_fid_borrar(uuid)
  from public, anon, authenticated;
revoke all on function public.cfx_desc_guardar(text, int, date), public.cfx_desc_borrar(uuid), public.cfx_desc_lista(), public.cfx_desc_validar(uuid, text),
  public.cfx_sellos_guardar(int, text), public.cfx_sellos_mios(uuid) from public, anon;
grant execute on function public.cfx_desc_guardar(text, int, date), public.cfx_desc_borrar(uuid), public.cfx_desc_lista(), public.cfx_desc_validar(uuid, text),
  public.cfx_sellos_guardar(int, text), public.cfx_sellos_mios(uuid) to authenticated;
-- ---------- 🛒 Carrito y 🚚 despacho (C17) ----------
-- Carrito guardado en la nube (para recordarle al cliente lo que dejó) y el cálculo del despacho por comuna y al resto de Chile (2.58).
-- Ganchos que pone cada app que lo usa (y 'carrito' en cfx_modulos_app() para el recordatorio):
--   cfx_carrito_puede(u, negocio) bool           ¿u puede guardar carrito en ese negocio? (es su cliente, puede comprar)
--   cfx_carrito_aviso(cliente, negocio, n) bool  manda el recordatorio (push); false = no corresponde (plan, vacaciones…)
-- La app usa: cfx_carrito_vaciar (al crear el pedido), cfx_carritos_recordar (pg_cron, cada hora), cfx_carrito_borrar (al borrar una cuenta).
-- Despacho (sin tabla: cada app guarda su { retiro, gratis_desde, zonas: [{comuna, precio}] } donde quiera):
--   cfx_despacho_limpio(p) → la misma config revisada (o error claro) · cfx_despacho_costo(cfg, entrega, direccion, monto) → {costo, comuna} o {error}
create table if not exists public.cfx_carritos (
  cliente     uuid not null references auth.users (id) on delete cascade,
  negocio     uuid not null,
  items       jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now(),
  avisado     timestamptz,
  primary key (cliente, negocio)
);
create index if not exists cfx_carritos_negocio_idx on public.cfx_carritos (negocio);
create index if not exists cfx_carritos_aviso_idx on public.cfx_carritos (actualizado) where avisado is null;
alter table public.cfx_carritos enable row level security;
revoke all on public.cfx_carritos from anon, authenticated;

-- El cliente guarda su carrito (hasta 50 productos). Vacío = se borra.
create or replace function public.cfx_carrito_guardar(p_negocio uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare l jsonb := '[]'::jsonb; it jsonb; ok boolean := false;
begin
  if auth.uid() is null or p_negocio is null or to_regprocedure('public.cfx_carrito_puede(uuid,uuid)') is null then return; end if;
  execute 'select public.cfx_carrito_puede($1, $2)' into ok using auth.uid(), p_negocio;
  if not coalesce(ok, false) or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then return; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 50 loop
    continue when jsonb_typeof(it) <> 'object' or coalesce(it ->> 'clave', '') = '';
    l := l || jsonb_build_object('clave', left(it ->> 'clave', 60), 'cant', least(greatest(coalesce((it ->> 'cant')::int, 1), 1), 99), 'nombre', left(it ->> 'nombre', 80));
  end loop;
  if jsonb_array_length(l) = 0 then
    delete from public.cfx_carritos where cliente = auth.uid() and negocio = p_negocio;
  else
    insert into public.cfx_carritos (cliente, negocio, items) values (auth.uid(), p_negocio, l)
    on conflict (cliente, negocio) do update set items = excluded.items, actualizado = now(), avisado = null
      where public.cfx_carritos.items is distinct from excluded.items;
  end if;
end $$;

create or replace function public.cfx_carrito_vaciar(p_cliente uuid, p_negocio uuid) returns void
language sql security definer set search_path = '' as $$ delete from public.cfx_carritos where cliente = p_cliente and negocio = p_negocio $$;
create or replace function public.cfx_carrito_borrar(p_cuenta uuid) returns void
language sql security definer set search_path = '' as $$ delete from public.cfx_carritos where cliente = p_cuenta or negocio = p_cuenta $$;

-- Cada hora: carritos sin pedir de hace más de 20 horas (y menos de 4 días) reciben UN aviso, de 10 a 20 h de Chile.
create or replace function public.cfx_carritos_recordar() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; ok boolean; h int := extract(hour from now() at time zone 'America/Santiago');
begin
  if h < 10 or h > 20 or not public.cfx_modulo('carrito') or to_regprocedure('public.cfx_carrito_aviso(uuid,uuid,integer)') is null then return 0; end if;
  for r in select * from public.cfx_carritos where avisado is null and actualizado < now() - interval '20 hours' and actualizado > now() - interval '4 days' limit 500 loop
    if not public.cfx_modulo_de('carrito', r.negocio) then  -- G19: la tienda no tiene el módulo (no se vuelve a revisar)
      update public.cfx_carritos set avisado = now() where cliente = r.cliente and negocio = r.negocio; continue;
    end if;
    execute 'select public.cfx_carrito_aviso($1, $2, $3)' into ok using r.cliente, r.negocio, jsonb_array_length(r.items);
    update public.cfx_carritos set avisado = now() where cliente = r.cliente and negocio = r.negocio;
    if coalesce(ok, false) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------- Despacho por comuna ----------
create or replace function public.cfx_comuna_norm(t text) returns text
language sql immutable set search_path = '' as $$ select lower(trim(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) $$;

create or replace function public.cfx_despacho_limpio(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare z jsonb; l jsonb := '[]'::jsonb; vistas text[] := '{}'; rm text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Datos no válidos'; end if;
  for z in select * from jsonb_array_elements(case when jsonb_typeof(p -> 'zonas') = 'array' then p -> 'zonas' else '[]'::jsonb end) loop
    if coalesce(trim(z ->> 'comuna'), '') = '' then continue; end if;
    if length(z ->> 'comuna') > 40 then raise exception 'Nombre de comuna muy largo'; end if;
    if coalesce((z ->> 'precio')::numeric, -1) not between 0 and 200000 then raise exception 'El despacho a % debe costar entre $0 y $200.000', z ->> 'comuna'; end if;
    if public.cfx_comuna_norm(z ->> 'comuna') = any (vistas) then raise exception 'La comuna % está repetida', z ->> 'comuna'; end if;
    vistas := vistas || public.cfx_comuna_norm(z ->> 'comuna');
    l := l || jsonb_build_object('comuna', trim(z ->> 'comuna'), 'precio', round((z ->> 'precio')::numeric));
  end loop;
  if jsonb_array_length(l) > 80 then raise exception 'Máximo 80 comunas'; end if;
  -- Resto de Chile (regiones y comunas que no están en la lista): 'no' | 'fijo' (un precio) | 'por_pagar' (lo paga quien recibe al courier).
  rm := coalesce(nullif(p #>> '{resto,modo}', ''), 'no');
  if rm not in ('no', 'fijo', 'por_pagar') then raise exception 'Elige cómo despachas al resto de Chile'; end if;
  if rm = 'fijo' and coalesce((p #>> '{resto,precio}')::numeric, -1) not between 0 and 200000 then raise exception 'El despacho al resto de Chile debe costar entre $0 y $200.000'; end if;
  if not coalesce((p ->> 'retiro')::boolean, true) and jsonb_array_length(l) = 0 and rm = 'no' then raise exception 'Activa el retiro en tienda o agrega al menos una comuna de despacho'; end if;
  if coalesce((p ->> 'gratis_desde')::numeric, 0) not between 0 and 10000000 then raise exception 'Monto de despacho gratis no válido'; end if;
  return jsonb_build_object('retiro', coalesce((p ->> 'retiro')::boolean, true), 'gratis_desde', round(coalesce((p ->> 'gratis_desde')::numeric, 0)), 'zonas', l,
    'resto', jsonb_build_object('modo', rm, 'precio', case when rm = 'fijo' then round((p #>> '{resto,precio}')::numeric) else 0 end));
end $$;

-- La comuna va al final de la dirección ("…, Ñuñoa"). Sin zonas ni resto de Chile: se coordina con el negocio ($0 aquí).
-- Comuna fuera de la lista: con resto 'fijo' cobra ese precio; con 'por_pagar' $0 y por_pagar = true (lo paga quien recibe).
create or replace function public.cfx_despacho_costo(p_cfg jsonb, p_entrega text, p_direccion text, p_monto numeric) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare c jsonb := coalesce(p_cfg, '{}'::jsonb); com text; z jsonb; rm text := coalesce(nullif(p_cfg #>> '{resto,modo}', ''), 'no'); orig text;
  gratis boolean := coalesce((p_cfg ->> 'gratis_desde')::numeric, 0) > 0 and p_monto >= (p_cfg ->> 'gratis_desde')::numeric;
begin
  if p_entrega is distinct from 'despacho' or (jsonb_array_length(coalesce(c -> 'zonas', '[]'::jsonb)) = 0 and rm = 'no') then return jsonb_build_object('costo', 0, 'comuna', null); end if;
  orig := left(trim(regexp_replace(coalesce(p_direccion, ''), '^.*,', '')), 60);
  com := public.cfx_comuna_norm(orig);
  select e into z from jsonb_array_elements(coalesce(c -> 'zonas', '[]'::jsonb)) e where public.cfx_comuna_norm(e ->> 'comuna') = com limit 1;
  if z is null then
    if com = '' or position(',' in coalesce(p_direccion, '')) = 0 then return jsonb_build_object('error', 'Escribe la dirección y la comuna de despacho'); end if;
    if rm = 'fijo' then return jsonb_build_object('comuna', orig, 'costo', case when gratis then 0 else greatest(0, coalesce((c #>> '{resto,precio}')::numeric, 0)) end); end if;
    if rm = 'por_pagar' then return jsonb_build_object('comuna', orig, 'costo', 0, 'por_pagar', true); end if;
    return jsonb_build_object('error', 'Esta tienda no despacha a esa comuna. Elige otra comuna o retiro en tienda.');
  end if;
  return jsonb_build_object('comuna', z ->> 'comuna', 'costo', case when gratis then 0 else greatest(0, coalesce((z ->> 'precio')::numeric, 0)) end);
end $$;

revoke all on function public.cfx_carrito_vaciar(uuid, uuid), public.cfx_carrito_borrar(uuid), public.cfx_carritos_recordar(), public.cfx_comuna_norm(text),
  public.cfx_despacho_limpio(jsonb), public.cfx_despacho_costo(jsonb, text, text, numeric) from public, anon, authenticated;
revoke all on function public.cfx_carrito_guardar(uuid, jsonb) from public, anon;
grant execute on function public.cfx_carrito_guardar(uuid, jsonb) to authenticated;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'cfx-carritos';
  perform cron.schedule('cfx-carritos', '23 * * * *', 'select public.cfx_carritos_recordar()');
exception when others then
  raise notice 'Recordatorio de carritos no programado (%).', sqlerrm;
end $$;
-- ---------- 🧹 Limpieza (C18): una sola lista para el Centro de Mando → Mis aplicaciones → ↻ → 🧹 Respaldo y limpieza ----------
-- Lo del núcleo (claves "n_…") se borra solo cada noche si la limpieza automática está prendida (por defecto sí).
-- Lo propio de cada app viene del gancho cfx_limpieza_app() → [{clave, titulo, detalle, filas}] y cfx_limpiar_app(clave) → int
-- (la app ya lo borra sola con su propio horario; aquí se puede borrar a mano).
create index if not exists cfx_registro_creado_idx on public.cfx_registro (creado);
create index if not exists cfx_errores_ultimo_idx on public.cfx_errores (ultimo);
insert into public.cfx_config (clave, valor) values ('limpieza_auto', 'true') on conflict (clave) do nothing;

create or replace function public.cfx_limpieza_nucleo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_array(
    jsonb_build_object('clave', 'n_registro', 'titulo', 'Registro de cambios', 'detalle', 'Más de 180 días.', 'auto', true,
      'filas', (select count(*) from public.cfx_registro where creado < now() - interval '180 days')),
    jsonb_build_object('clave', 'n_errores', 'titulo', 'Errores de la app', 'detalle', 'Sin repetirse hace más de 30 días.', 'auto', true,
      'filas', (select count(*) from public.cfx_errores where ultimo < now() - interval '30 days')),
    jsonb_build_object('clave', 'n_reportes', 'titulo', 'Reportes del chat ya revisados', 'detalle', 'Más de 90 días.', 'auto', true,
      'filas', (select count(*) from public.cfx_reportes where resuelto and creado < now() - interval '90 days')),
    jsonb_build_object('clave', 'n_carritos', 'titulo', 'Carritos abandonados', 'detalle', 'Sin tocar hace más de 30 días.', 'auto', true,
      'filas', (select count(*) from public.cfx_carritos where actualizado < now() - interval '30 days')));
end $$;

create or replace function public.cfx_limpiar_nucleo(p_clave text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0;
begin
  if p_clave = 'n_registro' then delete from public.cfx_registro where creado < now() - interval '180 days';
  elsif p_clave = 'n_errores' then delete from public.cfx_errores where ultimo < now() - interval '30 days';
  elsif p_clave = 'n_reportes' then delete from public.cfx_reportes where resuelto and creado < now() - interval '90 days';
  elsif p_clave = 'n_carritos' then delete from public.cfx_carritos where actualizado < now() - interval '30 days';
  else return 0; end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.cfx_limpieza() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb := '[]';
begin
  perform public.cfx_es_admin();
  if to_regprocedure('public.cfx_limpieza_app()') is not null then
    execute 'select public.cfx_limpieza_app()' into a;
  end if;
  return public.cfx_limpieza_nucleo() || coalesce(a, '[]');
end $$;

create or replace function public.cfx_limpiar(p_clave text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0;
begin
  perform public.cfx_es_admin();
  if p_clave like 'n\_%' then
    if not exists (select 1 from jsonb_array_elements(public.cfx_limpieza_nucleo()) x where x ->> 'clave' = p_clave) then raise exception 'Opción no válida'; end if;
    n := public.cfx_limpiar_nucleo(p_clave);
  elsif to_regprocedure('public.cfx_limpiar_app(text)') is not null then
    execute 'select public.cfx_limpiar_app($1)' into n using p_clave;
  else raise exception 'Opción no válida'; end if;
  perform public.cfx_anotar('limpieza', p_clave || ': ' || coalesce(n, 0) || ' borrados');
  return coalesce(n, 0);
end $$;

-- Cada noche (pg_cron 'cfx-limpieza'): borra lo del núcleo marcado "auto" y anota cuánto.
create or replace function public.cfx_limpieza_auto() returns int
language plpgsql security definer set search_path = '' as $$
declare x jsonb; n int := 0;
begin
  if not coalesce(((select valor from public.cfx_config where clave = 'limpieza_auto') #>> '{}')::boolean, true) then return 0; end if;
  for x in select * from jsonb_array_elements(public.cfx_limpieza_nucleo()) loop
    if (x ->> 'auto')::boolean and (x ->> 'filas')::int > 0 then n := n + public.cfx_limpiar_nucleo(x ->> 'clave'); end if;
  end loop;
  insert into public.cfx_salud (clave, valor, cuando) values ('limpieza', jsonb_build_object('filas', n), now())
  on conflict (clave) do update set valor = excluded.valor, cuando = excluded.cuando;
  if n > 0 then perform public.cfx_anotar('limpieza automática', n || ' filas viejas borradas'); end if;
  return n;
end $$;

-- Interruptor del Centro de Mando: { activo, ultima, filas }.
create or replace function public.cfx_limpieza_auto_ver() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object('activo', coalesce(((select valor from public.cfx_config where clave = 'limpieza_auto') #>> '{}')::boolean, true),
    'ultima', (select cuando from public.cfx_salud where clave = 'limpieza'), 'filas', (select (valor ->> 'filas')::int from public.cfx_salud where clave = 'limpieza'));
end $$;
create or replace function public.cfx_limpieza_auto_guardar(p_activo boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  insert into public.cfx_config (clave, valor) values ('limpieza_auto', to_jsonb(coalesce(p_activo, true)))
  on conflict (clave) do update set valor = excluded.valor;
  perform public.cfx_anotar('limpieza automática', case when coalesce(p_activo, true) then 'prendida' else 'apagada' end);
  return public.cfx_limpieza_auto_ver();
end $$;

revoke all on function public.cfx_limpieza_nucleo(), public.cfx_limpiar_nucleo(text), public.cfx_limpieza_auto() from public, anon, authenticated;
revoke all on function public.cfx_limpieza(), public.cfx_limpiar(text), public.cfx_limpieza_auto_ver(), public.cfx_limpieza_auto_guardar(boolean) from public, anon;
grant execute on function public.cfx_limpieza(), public.cfx_limpiar(text), public.cfx_limpieza_auto_ver(), public.cfx_limpieza_auto_guardar(boolean) to authenticated;
do $$
begin
  if to_regprocedure('public.cfx_limpieza_app()') is not null then revoke all on function public.cfx_limpieza_app() from public, anon, authenticated; end if;
  if to_regprocedure('public.cfx_limpiar_app(text)') is not null then revoke all on function public.cfx_limpiar_app(text) from public, anon, authenticated; end if;
end $$;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'cfx-limpieza';
  perform cron.schedule('cfx-limpieza', '40 7 * * *', 'select public.cfx_limpieza_auto()');
exception when others then
  raise notice 'Limpieza automática no programada (%).', sqlerrm;
end $$;

-- ---------- Analítica (E24 · E25 · E27): el análisis nocturno lo hace Python en GitHub Actions (SaaS: analisis.yml + analisis/analisis.py) ----------
-- 1) Python lee cfx_analisis_datos() con la conexión del respaldo (solo la base: nadie con cuenta puede llamarla).
-- 2) Calcula tendencias de la app (CM → 📊 Analítica) y, por negocio, clientes que dejaron de comprar y productos quietos (E27).
-- 3) Lo devuelve con cfx_analisis_guardar(): una fila 'app' y una por negocio en cfx_analisis.
-- Ganchos de cada app (opcionales; sin ellos hay solo números generales):
--   cfx_analisis_datos_app() → {ventas: [{n, c, f, m, l: [[clave, cant]]}], clientes: {c: {nombre, tel}}, productos: [{n, k, nombre, stock, creado}],
--                               negocios: [{id, nombre, creado, ingreso}]}
--   cfx_analisis_negocio(u) → uuid del negocio que ve ese usuario (null: ninguno). Módulo 'analisis' (🧩 en el CM).
create table if not exists public.cfx_analisis (clave text primary key, datos jsonb not null default '{}', calculado timestamptz not null default now());
alter table public.cfx_analisis enable row level security;
revoke all on public.cfx_analisis from anon, authenticated;

create or replace function public.cfx_analisis_datos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb; d date := (now() at time zone 'America/Santiago')::date;
begin
  if to_regprocedure('public.cfx_analisis_datos_app()') is not null then execute 'select public.cfx_analisis_datos_app()' into a; end if;
  return jsonb_build_object('hoy', d, 'modulo', public.cfx_modulo('analisis'),
    'usuarios', (select jsonb_build_object('total', count(*),
        'activos7', count(*) filter (where last_sign_in_at > now() - interval '7 days'),
        'activos30', count(*) filter (where last_sign_in_at > now() - interval '30 days'),
        'dias', coalesce((select jsonb_object_agg(x.f, x.n) from (select (created_at at time zone 'America/Santiago')::date f, count(*) n from auth.users
          where created_at > now() - interval '61 days' and deleted_at is null group by 1) x), '{}'))
      from auth.users where deleted_at is null),
    'ingresos', coalesce((select jsonb_object_agg(x.f, x.m) from (select (coalesce(resuelto, creado) at time zone 'America/Santiago')::date f, sum(monto) m
      from public.cfx_pagos where estado = 'aprobado' and coalesce(resuelto, creado) > now() - interval '61 days' group by 1) x), '{}'),
    'premium', (select count(distinct cuenta) from public.cfx_pagos where estado = 'aprobado' and coalesce(resuelto, creado) > now() - interval '30 days'),
    'previo', coalesce((select jsonb_object_agg(clave, datos -> 'mov') from public.cfx_analisis where clave <> 'app' and datos ? 'mov'), '{}'),
    'app', a);
end $$;

create or replace function public.cfx_analisis_guardar(p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; k text; v jsonb;
begin
  if jsonb_typeof(p -> 'app') = 'object' then
    insert into public.cfx_analisis (clave, datos, calculado) values ('app', p -> 'app', now())
    on conflict (clave) do update set datos = excluded.datos, calculado = now();
  end if;
  delete from public.cfx_analisis where clave <> 'app' and not (coalesce(p -> 'negocios', '{}') ? clave);
  for k, v in select * from jsonb_each(coalesce(p -> 'negocios', '{}')) loop
    insert into public.cfx_analisis (clave, datos, calculado) values (k, v, now())
    on conflict (clave) do update set datos = excluded.datos, calculado = now();
    n := n + 1;
  end loop;
  perform public.cfx_salud_marca('analisis', jsonb_build_object('negocios', n, 'run', coalesce(p ->> 'run', '')));
  return n;
end $$;
revoke all on function public.cfx_analisis_datos(), public.cfx_analisis_guardar(jsonb) from public, anon, authenticated;

-- Centro de Mando → 📊 Analítica.
create or replace function public.cfx_analisis_app() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return (select datos || jsonb_build_object('calculado', calculado) from public.cfx_analisis where clave = 'app');
end $$;
revoke all on function public.cfx_analisis_app() from public, anon;
grant execute on function public.cfx_analisis_app() to authenticated;

-- Para el negocio (E27): sus clientes en riesgo y productos quietos (sin la foto interna del stock).
create or replace function public.cfx_analisis_mio() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n uuid;
begin
  if auth.uid() is null or not public.cfx_modulo('analisis') or to_regprocedure('public.cfx_analisis_negocio(uuid)') is null then return null; end if;
  execute 'select public.cfx_analisis_negocio($1)' into n using auth.uid();
  if n is null or not public.cfx_modulo_de('analisis', n) then return null; end if;
  return (select (datos - 'mov') || jsonb_build_object('calculado', calculado) from public.cfx_analisis where clave = n::text);
end $$;
revoke all on function public.cfx_analisis_mio() from public, anon;
grant execute on function public.cfx_analisis_mio() to authenticated;

-- ---------- Seguridad (A7): lo que puede hacer alguien sin cuenta (anon) y los buckets de archivos ----------
-- Va al final del núcleo: así alcanza a todas las funciones de la app.
-- 1) En Supabase anon recibe permiso para TODA función nueva ("revoke ... from public" no se lo quita). Las que lo primero que hacen es
--    exigir ser admin igual fallarían: se les quita el permiso a anon (no cambia nada para quien tiene cuenta).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and substring(lower(p.prosrc) from '\mbegin\M(.*)$') ~ ('^\s*perform\s+' || regexp_replace(lower('public.cfx_es_admin()'), '([().])', '\\\1', 'g') || '\s*;')
  loop
    execute 'revoke execute on function ' || f.fn || ' from public, anon';
  end loop;
end $$;
revoke execute on function public.cfx_anotar(text, text) from public, anon;

-- 2) Buckets públicos (se ven con su dirección): solo fotos y de hasta 5 MB, si la app no puso otro límite.
update storage.buckets set file_size_limit = 5242880 where public and file_size_limit is null;
update storage.buckets set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'] where public and allowed_mime_types is null;

-- 3) Revisión para el Centro de Mando → Control → 🛡️ Seguridad.
create or replace function public.cfx_seguridad() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cfx_es_admin();
  return jsonb_build_object(
    'sin_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
        and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert,update,delete'))), '[]'),
    'anon_escribe', coalesce((select jsonb_agg(p.tablename || ' · ' || lower(p.cmd) order by p.tablename) from pg_policies p
      where p.schemaname = 'public' and p.cmd <> 'SELECT' and (p.roles @> '{anon}' or p.roles @> '{public}')), '[]'),
    'anon_lee', coalesce((select jsonb_agg(distinct p.tablename) from pg_policies p
      where p.schemaname = 'public' and p.cmd in ('SELECT', 'ALL') and (p.roles @> '{anon}' or p.roles @> '{public}')), '[]'),
    'funciones_anon', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')), '[]'),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'publico', b.public, 'mb', round(b.file_size_limit / 1048576.0, 1),
        'tipos', b.allowed_mime_types,
        'anon_lista', exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
          and p.cmd in ('SELECT', 'ALL') and (p.roles @> '{anon}' or p.roles @> '{public}'))) order by b.id) from storage.buckets b), '[]'),
    'humano', public.cfx_humano() - 'site_key' || jsonb_build_object('activo', coalesce(public.cfx_humano() ->> 'site_key', '') <> ''));
end $$;
revoke all on function public.cfx_seguridad() from public, anon;
grant execute on function public.cfx_seguridad() to authenticated;
-- <<< CFX núcleo

-- ---------- VERSIÓN 5.34 · C17 + C18 + B10 (se puede volver a correr) ----------
-- carritos → cfx_carritos y auditoria → cfx_registro: se copian y se borran las tablas viejas.
do $$
begin
  if to_regclass('public.carritos') is not null then
    execute $q$ insert into public.cfx_carritos (cliente, negocio, items, actualizado, avisado)
      select k.cliente_id, k.negocio_id, k.items, k.updated_at, k.avisado_at from public.carritos k
      where exists (select 1 from auth.users u where u.id = k.cliente_id) on conflict do nothing $q$;
    drop table public.carritos;
  end if;
  if to_regclass('public.auditoria') is not null then
    execute $q$ insert into public.cfx_registro (quien, accion, detalle, creado) select 'sistema', left(a.accion, 60), a.detalle, a.created_at from public.auditoria a $q$;
    drop table public.auditoria;
  end if;
end $$;
-- Ganchos del carrito (C17): puede guardar el cliente de la tienda; el aviso solo en tiendas Pro que no están de vacaciones.
create or replace function public.cfx_carrito_puede(u uuid, n uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.puede_comprar(u, n) and exists (select 1 from public.profiles where id = u and role = 'client')
$$;
create or replace function public.cfx_carrito_aviso(p_cliente uuid, p_negocio uuid, p_n int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select coalesce(nullif(x.empresa, ''), 'la tienda') into t from public.profiles x join public.profiles c on c.id = p_cliente
    where x.id = p_negocio and not x.suspended and not c.suspended and c.negocio_id = p_negocio and public.pro_o_modulo(x.id, 'carrito') and not public.en_vacaciones(x.id);
  if t is null then return false; end if;
  perform public.notify_user(p_cliente, '🛒 Tu pedido en ' || t || ' te espera',
    'Dejaste ' || p_n || ' producto(s) en el carrito. ¡Termina tu pedido con un toque!', 'apps/catalogo/?v=pedidos');
  return true;
end $$;
revoke all on function public.cfx_carrito_puede(uuid, uuid), public.cfx_carrito_aviso(uuid, uuid, int) from public, anon, authenticated;
-- B10: índices de lo que corre cada minuto (pedidos por liberar, avisos por enviar) y de las listas por cuenta.
create index if not exists pedidos_pagando_idx on public.pedidos (retenido_hasta) where estado = 'pagando';
create index if not exists pedidos_negocio_estado_idx on public.pedidos (negocio_id, estado);
create index if not exists notifications_envio_idx on public.notifications (send_at) where status = 'scheduled';
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists requests_user_idx on public.requests (user_id, status);
create index if not exists conexiones_para_idx on public.conexiones (para);
create index if not exists avisos_stock_negocio_idx on public.avisos_stock (negocio_id, clave);
create index if not exists notification_reads_user_idx on public.notification_reads (user_id);
create index if not exists publicacion_vistas_user_idx on public.publicacion_vistas (user_id);
create index if not exists user_invites_negocio_idx on public.user_invites (negocio_id);

-- ---------- VERSIÓN 5.33 · C15 + C16: calificaciones, cupones y sellos pasan al núcleo (se puede volver a correr) ----------
-- calificaciones → cfx_calificaciones (ref = id del pedido), cupones → cfx_descuentos, sellos → cfx_sellos, profiles.sellos_meta/premio → cfx_sellos_cfg.
drop function if exists public.guardar_cupon(text, int, date), public.borrar_cupon(uuid), public.mis_cupones(), public.validar_cupon(uuid, text),
  public.mis_sellos(uuid), public.calificar_pedido(text, int);
do $$
declare f int;
begin
  if to_regclass('public.calificaciones') is not null then
    execute $q$ insert into public.cfx_calificaciones (ref, de_negocio, negocio_id, cliente_id, cliente_ref, estrellas, creado)
      select q.pedido_id::text, q.de_negocio, x.negocio_id, (select u.id from auth.users u where u.id = x.cliente_id),
        case when x.cliente_id is null then x.invitado_tel end, q.estrellas, q.created_at
      from public.calificaciones q join public.pedidos x on x.id = q.pedido_id
      on conflict (ref, de_negocio) do nothing $q$;
    drop table public.calificaciones;
  end if;
  if to_regclass('public.cupones') is not null then
    execute $q$ insert into public.cfx_descuentos (id, owner_id, codigo, porcentaje, hasta, activo, usos, creado)
      select c.id, c.owner_id, c.codigo, c.porcentaje, c.hasta, c.activo, c.usos, c.created_at from public.cupones c
      where c.codigo ~ '^[A-Z0-9]{3,20}$' on conflict do nothing $q$;
    execute $q$ select count(*) from public.cupones c where not exists (select 1 from public.cfx_descuentos d where d.owner_id = c.owner_id and d.codigo = c.codigo) $q$ into f;
    if f = 0 then drop table public.cupones; else raise notice 'cupones: % sin copiar, la tabla queda', f; end if;
  end if;
  if to_regclass('public.sellos') is not null then
    execute $q$ insert into public.cfx_sellos (negocio_id, cliente_id, cantidad, premios)
      select s.negocio_id, s.cliente_id, s.cantidad, s.premios from public.sellos s
      where exists (select 1 from auth.users u where u.id = s.cliente_id) on conflict do nothing $q$;
    drop table public.sellos;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'sellos_meta') then
    execute $q$ insert into public.cfx_sellos_cfg (owner_id, meta, premio)
      select p.id, p.sellos_meta, nullif(left(trim(coalesce(p.sellos_premio, '')), 80), '') from public.profiles p
      where p.sellos_meta between 2 and 30 on conflict do nothing $q$;
    alter table public.profiles drop column sellos_meta, drop column if exists sellos_premio;
  end if;
end $$;

-- Lo que leen las pantallas, ahora desde el núcleo (con el módulo apagado: sin estrellas, sin "Califica" y sin tarjeta).
create or replace function public.estrellas_tienda(n uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select public.cfx_calif_negocio(n) $$;

create or replace function public.tienda_info(p_negocio uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug,
    'telefono', t.telefono, 'datos_pago', t.datos_pago, 'horario', t.horario, 'abierto', t.abierto,
    'sellos_meta', (s.c ->> 'meta')::int, 'sellos_premio', s.c ->> 'premio',
    'pro', public.is_pro(t.id), 'logo', t.logo, 'color', t.color,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'desc_premium', t.desc_premium, 'rubro', t.rubro, 'despacho', t.despacho, 'perfil', t.perfil, 'desde', t.created_at::date)
  from public.profiles t cross join lateral (select public.cfx_sellos_cfg_de(t.id) as c) s
  where t.id = p_negocio and (public.puede_comprar(auth.uid(), t.id) or public.negocio_de(auth.uid()) = t.id or public.is_admin())
$$;

create or replace function public.mis_pedidos(p_negocio uuid default null)
returns table (id uuid, negocio text, lineas jsonb, subtotal numeric, descuento numeric, total numeric, cupon text,
               entrega text, direccion text, nota text, estado text, fecha timestamptz, actualizado timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, calificado boolean, token text,
               desc_premium numeric, motivo text, rechazos int, boleta jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, t.empresa, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at, x.retenido_hasta, x.comprobante is not null, x.devolucion,
         public.cfx_calif_hecha(x.id::text, false), x.token, x.desc_premium, x.motivo, x.rechazos,
         case when x.boleta_folio is not null then public.boleta_de(x) end
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;

create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric,
               premium boolean, desc_premium numeric, rechazos int, motivo text, boleta jsonb, medio text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         public.cfx_calif_hecha(x.id::text, true),
         (public.cfx_calif_cliente(x.cliente_id, case when x.cliente_id is null then x.invitado_tel end) ->> 'promedio')::numeric,
         pr.premium, x.desc_premium, x.rechazos, x.motivo, public.boleta_de(x),
         case when x.mp_pago is not null then 'mercadopago' when x.comprobante_at is not null then 'transferencia' end
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

-- Al borrar una tienda o un pedido, se borra lo suyo en el núcleo (antes lo hacía la clave foránea).
create or replace function public.borrar_fidelidad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' then
    perform public.cfx_fid_borrar(old.id);
    perform public.cfx_calif_borrar(old.id);
    perform public.cfx_carrito_borrar(old.id);
    perform public.cfx_modulos_borrar(old.id);
  else
    perform public.cfx_calif_borrar(old.negocio_id, old.id::text);
  end if;
  return old;
end $$;
revoke all on function public.borrar_fidelidad() from public, anon, authenticated;
drop trigger if exists borrar_fidelidad on public.profiles;
create trigger borrar_fidelidad after delete on public.profiles for each row execute function public.borrar_fidelidad();
drop trigger if exists borrar_fidelidad on public.pedidos;
create trigger borrar_fidelidad after delete on public.pedidos for each row execute function public.borrar_fidelidad();

-- ---------- VERSIÓN 5.32 · C14: el chat pasa al núcleo. messages/blocks/reports → cfx_mensajes/cfx_bloqueos/cfx_reportes (se puede volver a correr) ----------
drop function if exists public.chat_remaining(uuid), public.send_message(uuid, text), public.chat_list(), public.chat_messages(uuid),
  public.block_contact(uuid, boolean), public.report_message(uuid, text), public.admin_resolve_report(uuid, boolean), public.chat_borrar(uuid);
do $$
declare f int;
begin
  if to_regclass('public.messages') is not null then
    execute $q$ insert into public.cfx_mensajes (id, de, para, texto, creado, leido)
      select m.id, m.sender, m.recipient, m.body, m.created_at, m.read_at from public.messages m
      where exists (select 1 from auth.users u where u.id = m.sender) and exists (select 1 from auth.users u where u.id = m.recipient)
      on conflict (id) do nothing $q$;
  end if;
  if to_regclass('public.blocks') is not null then
    execute $q$ insert into public.cfx_bloqueos (quien, a, creado)
      select b.blocker, b.blocked, b.created_at from public.blocks b
      where exists (select 1 from auth.users u where u.id = b.blocker) and exists (select 1 from auth.users u where u.id = b.blocked)
      on conflict do nothing $q$;
    drop table public.blocks;
  end if;
  if to_regclass('public.reports') is not null then
    execute $q$ insert into public.cfx_reportes (id, quien, a, mensaje, motivo, extracto, resuelto, creado)
      select r.id, r.reporter, r.reported, (select x.id from public.cfx_mensajes x where x.id = r.message_id), r.reason, coalesce(r.excerpt, ''), r.resolved, r.created_at
      from public.reports r
      where exists (select 1 from auth.users u where u.id = r.reporter) and exists (select 1 from auth.users u where u.id = r.reported)
      on conflict (id) do nothing $q$;
    drop table public.reports;
  end if;
  if to_regclass('public.messages') is not null then
    execute $q$ select count(*) from public.messages m where not exists (select 1 from public.cfx_mensajes x where x.id = m.id)
      and exists (select 1 from auth.users u where u.id = m.sender) and exists (select 1 from auth.users u where u.id = m.recipient) $q$ into f;
    if f = 0 then drop table public.messages; else raise notice 'messages: % sin copiar, la tabla queda', f; end if;
  end if;
end $$;

-- ---------- VERSIÓN 5.30 · A5: copiar las tablas viejas a las del núcleo y borrarlas (se puede volver a correr) ----------
drop function if exists public.admin_create_license(text, int, numeric, text), public.admin_revoke_license(uuid), public.admin_stats(),
  public.puede_resenar(uuid, uuid), public.dejar_resena(uuid, int, text), public.ver_resenas(uuid), public.responder_resena(uuid, text),
  public.destacar_resena(uuid, boolean), public.subir_pago_premium(text), public.subir_pago_premium(text, boolean), public.mis_pagos(),
  public.admin_pagos(text), public.admin_pago_comprobante(uuid), public.admin_revisar_pago(uuid, boolean, text),
  public.admin_revisar_pago(uuid, boolean, text, int);
do $$
declare n int; f int;
begin
  -- 🔑 Keys: las sin usar siguen sirviendo (mismo código); las usadas quedan como historial.
  if to_regclass('public.licenses') is not null then
    execute $q$ insert into public.cfx_keys (hash, ultimos, rol, dias, nota, creado, usada_por, usada_email, usada_at, revocada)
      select encode(sha256(convert_to(upper(l.key), 'UTF8')), 'hex'), right(l.key, 4), 'negocio', least(3660, coalesce(l.months * 31, 3660)),
        left('Key antigua · ' || l.empresa || coalesce(' · ' || l.note, ''), 300), l.created_at, l.redeemed_by, u.email, l.redeemed_at, l.revoked
      from public.licenses l left join auth.users u on u.id = l.redeemed_by
      on conflict (hash) do nothing $q$;
    execute $q$ select count(*) from public.licenses l where not exists (select 1 from public.cfx_keys k where k.hash = encode(sha256(convert_to(upper(l.key), 'UTF8')), 'hex')) $q$ into f;
    if f = 0 then drop table public.licenses; else raise notice 'licenses: % keys sin copiar, la tabla queda', f; end if;
  end if;
  -- 💰 Pagos Premium con comprobante: los "en revisión" quedan pendientes en el Centro de Mando → Pagos.
  if to_regclass('public.pagos') is not null then
    execute $q$ insert into public.cfx_pagos (id, cuenta, email, nombre, rol, periodo, monto, medio, nota, comprobante, estado, dias, motivo, creado, resuelto)
      select g.id, g.user_id, coalesce(p.email, ''), coalesce(nullif(p.empresa, ''), p.email, ''), case when g.tipo = 'premium_cliente' then 'cliente' else 'negocio' end,
        case when coalesce(to_jsonb(g) ->> 'anual', 'false')::boolean then 'anual' else 'mensual' end, least(100000000, greatest(1, coalesce(g.monto, 1))),
        'transferencia', 'Pago anterior a Pagos del núcleo',
        case when g.estado = 'en_revision' and g.comprobante ~ '^data:image/(jpeg|png|webp);base64,' and length(g.comprobante) <= 400000 then g.comprobante end,
        case when g.estado = 'en_revision' then 'pendiente' else g.estado end, g.dias, coalesce(g.motivo, ''), g.created_at, g.revisado_at
      from public.pagos g left join public.profiles p on p.id = g.user_id
      on conflict (id) do nothing $q$;
    execute $q$ select count(*) from public.pagos g where not exists (select 1 from public.cfx_pagos c where c.id = g.id) $q$ into f;
    if f = 0 then drop table public.pagos; else raise notice 'pagos: % sin copiar, la tabla queda', f; end if;
  end if;
  -- ⭐ Reseñas viejas (sin pantalla): se guardan en el registro del Centro de Mando y se borra la tabla. Las estrellas siguen en calificaciones.
  if to_regclass('public.resenas') is not null then
    execute $q$ insert into public.cfx_registro (quien, accion, detalle)
      select 'sistema', 'reseña archivada', left(jsonb_build_object('tienda', t.empresa, 'autor', a.empresa, 'estrellas', r.estrellas, 'texto', r.texto,
        'respuesta', r.respuesta, 'fecha', r.created_at)::text, 400)
      from public.resenas r left join public.profiles t on t.id = r.negocio_id left join public.profiles a on a.id = r.autor_id $q$;
    get diagnostics n = row_count;
    drop table public.resenas;
    if n > 0 then raise notice 'resenas: % archivadas en cfx_registro', n; end if;
  end if;
end $$;

-- =====================================================================
--  Envío automático: cada minuto llama a la función "enviar".
--  (Viene incluido aquí: no hay que pegarlo aparte. Requiere la Edge Function "enviar".)
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

-- Cada día (10:00 hora de Chile aprox.): avisa a quienes se les vence el plan (15 y 5 días antes, editable en Reglas).
select cron.unschedule(jobid) from cron.job where jobname = 'avisar-vencimientos';
select cron.schedule('avisar-vencimientos', '0 13 * * *', $$ select public.avisar_vencimientos(); $$);

-- Cada día (madrugada en Chile): borra avisos y mensajes de más de 30 días (avisa antes). Los pedidos no se tocan.
select cron.unschedule(jobid) from cron.job where jobname = 'limpiar-registros';
select cron.schedule('limpiar-registros', '0 8 * * *', $$ select public.limpiar_registros(); $$);

-- Cada hora: si subí una versión nueva de la app, te llega un aviso para tocar "Actualizar".
create extension if not exists http with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'avisar-version';
select cron.schedule('avisar-version', '17 * * * *', $$ select public.avisar_version_nueva(); $$);

-- Cada minuto: los pedidos sin comprobante a tiempo se liberan solos.
select cron.unschedule(jobid) from cron.job where jobname = 'expirar-retenciones';
select cron.schedule('expirar-retenciones', '* * * * *', $$ select public.expirar_retenciones(); $$);
-- Cada día: borra comprobantes viejos y pedidos expirados (los demás registros ya los limpia "limpiar-registros").
select cron.unschedule(jobid) from cron.job where jobname = 'limpiar-comprobantes';
select cron.schedule('limpiar-comprobantes', '10 8 * * *', $$ select public.limpiar('comprobantes'); select public.limpiar('pedidos'); $$);
-- Recordatorio de carritos: desde 5.34 lo hace el núcleo ('cfx-carritos', módulo 🛒 Recordar carrito).
select cron.unschedule(jobid) from cron.job where jobname = 'recordar-carritos';
-- Cada lunes (9:00 de Chile aprox.): reporte semanal de ventas a las tiendas Pro.
select cron.unschedule(jobid) from cron.job where jobname = 'reporte-semanal';
-- =====================================================================
-- Actualización automática (núcleo CodeFix): cada 10 minutos la base revisa GitHub (rama main).
--   · Si hay una base nueva (version.json), descarga y ejecuta este mismo instalar.sql (no borra datos).
--   · La app la liberas tú cuando la pruebes (panel de la app o Centro de Mando → Liberar).
--   Si algo falla no cambia nada y lo reintenta en la siguiente vuelta. Hay que correr este archivo UNA vez.
-- =====================================================================
create or replace function public.auto_actualizar() returns text
language plpgsql security definer set search_path = '' as $f$
declare
  base constant text := 'https://raw.githubusercontent.com/CodeFixService/Aplicaciones/main/';
  marca text := '?t=' || extract(epoch from now())::bigint; j jsonb; v_bd text; v_app text; codigo text; lib text;
  re constant text := '^[0-9]+(\.[0-9]+)*$';
begin
  execute 'select content from extensions.http_get($1)' into codigo using base || 'version.json' || marca;
  j := codigo::jsonb; v_bd := j ->> 'bd'; v_app := j ->> 'version';
  if v_bd ~ re and coalesce((public.db_version())::text, '0') ~ re and string_to_array(v_bd, '.')::int[] > string_to_array(coalesce((public.db_version())::text, '0'), '.')::int[] then
    execute 'select content from extensions.http_get($1)' into codigo using base || 'supabase/instalar.sql' || marca;
    if codigo is null or length(codigo) < 1000 then return 'instalar.sql no disponible'; end if;
    execute codigo;
    return 'base actualizada a ' || (public.db_version())::text;
  end if;
  -- La app NO se libera sola: la liberas tú desde el panel o el Centro de Mando después de probarla.
  return 'al día';
exception when others then
  return 'sin cambios: ' || sqlerrm;
end $f$;
revoke execute on function public.auto_actualizar() from public, anon, authenticated;
do $$
begin
  create extension if not exists http with schema extensions;
  perform cron.unschedule(jobid) from cron.job where jobname = 'cfx-auto';
  perform cron.schedule('cfx-auto', '*/10 * * * *', 'select public.auto_actualizar()');
exception when others then
  raise notice 'Actualización automática no activada (%). Activa pg_cron en Supabase y vuelve a correr este archivo.', sqlerrm;
end $$;

select cron.schedule('reporte-semanal', '7 12 * * 1', $$ select public.reporte_semanal(); $$);

-- ---------- VERSIÓN 5.41 · Lanzamiento: 📄 políticas, 📦 despacho a todo Chile, 🚚 seguimiento, ✉️ correo al comprador, 📊 medir anuncios y 🌐 dominio propio (se puede volver a correr) ----------
alter table public.pedidos add column if not exists invitado_correo text;
alter table public.pedidos add column if not exists envio_courier text;
alter table public.pedidos add column if not exists envio_codigo text;
alter table public.pedidos add column if not exists envio_link text;
alter table public.pedidos add column if not exists envio_por_pagar boolean not null default false;
alter table public.profiles add column if not exists medicion jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists dominio text;
create unique index if not exists profiles_dominio_idx on public.profiles (dominio) where dominio is not null;
alter table public.notifications add column if not exists email_directo text;
alter table public.notifications add column if not exists nombre_directo text;
alter table public.notifications drop constraint if exists notifications_audience_check;
alter table public.notifications add constraint notifications_audience_check
  check (audience in ('all_users', 'all_businesses', 'pro_users', 'free_users', 'all_clients', 'my_subscribers', 'self', 'direct', 'correo'));

-- ✉️ 'correo' = un correo a una persona (comprador sin cuenta o cliente): no sale en ninguna bandeja; la Edge Function "enviar" lo manda igual que los demás.
create or replace function public.notification_targets(p_id uuid)
returns table (endpoint text, p256dh text, auth text, email text, nombre text)
language plpgsql stable security definer set search_path = '' as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id = p_id;
  if n.audience = 'correo' then
    return query select null::text, null::text, null::text, n.email_directo, n.nombre_directo where coalesce(n.email_directo, '') <> '';
  elsif n.audience = 'my_subscribers' then
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
revoke all on function public.notification_targets(uuid) from public, anon, authenticated;

-- 🚚 Link del courier para seguir el envío (o el link que pegó la tienda).
create or replace function public.envio_link(p_courier text, p_codigo text, p_link text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(p_codigo, '') = '' and coalesce(p_link, '') = '' then null
    when coalesce(p_link, '') <> '' then p_link
    when p_courier = 'starken' then 'https://www.starken.cl/seguimiento?codigo=' || p_codigo
    when p_courier = 'chilexpress' then 'https://centrodeayuda.chilexpress.cl/seguimiento/' || p_codigo
    when p_courier = 'blue' then 'https://www.blue.cl/seguimiento/?n_seguimiento=' || p_codigo
    when p_courier = 'correos' then 'https://www.correos.cl/web/guest/seguimiento-en-linea?codigos=' || p_codigo end
$$;
create or replace function public.envio_de(x public.pedidos) returns jsonb
language sql stable set search_path = '' as $$
  select case when x.envio_codigo is not null or x.envio_link is not null or x.envio_por_pagar then jsonb_build_object(
    'courier', x.envio_courier, 'nombre', case x.envio_courier when 'starken' then 'Starken' when 'chilexpress' then 'Chilexpress' when 'blue' then 'Blue Express'
      when 'correos' then 'Correos de Chile' when 'propio' then 'Reparto de la tienda' else 'Courier' end,
    'codigo', x.envio_codigo, 'link', public.envio_link(x.envio_courier, x.envio_codigo, x.envio_link), 'por_pagar', x.envio_por_pagar) end
$$;

-- La tienda (o su equipo con Pedidos) anota el courier y el código. Si el pedido estaba preparándose o listo, pasa a "en camino" (avisa al cliente).
create or replace function public.pedido_seguimiento(p_id uuid, p_courier text, p_codigo text, p_link text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; c text := lower(coalesce(nullif(trim(p_courier), ''), 'otro')); k text := nullif(upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g')), '');
  l text := nullif(trim(coalesce(p_link, '')), ''); t text;
begin
  if not public.equipo_puede('pedidos') then raise exception 'Sin permiso'; end if;
  select * into x from public.pedidos where id = p_id and negocio_id = public.negocio_de(auth.uid());
  if x.id is null then raise exception 'Pedido no encontrado'; end if;
  if x.entrega <> 'despacho' then raise exception 'Este pedido es con retiro en tienda'; end if;
  if x.estado in ('cancelado', 'rechazado', 'expirado', 'pagando', 'en_revision') then raise exception 'Este pedido no está para enviar'; end if;
  if c not in ('starken', 'chilexpress', 'blue', 'correos', 'propio', 'otro') then raise exception 'Courier no válido'; end if;
  if k is not null and k !~ '^[A-Z0-9-]{4,40}$' then raise exception 'El código de seguimiento lleva solo letras, números y guiones (4 a 40)'; end if;
  if l is not null and (l !~* '^https://[^\s<>"'']+$' or length(l) > 300) then raise exception 'El link debe empezar con https://'; end if;
  if k is null and l is null and c <> 'propio' then raise exception 'Escribe el código de seguimiento'; end if;
  update public.pedidos set envio_courier = c, envio_codigo = k, envio_link = l, updated_at = now() where id = x.id returning * into x;
  if x.estado in ('recibido', 'preparando', 'listo') then
    perform public.actualizar_pedido(x.id, 'en_camino');
  else
    select coalesce(nullif(empresa, ''), 'Tu tienda') into t from public.profiles where id = x.negocio_id;
    perform public.aviso_cliente(x, '🚚 Sigue tu envío', t || ' · ' || coalesce((public.envio_de(x)) ->> 'nombre', '') || coalesce(' · ' || k, ''));
  end if;
  return public.envio_de((select p from public.pedidos p where p.id = x.id));
end $$;
revoke all on function public.envio_link(text, text, text), public.envio_de(public.pedidos) from public, anon, authenticated;
revoke all on function public.pedido_seguimiento(uuid, text, text, text) from public, anon;
grant execute on function public.pedido_seguimiento(uuid, text, text, text) to authenticated;

-- 📦 Envío "por pagar": queda anotado en el pedido (la tienda lo ve y el cliente también).
create or replace function public.pedido_por_pagar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.entrega = 'despacho' and coalesce(new.costo_despacho, 0) = 0 then
      new.envio_por_pagar := coalesce((public.cfx_despacho_costo((select despacho from public.profiles where id = new.negocio_id), new.entrega, new.direccion, new.subtotal) ->> 'por_pagar')::boolean, false);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.pedido_por_pagar() from public, anon, authenticated;
drop trigger if exists pedido_por_pagar on public.pedidos;
create trigger pedido_por_pagar before insert on public.pedidos for each row execute function public.pedido_por_pagar();

-- ✉️ Correo al comprador: al hacer el pedido y en cada cambio de estado (solo si el correo de la app está configurado). Nunca rompe el pedido.
create or replace function public.pedido_correo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare dest text; nom text; t public.profiles; tit text; cab text; res text; url text; env jsonb; resumen boolean := false;
begin
  begin
    if not exists (select 1 from public.app_secrets where name = 'gmail_user' and coalesce(value, '') <> '') then return null; end if;
    dest := coalesce(new.invitado_correo, (select c.email from public.profiles c where c.id = new.cliente_id and c.role = 'client'));
    if coalesce(dest, '') = '' then return null; end if;
    if tg_op = 'INSERT' then resumen := new.estado in ('pagando', 'recibido');
    elsif new.invitado_correo is distinct from old.invitado_correo then resumen := true;
    elsif new.envio_codigo is distinct from old.envio_codigo or new.envio_link is distinct from old.envio_link then
      if not (old.estado = 'en_camino' and new.estado = 'en_camino') then return null; end if;
    elsif new.estado is not distinct from old.estado then return null;
    end if;
    select * into t from public.profiles where id = new.negocio_id;
    nom := coalesce(nullif(t.empresa, ''), 'La tienda');
    env := public.envio_de(new);
    tit := case when resumen and new.estado = 'pagando' then '🛒 Tu pedido en ' || nom || ' está apartado'
      when resumen then '📦 ' || nom || ' recibió tu pedido'
      else case new.estado when 'recibido' then '📦 ' || nom || ' recibió tu pedido' when 'preparando' then '👨‍🍳 ' || nom || ' está preparando tu pedido'
        when 'listo' then '✅ Tu pedido está listo para retirar' when 'en_camino' then '🚚 Tu pedido va en camino'
        when 'entregado' then '🎉 Pedido entregado. ¡Gracias por tu compra!' when 'cancelado' then '❌ Tu pedido fue cancelado'
        when 'rechazado' then '❌ No pudimos confirmar tu pago' end end;
    if tit is null then return null; end if;
    cab := case when resumen and new.estado = 'pagando' then 'Paga antes de las ' || to_char(new.retenido_hasta at time zone 'America/Santiago', 'HH24:MI') || ' para confirmarlo.'
      when new.estado = 'entregado' then 'Cuéntanos cómo te fue: califica tu compra en el link.'
      when new.estado = 'rechazado' then coalesce('Motivo: ' || nullif(new.motivo, ''), 'Escríbele a la tienda para resolverlo.')
      else '' end;
    if env is not null and new.estado = 'en_camino' then
      cab := trim(cab || E'\n' || (env ->> 'nombre') || coalesce(' · código ' || (env ->> 'codigo'), '') || coalesce(E'\nSigue tu envío: ' || (env ->> 'link'), ''));
    end if;
    if coalesce((env ->> 'por_pagar')::boolean, false) then cab := trim(cab || E'\n📦 Envío por pagar: lo pagas al recibir.'); end if;
    res := (select string_agg((l ->> 'cant') || ' × ' || (l ->> 'nombre') || coalesce(' (' || nullif(l ->> 'opcion', '') || ')', ''), E'\n')
            from (select l from jsonb_array_elements(new.lineas) l limit 8) z);
    url := coalesce((select value from public.app_settings where key = 'app_url'), 'https://aplicaciones.juanjosuecastilloloyola.workers.dev/');
    url := regexp_replace(url, '/?$', '/') || 'r/?t=' || new.token;
    insert into public.notifications (owner_id, audience, channels, title, body, url, send_at, email_directo, nombre_directo)
    values (new.negocio_id, 'correo', '{email}', left(tit, 80),
      left(trim(cab || E'\n\n' || coalesce(res, '') || E'\nTotal: $' || to_char(new.total, 'FM999G999G999') || E'\n' ||
        case when new.entrega = 'despacho' then '🚚 Despacho a ' || coalesce(new.direccion, '') else '🏪 Retiro en tienda' end), 1200),
      url, now(), dest, coalesce(new.invitado_nombre, (select c.empresa from public.profiles c where c.id = new.cliente_id)));
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.pedido_correo() from public, anon, authenticated;
drop trigger if exists pedido_correo on public.pedidos;
create trigger pedido_correo after insert or update of estado, invitado_correo, envio_codigo, envio_link on public.pedidos for each row execute function public.pedido_correo();

-- El comprador sin cuenta deja su correo después de pedir (con el enlace secreto del pedido). Una sola vez por pedido.
create or replace function public.pedido_correo_guardar(p_ref text, p_correo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.pedidos; c text := lower(trim(coalesce(p_correo, '')));
begin
  if length(coalesce(p_ref, '')) <> 24 then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  select * into x from public.pedidos where token = p_ref;
  if x.id is null or x.cliente_id is not null then return jsonb_build_object('ok', false, 'error', 'Pedido no encontrado'); end if;
  if c !~ '^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$' or length(c) > 120 then return jsonb_build_object('ok', false, 'error', 'Correo no válido'); end if;
  if x.invitado_correo is not null then return jsonb_build_object('ok', true); end if;
  update public.pedidos set invitado_correo = c where id = x.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pedido_correo_guardar(text, text) from public;
grant execute on function public.pedido_correo_guardar(text, text) to anon, authenticated;

-- El pedido con su envío (cliente, comprador sin cuenta y tienda).
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
    'calificado', public.cfx_calif_hecha(x.id::text, false),
    'boleta', case when x.boleta_folio is not null then public.boleta_de(x) end,
    'envio', public.envio_de(x), 'con_correo', x.cliente_id is not null or x.invitado_correo is not null);
end $$;

drop function if exists public.mis_pedidos(uuid);
create or replace function public.mis_pedidos(p_negocio uuid default null)
returns table (id uuid, negocio text, lineas jsonb, subtotal numeric, descuento numeric, total numeric, cupon text,
               entrega text, direccion text, nota text, estado text, fecha timestamptz, actualizado timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, calificado boolean, token text,
               desc_premium numeric, motivo text, rechazos int, boleta jsonb, envio jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, t.empresa, x.lineas, x.subtotal, x.descuento, x.total, x.cupon,
         x.entrega, x.direccion, x.nota, x.estado, x.created_at, x.updated_at, x.retenido_hasta, x.comprobante is not null, x.devolucion,
         public.cfx_calif_hecha(x.id::text, false), x.token, x.desc_premium, x.motivo, x.rechazos,
         case when x.boleta_folio is not null then public.boleta_de(x) end, public.envio_de(x)
  from public.pedidos x join public.profiles t on t.id = x.negocio_id
  where x.cliente_id = auth.uid() and (p_negocio is null or x.negocio_id = p_negocio)
  order by x.created_at desc limit 50
$$;
revoke all on function public.mis_pedidos(uuid) from public, anon;
grant execute on function public.mis_pedidos(uuid) to authenticated;

drop function if exists public.pedidos_tienda(text);
create or replace function public.pedidos_tienda(p_estado text default null)
returns table (id uuid, cliente_id uuid, cliente text, telefono text, lineas jsonb, subtotal numeric, descuento numeric,
               total numeric, cupon text, entrega text, direccion text, nota text, estado text, fecha timestamptz,
               retenido_hasta timestamptz, tiene_comprobante boolean, devolucion text, invitado boolean, calificado boolean, cliente_estrellas numeric,
               premium boolean, desc_premium numeric, rechazos int, motivo text, boleta jsonb, medio text, envio jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, x.cliente_id, coalesce(nullif(c.empresa, ''), split_part(c.email, '@', 1), x.invitado_nombre, 'Cliente'),
         coalesce(c.telefono, x.invitado_tel), x.lineas, x.subtotal, x.descuento, x.total, x.cupon, x.entrega, x.direccion, x.nota, x.estado,
         x.created_at, x.retenido_hasta, x.comprobante is not null, x.devolucion, x.cliente_id is null,
         public.cfx_calif_hecha(x.id::text, true),
         (public.cfx_calif_cliente(x.cliente_id, case when x.cliente_id is null then x.invitado_tel end) ->> 'promedio')::numeric,
         pr.premium, x.desc_premium, x.rechazos, x.motivo, public.boleta_de(x),
         case when x.mp_pago is not null then 'mercadopago' when x.comprobante_at is not null then 'transferencia' end, public.envio_de(x)
  from public.pedidos x left join public.profiles c on c.id = x.cliente_id
  cross join lateral (select c.role = 'client' and public.is_pro(c.id) as premium) pr
  where x.negocio_id = public.negocio_de(auth.uid())
    and (p_estado is null or (p_estado = 'activos' and x.estado in ('recibido', 'preparando', 'listo', 'en_camino'))
         or (p_estado = 'revisar' and x.estado = 'en_revision') or (p_estado = 'pagando' and x.estado = 'pagando')
         or (p_estado = 'devolver' and x.devolucion = 'pendiente')
         or (p_estado = 'historial' and x.estado in ('entregado', 'cancelado', 'rechazado', 'expirado')) or x.estado = p_estado)
  order by (coalesce(pr.premium, false) and x.estado in ('pagando', 'en_revision', 'recibido', 'preparando', 'listo', 'en_camino')) desc, x.created_at desc
  limit 300
$$;
revoke all on function public.pedidos_tienda(text) from public, anon;
grant execute on function public.pedidos_tienda(text) to authenticated;

-- 📄 Perfil con las políticas de la tienda (Ley 19.496): vendedor, RUT, cambios y devoluciones, envíos y si excluye el retracto.
create or replace function public.set_mi_perfil(p_perfil jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := '{}'::jsonb; k text; v text;
  lim constant jsonb := '{"descripcion":400,"direccion":150,"comuna":60,"instagram":100,"facebook":100,"tiktok":100,"web":150,"correo":120,"razon":120,"rut":12,"cambios":800,"envios":400,"sin_retracto":1}';
begin
  if not public.is_business(auth.uid()) then raise exception 'Solo las empresas'; end if;
  for k in select jsonb_object_keys(lim) loop
    v := nullif(trim(regexp_replace(coalesce(p_perfil ->> k, ''), '[<>]', '', 'g')), '');
    if v is null then continue; end if;
    if k = 'rut' then v := public.rut_normal(v); if v is null then raise exception 'RUT no válido'; end if; end if;
    if k = 'sin_retracto' then v := '1'; end if;
    v := left(v, (lim ->> k)::int);
    if k = 'web' and v !~* '^https?://' then v := 'https://' || v; end if;
    if k = 'correo' and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  update public.profiles set perfil = r where id = auth.uid();
  return r;
end $$;
revoke all on function public.set_mi_perfil(jsonb) from public, anon;
grant execute on function public.set_mi_perfil(jsonb) to authenticated;

-- 📊 Medir anuncios (Meta Pixel y Google Analytics 4) y 🌐 dominio propio: módulos (sin venta de módulos: Pro).
create or replace function public.mi_marca_web() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = public.webhook_dueno();
  return jsonb_build_object('slug', p.slug, 'meta', p.medicion ->> 'meta', 'ga', p.medicion ->> 'ga', 'dominio', p.dominio,
    'medicion', public.pro_o_modulo(p.id, 'medicion'), 'con_dominio', public.pro_o_modulo(p.id, 'dominio'), 'modulos', public.mis_modulos(p.id) is not null);
end $$;
create or replace function public.medicion_guardar(p_meta text, p_ga text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno(); m text := nullif(regexp_replace(coalesce(p_meta, ''), '\s', '', 'g'), ''); g text := nullif(upper(trim(coalesce(p_ga, ''))), '');
begin
  if not public.pro_o_modulo(me, 'medicion') then raise exception '📊 Medir anuncios es % ', case when public.mis_modulos(me) is not null then 'un módulo: actívalo en Ajustes → 🧩 Módulos' else 'de la versión Pro' end; end if;
  if m is not null and m !~ '^[0-9]{8,20}$' then raise exception 'El ID del Pixel de Meta son solo números (8 a 20)'; end if;
  if g is not null and g !~ '^G-[A-Z0-9]{4,15}$' then raise exception 'El ID de Google Analytics empieza con G- (ej: G-AB12CD34EF)'; end if;
  update public.profiles set medicion = jsonb_strip_nulls(jsonb_build_object('meta', m, 'ga', g)) where id = me;
  return public.mi_marca_web();
end $$;
create or replace function public.dominio_guardar(p_dominio text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.webhook_dueno(); d text := nullif(lower(trim(regexp_replace(coalesce(p_dominio, ''), '^https?://|/.*$', '', 'gi'))), ''); antes text;
begin
  if not public.pro_o_modulo(me, 'dominio') then raise exception '🌐 Dominio propio es % ', case when public.mis_modulos(me) is not null then 'un módulo: actívalo en Ajustes → 🧩 Módulos' else 'de la versión Pro' end; end if;
  if d is not null and (d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' or length(d) > 80 or d ~ '(workers\.dev|supabase\.|pages\.dev|codefix)') then
    raise exception 'Escribe solo el dominio, ej: mitienda.cl';
  end if;
  if d is not null and exists (select 1 from public.profiles where dominio = d and id <> me) then raise exception 'Ese dominio ya lo usa otra tienda'; end if;
  select dominio into antes from public.profiles where id = me;
  update public.profiles set dominio = d where id = me;
  if d is not null and d is distinct from antes then
    perform public.cfx_al_cm('🌐 Dominio nuevo: ' || d, 'Tienda ' || coalesce((select slug from public.profiles where id = me), '') ||
      '. Agrégalo en Cloudflare → Workers → aplicaciones → Settings → Domains & Routes → Add → Custom domain.');
  end if;
  return public.mi_marca_web();
end $$;
-- El Worker pregunta de qué tienda es un dominio (solo dominios con el módulo vigente).
create or replace function public.tienda_por_dominio(p_host text) returns text
language sql stable security definer set search_path = '' as $$
  select p.slug from public.profiles p
  where p.dominio = lower(regexp_replace(trim(coalesce(p_host, '')), '^www\.', '')) and p.role = 'user' and not p.suspended and public.pro_o_modulo(p.id, 'dominio')
$$;
revoke all on function public.mi_marca_web(), public.medicion_guardar(text, text), public.dominio_guardar(text) from public, anon;
grant execute on function public.mi_marca_web(), public.medicion_guardar(text, text), public.dominio_guardar(text) to authenticated;
revoke all on function public.tienda_por_dominio(text) from public;
grant execute on function public.tienda_por_dominio(text) to anon, authenticated;

-- La vitrina pública con la medición (solo si la tienda tiene el módulo) y las políticas (vienen en perfil).
create or replace function public.tienda_publica(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'empresa', t.empresa, 'slug', t.slug, 'telefono', t.telefono, 'horario', t.horario, 'abierto', t.abierto,
    'logo', t.logo, 'color', t.color, 'datos_pago', t.datos_pago,
    'vacaciones_hasta', case when public.en_vacaciones(t.id) then t.vacaciones_hasta end,
    'vacaciones_msg', case when public.en_vacaciones(t.id) then t.vacaciones_msg end,
    'estrellas', public.estrellas_tienda(t.id), 'cobra_online', public.link_activo(t.id, 'pedido') is not null,
    'retencion_min', public.regla('retencion_min', 30), 'pro', public.is_pro(t.id), 'desc_premium', t.desc_premium, 'despacho', t.despacho,
    'perfil', t.perfil, 'rubro', t.rubro, 'desde', t.created_at::date,
    'medicion', case when t.medicion <> '{}'::jsonb and public.pro_o_modulo(t.id, 'medicion') then t.medicion end)
  from public.profiles t where t.slug = lower(trim(coalesce(p_slug, ''))) and t.role = 'user' and not t.suspended
$$;

-- Módulos de Órbita (+ 📊 medir anuncios y 🌐 dominio propio).
create or replace function public.cfx_modulos_app() returns text[]
language sql immutable as $$ select array['chat', 'calificaciones', 'cupones', 'sellos', 'carrito', 'analisis', 'estadisticas', 'equipo', 'campanas', 'redes', 'webhooks', 'medicion', 'dominio'] $$;
revoke all on function public.cfx_modulos_app() from public, anon, authenticated;

-- Guía para partir: + 📄 políticas de la tienda; el despacho cuenta también el resto de Chile.
create or replace function public.cfx_guia_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(
    jsonb_build_object('k', 'perfil', 't', 'Nombre y logo de tu tienda', 'd', 'Así te ven tus clientes en el catálogo.', 'ir', '#ajustes', 'ok', p.empresa <> '' and p.logo is not null),
    jsonb_build_object('k', 'whatsapp', 't', 'Tu WhatsApp', 'd', 'Para recibir y coordinar pedidos.', 'ir', '#ajustes', 'ok', coalesce(p.telefono, '') <> ''),
    jsonb_build_object('k', 'productos', 't', 'Tus productos', 'd', 'Sube al menos un producto con foto y precio.', 'ir', 'apps/caja/',
      'ok', exists (select 1 from public.catalog_items i where i.owner_id = p.id)),
    jsonb_build_object('k', 'cobro', 't', 'Cómo te pagan los pedidos', 'd', 'Tu link de pago o tus datos de transferencia. Los pedidos se pagan completos.', 'ir', '#links',
      'ok', coalesce(p.datos_pago, '') <> '' or exists (select 1 from public.links_pago l where l.owner_id = p.id and l.tipo = 'pedido' and l.activo and l.url <> '')),
    jsonb_build_object('k', 'despacho', 't', 'Despacho o retiro', 'd', 'Retiro en tienda, precio por comuna y envío al resto de Chile.', 'ir', '#despacho',
      'ok', coalesce((p.despacho ->> 'retiro')::boolean, false) or jsonb_array_length(coalesce(p.despacho -> 'zonas', '[]'::jsonb)) > 0
        or coalesce(p.despacho #>> '{resto,modo}', 'no') <> 'no'),
    jsonb_build_object('k', 'politicas', 't', 'Políticas de la tienda', 'd', 'Quién vende (RUT) y tu política de cambios: la ley las pide en la venta por internet.', 'ir', '#ajustes',
      'ok', coalesce(p.perfil ->> 'rut', '') <> '' and coalesce(p.perfil ->> 'cambios', '') <> ''))
  from public.profiles p where p.id = auth.uid()), '[]'::jsonb)
$$;
revoke all on function public.cfx_guia_app() from public, anon, authenticated;

-- ---------- VERSIÓN 5.42 · G25 ⏰ Renovación obligatoria (se puede volver a correr) ----------
-- Pro/Premium sin fecha de término → 30 días desde hoy (o desde que se activó). Al vencer, is_pro() deja de valer solo: hay que renovar.
create or replace function public.pro_con_fecha() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.plan = 'pro' and new.pro_until is null and new.role <> 'admin' then new.pro_until := now() + interval '30 days'; end if;
  return new;
end $$;
revoke all on function public.pro_con_fecha() from public, anon, authenticated;
drop trigger if exists profiles_vence on public.profiles;
create trigger profiles_vence before insert or update of plan, pro_until, role on public.profiles for each row execute function public.pro_con_fecha();
update public.profiles set pro_until = now() + interval '30 days' where plan = 'pro' and pro_until is null and role <> 'admin';
