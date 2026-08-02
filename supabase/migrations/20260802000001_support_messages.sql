-- Support messages — submitted via the in-app Contact support form.
-- Authenticated users can INSERT their own rows; only service_role can SELECT.
create table if not exists support_messages (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references auth.users(id) on delete set null,
  email      text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

alter table support_messages enable row level security;

-- Authenticated users can submit a message
create policy "authenticated can insert support_messages"
  on support_messages for insert
  to authenticated
  with check (auth.uid() = account_id or account_id is null);

-- Only service_role reads (admin dashboard / Supabase table view)
revoke select on support_messages from anon, authenticated;
