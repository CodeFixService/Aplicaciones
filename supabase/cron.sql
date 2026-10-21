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

-- Cada día (10:00 hora de Chile aprox.): avisa a quienes se les vence el plan (15 y 5 días antes, editable en Reglas).
select cron.unschedule(jobid) from cron.job where jobname = 'avisar-vencimientos';
select cron.schedule('avisar-vencimientos', '0 13 * * *', $$ select public.avisar_vencimientos(); $$);

-- Cada día (madrugada en Chile): borra avisos y mensajes de más de 7 días (ofertas: 30). Los pedidos no se tocan.
select cron.unschedule(jobid) from cron.job where jobname = 'limpiar-registros';
select cron.schedule('limpiar-registros', '0 8 * * *', $$ select public.limpiar_registros(); $$);

-- Cada hora: si subí una versión nueva de la app, te llega un aviso para tocar "Actualizar".
create extension if not exists http with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'avisar-version';
select cron.schedule('avisar-version', '17 * * * *', $$ select public.avisar_version_nueva(); $$);

-- Cada minuto: los pedidos sin comprobante a tiempo se liberan solos.
select cron.unschedule(jobid) from cron.job where jobname = 'expirar-retenciones';
select cron.schedule('expirar-retenciones', '* * * * *', $$ select public.expirar_retenciones(); $$);
-- Cada día: borra comprobantes viejos y pedidos expirados (los demás registros ya los limpia "limpiar-registros").
select cron.unschedule(jobid) from cron.job where jobname = 'limpiar-comprobantes';
select cron.schedule('limpiar-comprobantes', '10 8 * * *', $$ select public.limpiar('comprobantes'); select public.limpiar('pedidos'); $$);
-- Cada hora: recordatorio de carritos sin pedir (tiendas Pro; la función solo avisa de 10 a 20 h de Chile).
select cron.unschedule(jobid) from cron.job where jobname = 'recordar-carritos';
select cron.schedule('recordar-carritos', '23 * * * *', $$ select public.recordar_carritos(); $$);
-- Cada lunes (9:00 de Chile aprox.): reporte semanal de ventas a las tiendas Pro.
select cron.unschedule(jobid) from cron.job where jobname = 'reporte-semanal';
select cron.schedule('reporte-semanal', '7 12 * * 1', $$ select public.reporte_semanal(); $$);
