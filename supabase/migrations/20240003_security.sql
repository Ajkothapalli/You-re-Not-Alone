-- ============================================================
-- SECURITY HARDENING
-- Access control matrix:
--   anon / authenticated  → confessions_public view only
--   service_role          → full access (Edge Functions)
-- ============================================================


-- ── 1. REVOKE direct table access from all client roles ───────────────────────
-- Belt-and-suspenders on top of RLS. Even if a future migration accidentally
-- grants table access, these explicit REVOKEs prevent it from working.

revoke all on confessions    from anon, authenticated;
revoke all on devices        from anon, authenticated;
revoke all on matches        from anon, authenticated;
revoke all on crisis_events  from anon, authenticated;
revoke all on banned_tokens  from anon, authenticated;

-- Column-level guard: even if the above is ever accidentally reversed,
-- clients can never read the identity-linking column.
revoke select (author_token) on confessions from anon, authenticated;


-- ── 2. Public view — no author_token, security_invoker ────────────────────────
-- security_invoker=true means RLS runs as the calling user, not the view owner.
-- This ensures the view cannot be used to bypass row-level policies.
create or replace view confessions_public
  with (security_invoker = true) as
  select id, text, felt_count, created_at
  from confessions
  where status = 'live';

grant select on confessions_public to anon, authenticated;


-- ── 3. RLS verification (aborts migration if any table is unprotected) ─────────
do $$
declare
  r record;
  expected_tables text[] := array[
    'accounts', 'devices', 'confessions', 'banned_tokens',
    'matches', 'reports', 'crisis_events'
  ];
  t text;
begin
  foreach t in array expected_tables loop
    select tablename, rowsecurity into r
    from pg_tables
    where schemaname = 'public' and tablename = t;
    if not found or not r.rowsecurity then
      raise exception 'SECURITY: RLS is NOT enabled on table: %', t;
    end if;
  end loop;
  raise notice 'RLS check passed on all % tables.', array_length(expected_tables, 1);
end;
$$;


-- ── 4. match_confession RPC ────────────────────────────────────────────────────
-- Nearest-neighbour search called by the Edge Function.
-- Excludes: seeker's own token, crisis_held/removed confessions,
--           confessions whose author_token is in banned_tokens.
-- security definer + locked search_path prevents SQL injection via schema tricks.
create or replace function match_confession(
  p_embedding    extensions.vector,
  p_seeker_token text,
  p_limit        int default 1
)
returns table (
  id          uuid,
  text        text,
  felt_count  int,
  distance    float
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.text,
    c.felt_count,
    (c.embedding <=> p_embedding)::float as distance
  from confessions c
  where c.status = 'live'
    and c.author_token <> p_seeker_token
    and c.author_token not in (select token from banned_tokens)
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;

-- Only service_role (Edge Functions) may call this.
revoke execute on function match_confession(extensions.vector, text, int)
  from public, anon, authenticated;


-- ── 5. Atomic felt_count increment ────────────────────────────────────────────
-- Avoids read-then-write race condition. Returns new count.
create or replace function increment_felt_count(p_confession_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update confessions
  set felt_count = felt_count + 1
  where id = p_confession_id
    and status = 'live'
  returning felt_count;
$$;

revoke execute on function increment_felt_count(uuid)
  from public, anon, authenticated;


-- ── 6. check_and_apply_ban_escalation RPC ─────────────────────────────────────
-- Called by the Edge Function after recording an abuse event.
-- Returns the new ban state for the account.
create or replace function check_and_apply_ban_escalation(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account accounts%rowtype;
  v_result  jsonb;
begin
  select * into v_account from accounts where id = p_account_id for update;

  -- Count violations in the last 24h (using abuse_strike_count as a proxy;
  -- the Edge Function increments it and we reset it when a ban is applied).
  if v_account.abuse_strike_count >= 3 then

    if v_account.temp_ban_count >= 3 then
      -- Permanent ban
      update accounts
      set banned = true,
          ban_reason = 'repeated_violations',
          abuse_strike_count = 0
      where id = p_account_id;
      v_result := jsonb_build_object('banned', true, 'permanent', true);
    else
      -- Temporary ban: 24 hours
      update accounts
      set temp_ban_expires_at = now() + interval '24 hours',
          temp_ban_count      = temp_ban_count + 1,
          abuse_strike_count  = 0
      where id = p_account_id;
      v_result := jsonb_build_object(
        'banned', false,
        'temp_ban', true,
        'expires_at', (now() + interval '24 hours')
      );
    end if;

  else
    v_result := jsonb_build_object('banned', false, 'temp_ban', false);
  end if;

  return v_result;
end;
$$;

revoke execute on function check_and_apply_ban_escalation(uuid)
  from public, anon, authenticated;


-- ── 7. increment_abuse_strike RPC ─────────────────────────────────────────────
-- Atomically increments the rolling violation counter on an account.
create or replace function increment_abuse_strike(p_account_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update accounts
  set abuse_strike_count = abuse_strike_count + 1
  where id = p_account_id;
$$;

revoke execute on function increment_abuse_strike(uuid)
  from public, anon, authenticated;


-- ── 8. cache_banned_token RPC ─────────────────────────────────────────────────
-- Called by the Edge Function when permanently banning an account.
-- Inserts the HMAC token into banned_tokens so the match query excludes
-- confessions by this author without reversing the HMAC.
create or replace function cache_banned_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into banned_tokens (token) values (p_token)
  on conflict (token) do nothing;
$$;

revoke execute on function cache_banned_token(text)
  from public, anon, authenticated;
