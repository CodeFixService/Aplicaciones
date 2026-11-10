-- LIMPIEZA FINAL · Órbita · PASO 2: BORRA todas las cuentas menos los administradores, con sus datos y avisos.
-- ⚠️ No se puede deshacer. Correr SOLO después del PASO 1 (1_contar.sql) y de revisar sus números.
-- Quedan: los administradores, la configuración (precios, textos, planes, módulos) y los avisos generales a todos.
-- Las fotos (Storage) se borran aparte: Supabase → Storage → cada bucket → seleccionar todo → Delete.
do $$
declare
  ids uuid[] := array(select u.id from auth.users u where u.id not in (select p.id from public.profiles p where p.role = 'admin' or lower(p.email) = public.admin_email()));
  r record; n bigint; total bigint := 0; pasada int; quedan int;
begin
  if (select count(*) from public.profiles where role = 'admin' or lower(email) = public.admin_email()) = 0 then raise exception 'No hay administrador: no se borra nada.'; end if;
  -- Varias pasadas: si una tabla depende de otra (llave foránea), se borra en la pasada siguiente.
  for pasada in 1..5 loop
    quedan := 0;
    for r in select c.table_name t, c.column_name col from information_schema.columns c
             join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
             where c.table_schema = 'public' and c.data_type = 'uuid' order by c.table_name loop
      begin
        execute format('delete from public.%I where %I = any($1)', r.t, r.col) using ids;
        get diagnostics n = row_count; total := total + n;
      exception when foreign_key_violation then quedan := quedan + 1;
      end;
    end loop;
    exit when quedan = 0;
  end loop;
  -- Análisis nocturno guardado por negocio (clave = id en texto).
  if to_regclass('public.cfx_analisis') is not null then delete from public.cfx_analisis where clave = any(select x::text from unnest(ids) x); end if;
  delete from auth.users where id = any(ids);
  raise notice 'Listo: % cuentas borradas y % filas de sus datos.', coalesce(array_length(ids, 1), 0), total;
end $$;
-- Para revisar: debería mostrar 0 cuentas que se borran.
select count(*) as cuentas_que_quedan, count(*) filter (where role = 'admin') as administradores from public.profiles;
