-- Allow authenticated users to create and update their own account row.
-- The 18+ age gate is enforced server-side in submit-confession (step [0]),
-- so a client-supplied DOB cannot bypass the age requirement.
create policy "accounts: owner insert"
  on accounts for insert
  with check (auth.uid() = id);

create policy "accounts: owner update"
  on accounts for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);
