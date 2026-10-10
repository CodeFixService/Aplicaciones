-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/b86f9f8008cdf2be8a8b2f40176dc8b2650d8ddc/supabase/instalar.sql'));
end $$;
