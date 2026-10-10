-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/d0e03b26ae3a199f8a5b4bb64ec6f756f0c6c554/supabase/instalar.sql'));
end $$;
