-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/604a8a73b8a5e7c7a4ac43868fb2356bb23a64f3/supabase/instalar.sql'));
end $$;
