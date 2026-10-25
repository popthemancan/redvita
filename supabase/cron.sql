create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'redvita-watchdog',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/watchdog',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-watchdog-secret', 'YOUR-WATCHDOG-SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

