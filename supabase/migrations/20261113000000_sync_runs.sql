-- Pulse Find: log tracker sync runs and keep them on schedule.
--
-- Before this runs, store the route secret in Vault (SQL editor):
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
-- The job calls the app's /api/cron/sync-sheet route on the same schedule
-- the old external sync used: every 2 hours at :35. Vercel Hobby crons
-- only run once a day, so the schedule lives here on pg_cron instead.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok', 'error')),
  source text not null default 'cron',
  created int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  total int not null default 0,
  error text,
  constraint sync_runs_counts_non_negative
    check (created >= 0 and updated >= 0 and skipped >= 0 and total >= 0)
);

alter table public.sync_runs enable row level security;

drop policy if exists "own sync runs: read" on public.sync_runs;
create policy "own sync runs: read"
  on public.sync_runs for select
  using (user_id = (select auth.uid()));

create index if not exists sync_runs_started_at_idx on public.sync_runs (started_at desc);

select cron.schedule('sync-sheet', '35 */2 * * *', $$
  select net.http_post(
    url := 'https://pulse-find-two.vercel.app/api/cron/sync-sheet',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$$);
