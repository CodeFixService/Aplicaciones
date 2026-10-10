-- Instalación corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/11dfa6e8e30abaefd49dfe188fef8bbdde266810/supabase/instalar.sql'));
end $$;
