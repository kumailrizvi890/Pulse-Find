-- Pulse Find: job discovery
-- Openings come from companies' public job boards (Greenhouse, Lever, Ashby).
-- Jobs are public data: anyone can read them. Only the refresh function (service role) writes them.

create table public.job_boards (
  source     text not null check (source in ('greenhouse', 'lever', 'ashby')),
  slug       text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  company    text not null,
  active     boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  job_count  integer not null default 0,
  primary key (source, slug)
);

create table public.jobs (
  id         text primary key,                 -- "<source>:<slug>:<board job id>"
  source     text not null,
  board      text not null,
  company    text not null,
  title      text not null,
  location   text not null default '',
  remote     boolean not null default false,
  url        text not null check (url ~ '^https://'),
  track      text not null check (track in ('Internship', 'New Grad', 'Full-Time', 'Part-Time', 'Other')),
  tech       boolean not null default false,
  posted_at  timestamptz,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  active     boolean not null default true
);
create index jobs_feed_idx on public.jobs (active, track, posted_at desc);
create index jobs_company_idx on public.jobs (lower(company));

create table public.job_refresh_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  boards_ok   integer not null default 0,
  boards_err  integer not null default 0,
  jobs_seen   integer not null default 0
);

create table public.saved_jobs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id     text not null references public.jobs(id) on delete cascade,
  state      text not null default 'saved' check (state in ('saved', 'applied', 'hidden')),
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index saved_jobs_user_idx on public.saved_jobs (user_id);

alter table public.job_boards       enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_refresh_runs enable row level security;
alter table public.saved_jobs       enable row level security;

create policy "jobs are public"       on public.jobs             for select to anon, authenticated using (true);
create policy "boards are public"     on public.job_boards       for select to anon, authenticated using (true);
create policy "refresh runs public"   on public.job_refresh_runs for select to anon, authenticated using (true);

create policy "own saved jobs: read"   on public.saved_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy "own saved jobs: insert" on public.saved_jobs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own saved jobs: update" on public.saved_jobs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own saved jobs: delete" on public.saved_jobs for delete to authenticated using (user_id = (select auth.uid()));

-- Companies that hire interns and new grads and publish public boards. Wrong or retired slugs
-- are recorded in last_error by the refresh function and can be turned off without a deploy.
insert into public.job_boards (source, slug, company) values
  ('greenhouse','stripe','Stripe'), ('greenhouse','airbnb','Airbnb'), ('greenhouse','robinhood','Robinhood'),
  ('greenhouse','coinbase','Coinbase'), ('greenhouse','figma','Figma'), ('greenhouse','discord','Discord'),
  ('greenhouse','databricks','Databricks'), ('greenhouse','dropbox','Dropbox'), ('greenhouse','instacart','Instacart'),
  ('greenhouse','lyft','Lyft'), ('greenhouse','pinterest','Pinterest'), ('greenhouse','reddit','Reddit'),
  ('greenhouse','roblox','Roblox'), ('greenhouse','twitch','Twitch'), ('greenhouse','asana','Asana'),
  ('greenhouse','cloudflare','Cloudflare'), ('greenhouse','datadog','Datadog'), ('greenhouse','gitlab','GitLab'),
  ('greenhouse','mongodb','MongoDB'), ('greenhouse','okta','Okta'), ('greenhouse','samsara','Samsara'),
  ('greenhouse','affirm','Affirm'), ('greenhouse','brex','Brex'), ('greenhouse','chime','Chime'),
  ('greenhouse','duolingo','Duolingo'), ('greenhouse','gusto','Gusto'), ('greenhouse','anthropic','Anthropic'),
  ('greenhouse','scaleai','Scale AI'), ('greenhouse','andurilindustries','Anduril'), ('greenhouse','waymo','Waymo'),
  ('greenhouse','nuro','Nuro'), ('greenhouse','verkada','Verkada'), ('greenhouse','flexport','Flexport'),
  ('greenhouse','toast','Toast'), ('greenhouse','squarespace','Squarespace'), ('greenhouse','twilio','Twilio'),
  ('greenhouse','zillow','Zillow'), ('greenhouse','tripadvisor','Tripadvisor'), ('greenhouse','point72','Point72'),
  ('greenhouse','janestreet','Jane Street'), ('greenhouse','hudsonrivertrading','Hudson River Trading'),
  ('greenhouse','imc','IMC Trading'), ('greenhouse','sofi','SoFi'), ('greenhouse','nerdwallet','NerdWallet'),
  ('lever','palantir','Palantir'), ('lever','spotify','Spotify'), ('lever','plaid','Plaid'),
  ('lever','zoox','Zoox'), ('lever','attentive','Attentive'), ('lever','whoop','WHOOP'),
  ('ashby','ramp','Ramp'), ('ashby','openai','OpenAI'), ('ashby','notion','Notion'), ('ashby','linear','Linear'),
  ('ashby','supabase','Supabase'), ('ashby','replit','Replit'), ('ashby','perplexity','Perplexity'),
  ('ashby','cohere','Cohere'), ('ashby','vanta','Vanta'), ('ashby','retool','Retool'), ('ashby','deel','Deel');
