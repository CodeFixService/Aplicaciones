-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/8ebecf9886c2dfc9d474fa14a77addc5a54bc80f/supabase/instalar.sql'));
end $$;
