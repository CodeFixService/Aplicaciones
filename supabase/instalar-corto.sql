-- Instalación / actualización corta (para pegar desde el celular): descarga y ejecuta supabase/instalar.sql.
create extension if not exists http with schema extensions;
do $$ begin
  execute (select content from extensions.http_get('https://raw.githubusercontent.com/CodeFixService/Aplicaciones/7932847c61fee565ec57f368839b77cb305e48b8/supabase/instalar.sql'));
end $$;
