-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/28e4425d80faba7671d73e7dbac221228071f6c1/supabase/instalar.sql'));
end $$;
