-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/b1c59ee9dfa0896d5436c650e284b17a64f05669/supabase/instalar.sql'));
end $$;
