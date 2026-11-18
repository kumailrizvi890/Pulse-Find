-- Pulse Find: let a sync run be claimed as "running" while it is in flight.
--
-- The route used to record its sync_runs row only when it finished, so a
-- second invocation that started while the first was still inserting
-- could not see it and planned the same creates. The sync-trigger retries
-- the route when its 55s timeout fires while the route still has up to
-- 60s, so that overlap is real. The route now claims its run up front
-- (status "running") and a second invocation that finds a fresh claim
-- exits early. A claim older than 10 minutes is stale and ignored: a run
-- cannot last longer than the route's 60s maxDuration.
--
-- The old check constraint was declared inline, so its name is the
-- Postgres default (<table>_<column>_check). The DO block drops whatever
-- status check is actually there, so the migration still applies if the
-- name ever differs.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.sync_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.sync_runs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.sync_runs
  add constraint sync_runs_status_check
  check (status in ('ok', 'error', 'running'));
