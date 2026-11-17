-- Pulse Find: LinkedIn profile URL + last-contacted date on networking contacts (audit gap #9).
--
-- The Networking Tracker sheet already holds both (Profile URL column E,
-- Last Touch column I); the in-app sync populates them from there, so a
-- contact's name can link to their real LinkedIn profile and the row can
-- show when the user last talked to them. RLS policies on
-- networking_contacts are row-based, so the new columns are covered by
-- the existing policies with no changes needed.
alter table public.networking_contacts
  add column if not exists linkedin_url text not null default '' check (char_length(linkedin_url) <= 2000),
  add column if not exists last_contacted date;
