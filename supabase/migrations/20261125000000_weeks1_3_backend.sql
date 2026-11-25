-- Pulse Find: Weeks 1-3 backend pass.
--
--   1. rate_limit_counters + check_rate_limit(): one atomic counter per
--      key, used by the MCP edge function (per token + per IP) and by the
--      /api/auth/attempt route (per hashed email + IP). A fixed window:
--      the counter resets when the wall-clock window rolls over.
--   2. reminder_runs: one row per user per reminder date, so a retried
--      remind run never sends the same day's digest twice.
--   3. Indexes for the two unindexed foreign keys the Supabase advisor
--      flagged: saved_jobs.job_id and sync_runs.user_id.
--   4. pg_cron schedule for the remind edge function, daily ~7am,
--      following the refresh-jobs pattern (vault project_url/anon_key).
--
-- Reliable reminder delivery needs the owner to set RESEND_API_KEY as an
-- edge-function secret (and, for the address to send from a custom
-- domain, the matching Resend / custom SMTP setup in the dashboard).
-- Until that key exists the remind function logs the gap and sends
-- nothing; nothing here sends mail on its own.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- rate limiting ----------

create table public.rate_limit_counters (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  updated_at   timestamptz not null default now()
);

-- No policies: only the service role (MCP edge function, auth-attempt
-- route) may touch this table, through check_rate_limit() below. It is
-- not user data and no client should ever read it.
alter table public.rate_limit_counters enable row level security;

create or replace function public.check_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
  v_retry integer;
begin
  insert into public.rate_limit_counters (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key) do update set
    count = case
      when rate_limit_counters.window_start = excluded.window_start
      then rate_limit_counters.count + 1
      else 1
    end,
    window_start = excluded.window_start,
    updated_at = now()
  returning count into v_count;

  if v_count <= p_limit then
    return query select true, 0;
  end if;

  v_retry := ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer;
  return query select false, greatest(v_retry, 1);
end
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;

-- ---------- day-before deadline reminders ----------

create table public.reminder_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  reminder_date     date not null,
  sent_at           timestamptz not null default now(),
  applications_count integer not null default 0 check (applications_count >= 0),
  constraint reminder_runs_one_per_user_per_day unique (user_id, reminder_date)
);
create index reminder_runs_user_idx on public.reminder_runs (user_id, reminder_date);

alter table public.reminder_runs enable row level security;
create policy "own reminder runs: read" on public.reminder_runs
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------- advisor-flagged unindexed foreign keys ----------

create index if not exists saved_jobs_job_idx on public.saved_jobs (job_id);
create index if not exists sync_runs_user_idx on public.sync_runs (user_id);

-- ---------- daily reminder schedule ----------

select cron.schedule('remind-daily', '0 7 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/remind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
