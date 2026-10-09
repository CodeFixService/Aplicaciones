-- =====================================================================
--  CodeFix · INSTALACIÓN COMPLETA DEL SERVIDOR (un solo paso)
--  Supabase → SQL Editor → New query → pega TODO → Run.
--  Se puede volver a ejecutar sin perder datos.
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
alter table public.profiles enable row level security;

-- El único administrador general. Solo se reconoce si confirmó su correo.
create or replace function public.admin_email() returns text
language sql immutable as $$ select 'juanjosuecastilloloyola@gmail.com'::text $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, empresa, role)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'empresa', ''), 80),
    case when lower(new.email) = public.admin_email() then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
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

drop policy if exists "perfil propio o admin" on public.profiles;
create policy "perfil propio o admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
-- Sin políticas de insert/update/delete: todo cambio pasa por las funciones de abajo.

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'empresa', p.empresa, 'plan', p.plan,
    'pro_until', p.pro_until, 'suspended', p.suspended,
    'is_pro', public.is_pro(p.id), 'is_admin', public.is_admin())
  from public.profiles p where p.id = auth.uid()
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
  select jsonb_build_object('empresa', p.empresa)
  from public.profiles p where p.id = p_id and public.is_pro(p.id)
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
--   all_users / pro_users / free_users → solo el admin (a usuarios de la app)
--   my_subscribers                     → negocios Pro (a sus clientes)
--   self                               → prueba: solo a uno mismo
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  audience     text not null check (audience in ('all_users', 'pro_users', 'free_users', 'my_subscribers', 'self')),
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
alter table public.notifications drop constraint if exists notifications_audience_check;
alter table public.notifications add constraint notifications_audience_check
  check (audience in ('all_users', 'pro_users', 'free_users', 'my_subscribers', 'self'));
alter table public.notifications enable row level security;
drop policy if exists "mis notificaciones" on public.notifications;
create policy "mis notificaciones" on public.notifications
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

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
  if p_audience in ('all_users', 'pro_users', 'free_users') and not admin then
    raise exception 'Solo el administrador puede avisar a todos los usuarios';
  end if;
  if p_audience = 'my_subscribers' and not public.is_pro(auth.uid()) then
    raise exception 'Las notificaciones automáticas son de la versión Pro';
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
create or replace function public.my_inbox() returns setof public.notifications
language sql stable security definer set search_path = '' as $$
  select n.* from public.notifications n
  where n.status = 'sent' and n.sent_at > now() - interval '60 days'
    and (n.audience = 'all_users'
         or (n.audience = 'pro_users' and public.is_pro(auth.uid()))
         or (n.audience = 'free_users' and not public.is_pro(auth.uid())))
    and auth.uid() is not null
  order by n.sent_at desc limit 30
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.profiles),
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
    return query select s.endpoint, s.p256dh, s.auth, s.email, s.nombre
      from public.subscribers s where s.negocio_id = n.owner_id;
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
        where not p.suspended
          and (n.audience = 'all_users'
               or (n.audience = 'pro_users' and public.is_pro(p.id))
               or (n.audience = 'free_users' and not public.is_pro(p.id)))
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
  with check (bucket_id = 'fichas' and (storage.foldername(name))[1] = auth.uid()::text and public.is_pro(auth.uid()));
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
