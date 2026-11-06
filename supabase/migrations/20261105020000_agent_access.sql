-- Pulse Find: access for AI agents (MCP)
-- People create personal access tokens in the app and give them to their own agent.
-- Only a SHA-256 hash of each token is stored; the token itself is shown once.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  prefix       text not null check (prefix ~ '^pf_[A-Za-z0-9]{4}$'),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_user_idx on public.api_tokens(user_id);

alter table public.api_tokens enable row level security;
create policy "own tokens: read"   on public.api_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "own tokens: create" on public.api_tokens for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null and last_used_at is null);
-- revoking is the only edit allowed
create policy "own tokens: revoke" on public.api_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tokens: delete" on public.api_tokens for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.api_tokens from authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;

-- Agents may send the same email twice; the email's message id makes the second one a no-op.
alter table public.events add column source_ref text check (char_length(source_ref) <= 300);
create unique index events_source_ref_uniq on public.events(user_id, source_ref) where source_ref is not null;
