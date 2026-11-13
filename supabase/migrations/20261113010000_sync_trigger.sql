-- Pulse Find: trigger the tracker sync through the sync-trigger edge function.
--
-- pg_net's HTTP client drops about every other call to Vercel with an
-- HTTP/2 framing error, so the job calls the edge function instead and
-- lets it forward the call to the app's route, with retries. The schedule
-- stays the same: every 2 hours at :35. This replaces the job created by
-- 20261113000000_sync_runs.sql.
select cron.unschedule('sync-sheet');

select cron.schedule('sync-sheet', '35 */2 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
