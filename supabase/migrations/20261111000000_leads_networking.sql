-- Pulse Find: per-user leads pipeline + networking next-steps.
-- Promoted from supabase/drafts/phase2_leads_networking.sql (Phase 2, full package).
--
--   1. job_leads           — the Leads pipeline (New -> Queued -> Applied,
--                            or parked as Problem / Not eligible / Closed),
--                            mirroring the Leads tab of Kumail's Excel tracker.
--   2. networking_contacts — people to follow up with, next step + date,
--                            mirroring his Networking Tracker.
--
-- Isolation model (same as every other user table in this project):
--   * user_id defaults to auth.uid() and FKs to auth.users on delete cascade.
--   * RLS is enabled with own-row select/insert/update/delete policies, so an
--     authenticated client can only ever read or write rows where
--     user_id = auth.uid(). A second user sees zero of another user's rows:
--     there is no cross-user policy, no public-read policy, and the anon role
--     has no policies at all on these tables.
--   * The MCP edge function uses the service role (bypasses RLS) but scopes
--     every query with .eq("user_id", uid) from the token, same as it does
--     for applications/events.

create table public.job_leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company     text not null check (char_length(company) between 1 and 200),
  role        text not null default '' check (char_length(role) <= 300),
  track       text not null default 'Internship'
              check (track in ('Internship','New Grad','Full-Time','Part-Time','Other')),
  location    text not null default '' check (char_length(location) <= 200),
  pay         text not null default '' check (char_length(pay) <= 120),
  url         text not null default '' check (char_length(url) <= 2000),
  source      text not null default '' check (char_length(source) <= 120),
  status      text not null default 'New'
              check (status in ('New','Queued','Applied','Problem','Not eligible','Closed')),
  fit_note    text not null default '' check (char_length(fit_note) <= 1000),
  date_found  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index job_leads_user_idx on public.job_leads(user_id, status);
create trigger job_leads_touch before update on public.job_leads
  for each row execute function public.touch_updated_at();

create table public.networking_contacts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_name  text not null check (char_length(person_name) between 1 and 120),
  company      text not null default '' check (char_length(company) <= 200),
  status       text not null default '' check (char_length(status) <= 200),
  next_step    text not null default '' check (char_length(next_step) <= 500),
  next_step_on date,
  notes        text not null default '' check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index networking_contacts_user_idx on public.networking_contacts(user_id, next_step_on);
create trigger networking_contacts_touch before update on public.networking_contacts
  for each row execute function public.touch_updated_at();

alter table public.job_leads           enable row level security;
alter table public.networking_contacts enable row level security;

create policy "own leads: read"   on public.job_leads for select to authenticated using (user_id = (select auth.uid()));
create policy "own leads: insert" on public.job_leads for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own leads: update" on public.job_leads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own leads: delete" on public.job_leads for delete to authenticated using (user_id = (select auth.uid()));

create policy "own contacts: read"   on public.networking_contacts for select to authenticated using (user_id = (select auth.uid()));
create policy "own contacts: insert" on public.networking_contacts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own contacts: update" on public.networking_contacts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own contacts: delete" on public.networking_contacts for delete to authenticated using (user_id = (select auth.uid()));
