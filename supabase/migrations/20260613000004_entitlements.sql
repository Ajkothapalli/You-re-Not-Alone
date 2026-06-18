-- Premium entitlements — server source of truth for the reading paywall.
-- Written ONLY by the revenuecat-webhook Edge Function (service role).
-- Keyed to account_id (the RevenueCat app_user_id == Supabase auth uid).
--
-- This is reader/consumption state, separate from author_token — it never
-- reveals what a user wrote (identity-separation invariant).

create table if not exists entitlements (
  account_id   uuid primary key references auth.users (id) on delete cascade,
  is_premium   boolean     not null default false,
  product_id   text,
  expires_at   timestamptz,
  updated_at   timestamptz not null default now()
);

alter table entitlements enable row level security;

-- Owner may read their own entitlement; only the service role writes.
drop policy if exists "own entitlement read" on entitlements;
create policy "own entitlement read"
  on entitlements for select
  using (auth.uid() = account_id);

-- Convenience: is the given account premium right now?
create or replace function is_premium(uid uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select is_premium and (expires_at is null or expires_at > now())
       from entitlements where account_id = uid),
    false);
$$;
