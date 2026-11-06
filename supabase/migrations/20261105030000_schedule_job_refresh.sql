-- Pulse Find: refresh the job board every 6 hours.
-- Before this runs, store two secrets in Vault (SQL editor):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your publishable or anon key>', 'anon_key');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('refresh-jobs', '17 */6 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
