-- ============================================================
-- SCHEMA
-- Identity separation is the most critical invariant:
--   author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)
--   Computed in Edge Functions only. Never stored as a column here.
--   No mapping table. No join surface for clients.
-- ============================================================


-- ── accounts ─────────────────────────────────────────────────────────────────
-- Age gate + abuse controls only. NEVER joined to confessions.
create table accounts (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  dob                  date not null,             -- 18+ enforced server-side
  auth_provider        text not null default 'email',
  banned               bool not null default false,  -- permanent ban
  ban_reason           text,
  temp_ban_expires_at  timestamptz,               -- null = not temp-banned
  temp_ban_count       int not null default 0,    -- escalation counter
  abuse_strike_count   int not null default 0     -- rolling violation counter
);

alter table accounts enable row level security;

-- Client can only read their own row; no insert/update from client side.
-- All mutations go through Edge Functions (service_role).
create policy "accounts: owner read"
  on accounts for select
  using (auth.uid() = id);


-- ── devices ──────────────────────────────────────────────────────────────────
-- Rate-limiting. device_hash is server-computed — never trusted from client.
create table devices (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  device_hash text not null,
  last_seen   timestamptz not null default now(),
  unique (account_id, device_hash)
);

alter table devices enable row level security;


-- ── confessions ──────────────────────────────────────────────────────────────
-- NO account_id column — by design.
-- author_token is the HMAC of account_id — never exposed to clients.
-- Dimension: 1536 matches text-embedding-3-small.
-- If you change the embedding model, update this dimension AND the Edge Function.
create table confessions (
  id           uuid primary key default gen_random_uuid(),
  author_token text not null,
  created_at   timestamptz not null default now(),
  text         text not null,
  embedding    extensions.vector(1536),
  status       text not null default 'live'
                 check (status in ('live', 'crisis_held', 'removed')),
  felt_count   int not null default 0
);

alter table confessions enable row level security;

-- HNSW index for approximate nearest-neighbour cosine search.
-- Verify operator class name against installed pgvector version.
create index confessions_embedding_hnsw
  on confessions
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);


-- ── banned_tokens ─────────────────────────────────────────────────────────────
-- HMAC is one-way: we cannot re-derive a token from accounts.banned alone.
-- When an account is banned, the Edge Function inserts its HMAC token here so
-- that the match query can exclude confessions by banned authors without
-- reversing the HMAC.
create table banned_tokens (
  token      text primary key,  -- HMAC-SHA256 of the banned account
  banned_at  timestamptz not null default now()
);

alter table banned_tokens enable row level security;


-- ── matches ───────────────────────────────────────────────────────────────────
-- Log of what was shown to whom. By token only — no account_id.
create table matches (
  id                  uuid primary key default gen_random_uuid(),
  seeker_token        text not null,
  shown_confession_id uuid references confessions(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table matches enable row level security;


-- ── reports ───────────────────────────────────────────────────────────────────
create table reports (
  id            uuid primary key default gen_random_uuid(),
  confession_id uuid not null references confessions(id) on delete cascade,
  reason        text not null,
  created_at    timestamptz not null default now(),
  resolved      bool not null default false
);

alter table reports enable row level security;

-- Authenticated clients may INSERT a report; no SELECT/UPDATE/DELETE.
create policy "reports: authenticated insert"
  on reports for insert
  with check (auth.role() = 'authenticated');


-- ── crisis_events ─────────────────────────────────────────────────────────────
-- For human review only. Minimal data. No account_id stored.
create table crisis_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  text       text not null,
  reviewed   bool not null default false
);

alter table crisis_events enable row level security;
