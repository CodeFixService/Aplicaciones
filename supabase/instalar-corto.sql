-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/60c0f44261bbfe74f0c83ce3dc3016657c86c4f9/supabase/instalar.sql'));
end $$;
