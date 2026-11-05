-- Pulse Find: initial schema
-- Every row belongs to one user; row-level security makes sure people only ever see their own data.

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  ghost_days  integer not null default 21 check (ghost_days between 3 and 120),
  weekly_goal integer not null default 25 check (weekly_goal between 1 and 200),
  created_at  timestamptz not null default now()
);

create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company         text not null check (char_length(company) between 1 and 200),
  role            text not null default '' check (char_length(role) <= 300),
  track           text not null default 'Internship'
                  check (track in ('Internship','New Grad','Full-Time','Part-Time','Other')),
  status          text not null default 'Applied'
                  check (status in ('Applied','Incomplete','OA Received','OA Completed','Recruiter Screen',
                                    'Interview Invited','Interviewing','Final Round','Offer','Accepted',
                                    'Rejected','Withdrawn')),
  date_applied    date,
  last_contact    date,
  oa_received     boolean not null default false,
  interviews_done integer not null default 0 check (interviews_done between 0 and 50),
  latest_update   text not null default '' check (char_length(latest_update) <= 1000),
  link            text not null default '' check (char_length(link) <= 2000),
  notes           text not null default '' check (char_length(notes) <= 4000),
  action_needed   text not null default '' check (char_length(action_needed) <= 500),
  action_due      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  event_date     date not null default current_date,
  kind           text not null check (char_length(kind) between 1 and 80),
  details        text not null default '' check (char_length(details) <= 1000),
  created_at     timestamptz not null default now()
);

create index applications_user_idx on public.applications(user_id);
create index events_user_idx on public.events(user_id);
create index events_application_idx on public.events(application_id);

-- keep updated_at fresh
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- create a profile row when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- row-level security
alter table public.profiles     enable row level security;
alter table public.applications enable row level security;
alter table public.events       enable row level security;

create policy "own profile: read"   on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own applications: read"   on public.applications for select to authenticated using (user_id = (select auth.uid()));
create policy "own applications: insert" on public.applications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own applications: update" on public.applications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own applications: delete" on public.applications for delete to authenticated using (user_id = (select auth.uid()));

create policy "own events: read"   on public.events for select to authenticated using (user_id = (select auth.uid()));
create policy "own events: insert" on public.events for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid())));
create policy "own events: delete" on public.events for delete to authenticated using (user_id = (select auth.uid()));
