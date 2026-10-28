-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
-- Siempre la última (rama main). Basta con correrla UNA vez: después la base se actualiza sola cada 10 minutos.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/main/supabase/instalar.sql?t=' || extract(epoch from now())::bigint));
end $$;
select 'CodeFix Apps instalada v' || public.db_version() as resultado;
