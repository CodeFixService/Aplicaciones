-- =====================================================================
--  Envío automático: cada minuto llama a la función "enviar".
--  Pega este archivo en Supabase → SQL Editor → Run (después de schema.sql
--  y de crear la Edge Function "enviar").
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'enviar-notificaciones';

select cron.schedule(
  'enviar-notificaciones',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gilsamacgappycibcqhq.supabase.co/functions/v1/enviar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
