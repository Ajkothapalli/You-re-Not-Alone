-- ─────────────────────────────────────────────────────────────────────────────
-- [B] Sticky 50/50 A/B variant for the invite copy.
--
-- Assigned SERVER-side, once, and never re-rolled. A client-rolled variant
-- would change on reinstall and differ between a person's devices, which would
-- mean the test measured nothing — the same account would appear in both arms.
--
-- Callable by the account itself and returns ONLY that account's own variant,
-- so it is safe for authenticated clients. It reveals nothing about anyone
-- else and nothing about what the caller has written or read.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_referral_variant()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v   text;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;

  SELECT referral_variant INTO v FROM accounts WHERE id = uid;
  IF v IS NOT NULL THEN RETURN v; END IF;

  -- A coin flip on a random value, not on the uuid: deriving the arm from the
  -- account id would make assignment predictable from a value that travels.
  v := CASE WHEN random() < 0.5 THEN 'gift' ELSE 'earn' END;

  UPDATE accounts SET referral_variant = v WHERE id = uid AND referral_variant IS NULL;
  -- Re-read: a concurrent call may have won, and the variant must be stable.
  SELECT referral_variant INTO v FROM accounts WHERE id = uid;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_referral_variant() FROM anon;
GRANT  EXECUTE ON FUNCTION assign_referral_variant() TO   authenticated;
