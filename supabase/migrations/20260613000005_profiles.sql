-- Profiles — the reader's own character + display name + release count,
-- account-keyed so they FLOW ACROSS DEVICES AND PLATFORMS (iOS ↔ Android).
--
-- This is reader-side identity. It is NEVER shown on confessions (those carry
-- a random per-confession persona), so the author-identity separation invariant
-- still holds — same trust boundary as reader_preferences and entitlements.
--
-- Owner-only RLS: a user reads/writes their own row and no other.

create table if not exists profiles (
  account_id    uuid primary key references auth.users (id) on delete cascade,
  persona_id    text,
  display_name  text,
  release_count integer     not null default 0,
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "own profile select" on profiles;
create policy "own profile select"
  on profiles for select using (auth.uid() = account_id);

drop policy if exists "own profile insert" on profiles;
create policy "own profile insert"
  on profiles for insert with check (auth.uid() = account_id);

drop policy if exists "own profile update" on profiles;
create policy "own profile update"
  on profiles for update using (auth.uid() = account_id) with check (auth.uid() = account_id);
