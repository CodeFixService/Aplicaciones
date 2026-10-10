-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/99dfde1ad908a54ade8a05aed724509f6a0e3368/supabase/instalar.sql'));
end $$;
